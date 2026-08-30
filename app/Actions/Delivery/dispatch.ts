import { db } from '@stacksjs/database'
import { distanceInMeters } from '../Business/geo'

/**
 * Getting an order onto a courier.
 *
 * A delivery is two stops, not one: collect from the merchant, then hand over
 * to the customer. Both are created together at dispatch, in that order, so the
 * run reads correctly from the moment it exists and the order's status follows
 * the pickup rather than jumping straight to out-for-delivery.
 *
 * The offer goes to the nearest courier who is free. Nearest is the right
 * heuristic for food, which does not improve while it waits, and it is the one
 * a courier can also understand when they wonder why they got the job.
 */

export interface DispatchResult {
  ok: boolean
  reason?: string
  routeId?: number
  courierId?: number
  courierName?: string
}

export async function dispatchOrder(orderId: number): Promise<DispatchResult> {
  const order = await db.selectFrom('orders')
    .where('id', '=', orderId)
    .selectAll()
    .executeTakeFirst() as Record<string, unknown> | undefined

  if (!order)
    return { ok: false, reason: 'No such order.' }

  if (String(order.order_type) !== 'DELIVERY')
    return { ok: false, reason: 'That order is not a delivery.' }

  const existing = await db.selectFrom('delivery_stops')
    .where('order_id', '=', orderId)
    .select(['id'])
    .executeTakeFirst() as { id: number } | undefined

  // Dispatching twice would put one order on two runs and pay two couriers.
  if (existing)
    return { ok: false, reason: 'That order is already on a run.' }

  const business = await db.selectFrom('businesses')
    .where('id', '=', Number(order.business_id))
    .selectAll()
    .executeTakeFirst() as Record<string, unknown> | undefined

  if (!business)
    return { ok: false, reason: 'That order has no business.' }

  const courier = await nearestAvailableCourier(
    Number(business.latitude),
    Number(business.longitude),
  )

  if (!courier)
    return { ok: false, reason: 'No courier is free right now.' }

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

/**
 * The closest courier who is not already carrying something.
 *
 * Distance is computed in code rather than SQL for the same reason the business
 * search does it: SQLite has no trigonometry to rely on, and the candidate set
 * here is a handful of rows.
 */
async function nearestAvailableCourier(latitude: number, longitude: number): Promise<Record<string, unknown> | null> {
  const couriers = await db.selectFrom('couriers')
    .where('status', '=', 'active')
    .selectAll()
    .execute() as Array<Record<string, unknown>>

  const positioned = couriers.filter(courier => courier.latitude != null && courier.longitude != null)

  // A courier who has never pinged has no position, and guessing one would send
  // the job to whoever happened to be first in the table.
  if (positioned.length === 0)
    return couriers[0] ?? null

  return positioned
    .map(courier => ({
      courier,
      distance: distanceInMeters(
        { latitude, longitude },
        { latitude: Number(courier.latitude), longitude: Number(courier.longitude) },
      ),
    }))
    .sort((a, b) => a.distance - b.distance)[0]?.courier ?? null
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
