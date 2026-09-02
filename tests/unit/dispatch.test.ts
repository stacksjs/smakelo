import { describe, expect, test } from 'bun:test'
import { dispatchOrder } from '../../app/Actions/Delivery/dispatch'
import { assertDatabaseCount, assertDatabaseHas, factory, refreshDatabase } from '../support/database'

/**
 * Getting an order onto a courier.
 *
 * A delivery is two stops, not one: collect from the merchant, then hand over
 * to the customer. Both are written at dispatch and the sequence between them
 * is what the tracking pipeline reads to decide which stop is being served -
 * so getting it backwards has a courier delivering before collecting, and the
 * customer watching a map that says the food is on its way while it is still
 * in the oven.
 *
 * The other half is money. The courier's ledger rows are written when the
 * order is placed, under party id 0, because nobody has accepted it yet.
 * Dispatch is where they get a name. Leave that out and the delivery fee and
 * the tip stay owed to courier number zero, who does not exist and cannot be
 * paid.
 */

const database = refreshDatabase()

function seedDelivery(overrides: Record<string, unknown> = {}): { orderId: number, businessId: number } {
  const [marketId] = database.seed('markets', [factory.market()])
  const [businessId] = database.seed('businesses', [factory.business({
    // Unique per call: a test that dispatches two orders seeds two shops.
    slug: `a-shop-${Math.random().toString(36).slice(2, 8)}`,
    name: 'A Shop',
    address: '1 Example St',
    is_partner: 1,
    offers_delivery: 1,
    market_id: marketId,
    latitude: 34.0195,
    longitude: -118.4912,
  })])

  const [orderId] = database.seed('orders', [{
    uuid: crypto.randomUUID(),
    business_id: businessId,
    status: 'PENDING',
    order_type: 'DELIVERY',
    subtotal_cents: 1000,
    tax_amount: 0,
    delivery_fee: 400,
    service_fee_cents: 100,
    tip_amount: 300,
    total_amount: 1800,
    discount_amount: 0,
    currency: 'usd',
    delivery_address: '99 Somewhere Ave',
    delivery_latitude: 34.0245,
    delivery_longitude: -118.4912,
    special_instructions: '',
    tracking_token: crypto.randomUUID().replace(/-/g, '').slice(0, 24),
    ...overrides,
  }])

  return { orderId, businessId }
}

describe('what can be dispatched', () => {
  test('an order nobody has', async () => {
    const result = await dispatchOrder(999_999)

    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/No such order/)
  })

  test('a collection order is not a delivery', async () => {
    const { orderId } = seedDelivery({ order_type: 'PICKUP' })

    const result = await dispatchOrder(orderId)

    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/not a delivery/)
    assertDatabaseCount('delivery_routes', 0)
  })

  test('an order already on a run is not dispatched twice', async () => {
    // Twice would put one order on two runs and pay two couriers for it.
    const { orderId } = seedDelivery()
    database.seed('couriers', [factory.courier()])

    expect((await dispatchOrder(orderId)).ok).toBe(true)

    const second = await dispatchOrder(orderId)

    expect(second.ok).toBe(false)
    expect(second.reason).toMatch(/already on a run/)
    assertDatabaseCount('delivery_routes', 1)
  })

  test('nothing happens when no courier is free', async () => {
    const { orderId } = seedDelivery()
    database.seed('couriers', [factory.courier({ status: 'on_delivery' })])

    const result = await dispatchOrder(orderId)

    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/No courier is free/)
    assertDatabaseCount('delivery_routes', 0)
    assertDatabaseCount('delivery_stops', 0)
  })
})

describe('who gets the job', () => {
  test('the nearest free courier', async () => {
    // Nearest is the right heuristic for food, which does not improve while it
    // waits, and it is the one a courier can understand when they wonder why
    // they got the job.
    const { orderId } = seedDelivery()

    database.seed('couriers', [
      // ~11km away.
      factory.courier({ name: 'Far', latitude: 34.1195, longitude: -118.4912 }),
      // ~500m away.
      factory.courier({ name: 'Near', latitude: 34.0240, longitude: -118.4912 }),
      // ~5km away.
      factory.courier({ name: 'Middle', latitude: 34.0645, longitude: -118.4912 }),
    ])

    const result = await dispatchOrder(orderId)

    expect(result.ok).toBe(true)
    expect(result.courierName).toBe('Near')
  })

  test('a courier who is already carrying something is passed over', async () => {
    const { orderId } = seedDelivery()

    database.seed('couriers', [
      factory.courier({ name: 'Busy But Close', status: 'on_delivery', latitude: 34.0196, longitude: -118.4912 }),
      factory.courier({ name: 'Free But Far', latitude: 34.0645, longitude: -118.4912 }),
    ])

    const result = await dispatchOrder(orderId)

    expect(result.courierName).toBe('Free But Far')
  })

  test('one who has never pinged still gets work', async () => {
    // A courier with no position cannot be ranked, and dropping them would
    // mean a fleet that has just come on shift can take no orders at all.
    const { orderId } = seedDelivery()
    database.seed('couriers', [factory.courier({ name: 'Just Started', latitude: null, longitude: null })])

    const result = await dispatchOrder(orderId)

    expect(result.ok).toBe(true)
    expect(result.courierName).toBe('Just Started')
  })

  test('and is marked as carrying it afterwards', async () => {
    // Otherwise the same courier is the nearest free one for every order that
    // arrives in the next minute.
    const { orderId } = seedDelivery()
    const [courierId] = database.seed('couriers', [factory.courier()])

    await dispatchOrder(orderId)

    assertDatabaseHas('couriers', { id: courierId, status: 'on_delivery' })
  })
})

