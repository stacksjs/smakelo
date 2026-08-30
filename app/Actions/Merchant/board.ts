import { db } from '@stacksjs/database'

/**
 * What a kitchen and a merchant need to see.
 *
 * The orders board is the screen a restaurant actually stands in front of, so
 * it answers one question first: what do I make next. Orders come back oldest
 * first, because a kitchen works a queue, and each carries its lines with the
 * modifiers already resolved into strings the cook can read without a lookup.
 */

export interface BoardOrder {
  id: number
  status: string
  orderType: string
  placedAt: unknown
  minutesAgo: number
  totalCents: number
  tableLabel: string | null
  items: Array<{ name: string, quantity: number, modifiers: string[], notes: string }>
}

export interface MerchantBoard {
  business: { id: number, slug: string, name: string, currency: string }
  active: BoardOrder[]
  completed: BoardOrder[]
  today: {
    orders: number
    grossCents: number
    /** What the business actually keeps, after the platform's fee. */
    netCents: number
  }
}

const ACTIVE_STATUSES = ['PENDING', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY']

export async function boardFor(slug: string): Promise<MerchantBoard | null> {
  const business = await db.selectFrom('businesses')
    .where('slug', '=', slug)
    .selectAll()
    .executeTakeFirst() as Record<string, unknown> | undefined

  if (!business)
    return null

  const market = await db.selectFrom('markets')
    .where('id', '=', Number(business.market_id))
    .select(['currency'])
    .executeTakeFirst() as { currency?: string } | undefined

  const orders = await db.selectFrom('orders')
    .where('business_id', '=', Number(business.id))
    .orderBy('id', 'asc')
    .selectAll()
    .execute() as Array<Record<string, unknown>>

  const active: BoardOrder[] = []
  const completed: BoardOrder[] = []

  for (const order of orders) {
    const shaped = await shapeOrder(order)

    if (ACTIVE_STATUSES.includes(String(order.status)))
      active.push(shaped)
    else
      completed.push(shaped)
  }

  // Newest first once an order is done: a finished list is read as history,
  // and history reads backwards.
  completed.reverse()

  const grossCents = orders
    .filter(order => String(order.status) !== 'CANCELLED')
    .reduce((sum, order) => sum + Number(order.total_amount ?? 0), 0)

  const feeCents = orders
    .filter(order => String(order.status) !== 'CANCELLED')
    .reduce((sum, order) => sum + Number(order.service_fee_cents ?? 0), 0)

  return {
    business: {
      id: Number(business.id),
      slug: String(business.slug),
      name: String(business.name),
      currency: String(market?.currency ?? 'usd'),
    },
    active,
    completed: completed.slice(0, 20),
    today: {
      orders: orders.length,
      grossCents,
      netCents: grossCents - feeCents,
    },
  }
}

async function shapeOrder(order: Record<string, unknown>): Promise<BoardOrder> {
  const items = await db.selectFrom('order_items')
    .where('order_id', '=', Number(order.id))
    .selectAll()
    .execute() as Array<Record<string, unknown>>

  const lines = []

  for (const item of items) {
    const product = await db.selectFrom('products')
      .where('id', '=', Number(item.product_id))
      .select(['name'])
      .executeTakeFirst() as { name?: string } | undefined

    const modifiers = await db.selectFrom('order_item_modifiers')
      .where('order_item_id', '=', Number(item.id))
      .select(['group_name', 'name'])
      .execute() as Array<{ group_name: string, name: string }>

    lines.push({
      name: String(product?.name ?? 'Item'),
      quantity: Number(item.quantity ?? 1),
      // The cook reads "Protein: Carnitas", not a modifier id.
      modifiers: modifiers.map(modifier => `${modifier.group_name}: ${modifier.name}`),
      notes: String(item.special_instructions ?? ''),
    })
  }

  let tableLabel: string | null = null

  if (order.table_id) {
    const table = await db.selectFrom('tables')
      .where('id', '=', Number(order.table_id))
      .select(['label'])
      .executeTakeFirst() as { label?: string } | undefined

    tableLabel = table?.label ? String(table.label) : null
  }

  const placedAt = order.created_at
  const minutesAgo = placedAt
    ? Math.max(0, Math.round((Date.now() - new Date(String(placedAt).replace(' ', 'T') + (String(placedAt).endsWith('Z') ? '' : 'Z')).getTime()) / 60000))
    : 0

  return {
    id: Number(order.id),
    status: String(order.status),
    orderType: String(order.order_type),
    placedAt: placedAt ?? null,
    minutesAgo,
    totalCents: Number(order.total_amount ?? 0),
    tableLabel,
    items: lines,
  }
}

/**
 * Move an order along.
 *
 * The kitchen's vocabulary is smaller than the order lifecycle's: received,
 * cooking, ready. Anything past "ready" belongs to the courier or the counter,
 * so this refuses to skip ahead to DELIVERED - that is the handover's word,
 * not the kitchen's.
 */
export async function advanceOrder(orderId: number, to: string): Promise<{ ok: boolean, status?: string, reason?: string }> {
  const allowed = ['PROCESSING', 'SHIPPED', 'CANCELLED']

  if (!allowed.includes(to))
    return { ok: false, reason: `A kitchen can move an order to ${allowed.join(', ')}.` }

  const order = await db.selectFrom('orders')
    .where('id', '=', orderId)
    .select(['id', 'status'])
    .executeTakeFirst() as { id: number, status: string } | undefined

  if (!order)
    return { ok: false, reason: 'No such order.' }

  if (order.status === 'DELIVERED' || order.status === 'CANCELLED')
    return { ok: false, reason: `That order is already ${order.status.toLowerCase()}.` }

  await db.updateTable('orders')
    .set({ status: to } as never)
    .where('id', '=', orderId)
    .execute()

  return { ok: true, status: to }
}
