import { db } from '@stacksjs/database'

/**
 * Taking a listing down.
 *
 * The most likely message this demo will ever receive is somebody asking why
 * their restaurant is on it, so removing a listing has to be one click and has
 * to actually work everywhere: the discover page, the search API, the place
 * page, and the map.
 *
 * Hidden rather than deleted, using the `deleted_at` column the model already
 * carries. A row that is gone cannot be restored when the request turns out to
 * have come from somebody who did not run the place after all, and it cannot be
 * kept out of the next import either.
 */

export interface CurationRow {
  id: number
  slug: string
  name: string
  city: string
  type: string
  isPartner: boolean
  isClaimed: boolean
  hidden: boolean
  source: string
}

export async function listings(query = '', limit = 60): Promise<CurationRow[]> {
  const rows = await db.selectFrom('businesses')
    .orderBy('name', 'asc')
    .selectAll()
    .execute() as Array<Record<string, unknown>>

  const term = String(query).trim().toLowerCase()

  return rows
    .filter((row) => {
      if (!term)
        return true

      return `${row.name} ${row.city} ${row.slug}`.toLowerCase().includes(term)
    })
    .slice(0, limit)
    .map(row => ({
      id: Number(row.id),
      slug: String(row.slug),
      name: String(row.name),
      city: String(row.city ?? ''),
      type: String(row.type ?? ''),
      isPartner: Number(row.is_partner) === 1,
      isClaimed: Number(row.is_claimed) === 1,
      hidden: row.deleted_at !== null && row.deleted_at !== undefined && String(row.deleted_at) !== '',
      source: String(row.source ?? ''),
    }))
}

export async function setHidden(slug: string, hidden: boolean): Promise<{ ok: boolean, reason?: string }> {
  const business = await db.selectFrom('businesses')
    .where('slug', '=', String(slug))
    .select(['id', 'is_partner'])
    .executeTakeFirst() as { id: number, is_partner: number } | undefined

  if (!business)
    return { ok: false, reason: 'No such business.' }

  /*
   * A partner is part of the demonstration rather than somebody's livelihood,
   * and hiding one would empty the ordering, kitchen and courier screens that
   * the whole site exists to show. If one really has to go, it goes from the
   * seed data.
   */
  if (Number(business.is_partner) === 1 && hidden)
    return { ok: false, reason: 'That is one of the invented partners. Hiding it would empty half the demo; remove it from the seed instead.' }

  await db.updateTable('businesses')
    .set({ deleted_at: hidden ? new Date().toISOString() : null } as never)
    .where('id', '=', Number(business.id))
    .execute()

  return { ok: true }
}
