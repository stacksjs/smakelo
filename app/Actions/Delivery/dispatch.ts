import { db, sqliteWriteOptions } from '@stacksjs/database/runtime'
import { storeJob } from '@stacksjs/queue/utils'
import { distanceInMeters } from '../Business/geo'

const OFFER_DURATION_SECONDS = 60

interface DeliveryOfferRow {
  id: number
  order_id: number
  courier_id: number
  status: string
  expires_at: number
}

export interface CourierOffer {
  id: number
  businessName: string
  pickupAddress: string
  expiresAt: number
}

export interface DispatchResult {
  ok: boolean
  reason?: string
  routeId?: number
  courierId?: number
  courierName?: string
}

/** Assign historical runs for demo seeding and simulation. */
export async function dispatchOrder(orderId: number): Promise<DispatchResult> {
  return await db.transaction(async () => {
    const order = await db.selectFrom('orders').where('id', '=', orderId).selectAll().executeTakeFirst()
    if (!order)
      return { ok: false, reason: 'No such order.' }

    if (order.order_type !== 'DELIVERY')
      return { ok: false, reason: 'That order is not a delivery.' }

    const existing = await db.selectFrom('delivery_stops')
      .where('order_id', '=', orderId)
      .select('id')
      .executeTakeFirst()

    if (existing)
      return { ok: false, reason: 'That order is already on a run.' }

    const business = await db.selectFrom('businesses')
      .where('id', '=', Number(order.business_id))
      .selectAll()
      .executeTakeFirst()

    if (!business)
      return { ok: false, reason: 'That order has no business.' }

    if (Number(business.self_delivery) === 1)
      return { ok: false, reason: 'That business handles its own deliveries.' }

    const couriers = await db.unsafe(`
      SELECT couriers.*
      FROM couriers
      JOIN courier_markets ON courier_markets.courier_id = couriers.id
      JOIN markets ON markets.id = courier_markets.market_id AND markets.is_active = 1
      WHERE courier_markets.market_id = ? AND couriers.status = 'active'
      ORDER BY couriers.id
    `, [business.market_id]).execute() as Array<Record<string, unknown>>
    const courier = nearestCourier(business, couriers)
    return courier
      ? await createRoute(order, business, courier)
      : { ok: false, reason: 'No courier is free right now.' }
  }, sqliteWriteOptions())
}

function unixSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

/** Run inside the transaction that made an order or courier available. */
export async function offerReadyDeliveries(firstOrderId?: number): Promise<void> {
  const orders = await db.unsafe(`
    SELECT orders.id, businesses.market_id, businesses.latitude, businesses.longitude
    FROM orders
    JOIN businesses ON businesses.id = orders.business_id
    JOIN markets ON markets.id = businesses.market_id AND markets.is_active = 1
    WHERE orders.order_type = 'DELIVERY'
      AND orders.status = 'SHIPPED'
      AND businesses.self_delivery = 0
      AND NOT EXISTS (
        SELECT 1 FROM delivery_stops WHERE delivery_stops.order_id = orders.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM delivery_offers
        WHERE delivery_offers.order_id = orders.id AND delivery_offers.status = 'pending'
      )
    ORDER BY CASE WHEN orders.id = ? THEN 0 ELSE 1 END, orders.id
  `, [firstOrderId ?? null]).execute() as Array<{ id: number, market_id: number, latitude: number | null, longitude: number | null }>

  for (const order of orders) {
    const couriers = await db.unsafe(`
      SELECT couriers.id, couriers.latitude, couriers.longitude
      FROM couriers
      JOIN courier_markets ON courier_markets.courier_id = couriers.id
      WHERE courier_markets.market_id = ?
        AND couriers.status = 'active'
        AND couriers.user_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM delivery_offers
          WHERE delivery_offers.courier_id = couriers.id
            AND (delivery_offers.order_id = ? OR delivery_offers.status = 'pending')
        )
      ORDER BY couriers.id
    `, [order.market_id, order.id]).execute() as Array<{ id: number, latitude: number | null, longitude: number | null }>

    const courier = nearestCourier(order, couriers)
    if (!courier)
      continue

    const expiresAt = unixSeconds() + OFFER_DURATION_SECONDS
    const offer = await db.insertInto('delivery_offers').values({
      uuid: crypto.randomUUID(),
      order_id: order.id,
      courier_id: courier.id,
      status: 'pending',
      expires_at: expiresAt,
    }).returning('id').executeTakeFirstOrThrow()

    await storeJob('ExpireDeliveryOffer', {
      queue: 'delivery-offers',
      payload: { offerId: offer.id },
      delay: expiresAt - unixSeconds(),
      maxTries: 5,
      backoff: [2, 5, 10, 30],
    })
  }
}

