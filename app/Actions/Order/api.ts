import type { PlaceOrderInput } from './place'
import { db } from '@stacksjs/database'
import { placeOrder, previewOrder } from './place'
import { visualFor } from '../Business/identity'
import { customerIdsForBuyer } from '../Visitor/identity'

/**
 * The order endpoints' thin layer: read an untrusted body, hand something
 * typed to the code that does the work.
 *
 * Nothing here decides a price or a rule. It exists so the route file stays a
 * list of routes and the parsing of a JSON body lives somewhere it can be read.
 */

const FULFILMENTS = new Set(['delivery', 'pickup', 'dine_in'])

function readInput(body: any): PlaceOrderInput | { reason: string } {
  const businessSlug = String(body?.businessSlug ?? '').trim()

  if (!businessSlug)
    return { reason: 'An order needs a business.' }

  const fulfilment = String(body?.fulfilment ?? 'pickup')

  if (!FULFILMENTS.has(fulfilment))
    return { reason: 'Fulfilment must be delivery, pickup or dine_in.' }

  const rawLines = Array.isArray(body?.lines) ? body.lines : []

  if (rawLines.length === 0)
    return { reason: 'An order needs at least one item.' }

  const lines = (rawLines as any[]).map((line: any) => ({
    productId: Number(line?.productId),
    quantity: Number(line?.quantity ?? 1),
    modifierIds: Array.isArray(line?.modifierIds) ? line.modifierIds.map(Number).filter(Number.isFinite) : [],
    notes: typeof line?.notes === 'string' ? line.notes.slice(0, 300) : '',
  }))

  if (lines.some(line => !Number.isFinite(line.productId)))
    return { reason: 'One of those items is not a real item.' }

  const latitude = body?.deliveryLatitude == null ? NaN : Number(body.deliveryLatitude)
  const longitude = body?.deliveryLongitude == null ? NaN : Number(body.deliveryLongitude)
  const hasCoordinates = fulfilment === 'delivery'
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 && (latitude !== 0 || longitude !== 0)

  return {
    businessSlug,
    fulfilment: fulfilment as 'delivery' | 'pickup' | 'dine_in',
    lines,
    customerName: typeof body?.customerName === 'string' ? body.customerName.slice(0, 120) : '',
    customerEmail: typeof body?.customerEmail === 'string' ? body.customerEmail.slice(0, 160) : '',
    deliveryAddress: typeof body?.deliveryAddress === 'string' ? body.deliveryAddress.slice(0, 255) : '',
    deliveryLatitude: hasCoordinates ? latitude : undefined,
    deliveryLongitude: hasCoordinates ? longitude : undefined,
    // Tips are clamped rather than trusted. A negative tip would take money out
    // of the courier's share.
    tipCents: Math.max(0, Math.min(50_000, Math.round(Number(body?.tipCents ?? 0)) || 0)),
    scheduledFor: typeof body?.scheduledFor === 'string' ? body.scheduledFor : null,
    tableCode: typeof body?.tableCode === 'string' ? body.tableCode.slice(0, 100) : '',
    tabId: Number.isFinite(Number(body?.tabId)) ? Number(body.tabId) : null,
    notes: typeof body?.notes === 'string' ? body.notes.slice(0, 500) : '',
    // Passed by the route from the `x-visitor` header rather than read from the
    // body, so a client cannot claim to be placing an order as somebody else.
    visitorToken: body?.visitorToken,
  }
}

export async function createOrder(body: any, userId: number | null = null) {
  const input = readInput(body)

  if ('reason' in input)
    return { ok: false as const, reason: input.reason }

  return await placeOrder({ ...input, userId })
}

/**
 * Price an order without writing anything.
 *
 * Shares the menu, fulfilment and price validation used by placement.
 */
export async function quoteOrder(body: any) {
  const input = readInput(body)

  if ('reason' in input)
    return { ok: false as const, reason: input.reason }

  return await previewOrder(input)
}

/**
 * What the customer's tracking page shows.
 *
 * Deliberately narrow: a status, an estimate, the business, and the courier's
 * position when there is one. The order rows themselves are not public, and
 * this is reached with a token anybody could be holding.
 */
