import { db } from '@stacksjs/database'

/**
 * What a business can change about itself.
 *
 * The two edits that matter during service are the two here: take a dish off
 * because it ran out, and change today's hours. Everything else a merchant
 * portal usually offers can wait until after the rush; these cannot, and a
 * portal that makes them slow gets replaced by a phone call to the platform.
 *
 * There are no merchant accounts in this demo, so ownership is asserted by
 * arriving with the business's slug rather than proven. That is stated rather
 * than dressed up: a real deployment resolves the business from the signed-in
 * team, and every function here already takes the business as its first
 * argument, so nothing else changes.
 */

export interface ManageItem {
  id: number
  name: string
  description: string
  priceCents: number
  isAvailable: boolean
  section: string
}

export interface ManageHour {
  /*
   * The day as a number, and no name for it.
   *
   * This used to also carry `dayName`, built from an English constant, which
   * put the language on the wrong side of the wire: the same payload is read
   * by a page that may be rendering in German. The screen names the day from
   * this number and its own locale.
   */
  dayOfWeek: number
  opensAt: number
  closesAt: number
  isClosed: boolean
}

export interface ManageView {
  business: { id: number, slug: string, name: string, currency: string, offersDelivery: boolean, offersPickup: boolean, offersDineIn: boolean }
  items: ManageItem[]
  hours: ManageHour[]
  counts: { tables: number, unavailable: number, openOrders: number }
}

export async function manageView(businessSlug: string): Promise<ManageView | null> {
  const business = await db.selectFrom('businesses')
    .where('slug', '=', String(businessSlug))
    .selectAll()
    .executeTakeFirst() as Record<string, unknown> | undefined

  if (!business || Number(business.is_partner) !== 1)
    return null

  const market = business.market_id
    ? await db.selectFrom('markets').where('id', '=', Number(business.market_id)).select(['currency']).executeTakeFirst() as { currency?: string } | undefined
    : undefined

  /*
   * Unavailable items are listed too, and listed in place rather than in a
   * separate "hidden" section. A dish that came off at noon has to be easy to
   * put back at six, and a merchant looking for it will look where it was.
   */
  const products = await db.selectFrom('products')
    .where('business_id', '=', Number(business.id))
    .orderBy('id', 'asc')
    .selectAll()
    .execute() as Array<Record<string, unknown>>

  const items: ManageItem[] = []

  for (const product of products) {
    const category = product.category_id
      ? await db.selectFrom('categories').where('id', '=', Number(product.category_id)).select(['name']).executeTakeFirst() as { name?: string } | undefined
      : undefined

    items.push({
      id: Number(product.id),
      name: String(product.name),
      description: String(product.description ?? ''),
      priceCents: Number(product.price ?? 0),
      isAvailable: Number(product.is_available) === 1,
      section: String(category?.name ?? ''),
    })
  }

  const hourRows = await db.selectFrom('business_hours')
    .where('business_id', '=', Number(business.id))
    .execute() as Array<Record<string, unknown>>

  const hours: ManageHour[] = []

  // Every day gets a row, closed or not. A table that silently omits Sunday
  // reads as an oversight rather than as "closed on Sunday".
  for (const day of [1, 2, 3, 4, 5, 6, 0]) {
    const row = hourRows.find(hour => Number(hour.day_of_week) === day)

    hours.push({
      dayOfWeek: day,
      opensAt: Number(row?.opens_at ?? 0),
      closesAt: Number(row?.closes_at ?? 0),
      isClosed: !row || Number(row.is_closed) === 1,
    })
  }

  const tables = await db.selectFrom('tables')
    .where('business_id', '=', Number(business.id))
    .select(['id'])
    .execute() as Array<{ id: number }>

  const openOrders = await db.selectFrom('orders')
    .where('business_id', '=', Number(business.id))
    .where('status', 'in', ['PENDING', 'PROCESSING'])
    .select(['id'])
    .execute() as Array<{ id: number }>

  return {
    business: {
      id: Number(business.id),
      slug: String(business.slug),
      name: String(business.name),
      currency: String(market?.currency ?? 'usd'),
      offersDelivery: Number(business.offers_delivery) === 1,
      offersPickup: Number(business.offers_pickup) === 1,
      offersDineIn: Number(business.offers_dine_in) === 1,
    },
    items,
    hours,
    counts: {
      tables: tables.length,
      unavailable: items.filter(item => !item.isAvailable).length,
      openOrders: openOrders.length,
    },
  }
}

/**
 * Change one menu item.
 *
 * Availability is the one a kitchen reaches for mid-service, and it has teeth:
 * `placeOrder` refuses an unavailable item, so switching this off stops orders
 * rather than only hiding a card.
 */
