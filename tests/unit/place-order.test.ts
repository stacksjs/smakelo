import { describe, expect, test } from 'bun:test'
import { placeOrder } from '../../app/Actions/Order/place'
import { assertDatabaseCount, assertDatabaseHas, factory, refreshDatabase } from '../support/database'

/**
 * Placing an order.
 *
 * The most consequential code here and, until now, the least covered: it
 * decides what somebody is charged and writes the rows that say who is owed
 * what. `pricing.test.ts` covers the arithmetic on values handed to it. This
 * covers the half that talks to the database - which prices it reads, which
 * orders it refuses, and what it leaves behind afterwards.
 *
 * The refusals are the security model, not error handling. A checkout that
 * takes a price from the request can be told zero, and every one of these
 * would otherwise be a way to pay less than the menu says: an item belonging
 * to another business, an option from another item's group, a required choice
 * skipped, an unavailable dish. None of them look like an attack in the
 * request - they look like ordinary orders, and each returns food for the
 * wrong money.
 *
 * The last group is the ledger, which is the part nobody sees until an audit.
 */

const database = refreshDatabase()

interface Fixture {
  businessId: number
  productId: number
  marketId: number
}

function seedMarket(overrides: Record<string, unknown> = {}): number {
  const [id] = database.seed('markets', [{
    name: 'Los Angeles',
    slug: `los-angeles-${Math.random().toString(36).slice(2, 8)}`,
    city: 'Los Angeles',
    country_code: 'US',
    currency: 'usd',
    tax_mode: 'exclusive',
    default_tax_rate: 0,
    timezone: 'America/Los_Angeles',
    locale: 'en',
    center_latitude: 34.0195,
    center_longitude: -118.4912,
    is_active: 1,
    ...overrides,
  }])

  return id
}

/** A partner that takes pickup orders, with one $10 dish on the menu. */
function seedShop(business: Record<string, unknown> = {}, product: Record<string, unknown> = {}): Fixture {
  const marketId = seedMarket()

  const [businessId] = database.seed('businesses', [factory.business({
    slug: 'a-shop',
    name: 'A Shop',
    is_partner: 1,
    offers_pickup: 1,
    offers_delivery: 0,
    offers_dine_in: 0,
    market_id: marketId,
    latitude: 34.0195,
    longitude: -118.4912,
    ...business,
  })])

  const [categoryId] = database.seed('categories', [{ name: 'Mains', slug: 'mains', display_order: 1, is_active: 1 }])

  const [productId] = database.seed('products', [factory.product({
    name: 'A Dish',
    price: 1000,
    business_id: businessId,
    category_id: categoryId,
    ...product,
  })])

  return { businessId, productId, marketId }
}

function order(overrides: Record<string, unknown> = {}, lines?: Array<Record<string, unknown>>): any {
  return {
    businessSlug: 'a-shop',
    fulfilment: 'pickup',
    lines: lines ?? [{ productId: 0, quantity: 1 }],
    ...overrides,
  }
}

describe('who may be ordered from', () => {
  test('a business nobody has heard of', async () => {
    const result = await placeOrder(order({ businessSlug: 'nowhere' }))

    expect(result.ok).toBe(false)
    expect((result as any).reason).toMatch(/not listed/)
  })

  test('a listing that has been taken down', async () => {
    // Curation that stops at the search page is not curation: a business
    // removed from search must not still be reachable by its slug.
    const { productId } = seedShop({ deleted_at: '2026-01-01 00:00:00' })
    const result = await placeOrder(order({}, [{ productId, quantity: 1 }]))

    expect(result.ok).toBe(false)
    expect((result as any).reason).toMatch(/not listed/)
  })

  test('a real business that never agreed to sell anything', async () => {
    // The listing half of the app is copied from open data. Nobody there has
    // agreed to take an order, and this is the last place that can be enforced
    // rather than assumed by a hidden button.
    const { productId } = seedShop({ is_partner: 0 })
    const result = await placeOrder(order({}, [{ productId, quantity: 1 }]))

    expect(result.ok).toBe(false)
    expect((result as any).reason).toMatch(/does not take orders/)
  })

  test('a way of getting the food they do not offer', async () => {
    const { productId } = seedShop({ offers_delivery: 0 })
    const result = await placeOrder(order({ fulfilment: 'delivery' }, [{ productId, quantity: 1 }]))

    expect(result.ok).toBe(false)
    expect((result as any).reason).toMatch(/does not offer delivery/)
  })

  test('an order with nothing in it', async () => {
    seedShop()
    const result = await placeOrder(order({}, []))

    expect(result.ok).toBe(false)
    expect((result as any).reason).toMatch(/at least one item/)
  })
})

