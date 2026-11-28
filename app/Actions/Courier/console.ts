import { db, sqliteWriteOptions } from '@stacksjs/database/runtime'
import type { CourierOffer } from '../Delivery/dispatch'
import { distanceInMeters } from '../Business/geo'
import { offerForCourier, offerReadyDeliveries, withdrawCourierOffer } from '../Delivery/dispatch'

/**
 * What a courier sees and does.
 *
 * The courier's screen is the one used one-handed, outdoors, on a phone that is
 * also the navigation. So it answers only what is true right now: whether they
 * are on shift, what they are carrying, where the next stop is, and what the
 * day has paid.
 *
 * Earnings are read from the ledger rather than recomputed, so the figure a
 * courier sees is the same figure the platform owes. Two implementations of
 * "what am I owed" is how a delivery company ends up in front of a tribunal.
 */

export interface CourierRun {
  routeId: number
  orderId: number
  stopId: number
  type: 'pickup' | 'dropoff'
  status: string
  address: string
  recipientName: string
  latitude: number | null
  longitude: number | null
  distanceMeters: number | null
  businessName: string
  etaAt: unknown
}

export interface CourierConsole {
  courier: {
    id: number
    name: string
    vehicle: string
    status: string
    latitude: number | null
    longitude: number | null
  }
  offer: CourierOffer | null
  /** The stop being served, or null when nothing is assigned. */
  current: CourierRun | null
  /** Everything else on the same run, in order. */
  remaining: CourierRun[]
  earnings: {
    deliveries: number
    amounts: Array<{ currency: string, feeCents: number, tipCents: number }>
  }
}

export async function consoleFor(courierId: number): Promise<CourierConsole | null> {
  const courier = await db.selectFrom('couriers')
    .where('id', '=', courierId)
    .selectAll()
    .executeTakeFirst() as Record<string, unknown> | undefined

  if (!courier)
    return null

  /*
   * `planned` counts, not just `active`.
   *
   * Dispatch creates a route as planned; it becomes active when the courier
   * actually sets off. Looking only for active routes meant a courier who had
   * just been given a job saw "nothing assigned" - the one screen where that is
   * exactly wrong, since the job is the reason they are looking.
   */
  const route = await db.selectFrom('delivery_routes')
    .where('courier_id', '=', courierId)
    .where('status', 'in', ['planned', 'active'])
    .orderBy('id', 'desc')
    .select(['id'])
    .executeTakeFirst() as { id: number } | undefined

  const stops = route
    ? await db.selectFrom('delivery_stops')
        .where('delivery_route_id', '=', Number(route.id))
        .orderBy('sequence', 'asc')
        .selectAll()
        .execute() as Array<Record<string, unknown>>
    : []

  const open = stops.filter(stop => !['completed', 'failed', 'skipped'].includes(String(stop.status)))
  const runs: CourierRun[] = []

  for (const stop of open) {
    const order = await db.selectFrom('orders')
      .where('id', '=', Number(stop.order_id))
      .select(['business_id'])
      .executeTakeFirst() as { business_id?: number } | undefined

    const business = order?.business_id
      ? await db.selectFrom('businesses').where('id', '=', Number(order.business_id)).select(['name']).executeTakeFirst() as { name?: string } | undefined
      : undefined

    const hasPosition = courier.latitude != null && stop.latitude != null

    runs.push({
      routeId: Number(route?.id ?? 0),
      orderId: Number(stop.order_id ?? 0),
      stopId: Number(stop.id),
      type: String(stop.type ?? 'dropoff') as 'pickup' | 'dropoff',
      status: String(stop.status),
      address: String(stop.address ?? ''),
      recipientName: String(stop.recipient_name ?? ''),
      latitude: stop.latitude == null ? null : Number(stop.latitude),
      longitude: stop.longitude == null ? null : Number(stop.longitude),
      distanceMeters: hasPosition
        ? Math.round(distanceInMeters(
            { latitude: Number(courier.latitude), longitude: Number(courier.longitude) },
            { latitude: Number(stop.latitude), longitude: Number(stop.longitude) },
          ))
        : null,
      businessName: String(business?.name ?? ''),
      etaAt: stop.eta_at ?? null,
    })
  }

  const currencies = await db.unsafe(`
    SELECT DISTINCT markets.currency
    FROM courier_markets
    JOIN markets ON markets.id = courier_markets.market_id
    WHERE courier_markets.courier_id = ?
  `, [courierId]).execute() as Array<{ currency: string }>
  const ledger = await db.selectFrom('ledger_entries')
    .where('party_type', '=', 'courier')
    .where('party_id', '=', courierId)
    .where('kind', 'in', ['delivery_fee', 'tip'])
    .select(['kind', 'amount_cents', 'currency'])
    .execute() as Array<{ kind: string, amount_cents: number, currency: string }>

  const amounts = new Map(currencies.map(({ currency }) => [currency, { currency, feeCents: 0, tipCents: 0 }]))
  let deliveries = 0

  for (const row of ledger) {
    const currency = row.currency.toLowerCase()
    const total = amounts.get(currency) ?? { currency, feeCents: 0, tipCents: 0 }

    if (row.kind === 'delivery_fee') {
      total.feeCents += row.amount_cents
      deliveries++
    }
    else {
      total.tipCents += row.amount_cents
    }

    amounts.set(currency, total)
  }

  return {
    courier: {
      id: courierId,
      name: String(courier.name),
      vehicle: String(courier.vehicle_number ?? ''),
      status: String(courier.status),
      latitude: courier.latitude == null ? null : Number(courier.latitude),
      longitude: courier.longitude == null ? null : Number(courier.longitude),
    },
    offer: runs.length ? null : await offerForCourier(courierId),
    current: runs[0] ?? null,
    remaining: runs.slice(1),
    earnings: {
      deliveries,
      amounts: [...amounts.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
    },
  }
}

/**
 * Go on or off shift.
 *
 * A courier already carrying something cannot go offline: the order in their
 * bag does not stop existing because they pressed a button, and letting it
 * happen leaves a customer watching a courier who is no longer coming.
 */
export async function setShift(courierId: number, online: boolean): Promise<{ ok: boolean, status?: string, reason?: string }> {
  return await db.transaction(async () => {
    const courier = await db.selectFrom('couriers')
      .where('id', '=', courierId)
      .select(['id', 'status'])
      .executeTakeFirst() as { id: number, status: string } | undefined

    if (!courier)
      return { ok: false, reason: 'No such courier.' }

    if (courier.status === 'on_delivery') {
      return online
        ? { ok: true, status: courier.status }
        : { ok: false, reason: 'Finish the delivery you are carrying first.' }
    }

    const status = online ? 'active' : 'offline'

    await db.updateTable('couriers')
      .set({ status } as never)
      .where('id', '=', courierId)
      .execute()

    const releasedOrderId = online ? undefined : await withdrawCourierOffer(courierId)
    await offerReadyDeliveries(releasedOrderId)

    return { ok: true, status }
  }, sqliteWriteOptions())
}

/** Every courier, for the demo's courier picker. */
export async function allCouriers(): Promise<Array<{ id: number, name: string, status: string }>> {
  const rows = await db.selectFrom('couriers')
    .orderBy('name', 'asc')
    .select(['id', 'name', 'status'])
    .execute() as Array<{ id: number, name: string, status: string }>

  return rows.map(row => ({ id: Number(row.id), name: String(row.name), status: String(row.status) }))
}
