import { describe, expect, test } from 'bun:test'
import { courierCoverage, setCourierMarket } from '../../app/Actions/Admin/courier-coverage'
import { consoleFor, setShift } from '../../app/Actions/Courier/console'
import { dispatchReadyDeliveries, dispatchOrder, expireDeliveryOffer, respondToDeliveryOffer } from '../../app/Actions/Delivery/dispatch'
import { advanceOrder, boardFor } from '../../app/Actions/Merchant/board'
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

function defaultMarket(): number {
  const existing = database.connection().query<{ id: number }, []>('SELECT id FROM markets ORDER BY id LIMIT 1').get()
  return existing?.id ?? database.seed('markets', [factory.market()])[0]!
}

function marketCouriers(rows: Array<Record<string, unknown>>, marketId = defaultMarket()): number[] {
  const ids = database.seed('couriers', rows)
  database.seed('courier_markets', ids.map(courierId => ({ courier_id: courierId, market_id: marketId })))
  return ids
}

function seedDelivery(overrides: Record<string, unknown> = {}, marketId = defaultMarket()): { orderId: number, businessId: number } {
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
    marketCouriers([factory.courier()])

    expect((await dispatchOrder(orderId)).ok).toBe(true)

    const second = await dispatchOrder(orderId)

    expect(second.ok).toBe(false)
    expect(second.reason).toMatch(/already on a run/)
    assertDatabaseCount('delivery_routes', 1)
  })

  test('nothing happens when no courier is free', async () => {
    const { orderId } = seedDelivery()
    marketCouriers([factory.courier({ status: 'on_delivery' })])

    const result = await dispatchOrder(orderId)

    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/No courier is free/)
    assertDatabaseCount('delivery_routes', 0)
    assertDatabaseCount('delivery_stops', 0)
  })
})

function linkedCourier(overrides: Record<string, unknown> = {}, marketId = defaultMarket()): number {
  const [userId] = database.seed('users', [{
    uuid: crypto.randomUUID(),
    name: 'Platform courier',
    email: `${crypto.randomUUID()}@example.invalid`,
    password: 'unused',
  }])
  const [id] = marketCouriers([factory.courier({ user_id: userId, ...overrides })], marketId)
  return id!
}