describe('what may be ordered', () => {
  test('an item that is not on this menu', async () => {
    // Otherwise somebody orders a farm box at a coffee shop's prices. The
    // request names an id; nothing about that id says which business it is on
    // unless this checks.
    seedShop()
    const [otherBusinessId] = database.seed('businesses', [factory.business({ slug: 'elsewhere', is_partner: 1 })])
    const [theirProduct] = database.seed('products', [factory.product({ name: 'Theirs', price: 1, business_id: otherBusinessId })])

    const result = await placeOrder(order({}, [{ productId: theirProduct, quantity: 1 }]))

    expect(result.ok).toBe(false)
    expect((result as any).reason).toMatch(/different business/)
  })

  test('an item that does not exist', async () => {
    seedShop()
    const result = await placeOrder(order({}, [{ productId: 999_999, quantity: 1 }]))

    expect(result.ok).toBe(false)
    expect((result as any).reason).toMatch(/no longer on the menu/)
  })

  test('a dish the kitchen has run out of', async () => {
    const { productId } = seedShop({}, { is_available: 0 })
    const result = await placeOrder(order({}, [{ productId, quantity: 1 }]))

    expect(result.ok).toBe(false)
    expect((result as any).reason).toMatch(/not available right now/)
  })
})

describe('the options on an item', () => {
  function seedSized(overrides: Record<string, unknown> = {}): { productId: number, regular: number, large: number, groupId: number } {
    const { productId } = seedShop()
    const [groupId] = database.seed('modifier_groups', [{
      name: 'Size',
      min_selections: 1,
      max_selections: 1,
      product_id: productId,
      position: 1,
      ...overrides,
    }])

    const [regular, large] = database.seed('modifiers', [
      { name: 'Regular', price_delta_cents: 0, is_default: 1, is_available: 1, modifier_group_id: groupId, position: 1 },
      { name: 'Large', price_delta_cents: 500, is_default: 0, is_available: 1, modifier_group_id: groupId, position: 2 },
    ])

    return { productId, regular, large, groupId }
  }

  test('an option from another item is refused', async () => {
    // The ids are just numbers in a request. Without this an option belonging
    // to a cheap item can be attached to an expensive one, or a discount
    // option lifted from somewhere else entirely.
    const { productId } = seedSized()
    const [otherBusiness] = database.seed('businesses', [factory.business({ slug: 'somewhere-else', is_partner: 1 })])
    const [otherProduct] = database.seed('products', [factory.product({ name: 'Other', business_id: otherBusiness, price: 500 })])
    const [otherGroup] = database.seed('modifier_groups', [{ name: 'Elsewhere', min_selections: 0, max_selections: 1, product_id: otherProduct, position: 1 }])
    const [otherOption] = database.seed('modifiers', [{ name: 'Free', price_delta_cents: -500, is_default: 0, is_available: 1, modifier_group_id: otherGroup, position: 1 }])

    const result = await placeOrder(order({}, [{ productId, quantity: 1, modifierIds: [otherOption] }]))

    expect(result.ok).toBe(false)
    expect((result as any).reason).toMatch(/does not belong to that item/)
  })

  test('an option that is not available is refused', async () => {
    const { productId, groupId } = seedSized()
    const [soldOut] = database.seed('modifiers', [{ name: 'Truffle', price_delta_cents: 900, is_default: 0, is_available: 0, modifier_group_id: groupId, position: 3 }])

    const result = await placeOrder(order({}, [{ productId, quantity: 1, modifierIds: [soldOut] }]))

    expect(result.ok).toBe(false)
    expect((result as any).reason).toMatch(/not available/)
  })

  test('a required choice cannot be skipped', async () => {
    // The drawer enforces this while somebody is choosing. A request does not
    // come from the drawer.
    const { productId } = seedSized()

    const result = await placeOrder(order({}, [{ productId, quantity: 1, modifierIds: [] }]))

    expect(result.ok).toBe(false)
    expect((result as any).reason).toMatch(/needs a choice for "Size"/)
  })

  test('more choices than the group allows is refused', async () => {
    const { productId, regular, large } = seedSized()

    const result = await placeOrder(order({}, [{ productId, quantity: 1, modifierIds: [regular, large] }]))

    expect(result.ok).toBe(false)
    expect((result as any).reason).toMatch(/Too many choices for "Size"/)
  })

  test('a valid choice goes through and is charged for', async () => {
    const { productId, large } = seedSized()

    const result = await placeOrder(order({}, [{ productId, quantity: 1, modifierIds: [large] }]))

    expect(result.ok).toBe(true)
    // $10 dish, $5 option.
    expect((result as any).pricing.subtotalCents).toBe(1500)
  })
})