export async function dispatchReadyDeliveries(): Promise<void> {
  await db.transaction(() => offerReadyDeliveries(), sqliteWriteOptions())
}

export async function offerForCourier(courierId: number): Promise<CourierOffer | null> {
  const [offer] = await db.unsafe(`
    SELECT delivery_offers.id, businesses.name, businesses.address, delivery_offers.expires_at
    FROM delivery_offers
    JOIN orders ON orders.id = delivery_offers.order_id
    JOIN businesses ON businesses.id = orders.business_id
    JOIN couriers ON couriers.id = delivery_offers.courier_id
    JOIN markets ON markets.id = businesses.market_id AND markets.is_active = 1
    JOIN courier_markets ON courier_markets.courier_id = couriers.id
      AND courier_markets.market_id = markets.id
    WHERE delivery_offers.courier_id = ?
      AND delivery_offers.status = 'pending'
      AND delivery_offers.expires_at > ?
      AND couriers.status = 'active'
      AND couriers.user_id IS NOT NULL
      AND orders.status = 'SHIPPED'
      AND businesses.self_delivery = 0
  `, [courierId, unixSeconds()]).execute() as Array<{ id: number, name: string, address: string, expires_at: number }>

  return offer
    ? { id: offer.id, businessName: offer.name, pickupAddress: offer.address, expiresAt: offer.expires_at }
    : null
}

async function closeOffer(offer: DeliveryOfferRow, status: 'accepted' | 'declined' | 'expired' | 'withdrawn'): Promise<void> {
  await db.updateTable('delivery_offers')
    .set({ status, updated_at: new Date().toISOString() })
    .where('id', '=', offer.id)
    .execute()
}

/** Run inside the transaction that took the courier off shift or out of a market. */
export async function withdrawCourierOffer(courierId: number, marketId?: number): Promise<number | undefined> {
  const query = db.selectFrom('delivery_offers')
    .where('courier_id', '=', courierId)
    .where('status', '=', 'pending')
    .selectAll()
  const offer = await query.executeTakeFirst() as DeliveryOfferRow | undefined

  if (!offer)
    return

  if (marketId !== undefined) {
    const [pickup] = await db.unsafe(`
      SELECT businesses.market_id
      FROM orders
      JOIN businesses ON businesses.id = orders.business_id
      WHERE orders.id = ?
    `, [offer.order_id]).execute() as Array<{ market_id: number }>

    if (pickup?.market_id !== marketId)
      return
  }

  await closeOffer(offer, offer.expires_at <= unixSeconds() ? 'expired' : 'withdrawn')
  return offer.order_id
}

export async function expireDeliveryOffer(offerId: number): Promise<void> {
  await db.transaction(async () => {
    const offer = await db.selectFrom('delivery_offers')
      .where('id', '=', offerId)
      .where('status', '=', 'pending')
      .where('expires_at', '<=', unixSeconds())
      .selectAll()
      .executeTakeFirst() as DeliveryOfferRow | undefined

    if (offer) {
      await closeOffer(offer, 'expired')
      await offerReadyDeliveries(offer.order_id)
    }
  }, sqliteWriteOptions())
}

