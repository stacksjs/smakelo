import { db } from '@stacksjs/database'
import { toSvg } from 'ts-qr-codes'

/**
 * Tables, their codes, and the tab a code opens.
 *
 * The code on the table encodes a URL carrying a token, not a table id. An id
 * is guessable, and a guessable code lets anyone open a tab on table 7 from the
 * pavement. Rotating the token reprints the code and invalidates every
 * photograph of the old one, which is the only remedy when a code walks off.
 */

export interface TableCode {
  id: number
  label: string
  seats: number
  url: string
  /** Inline SVG, ready to drop into a page or a print sheet. */
  svg: string
}

/**
 * A table's QR code as SVG.
 *
 * SVG rather than PNG because ts-qr-codes has no raster path, and because a
 * code that will be printed on a table tent should not be a bitmap anyway.
 * Error correction is left at the library's default; there is no logo here to
 * punch a hole in the middle.
 */
export function tableCodeSvg(url: string, size = 240): string {
  return toSvg(url, {
    size,
    margin: 2,
    title: 'Scan to see the menu and order',
  })
}

export async function tableCodesFor(businessSlug: string, origin: string): Promise<TableCode[] | null> {
  const business = await db.selectFrom('businesses')
    .where('slug', '=', businessSlug)
    .select(['id'])
    .executeTakeFirst() as { id: number } | undefined

  if (!business)
    return null

  const tables = await db.selectFrom('tables')
    .where('business_id', '=', Number(business.id))
    .where('is_active', '=', 1)
    .orderBy('id', 'asc')
    .selectAll()
    .execute() as Array<Record<string, unknown>>

  return tables.map((table) => {
    const url = `${origin}/t/${String(table.qr_token)}`

    return {
      id: Number(table.id),
      label: String(table.label),
      seats: Number(table.seats ?? 2),
      url,
      svg: tableCodeSvg(url),
    }
  })
}

export interface TableSession {
  table: { id: number, label: string, seats: number }
  business: { id: number, slug: string, name: string, currency: string }
  tab: { id: number, status: string, totalCents: number, paidCents: number, splitMode: string }
  rounds: Array<{
    orderId: number
    placedAt: unknown
    status: string
    totalCents: number
    items: Array<{ name: string, quantity: number, priceCents: number, modifiers: string[] }>
  }>
}

/**
 * Resolve a scanned code into a table and its open tab, opening one if needed.
 *
 * Scanning is what opens a tab, because asking someone to press "start a tab"
 * after they have already scanned a code is a step that exists only in the
 * data model. An existing open tab is reused, so the second person at the table
 * joins the first person's bill rather than starting a rival one.
 */
export async function sessionForToken(token: string): Promise<TableSession | null> {
  if (!token)
    return null

  const table = await db.selectFrom('tables')
    .where('qr_token', '=', token)
    .where('is_active', '=', 1)
    .selectAll()
    .executeTakeFirst() as Record<string, unknown> | undefined

  if (!table)
    return null

  const business = await db.selectFrom('businesses')
    .where('id', '=', Number(table.business_id))
    .selectAll()
    .executeTakeFirst() as Record<string, unknown> | undefined

  if (!business)
    return null

  const market = await db.selectFrom('markets')
    .where('id', '=', Number(business.market_id))
    .select(['currency'])
    .executeTakeFirst() as { currency?: string } | undefined

  let tab = await db.selectFrom('tabs')
    .where('table_id', '=', Number(table.id))
    .where('status', '=', 'open')
    .selectAll()
    .executeTakeFirst() as Record<string, unknown> | undefined

  if (!tab) {
    const uuid = crypto.randomUUID()

    await db.insertInto('tabs').values({
      uuid,
      business_id: Number(business.id),
      table_id: Number(table.id),
      status: 'open',
      split_mode: 'by_item',
      party_size: Number(table.seats ?? 2),
      opened_at: new Date().toISOString(),
      total_cents: 0,
      paid_cents: 0,
    } as never).executeTakeFirst()

    tab = await db.selectFrom('tabs').where('uuid', '=', uuid).selectAll().executeTakeFirst() as Record<string, unknown>
  }

  const orders = await db.selectFrom('orders')
    .where('tab_id', '=', Number(tab.id))
    .orderBy('id', 'asc')
    .selectAll()
    .execute() as Array<Record<string, unknown>>

  const rounds = []

  for (const order of orders) {
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
        .select(['name'])
        .execute() as Array<{ name: string }>

      lines.push({
        name: String(product?.name ?? 'Item'),
        quantity: Number(item.quantity ?? 1),
        priceCents: Number(item.price ?? 0),
        modifiers: modifiers.map(modifier => String(modifier.name)),
      })
    }

    rounds.push({
      orderId: Number(order.id),
      placedAt: order.created_at ?? null,
      status: String(order.status),
      totalCents: Number(order.total_amount ?? 0),
      items: lines,
    })
  }

  return {
    table: { id: Number(table.id), label: String(table.label), seats: Number(table.seats ?? 2) },
    business: {
      id: Number(business.id),
      slug: String(business.slug),
      name: String(business.name),
      currency: String(market?.currency ?? 'usd'),
    },
    tab: {
      id: Number(tab.id),
      status: String(tab.status),
      totalCents: Number(tab.total_cents ?? 0),
      paidCents: Number(tab.paid_cents ?? 0),
      splitMode: String(tab.split_mode ?? 'by_item'),
    },
    rounds,
  }
}

/**
 * Recompute a tab's total from its rounds.
 *
 * Derived rather than incremented, so a cancelled round or an edited order
 * cannot leave the tab quietly wrong. A running total maintained by addition is
 * right until the first thing that is not an addition.
 */
export async function recomputeTab(tabId: number): Promise<number> {
  const orders = await db.selectFrom('orders')
    .where('tab_id', '=', tabId)
    .where('status', '!=', 'CANCELLED')
    .select(['total_amount'])
    .execute() as Array<{ total_amount: number }>

  const total = orders.reduce((sum, order) => sum + Number(order.total_amount ?? 0), 0)

  await db.updateTable('tabs')
    .set({ total_cents: total } as never)
    .where('id', '=', tabId)
    .execute()

  return total
}

/**
 * Close a tab and say what each person owes.
 *
 * `even` divides the total without losing a cent; `by_item` bills each round to
 * whoever ordered it, which is what a code on a table makes possible in the
 * first place - the app already knows which phone ordered what.
 */
export async function closeTab(tabId: number, splitMode: 'even' | 'by_item' | 'single_payer', ways = 1): Promise<{
  totalCents: number
  shares: number[]
}> {
  const total = await recomputeTab(tabId)

  await db.updateTable('tabs')
    .set({ status: 'closed', split_mode: splitMode, closed_at: new Date().toISOString(), paid_cents: total } as never)
    .where('id', '=', tabId)
    .execute()

  if (splitMode === 'even') {
    const { splitEvenly } = await import('../Order/pricing')
    return { totalCents: total, shares: splitEvenly(total, Math.max(1, ways)) }
  }

  if (splitMode === 'by_item') {
    const orders = await db.selectFrom('orders')
      .where('tab_id', '=', tabId)
      .where('status', '!=', 'CANCELLED')
      .select(['total_amount'])
      .execute() as Array<{ total_amount: number }>

    return { totalCents: total, shares: orders.map(order => Number(order.total_amount ?? 0)) }
  }

  return { totalCents: total, shares: [total] }
}