describe('where the price comes from', () => {
  test('the menu, never the request', async () => {
    // The whole security model of a checkout in one test. A client that can
    // name a price can name zero, and no validation elsewhere recovers from
    // trusting it.
    const { productId } = seedShop({}, { price: 1000 })

    const result = await placeOrder(order({}, [
      { productId, quantity: 1, price: 1, unitPriceCents: 1, priceCents: 1, total: 1 } as any,
    ]))

    expect(result.ok).toBe(true)
    expect((result as any).pricing.subtotalCents).toBe(1000)
  })

  test('a quantity is clamped to something a kitchen could cook', async () => {
    const { productId } = seedShop()

    const many = await placeOrder(order({}, [{ productId, quantity: 10_000 }]))
    expect((many as any).pricing.subtotalCents).toBe(50 * 1000)

    const none = await placeOrder(order({}, [{ productId, quantity: 0 }]))
    expect((none as any).pricing.subtotalCents).toBe(1000)

    const negative = await placeOrder(order({}, [{ productId, quantity: -5 }]))
    expect((negative as any).pricing.subtotalCents).toBe(1000)
  })
})

describe('delivery', () => {
  test('further than they will go is refused', async () => {
    const { productId } = seedShop({
      offers_delivery: 1,
      delivery_radius_meters: 2000,
      latitude: 34.0195,
      longitude: -118.4912,
    })

    const result = await placeOrder(order({
      fulfilment: 'delivery',
      deliveryAddress: 'Far away',
      // ~11km north.
      deliveryLatitude: 34.1195,
      deliveryLongitude: -118.4912,
    }, [{ productId, quantity: 1 }]))

    expect(result.ok).toBe(false)
    expect((result as any).reason).toMatch(/does not deliver that far/)
  })

  test('within range is accepted', async () => {
    const { productId } = seedShop({ offers_delivery: 1, delivery_radius_meters: 8000 })

    const result = await placeOrder(order({
      fulfilment: 'delivery',
      deliveryAddress: 'Nearby',
      deliveryLatitude: 34.0245,
      deliveryLongitude: -118.4912,
    }, [{ productId, quantity: 1 }]))

    expect(result.ok).toBe(true)
  })

  test('under the minimum order is refused', async () => {
    const { productId } = seedShop({
      offers_delivery: 1,
      delivery_radius_meters: 8000,
      minimum_order_cents: 2500,
    })

    const result = await placeOrder(order({
      fulfilment: 'delivery',
      deliveryLatitude: 34.0245,
      deliveryLongitude: -118.4912,
    }, [{ productId, quantity: 1 }]))

    expect(result.ok).toBe(false)
    expect((result as any).reason).toMatch(/starts at \$25\.00/)
  })
})

describe('what an accepted order leaves behind', () => {
  test('the order itself, with what was actually charged', async () => {
    const { productId } = seedShop()

    const result = await placeOrder(order({ notes: 'Ring the bell' }, [{ productId, quantity: 2 }])) as any

    expect(result.ok).toBe(true)
    assertDatabaseCount('orders', 1)
    assertDatabaseHas('orders', {
      status: 'PENDING',
      order_type: 'PICKUP',
      subtotal_cents: 2000,
      total_amount: result.pricing.totalCents,
      tracking_token: result.trackingToken,
      special_instructions: 'Ring the bell',
    })
  })

  test('a line per item, priced with its options folded in', async () => {
    const { productId } = seedShop()
    const [groupId] = database.seed('modifier_groups', [{ name: 'Extras', min_selections: 0, max_selections: 2, product_id: productId, position: 1 }])
    const [olives] = database.seed('modifiers', [{ name: 'Olives', price_delta_cents: 150, is_default: 0, is_available: 1, modifier_group_id: groupId, position: 1 }])

    await placeOrder(order({}, [{ productId, quantity: 2, modifierIds: [olives], notes: 'No ice' }]))

    // The unit price carries the option, and the quantity stays separate.
    assertDatabaseHas('order_items', { product_id: productId, quantity: 2, price: 1150, special_instructions: 'No ice' })
  })

  test('the options copied onto the line, not referenced', async () => {
    // The menu changes: guacamole goes up, an option is renamed, a group is
    // deleted. None of that may retroactively rewrite what somebody was
    // charged, so the name and the price are copied at the moment of ordering.
    const { productId } = seedShop()
    const [groupId] = database.seed('modifier_groups', [{ name: 'Extras', min_selections: 0, max_selections: 2, product_id: productId, position: 1 }])
    const [olives] = database.seed('modifiers', [{ name: 'Olives', price_delta_cents: 150, is_default: 0, is_available: 1, modifier_group_id: groupId, position: 1 }])

    await placeOrder(order({}, [{ productId, quantity: 1, modifierIds: [olives] }]))

    assertDatabaseHas('order_item_modifiers', {
      modifier_id: olives,
      group_name: 'Extras',
      name: 'Olives',
      price_delta_cents: 150,
      quantity: 1,
    })
  })

  test('a tracking token that finds the order again', async () => {
    const { productId } = seedShop()

    const result = await placeOrder(order({}, [{ productId, quantity: 1 }])) as any

    expect(result.trackingToken).toMatch(/^[0-9a-f]{24}$/)
    assertDatabaseHas('orders', { id: result.orderId, tracking_token: result.trackingToken })
  })

  test('nothing at all when the order is refused', async () => {
    // A refusal that half-writes an order leaves a kitchen with a ticket for
    // food nobody is paying for.
    const { productId } = seedShop({ is_partner: 0 })

    await placeOrder(order({}, [{ productId, quantity: 1 }]))

    assertDatabaseCount('orders', 0)
    assertDatabaseCount('order_items', 0)
    assertDatabaseCount('ledger_entries', 0)
  })
})

