import { db } from '@stacksjs/database'
import { customerForVisitor, existingCustomerFor } from '../Visitor/identity'

/**
 * Saved places.
 *
 * Unlike a review, a favourite says nothing about the business and is visible
 * only to the person who saved it, so a real listing can be saved as freely as
 * an invented partner. That asymmetry is deliberate: the guard exists to stop
 * words being put in a real restaurant's mouth, not to stop somebody
 * remembering it.
 */

export async function toggleFavorite(businessSlug: string, visitorToken: unknown): Promise<{ ok: boolean, saved?: boolean, reason?: string }> {
  const business = await db.selectFrom('businesses')
    .where('slug', '=', String(businessSlug))
    .select(['id'])
    .executeTakeFirst() as { id: number } | undefined

  if (!business)
    return { ok: false, reason: 'That business is not listed.' }

  const customerId = await customerForVisitor(visitorToken)

  if (!customerId)
    return { ok: false, reason: 'Could not identify this browser.' }

  const existing = await db.selectFrom('favorites')
    .where('business_id', '=', Number(business.id))
    .where('customer_id', '=', customerId)
    .select(['id'])
    .executeTakeFirst() as { id: number } | undefined

  if (existing) {
    await db.deleteFrom('favorites').where('id', '=', Number(existing.id)).execute()
    return { ok: true, saved: false }
  }

  await db.insertInto('favorites').values({
    uuid: crypto.randomUUID(),
    business_id: Number(business.id),
    customer_id: customerId,
    note: '',
  } as never).executeTakeFirst()

  return { ok: true, saved: true }
}

export interface SavedPlace {
  slug: string
  name: string
  type: string
  cuisine: string
  city: string
  ratingAverage: number
  ratingCount: number
  isPartner: boolean
  note: string
  savedAt: unknown
}

/** The list somebody opens when deciding where to eat, newest first. */
export async function favoritesFor(visitorToken: unknown): Promise<SavedPlace[]> {
  const customerId = await existingCustomerFor(visitorToken)

  if (!customerId)
    return []

  const rows = await db.selectFrom('favorites')
    .where('customer_id', '=', customerId)
    .orderBy('id', 'desc')
    .selectAll()
    .execute() as Array<Record<string, unknown>>

  const places: SavedPlace[] = []

  for (const row of rows) {
    const business = await db.selectFrom('businesses')
      .where('id', '=', Number(row.business_id))
      .selectAll()
      .executeTakeFirst() as Record<string, unknown> | undefined

    if (!business)
      continue

    places.push({
      slug: String(business.slug),
      name: String(business.name),
      type: String(business.type ?? ''),
      cuisine: String(business.cuisine ?? ''),
      city: String(business.city ?? ''),
      ratingAverage: Number(business.rating_average ?? 0),
      ratingCount: Number(business.rating_count ?? 0),
      isPartner: Number(business.is_partner) === 1,
      note: String(row.note ?? ''),
      savedAt: row.created_at ?? null,
    })
  }

  return places
}

/** Which of these slugs this browser has saved, for marking a list of cards. */
export async function savedSlugs(visitorToken: unknown): Promise<string[]> {
  return (await favoritesFor(visitorToken)).map(place => place.slug)
}