describe('ready delivery offers', () => {
  test('offers the oldest ready platform delivery and creates both stops only on acceptance', async () => {
    seedDelivery({ status: 'PENDING' })
    const selfDelivery = seedDelivery({ status: 'SHIPPED' })
    database.connection().query('UPDATE businesses SET self_delivery = 1 WHERE id = ?').run(selfDelivery.businessId)
    seedDelivery({ status: 'SHIPPED', order_type: 'PICKUP' })
    const first = seedDelivery({ status: 'SHIPPED' })
    const second = seedDelivery({ status: 'SHIPPED' })
    marketCouriers([factory.courier()])

    await dispatchReadyDeliveries()
    assertDatabaseCount('delivery_offers', 0)

    const courierId = linkedCourier({ status: 'offline' })
    expect(await setShift(courierId, true)).toEqual({ ok: true, status: 'active' })

    const offer = (await consoleFor(courierId))!.offer!
    expect(offer).toEqual({ id: expect.any(Number), businessName: 'A Shop', pickupAddress: '1 Example St', expiresAt: expect.any(Number) })
    expect(offer.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000))
    assertDatabaseHas('delivery_offers', { id: offer.id, order_id: first.orderId, courier_id: courierId, status: 'pending' })
    assertDatabaseHas('jobs', { queue: 'delivery-offers', available_at: offer.expiresAt })
    assertDatabaseCount('delivery_routes', 0)
    assertDatabaseCount('delivery_stops', 0)

    await dispatchReadyDeliveries()
    assertDatabaseCount('delivery_offers', 1)
    expect(await respondToDeliveryOffer(offer.id, courierId + 1000, true)).toBeNull()

    const results = await Promise.all([
      respondToDeliveryOffer(offer.id, courierId, true),
      respondToDeliveryOffer(offer.id, courierId, true),
    ])
    expect(results.every(result => result?.ok)).toBe(true)
    assertDatabaseHas('delivery_offers', { id: offer.id, status: 'accepted' })
    assertDatabaseHas('delivery_stops', { order_id: first.orderId, sequence: 1, type: 'pickup' })
    assertDatabaseHas('delivery_stops', { order_id: first.orderId, sequence: 2, type: 'dropoff' })
    assertDatabaseCount('delivery_routes', 1)
    assertDatabaseCount('delivery_stops', 2)
    expect((await consoleFor(courierId))?.offer).toBeNull()

    database.connection().query("UPDATE couriers SET status = 'active' WHERE id = ?").run(courierId)
    await dispatchReadyDeliveries()
    assertDatabaseHas('delivery_offers', { order_id: second.orderId, courier_id: courierId, status: 'pending' })
  })

  test('decline and expiry pass the same order to the next closest courier', async () => {
    const { orderId } = seedDelivery({ status: 'PROCESSING' })
    const farthest = linkedCourier({ latitude: 34.1195, longitude: -118.4912 })
    const nearest = linkedCourier({ latitude: 34.0200, longitude: -118.4912 })
    const middle = linkedCourier({ latitude: 34.0645, longitude: -118.4912 })
    linkedCourier({ status: 'offline', latitude: 34.0196, longitude: -118.4912 })

    expect((await advanceOrder(orderId, 'SHIPPED')).ok).toBe(true)
    const first = (await consoleFor(nearest))!.offer!
    expect(first).not.toBeNull()
    await expireDeliveryOffer(first.id)
    assertDatabaseHas('delivery_offers', { id: first.id, status: 'pending' })

    expect(await respondToDeliveryOffer(first.id, nearest, false)).toEqual({ ok: true })
    assertDatabaseHas('delivery_offers', { id: first.id, status: 'declined' })
    const second = (await consoleFor(middle))!.offer!
    database.connection().query('UPDATE delivery_offers SET expires_at = 0 WHERE id = ?').run(second.id)

    expect((await consoleFor(middle))?.offer).toBeNull()
    await expireDeliveryOffer(second.id)
    await expireDeliveryOffer(second.id)
    expect((await respondToDeliveryOffer(second.id, middle, true))?.ok).toBe(false)

    assertDatabaseHas('delivery_offers', { id: second.id, status: 'expired' })
    assertDatabaseHas('delivery_offers', { order_id: orderId, courier_id: farthest, status: 'pending' })
    assertDatabaseCount('delivery_offers', 3)
    assertDatabaseCount('delivery_stops', 0)
  })

  test('going offline withdraws the offer and permits the next courier to accept it', async () => {
    const { orderId } = seedDelivery({ status: 'SHIPPED' })
    const first = linkedCourier({ latitude: null, longitude: null })
    const second = linkedCourier({ latitude: null, longitude: null })
    await dispatchReadyDeliveries()
    const firstOffer = (await consoleFor(first))!.offer!

    expect((await setShift(first, false)).status).toBe('offline')
    assertDatabaseHas('delivery_offers', { id: firstOffer.id, status: 'withdrawn' })
    expect((await respondToDeliveryOffer(firstOffer.id, first, true))?.ok).toBe(false)
    assertDatabaseHas('delivery_offers', { order_id: orderId, courier_id: second, status: 'pending' })
  })

  test('does not leave an order ready or an offer pending when its expiry job cannot be written', async () => {
    const { orderId } = seedDelivery({ status: 'PROCESSING' })
    linkedCourier()
    const db = database.connection()
    db.exec(`CREATE TRIGGER reject_expiry_job BEFORE INSERT ON jobs
      WHEN NEW.queue = 'delivery-offers'
      BEGIN SELECT RAISE(ABORT, 'Cannot write expiry job'); END`)
    try {
      await expect(advanceOrder(orderId, 'SHIPPED')).rejects.toThrow('Cannot write expiry job')
      assertDatabaseHas('orders', { id: orderId, status: 'PROCESSING' })
      assertDatabaseCount('delivery_offers', 0)
      assertDatabaseCount('jobs', 0)
    }
    finally {
      db.exec('DROP TRIGGER reject_expiry_job')
    }
  })
})