describe('the run itself', () => {
  test('is collect first, then hand over', async () => {
    // The sequence is what the tracking pipeline reads. Backwards, the courier
    // delivers before collecting.
    const { orderId } = seedDelivery()
    database.seed('couriers', [factory.courier()])

    const result = await dispatchOrder(orderId)

    const stops = database
      .connection()
      .query<{ sequence: number, type: string, address: string }, [number]>(
        'SELECT sequence, type, address FROM delivery_stops WHERE delivery_route_id = ? ORDER BY sequence',
      )
      .all(result.routeId!)

    expect(stops.map(stop => [stop.sequence, stop.type])).toEqual([[1, 'pickup'], [2, 'dropoff']])
    expect(stops[0]!.address).toContain('A Shop')
    expect(stops[1]!.address).toBe('99 Somewhere Ave')
  })

  test('starts planned, with both stops still to do', async () => {
    const { orderId } = seedDelivery()
    database.seed('couriers', [factory.courier()])

    const result = await dispatchOrder(orderId)

    assertDatabaseHas('delivery_routes', { id: result.routeId, status: 'planned', stops: 2 })
    assertDatabaseCount('delivery_stops', 2)
  })

  test('carries the courier onto the route', async () => {
    const { orderId } = seedDelivery()
    const [courierId] = database.seed('couriers', [factory.courier({ name: 'A Courier', vehicle_number: 'BIKE-9' })])

    const result = await dispatchOrder(orderId)

    assertDatabaseHas('delivery_routes', { id: result.routeId, courier_id: courierId, courier: 'A Courier', vehicle: 'BIKE-9' })
  })
})

describe('the money', () => {
  test('the courier\'s ledger rows stop being owed to nobody', async () => {
    // Written at placement under party id 0, because no courier had accepted
    // it yet. Left there, the delivery fee and the tip are owed to courier
    // number zero, who cannot be paid.
    const { orderId, businessId } = seedDelivery()
    const [courierId] = database.seed('couriers', [factory.courier()])

    for (const row of [
      { party_type: 'courier', party_id: 0, kind: 'delivery_fee', amount_cents: 400 },
      { party_type: 'courier', party_id: 0, kind: 'tip', amount_cents: 300 },
      { party_type: 'business', party_id: businessId, kind: 'order_revenue', amount_cents: 1000 },
    ]) {
      database.seed('ledger_entries', [{
        uuid: crypto.randomUUID(),
        order_id: orderId,
        currency: 'usd',
        description: '',
        external_reference: '',
        ...row,
      }])
    }

    await dispatchOrder(orderId)

    assertDatabaseHas('ledger_entries', { order_id: orderId, kind: 'delivery_fee', party_id: courierId })
    assertDatabaseHas('ledger_entries', { order_id: orderId, kind: 'tip', party_id: courierId })
  })

  test('and nobody else\'s rows are touched', async () => {
    // The update is scoped by party type. Without that it would reassign the
    // business's revenue to the courier as well.
    const { orderId, businessId } = seedDelivery()
    database.seed('couriers', [factory.courier()])

    database.seed('ledger_entries', [{
      uuid: crypto.randomUUID(),
      order_id: orderId,
      party_type: 'business',
      party_id: businessId,
      kind: 'order_revenue',
      amount_cents: 1000,
      currency: 'usd',
      description: '',
      external_reference: '',
    }])

    await dispatchOrder(orderId)

    assertDatabaseHas('ledger_entries', { order_id: orderId, party_type: 'business', party_id: businessId })
  })

  test('and no other order\'s rows either', async () => {
    const { orderId } = seedDelivery()
    const second = seedDelivery({ delivery_address: 'Another place' })
    database.seed('couriers', [factory.courier()])

    database.seed('ledger_entries', [{
      uuid: crypto.randomUUID(),
      order_id: second.orderId,
      party_type: 'courier',
      party_id: 0,
      kind: 'tip',
      amount_cents: 300,
      currency: 'usd',
      description: '',
      external_reference: '',
    }])

    await dispatchOrder(orderId)

    // Still waiting for its own courier.
    assertDatabaseHas('ledger_entries', { order_id: second.orderId, party_type: 'courier', party_id: 0 })
  })
})
