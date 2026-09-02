import { describe, expect, test } from 'bun:test'
import { advanceOrder, boardFor } from '../../app/Actions/Merchant/board'
import { assertDatabaseHas, factory, refreshDatabase } from '../support/database'

/**
 * The kitchen's board.
 *
 * The screen a restaurant actually stands in front of, answering one question:
 * what do I make next. Which means the order of the queue is the feature, not
 * a detail - a board that sorts newest-first has the kitchen cooking the wrong
 * ticket, and nothing about the screen would look wrong while it happened.
 *
 * `advanceOrder` is the other half: a kitchen's vocabulary is smaller than the
 * order lifecycle's, and the statuses it must not be able to set are the point.
 * Letting a kitchen mark something DELIVERED would have restaurants closing
 * orders the courier has not collected, and the money attributed to a handover
 * that never happened.
 */

const database = refreshDatabase()

function seedShop(): { businessId: number } {
  const [marketId] = database.seed('markets', [factory.market()])
  const [businessId] = database.seed('businesses', [factory.business({
    slug: 'a-shop',
    name: 'A Shop',
    is_partner: 1,
    offers_pickup: 1,
    market_id: marketId,
  })])

  return { businessId }
}

function seedOrder(businessId: number, overrides: Record<string, unknown> = {}): number {
  const [id] = database.seed('orders', [{
    uuid: crypto.randomUUID(),
    business_id: businessId,
    status: 'PENDING',
    order_type: 'PICKUP',
    subtotal_cents: 1000,
    tax_amount: 0,
    delivery_fee: 0,
    service_fee_cents: 100,
    tip_amount: 0,
    total_amount: 1100,
    discount_amount: 0,
    currency: 'usd',
    delivery_address: '',
    special_instructions: '',
    tracking_token: crypto.randomUUID().replace(/-/g, '').slice(0, 24),
    ...overrides,
  }])

  return id
}

describe('the board', () => {
  test('is nothing at all for a business that does not exist', async () => {
    expect(await boardFor('nowhere')).toBe(null)
  })

  test('queues the active orders oldest first', async () => {
    // A kitchen works a queue. Newest-first is the right order for a history
    // and the wrong one for a hob.
    const { businessId } = seedShop()
    const first = seedOrder(businessId)
    const second = seedOrder(businessId)
    const third = seedOrder(businessId)

    const board = await boardFor('a-shop')

    expect(board!.active.map(order => order.id)).toEqual([first, second, third])
  })

  test('reads the finished ones backwards', async () => {
    // Once an order is done the list is history, and history reads newest
    // first.
    const { businessId } = seedShop()
    const first = seedOrder(businessId, { status: 'DELIVERED' })
    const second = seedOrder(businessId, { status: 'DELIVERED' })

    const board = await boardFor('a-shop')

    expect(board!.completed.map(order => order.id)).toEqual([second, first])
  })

  test('separates what is still cooking from what is done', async () => {
    const { businessId } = seedShop()
    const pending = seedOrder(businessId, { status: 'PENDING' })
    const cooking = seedOrder(businessId, { status: 'PROCESSING' })
    const done = seedOrder(businessId, { status: 'DELIVERED' })
    const cancelled = seedOrder(businessId, { status: 'CANCELLED' })

    const board = await boardFor('a-shop')

    expect(board!.active.map(order => order.id).sort()).toEqual([pending, cooking].sort())
    expect(board!.completed.map(order => order.id).sort()).toEqual([done, cancelled].sort())
  })

  test('shows only this kitchen\'s orders', async () => {
    const { businessId } = seedShop()
    const [otherId] = database.seed('businesses', [factory.business({ slug: 'elsewhere', is_partner: 1 })])

    const mine = seedOrder(businessId)
    seedOrder(otherId)

    const board = await boardFor('a-shop')

    expect(board!.active.map(order => order.id)).toEqual([mine])
  })

  test('carries each order\'s lines with the options already resolved', async () => {
    // So a cook can read the ticket without a second lookup. A line that says
    // only "Pizza" is a line somebody has to go and ask about.
    const { businessId } = seedShop()
    const orderId = seedOrder(businessId)
    const [productId] = database.seed('products', [factory.product({ name: 'Pizza', business_id: businessId })])
    const [itemId] = database.seed('order_items', [{
      order_id: orderId,
      product_id: productId,
      quantity: 2,
      price: 1150,
      special_instructions: 'Well done',
    }])

    const [groupId] = database.seed('modifier_groups', [{ name: 'Extras', min_selections: 0, max_selections: 2, product_id: productId, position: 1 }])
    const [modifierId] = database.seed('modifiers', [{ name: 'Olives', price_delta_cents: 150, is_default: 0, is_available: 1, modifier_group_id: groupId, position: 1 }])

    database.seed('order_item_modifiers', [{
      uuid: crypto.randomUUID(),
      order_item_id: itemId,
      modifier_id: modifierId,
      group_name: 'Extras',
      name: 'Olives',
      price_delta_cents: 150,
      quantity: 1,
    }])

    const board = await boardFor('a-shop')
    const [line] = board!.active[0]!.items

    expect(line!.name).toBe('Pizza')
    expect(line!.quantity).toBe(2)
    // Group and option, not just the option: "Olives" alone leaves a cook
    // guessing which question it answered on an item with several.
    expect(line!.modifiers).toEqual(['Extras: Olives'])
    expect(line!.notes).toBe('Well done')
  })
})

