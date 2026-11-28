import { db, sqliteWriteOptions } from '@stacksjs/database'
import { visualFor } from '../Business/identity'
import { customerForBuyer, customerIdsForBuyer } from '../Visitor/identity'

/**
 * Saved places.
 *
 * Unlike a review, a favourite says nothing about the business and is visible
 * only to the person who saved it, so a real listing can be saved as freely as
 * an invented partner. That asymmetry is deliberate: the guard exists to stop
 * words being put in a real restaurant's mouth, not to stop somebody
 * remembering it.
 */

export async function toggleFavorite(
  businessSlug: string,
  visitorToken: unknown,
  userId?: number | null,
  saved?: boolean,
): Promise<{ ok: boolean, saved?: boolean, reason?: string }> {
  return await db.transaction(async () => {
    const business = await db.selectFrom('businesses')
      .where('slug', '=', businessSlug)
      .select(['id', 'deleted_at'])
      .executeTakeFirst()

    if (!business || (business.deleted_at && saved !== false))
      return { ok: false, reason: 'That business is not listed.' }

    const customerId = await customerForBuyer(visitorToken, userId)

    if (customerId === null)
      return { ok: false, reason: 'Could not identify this buyer.' }

    const customerIds = userId ? await customerIdsForBuyer(visitorToken, userId) : [customerId]
    const matches = db.selectFrom('favorites')
      .where('business_id', '=', Number(business.id))
      .where('customer_id', 'in', customerIds)

    const existing = await matches.select(['id']).execute()
    const shouldSave = saved ?? existing.length === 0

    if (!shouldSave && existing.length > 0) {
      await db.deleteFrom('favorites').where('id', 'in', existing.map(row => Number(row.id))).execute()
    }
    else if (shouldSave && existing.length === 0) {
      await db.insertInto('favorites').values({
        uuid: crypto.randomUUID(),
        business_id: Number(business.id),
        customer_id: customerId,
        note: '',
      } as never).execute()
    }

    return { ok: true, saved: shouldSave }
  }, sqliteWriteOptions())
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
  /** Generated cover art, so a saved list looks like the grid it came from. */
  hue: number
  hueEnd: number
  iconClass: string
  monogram: string
}

/** The list somebody opens when deciding where to eat, newest first. */
export async function favoritesFor(visitorToken: unknown, userId?: number | null): Promise<SavedPlace[]> {
  const customerIds = await customerIdsForBuyer(visitorToken, userId)

  if (customerIds.length === 0)
    return []

  const rows = await db.selectFrom('favorites')
    .where('customer_id', 'in', customerIds)
    .orderBy('id', 'desc')
    .selectAll()
    .execute() as Array<Record<string, unknown>>

  const places: SavedPlace[] = []
  const seen = new Set<number>()

  for (const row of rows) {
    const businessId = Number(row.business_id)

    if (seen.has(businessId))
      continue

    seen.add(businessId)

    const business = await db.selectFrom('businesses')
      .where('id', '=', businessId)
      .where('deleted_at', 'is', null)
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
      ...withIconClass(visualFor({
        name: business.name,
        slug: business.slug,
        type: business.type,
        cuisine: business.cuisine,
      })),
    })
  }

  return places
}

/** Which of these slugs this browser has saved, for marking a list of cards. */
export async function savedSlugs(visitorToken: unknown, userId?: number | null): Promise<string[]> {
  return (await favoritesFor(visitorToken, userId)).map(place => place.slug)
}

/** The full class, since a class assembled in a template is never generated. */
function withIconClass(visual: { icon: string, hue: number, hueEnd: number, monogram: string }) {
  return { ...visual, iconClass: `i-hugeicons-${visual.icon}` }
}