export async function respondToDeliveryOffer(offerId: number, courierId: number, accept: boolean): Promise<DispatchResult | null> {
  return await db.transaction(async () => {
    const offer = await db.selectFrom('delivery_offers')
      .where('id', '=', offerId)
      .where('courier_id', '=', courierId)
      .selectAll()
      .executeTakeFirst() as DeliveryOfferRow | undefined

    if (!offer)
      return null

    if (offer.status === 'accepted' && accept)
      return { ok: true }

    if (offer.status === 'declined' && !accept)
      return { ok: true }

    const unavailable = { ok: false, reason: 'This delivery offer is no longer available.' }

    if (offer.status !== 'pending')
      return unavailable

    if (offer.expires_at <= unixSeconds()) {
      await closeOffer(offer, 'expired')
      await offerReadyDeliveries(offer.order_id)
      return unavailable
    }

    if (!accept) {
      await closeOffer(offer, 'declined')
      await offerReadyDeliveries(offer.order_id)
      return { ok: true }
    }

    const order = await db.selectFrom('orders')
      .where('id', '=', offer.order_id)
      .where('order_type', '=', 'DELIVERY')
      .where('status', '=', 'SHIPPED')
      .selectAll()
      .executeTakeFirst()
    const business = order && await db.selectFrom('businesses')
      .where('id', '=', Number(order.business_id))
      .where('self_delivery', '=', 0)
      .selectAll()
      .executeTakeFirst()
    const couriers = business && await db.unsafe(`
      SELECT couriers.*
      FROM couriers
      JOIN courier_markets ON courier_markets.courier_id = couriers.id
      JOIN markets ON markets.id = courier_markets.market_id AND markets.is_active = 1
      WHERE couriers.id = ? AND courier_markets.market_id = ?
        AND couriers.status = 'active' AND couriers.user_id IS NOT NULL
    `, [courierId, business.market_id]).execute() as Array<Record<string, unknown>> | undefined
    const courier = couriers?.[0]
    const existingStop = await db.selectFrom('delivery_stops')
      .where('order_id', '=', offer.order_id)
      .select('id')
      .executeTakeFirst()

    if (!order || !business || !courier || existingStop) {
      await closeOffer(offer, 'withdrawn')
      await offerReadyDeliveries(offer.order_id)
      return unavailable
    }

    const result = await createRoute(order, business, courier)
    await closeOffer(offer, 'accepted')
    await offerReadyDeliveries()
    return result
  }, sqliteWriteOptions())
}

export type DispatchProgress = 'assigned' | 'offered' | 'waiting' | 'uncovered'

export async function dispatchProgressFor(businessId: number): Promise<Array<{ id: number, progress: DispatchProgress }>> {
  return await db.unsafe(`
    SELECT orders.id,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM delivery_stops WHERE delivery_stops.order_id = orders.id
        ) THEN 'assigned'
        WHEN EXISTS (
          SELECT 1 FROM delivery_offers
          JOIN courier_markets ON courier_markets.courier_id = delivery_offers.courier_id
            AND courier_markets.market_id = businesses.market_id
          JOIN couriers ON couriers.id = courier_markets.courier_id
          WHERE delivery_offers.order_id = orders.id AND delivery_offers.status = 'pending'
            AND delivery_offers.expires_at > ? AND couriers.status = 'active'
            AND couriers.user_id IS NOT NULL AND markets.is_active = 1
        ) THEN 'offered'
        WHEN EXISTS (
          SELECT 1 FROM courier_markets
          JOIN couriers ON couriers.id = courier_markets.courier_id
          WHERE courier_markets.market_id = businesses.market_id AND markets.is_active = 1
            AND couriers.user_id IS NOT NULL AND NOT EXISTS (
              SELECT 1 FROM delivery_offers
              WHERE delivery_offers.order_id = orders.id AND delivery_offers.courier_id = couriers.id
            )
        ) THEN 'waiting'
        ELSE 'uncovered'
      END AS progress
    FROM orders
    JOIN businesses ON businesses.id = orders.business_id
    LEFT JOIN markets ON markets.id = businesses.market_id
    WHERE businesses.id = ? AND businesses.self_delivery = 0
      AND orders.order_type = 'DELIVERY' AND orders.status = 'SHIPPED'
  `, [unixSeconds(), businessId]).execute() as Array<{ id: number, progress: DispatchProgress }>
}