describe('market coverage', () => {
  test('offers and accepts in both markets even when the other courier is physically closer', async () => {
    const us = defaultMarket()
    const [de] = database.seed('markets', [factory.market({ name: 'Nordrhein-Westfalen', country_code: 'DE' })])
    const american = seedDelivery({ status: 'SHIPPED' }, us)
    const german = seedDelivery({ status: 'SHIPPED' }, de!)
    database.connection().query('UPDATE businesses SET latitude = 51.2562, longitude = 7.1508 WHERE id = ?').run(german.businessId)

    const americanCourier = linkedCourier({ latitude: 51.2562, longitude: 7.1508 }, us)
    const germanCourier = linkedCourier({ latitude: 34.0195, longitude: -118.4912 }, de!)

    await dispatchReadyDeliveries()

    assertDatabaseHas('delivery_offers', { order_id: american.orderId, courier_id: americanCourier, status: 'pending' })
    assertDatabaseHas('delivery_offers', { order_id: german.orderId, courier_id: germanCourier, status: 'pending' })
    for (const [courierId, delivery] of [[americanCourier, american], [germanCourier, german]] as const) {
      const offer = (await consoleFor(courierId))!.offer!
      expect((await respondToDeliveryOffer(offer.id, courierId, true))?.ok).toBe(true)
      assertDatabaseHas('delivery_stops', { order_id: delivery.orderId, type: 'dropoff' })
    }
  })

  test('an uncovered order stays visible and gets an offer when operations assigns coverage', async () => {
    const us = defaultMarket()
    const [de] = database.seed('markets', [factory.market({ name: 'Nordrhein-Westfalen', country_code: 'DE' })])
    const { orderId, businessId } = seedDelivery({ status: 'SHIPPED' }, de!)
    const courier = linkedCourier({}, us)
    const slug = database.connection().query<{ slug: string }, [number]>('SELECT slug FROM businesses WHERE id = ?').get(businessId)!.slug

    await dispatchReadyDeliveries()
    expect((await boardFor(slug))?.active[0]?.dispatchProgress).toBe('uncovered')
    assertDatabaseCount('delivery_offers', 0)
    expect((await courierCoverage()).markets.find(market => market.id === de)?.waiting).toBe(1)

    expect(await setCourierMarket(courier, de!, true)).toBe(true)
    expect((await boardFor(slug))?.active[0]?.dispatchProgress).toBe('offered')
    const offer = (await consoleFor(courier))!.offer!
    assertDatabaseHas('delivery_offers', { id: offer.id, order_id: orderId, courier_id: courier })

    expect(await setCourierMarket(courier, us, false)).toBe(true)
    expect((await consoleFor(courier))?.offer?.id).toBe(offer.id)

    expect(await setCourierMarket(courier, de!, false)).toBe(true)
    expect((await boardFor(slug))?.active[0]?.dispatchProgress).toBe('uncovered')
    expect((await respondToDeliveryOffer(offer.id, courier, true))?.ok).toBe(false)
    assertDatabaseHas('delivery_offers', { id: offer.id, status: 'withdrawn' })
    assertDatabaseCount('delivery_stops', 0)
  })

  test('courier payouts appear in their ledger currency after a second market is added', async () => {
    const us = defaultMarket()
    const [de] = database.seed('markets', [factory.market({ currency: 'eur' })])
    const courierId = linkedCourier({}, us)
    await setCourierMarket(courierId, de!, true)
    database.seed('ledger_entries', [
      { currency: 'usd', kind: 'delivery_fee', amount_cents: 400 },
      { currency: 'eur', kind: 'delivery_fee', amount_cents: 550 },
      { currency: 'eur', kind: 'tip', amount_cents: 250 },
    ].map(row => ({ ...row, uuid: crypto.randomUUID(), party_id: courierId, party_type: 'courier' })))

    expect((await consoleFor(courierId))?.earnings).toEqual({
      deliveries: 2,
      amounts: [
        { currency: 'eur', feeCents: 550, tipCents: 250 },
        { currency: 'usd', feeCents: 400, tipCents: 0 },
      ],
    })
  })

  test('an inactive pickup market cannot dispatch or accept an existing offer', async () => {
    const market = defaultMarket()
    const { orderId } = seedDelivery({ status: 'SHIPPED' }, market)
    const courier = linkedCourier({}, market)

    await dispatchReadyDeliveries()
    const offer = (await consoleFor(courier))!.offer!
    database.connection().query('UPDATE markets SET is_active = 0 WHERE id = ?').run(market)

    expect((await consoleFor(courier))?.offer).toBeNull()
    expect((await respondToDeliveryOffer(offer.id, courier, true))?.ok).toBe(false)
    expect(await setCourierMarket(courier, market, true)).toBe(false)
    assertDatabaseHas('delivery_offers', { id: offer.id, order_id: orderId, status: 'withdrawn' })
    assertDatabaseCount('delivery_stops', 0)
  })
})

describe('who gets the job', () => {
  test('the nearest free courier', async () => {
    // Nearest is the right heuristic for food, which does not improve while it
    // waits, and it is the one a courier can understand when they wonder why
    // they got the job.
    const { orderId } = seedDelivery()

    marketCouriers([
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

    marketCouriers([
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
    marketCouriers([factory.courier({ name: 'Just Started', latitude: null, longitude: null })])

    const result = await dispatchOrder(orderId)

    expect(result.ok).toBe(true)
    expect(result.courierName).toBe('Just Started')
  })

  test('and is marked as carrying it afterwards', async () => {
    // Otherwise the same courier is the nearest free one for every order that
    // arrives in the next minute.
    const { orderId } = seedDelivery()
    const [courierId] = marketCouriers([factory.courier()])

    await dispatchOrder(orderId)

    assertDatabaseHas('couriers', { id: courierId, status: 'on_delivery' })
  })
})

describe('the run itself', () => {
  test('is collect first, then hand over', async () => {
    // The sequence is what the tracking pipeline reads. Backwards, the courier
    // delivers before collecting.
    const { orderId } = seedDelivery()
    marketCouriers([factory.courier()])

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
    marketCouriers([factory.courier()])

    const result = await dispatchOrder(orderId)

    assertDatabaseHas('delivery_routes', { id: result.routeId, status: 'planned', stops: 2 })
    assertDatabaseCount('delivery_stops', 2)
  })

  test('carries the courier onto the route', async () => {
    const { orderId } = seedDelivery()
    const [courierId] = marketCouriers([factory.courier({ name: 'A Courier', vehicle_number: 'BIKE-9' })])

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
    const [courierId] = marketCouriers([factory.courier()])

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
    marketCouriers([factory.courier()])

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
    marketCouriers([factory.courier()])

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