describe('the day\'s takings', () => {
  test('are what the business keeps, not what the customer paid', async () => {
    // Gross is the customer's number; net is the one a merchant plans
    // against, and showing gross under a label that means net overstates
    // every day's takings by the platform's cut.
    const { businessId } = seedShop()
    seedOrder(businessId, { total_amount: 1100, service_fee_cents: 100 })
    seedOrder(businessId, { total_amount: 2200, service_fee_cents: 200 })

    const board = await boardFor('a-shop')

    expect(board!.today.grossCents).toBe(3300)
    expect(board!.today.netCents).toBe(3000)
  })

  test('leave out what was cancelled', async () => {
    // A cancelled order is money that never arrived.
    const { businessId } = seedShop()
    seedOrder(businessId, { total_amount: 1100, service_fee_cents: 100 })
    seedOrder(businessId, { total_amount: 5000, service_fee_cents: 500, status: 'CANCELLED' })

    const board = await boardFor('a-shop')

    expect(board!.today.grossCents).toBe(1100)
  })
})

describe('moving an order along', () => {
  test('through the statuses a kitchen owns', async () => {
    const { businessId } = seedShop()
    const orderId = seedOrder(businessId)

    for (const status of ['PROCESSING', 'SHIPPED']) {
      const result = await advanceOrder(orderId, status)

      expect(result.ok).toBe(true)
      assertDatabaseHas('orders', { id: orderId, status })
    }
  })

  test('but not to one that belongs to the handover', async () => {
    // DELIVERED is the courier's word, or the counter's. A kitchen saying it
    // closes an order for food still sitting on the pass.
    const { businessId } = seedShop()
    const orderId = seedOrder(businessId)

    const result = await advanceOrder(orderId, 'DELIVERED')

    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/A kitchen can move an order to/)
    assertDatabaseHas('orders', { id: orderId, status: 'PENDING' })
  })

  test('and not to a status that does not exist', async () => {
    const { businessId } = seedShop()
    const orderId = seedOrder(businessId)

    const result = await advanceOrder(orderId, 'BURNED')

    expect(result.ok).toBe(false)
    assertDatabaseHas('orders', { id: orderId, status: 'PENDING' })
  })

  test('an order that is already finished does not move', async () => {
    // Reopening a delivered order would put a ticket back on a board for food
    // that has been eaten.
    const { businessId } = seedShop()
    const delivered = seedOrder(businessId, { status: 'DELIVERED' })
    const cancelled = seedOrder(businessId, { status: 'CANCELLED' })

    expect((await advanceOrder(delivered, 'PROCESSING')).ok).toBe(false)
    expect((await advanceOrder(cancelled, 'PROCESSING')).ok).toBe(false)

    assertDatabaseHas('orders', { id: delivered, status: 'DELIVERED' })
    assertDatabaseHas('orders', { id: cancelled, status: 'CANCELLED' })
  })

  test('an order nobody has', async () => {
    const result = await advanceOrder(999_999, 'PROCESSING')

    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/No such order/)
  })

  test('cancelling is something a kitchen may do', async () => {
    const { businessId } = seedShop()
    const orderId = seedOrder(businessId)

    expect((await advanceOrder(orderId, 'CANCELLED')).ok).toBe(true)
    assertDatabaseHas('orders', { id: orderId, status: 'CANCELLED' })
  })
})