export async function trackOrder(token: string) {
  if (!token)
    return null

  const order = await db.selectFrom('orders')
    .where('tracking_token', '=', token)
    .selectAll()
    .executeTakeFirst() as Record<string, unknown> | undefined

  if (!order)
    return null

  const business = await db.selectFrom('businesses')
    .where('id', '=', Number(order.business_id))
    .select(['name', 'slug', 'address', 'city', 'latitude', 'longitude', 'is_partner'])
    .executeTakeFirst() as Record<string, unknown> | undefined

  const stops = await db.selectFrom('delivery_stops')
    .where('order_id', '=', Number(order.id))
    .orderBy('sequence', 'asc')
    .selectAll()
    .execute() as Array<Record<string, unknown>>

  const stop = stops.find(stop => ['pending', 'en_route', 'arrived'].includes(String(stop.status))) ?? stops.at(-1)
  const isActive = order.status !== 'DELIVERED' && order.status !== 'CANCELLED'
  let courier: Record<string, unknown> | undefined

  if (isActive && stop?.delivery_route_id) {
    const route = await db.selectFrom('delivery_routes')
      .where('id', '=', Number(stop.delivery_route_id))
      .select(['courier_id'])
      .executeTakeFirst() as { courier_id?: number } | undefined

    if (route?.courier_id) {
      courier = await db.selectFrom('couriers')
        .where('id', '=', Number(route.courier_id))
        .select(['name', 'latitude', 'longitude', 'heading', 'last_ping_at'])
        .executeTakeFirst() as Record<string, unknown> | undefined
    }
  }

  return {
    status: String(order.status),
    reviewPath: order.status === 'DELIVERED' && Number(business?.is_partner) === 1
      ? `/places/${encodeURIComponent(String(business?.slug))}#reviews`
      : null,
    orderType: String(order.order_type),
    totalCents: Number(order.total_amount ?? 0),
    currency: String(order.currency ?? 'usd'),
    placedAt: order.created_at ?? null,
    estimatedMinutes: Number(order.estimated_delivery_time ?? 0),
    deliveryAddress: String(order.delivery_address ?? ''),
    destination: order.delivery_latitude != null && order.delivery_longitude != null
      ? { latitude: Number(order.delivery_latitude), longitude: Number(order.delivery_longitude) }
      : null,
    business: business
      ? {
          name: String(business.name),
          slug: String(business.slug),
          address: `${business.address}, ${business.city}`,
          latitude: Number(business.latitude),
          longitude: Number(business.longitude),
        }
      : null,
    stop: stop
      ? {
          type: String(stop.type ?? 'dropoff'),
          status: String(stop.status),
          etaAt: stop.eta_at ?? null,
          arrivedAt: stop.arrived_at ?? null,
        }
      : null,
    courier: courier
      ? {
          name: String(courier.name),
          latitude: courier.latitude == null ? null : Number(courier.latitude),
          longitude: courier.longitude == null ? null : Number(courier.longitude),
          heading: courier.heading == null ? null : Number(courier.heading),
          lastPingAt: courier.last_ping_at ?? null,
        }
      : null,
  }
}

/** Orders placed as a guest on this browser or linked to the signed-in buyer. */
export async function ordersForBuyer(visitorToken: unknown, userId: number | null): Promise<Array<Record<string, unknown>>> {
  const customerIds = await customerIdsForBuyer(visitorToken, userId)

  if (customerIds.length === 0)
    return []

  const rows = await db.selectFrom('orders')
    .where('customer_id', 'in', customerIds)
    .orderBy('id', 'desc')
    .selectAll()
    .execute() as Array<Record<string, unknown>>

  const out = []

  for (const row of rows) {
    const business = await db.selectFrom('businesses')
      .where('id', '=', Number(row.business_id))
      .select(['name', 'slug', 'type', 'cuisine'])
      .executeTakeFirst() as Record<string, unknown> | undefined

    const items = await db.selectFrom('order_items')
      .where('order_id', '=', Number(row.id))
      .selectAll()
      .execute() as Array<Record<string, unknown>>

    const names = []

    for (const item of items) {
      const product = await db.selectFrom('products')
        .where('id', '=', Number(item.product_id))
        .select(['name'])
        .executeTakeFirst() as { name?: string } | undefined

      names.push(`${Number(item.quantity)} × ${String(product?.name ?? 'Item')}`)
    }

    out.push({
      id: Number(row.id),
      businessName: String(business?.name ?? ''),
      businessSlug: String(business?.slug ?? ''),
      status: String(row.status),
      orderType: String(row.order_type ?? ''),
      totalCents: Number(row.total_amount ?? 0),
      currency: String(row.currency ?? 'usd'),
      trackingToken: String(row.tracking_token ?? ''),
      items: names,
      placedAt: row.created_at ?? null,
      ...(() => {
        const visual = visualFor({
          name: business?.name,
          slug: business?.slug,
          type: business?.type,
          cuisine: business?.cuisine,
        })

        return { ...visual, iconClass: `i-hugeicons-${visual.icon}` }
      })(),
    })
  }

  return out
}