export async function updateItem(
  businessSlug: string,
  itemId: number,
  changes: { priceCents?: number, description?: string, isAvailable?: boolean },
): Promise<{ ok: boolean, reason?: string }> {
  const business = await db.selectFrom('businesses')
    .where('slug', '=', String(businessSlug))
    .select(['id'])
    .executeTakeFirst() as { id: number } | undefined

  if (!business)
    return { ok: false, reason: 'No such business.' }

  const product = await db.selectFrom('products')
    .where('id', '=', Number(itemId))
    .select(['id', 'business_id'])
    .executeTakeFirst() as { id: number, business_id: number } | undefined

  if (!product || Number(product.business_id) !== Number(business.id))
    return { ok: false, reason: 'That item belongs to a different business.' }

  const update: Record<string, unknown> = {}

  if (changes.priceCents !== undefined) {
    const price = Math.round(Number(changes.priceCents))

    // A free dish is a mistake far more often than an offer, and a negative one
    // always is.
    if (!Number.isFinite(price) || price < 1 || price > 100_000)
      return { ok: false, reason: 'A price between 0.01 and 1000 please.' }

    update.price = price
  }

  if (changes.description !== undefined)
    update.description = String(changes.description).slice(0, 500)

  if (changes.isAvailable !== undefined)
    update.is_available = changes.isAvailable ? 1 : 0

  if (Object.keys(update).length === 0)
    return { ok: false, reason: 'Nothing to change.' }

  await db.updateTable('products')
    .set(update as never)
    .where('id', '=', Number(itemId))
    .execute()

  return { ok: true }
}

/**
 * Set one day's hours.
 *
 * Minutes from midnight, and a close before an open is taken as an overnight
 * shift rather than rejected: a bar open until two in the morning is the
 * normal case, not a typo.
 */
export async function updateHours(
  businessSlug: string,
  dayOfWeek: number,
  opensAt: number,
  closesAt: number,
  isClosed: boolean,
): Promise<{ ok: boolean, reason?: string }> {
  const business = await db.selectFrom('businesses')
    .where('slug', '=', String(businessSlug))
    .select(['id'])
    .executeTakeFirst() as { id: number } | undefined

  if (!business)
    return { ok: false, reason: 'No such business.' }

  const day = Math.round(Number(dayOfWeek))

  if (!Number.isFinite(day) || day < 0 || day > 6)
    return { ok: false, reason: 'That is not a day of the week.' }

  const opens = Math.round(Number(opensAt))
  const closes = Math.round(Number(closesAt))

  if (!isClosed) {
    for (const minute of [opens, closes]) {
      if (!Number.isFinite(minute) || minute < 0 || minute > 1440)
        return { ok: false, reason: 'Times run from 00:00 to 24:00.' }
    }

    if (opens === closes)
      return { ok: false, reason: 'Opening and closing at the same minute is the same as being closed.' }
  }

  const existing = await db.selectFrom('business_hours')
    .where('business_id', '=', Number(business.id))
    .where('day_of_week', '=', day)
    .select(['id'])
    .executeTakeFirst() as { id: number } | undefined

  const values = {
    business_id: Number(business.id),
    day_of_week: day,
    opens_at: isClosed ? 0 : opens,
    closes_at: isClosed ? 0 : closes,
    is_closed: isClosed ? 1 : 0,
  }

  if (existing) {
    await db.updateTable('business_hours')
      .set(values as never)
      .where('id', '=', Number(existing.id))
      .execute()
  }
  else {
    await db.insertInto('business_hours')
      .values({ uuid: crypto.randomUUID(), ...values } as never)
      .executeTakeFirst()
  }

  return { ok: true }
}

/** Which ways this business will take an order. */
export async function updateFulfilment(
  businessSlug: string,
  modes: { delivery?: boolean, pickup?: boolean, dineIn?: boolean },
): Promise<{ ok: boolean, reason?: string }> {
  const business = await db.selectFrom('businesses')
    .where('slug', '=', String(businessSlug))
    .select(['id', 'offers_delivery', 'offers_pickup', 'offers_dine_in'])
    .executeTakeFirst() as Record<string, unknown> | undefined

  if (!business)
    return { ok: false, reason: 'No such business.' }

  const next = {
    offers_delivery: (modes.delivery ?? Number(business.offers_delivery) === 1) ? 1 : 0,
    offers_pickup: (modes.pickup ?? Number(business.offers_pickup) === 1) ? 1 : 0,
    offers_dine_in: (modes.dineIn ?? Number(business.offers_dine_in) === 1) ? 1 : 0,
  }

  // A business that accepts an order no way at all is closed, and should say so
  // through its hours rather than by having every button quietly refuse.
  if (next.offers_delivery + next.offers_pickup + next.offers_dine_in === 0)
    return { ok: false, reason: 'Keep at least one way to order. To stop taking orders, close the day in your hours.' }

  await db.updateTable('businesses')
    .set(next as never)
    .where('id', '=', Number(business.id))
    .execute()

  return { ok: true }
}