describe('the ledger', () => {
  test('describes every cent the customer was charged', async () => {
    // The invariant. Ledger rows once summed to less than the total, and the
    // difference had no owner - the exact shape of an accounting error nobody
    // notices until an audit.
    const { productId } = seedShop({ offers_delivery: 1, delivery_radius_meters: 8000, market_id: seedMarket({ default_tax_rate: 9.5 }) })

    const result = await placeOrder(order({
      fulfilment: 'delivery',
      deliveryLatitude: 34.0245,
      deliveryLongitude: -118.4912,
      tipCents: 300,
    }, [{ productId, quantity: 2 }])) as any

    expect(result.ok).toBe(true)

    const rows = database
      .connection()
      .query<{ amount_cents: number }, [number]>('SELECT amount_cents FROM ledger_entries WHERE order_id = ?')
      .all(result.orderId)

    const ledgered = rows.reduce((sum, row) => sum + row.amount_cents, 0)

    expect(ledgered).toBe(result.pricing.totalCents)
  })

  test('names who is owed what', async () => {
    const { productId } = seedShop({ offers_delivery: 1, delivery_radius_meters: 8000 })

    const result = await placeOrder(order({
      fulfilment: 'delivery',
      deliveryLatitude: 34.0245,
      deliveryLongitude: -118.4912,
      tipCents: 300,
    }, [{ productId, quantity: 1 }])) as any

    assertDatabaseHas('ledger_entries', { order_id: result.orderId, party_type: 'business', kind: 'order_revenue', amount_cents: 1000 })
    assertDatabaseHas('ledger_entries', { order_id: result.orderId, party_type: 'platform', kind: 'service_fee' })
    // The courier is not known yet, so their rows wait under party id 0.
    assertDatabaseHas('ledger_entries', { order_id: result.orderId, party_type: 'courier', kind: 'tip', party_id: 0, amount_cents: 300 })
  })

  test('holds the tax rather than giving it to anybody', async () => {
    // California makes the marketplace the facilitator: the platform collects
    // it and remits it, so it is on the ledger and owned by nobody.
    //
    // 110 rather than 100 because tax is charged on the fees a customer pays
    // to receive the food as well as on the food - $10 of dish plus the $1
    // service fee, at 10%. Not on the tip, which is a gift rather than a
    // purchase.
    const { productId } = seedShop({ market_id: seedMarket({ default_tax_rate: 10 }) })

    const result = await placeOrder(order({ tipCents: 500 }, [{ productId, quantity: 1 }])) as any

    expect(result.pricing.taxCents).toBe(110)
    assertDatabaseHas('ledger_entries', { order_id: result.orderId, party_type: 'tax', kind: 'tax_collected', amount_cents: 110 })
  })

  test('carves the tax out of the merchant on an inclusive market', async () => {
    // In Germany the tax is already inside the menu price, so adding a
    // tax_collected row without taking it back off the business would pay the
    // merchant money the tax office is owed.
    const { productId } = seedShop({
      market_id: seedMarket({ currency: 'eur', tax_mode: 'inclusive', default_tax_rate: 19 }),
    })

    const result = await placeOrder(order({}, [{ productId, quantity: 1 }])) as any

    assertDatabaseHas('ledger_entries', { order_id: result.orderId, party_type: 'business', kind: 'tax_withheld' })

    const withheld = database
      .connection()
      .query<{ amount_cents: number }, [number]>("SELECT amount_cents FROM ledger_entries WHERE order_id = ? AND kind = 'tax_withheld'")
      .get(result.orderId)

    expect(withheld!.amount_cents).toBeLessThan(0)
  })

  test('is written in the market\'s own currency', async () => {
    const { productId } = seedShop({ market_id: seedMarket({ currency: 'eur' }) })

    const result = await placeOrder(order({}, [{ productId, quantity: 1 }])) as any

    assertDatabaseHas('ledger_entries', { order_id: result.orderId, party_type: 'business', currency: 'eur' })
  })
})