async function createRoute(
  order: Record<string, unknown>,
  business: Record<string, unknown>,
  courier: Record<string, unknown>,
): Promise<DispatchResult> {
  const orderId = Number(order.id)
  const routeUuid = crypto.randomUUID()

  await db.insertInto('delivery_routes').values({
    uuid: routeUuid,
    courier_id: Number(courier.id),
    courier: String(courier.name),
    vehicle: String(courier.vehicle_number ?? ''),
    stops: 2,
    delivery_time: 0,
    total_distance: 0,
    last_active: 0,
    status: 'planned',
  } as never).executeTakeFirst()

  const route = await db.selectFrom('delivery_routes')
    .where('uuid', '=', routeUuid)
    .select(['id'])
    .executeTakeFirst() as { id: number }

  const routeId = Number(route.id)

  // Pickup first. The sequence is what the tracking pipeline reads to decide
  // which stop is being served, so getting it backwards would have the courier
  // delivering before collecting.
  await createStop({
    routeId,
    orderId,
    sequence: 1,
    type: 'pickup',
    address: `${business.name}, ${business.address}`,
    latitude: Number(business.latitude),
    longitude: Number(business.longitude),
    recipientName: String(business.name),
  })

  await createStop({
    routeId,
    orderId,
    sequence: 2,
    type: 'dropoff',
    address: String(order.delivery_address ?? ''),
    latitude: order.delivery_latitude == null ? null : Number(order.delivery_latitude),
    longitude: order.delivery_longitude == null ? null : Number(order.delivery_longitude),
    recipientName: 'Customer',
  })

  await db.updateTable('couriers')
    .set({ status: 'on_delivery' } as never)
    .where('id', '=', Number(courier.id))
    .execute()

  // The courier's ledger rows were written when the order was placed, with
  // party id 0 because nobody had accepted it yet. Now they have a name.
  await db.updateTable('ledger_entries')
    .set({ party_id: Number(courier.id) } as never)
    .where('order_id', '=', orderId)
    .where('party_type', '=', 'courier')
    .execute()

  return { ok: true, routeId, courierId: Number(courier.id), courierName: String(courier.name) }
}

function nearestCourier<T extends { latitude?: unknown, longitude?: unknown }>(
  pickup: { latitude?: unknown, longitude?: unknown },
  couriers: T[],
): T | undefined {
  if (pickup.latitude == null || pickup.longitude == null)
    return couriers[0]

  const origin = { latitude: Number(pickup.latitude), longitude: Number(pickup.longitude) }

  return couriers
    .filter(courier => courier.latitude != null && courier.longitude != null)
    .map(courier => ({
      courier,
      distance: distanceInMeters(origin, { latitude: Number(courier.latitude), longitude: Number(courier.longitude) }),
    }))
    .sort((a, b) => a.distance - b.distance)[0]?.courier ?? couriers[0]
}

async function createStop(input: {
  routeId: number
  orderId: number
  sequence: number
  type: 'pickup' | 'dropoff'
  address: string
  latitude: number | null
  longitude: number | null
  recipientName: string
}): Promise<void> {
  await db.insertInto('delivery_stops').values({
    uuid: crypto.randomUUID(),
    delivery_route_id: input.routeId,
    order_id: input.orderId,
    sequence: input.sequence,
    status: 'pending',
    type: input.type,
    address: input.address,
    latitude: input.latitude,
    longitude: input.longitude,
    recipient_name: input.recipientName,
    recipient_phone: '',
  } as never).executeTakeFirst()
}
