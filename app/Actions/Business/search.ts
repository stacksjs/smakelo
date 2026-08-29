import type { OpeningInterval, OpenState } from './hours'
import { db } from '@stacksjs/database'
import { boundingBox, distanceInMeters } from './geo'
import { openStatus } from './hours'

/**
 * Business discovery: the query behind the browse page, the map and the API.
 *
 * Geography is done here rather than by the search engine, whose drivers have
 * no radius filter of any kind. That is not a workaround so much as a division
 * of labour - the index is good at text relevance and knows nothing about the
 * ground, so it gets the text and this gets the distance.
 *
 * The shape is a bounding box in SQL, then an exact circle in code. The box is
 * indexable and cheap and keeps too much; the haversine is exact and would be
 * wasteful across a whole city. Together they read a neighbourhood.
 */

export interface BusinessSearchQuery {
  latitude?: number
  longitude?: number
  /** Metres. Ignored without a centre to measure from. */
  radiusMeters?: number
  /** Free text over name, cuisine and description. */
  q?: string
  type?: string
  openNow?: boolean
  /** Only businesses that can actually take an order. */
  partnersOnly?: boolean
  sort?: 'distance' | 'rating' | 'name'
  limit?: number
}

export interface BusinessResult {
  id: number
  name: string
  slug: string
  type: string
  cuisine: string
  description: string
  address: string
  city: string
  latitude: number
  longitude: number
  priceTier: number
  ratingAverage: number
  ratingCount: number
  isPartner: boolean
  offersDelivery: boolean
  offersPickup: boolean
  offersDineIn: boolean
  prepTimeMinutes: number
  /** Metres from the requested centre, or null when none was given. */
  distanceMeters: number | null
  openState: OpenState
  closesInMinutes?: number
  opensInMinutes?: number
}

const DEFAULT_RADIUS_METERS = 5000
const MAX_LIMIT = 200

export async function searchBusinesses(query: BusinessSearchQuery = {}): Promise<BusinessResult[]> {
  const hasCentre = typeof query.latitude === 'number' && typeof query.longitude === 'number'
  const radius = query.radiusMeters ?? DEFAULT_RADIUS_METERS
  const limit = Math.min(query.limit ?? 60, MAX_LIMIT)

  let builder = db.selectFrom('businesses').selectAll()

  if (hasCentre) {
    const box = boundingBox({ latitude: query.latitude as number, longitude: query.longitude as number }, radius)
    builder = builder
      .where('latitude', '>=', box.minLatitude)
      .where('latitude', '<=', box.maxLatitude)
      .where('longitude', '>=', box.minLongitude)
      .where('longitude', '<=', box.maxLongitude)
  }

  if (query.type)
    builder = builder.where('type', '=', query.type)

  if (query.partnersOnly)
    builder = builder.where('is_partner', '=', 1)

  const rows = await builder.execute() as Array<Record<string, unknown>>

  // Text is matched here rather than in SQL because the same words should hit
  // a name, a cuisine and a description, and three ORed LIKEs read worse than
  // one pass over rows a bounding box has already narrowed to a neighbourhood.
  const needle = (query.q ?? '').trim().toLowerCase()
  const matchesText = (row: Record<string, unknown>): boolean => {
    if (!needle)
      return true

    const haystack = [row.name, row.cuisine, row.description, row.city]
      .map(value => String(value ?? '').toLowerCase())
      .join(' ')

    // Every word must appear somewhere: "venice coffee" should not return
    // every coffee shop in the county.
    return needle.split(/\s+/).every(word => haystack.includes(word))
  }

  const hoursByBusiness = await loadHours(rows.map(row => Number(row.id)))
  const timezone = await marketTimezone()
  const now = new Date()

  const results: BusinessResult[] = []

  for (const row of rows) {
    if (!matchesText(row))
      continue

    const latitude = Number(row.latitude)
    const longitude = Number(row.longitude)

    let distanceMeters: number | null = null
    if (hasCentre) {
      distanceMeters = Math.round(distanceInMeters(
        { latitude: query.latitude as number, longitude: query.longitude as number },
        { latitude, longitude },
      ))

      // The box kept the corners; the circle does not.
      if (distanceMeters > radius)
        continue
    }

    const status = openStatus(hoursByBusiness.get(Number(row.id)) ?? [], timezone, now)

    // `unknown` survives an open-now filter on purpose. A listing whose hours
    // nobody recorded is not a closed business, and dropping it would quietly
    // hide most of the imported data behind a filter people leave on.
    if (query.openNow && status.state === 'closed')
      continue

    results.push({
      id: Number(row.id),
      name: String(row.name),
      slug: String(row.slug),
      type: String(row.type),
      cuisine: String(row.cuisine ?? ''),
      description: String(row.description ?? ''),
      address: String(row.address ?? ''),
      city: String(row.city ?? ''),
      latitude,
      longitude,
      priceTier: Number(row.price_tier ?? 2),
      ratingAverage: Number(row.rating_average ?? 0),
      ratingCount: Number(row.rating_count ?? 0),
      isPartner: Number(row.is_partner) === 1,
      offersDelivery: Number(row.offers_delivery) === 1,
      offersPickup: Number(row.offers_pickup) === 1,
      offersDineIn: Number(row.offers_dine_in) === 1,
      prepTimeMinutes: Number(row.prep_time_minutes ?? 0),
      distanceMeters,
      openState: status.state,
      closesInMinutes: status.closesInMinutes,
      opensInMinutes: status.opensInMinutes,
    })
  }

  sortResults(results, query.sort ?? (hasCentre ? 'distance' : 'rating'))

  return results.slice(0, limit)
}

function sortResults(results: BusinessResult[], sort: 'distance' | 'rating' | 'name'): void {
  if (sort === 'name') {
    results.sort((a, b) => a.name.localeCompare(b.name))
    return
  }

  if (sort === 'rating') {
    // Unrated places sink rather than tie at the top, and a partner outranks a
    // listing at the same rating because only one of them can take the order.
    results.sort((a, b) =>
      b.ratingAverage - a.ratingAverage
      || b.ratingCount - a.ratingCount
      || Number(b.isPartner) - Number(a.isPartner)
      || a.name.localeCompare(b.name))
    return
  }

  results.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity) || a.name.localeCompare(b.name))
}

/** One query for every business's hours, rather than one per business. */
async function loadHours(businessIds: number[]): Promise<Map<number, OpeningInterval[]>> {
  const byBusiness = new Map<number, OpeningInterval[]>()

  if (businessIds.length === 0)
    return byBusiness

  const rows = await db.selectFrom('business_hours')
    .where('business_id', 'in', businessIds)
    .selectAll()
    .execute() as Array<Record<string, unknown>>

  for (const row of rows) {
    const businessId = Number(row.business_id)
    const list = byBusiness.get(businessId) ?? []

    list.push({
      dayOfWeek: Number(row.day_of_week),
      opensAt: Number(row.opens_at),
      closesAt: Number(row.closes_at),
      isClosed: Number(row.is_closed) === 1,
    })

    byBusiness.set(businessId, list)
  }

  return byBusiness
}

/**
 * The market's timezone, which is what "open now" is answered in.
 *
 * Falls back to Los Angeles rather than to the server's zone: the server could
 * be anywhere, and a box in Frankfurt would otherwise decide that everything in
 * Santa Monica is shut.
 */
async function marketTimezone(): Promise<string> {
  const market = await db.selectFrom('markets')
    .where('is_active', '=', 1)
    .select(['timezone'])
    .executeTakeFirst() as { timezone: string } | undefined

  return market?.timezone || 'America/Los_Angeles'
}

/** One business with everything its page needs. */
export async function businessBySlug(slug: string): Promise<{
  business: Record<string, unknown>
  hours: OpeningInterval[]
  status: ReturnType<typeof openStatus>
  menu: Array<{ section: string, items: Array<Record<string, unknown>> }>
  reviews: Array<Record<string, unknown>>
} | null> {
  const business = await db.selectFrom('businesses')
    .where('slug', '=', slug)
    .selectAll()
    .executeTakeFirst() as Record<string, unknown> | undefined

  if (!business)
    return null

  const businessId = Number(business.id)
  const hours = (await loadHours([businessId])).get(businessId) ?? []
  const status = openStatus(hours, await marketTimezone())

  const products = await db.selectFrom('products')
    .where('business_id', '=', businessId)
    .selectAll()
    .execute() as Array<Record<string, unknown>>

  const categories = await db.selectFrom('categories').selectAll().execute() as Array<Record<string, unknown>>
  const categoryById = new Map(categories.map(c => [Number(c.id), c]))

  // Group into the sections the menu was written in, keeping the kitchen's
  // order rather than an alphabetical one.
  const sections = new Map<string, { position: number, items: Array<Record<string, unknown>> }>()

  for (const product of products) {
    const category = categoryById.get(Number(product.category_id))
    const name = String(category?.name ?? 'Menu')
    const position = Number(category?.display_order ?? 99)
    const section = sections.get(name) ?? { position, items: [] }

    section.items.push(product)
    sections.set(name, section)
  }

  const menu = [...sections.entries()]
    .sort((a, b) => a[1].position - b[1].position)
    .map(([section, value]) => ({ section, items: value.items }))

  const reviews = await db.selectFrom('business_reviews')
    .where('business_id', '=', businessId)
    .where('is_published', '=', 1)
    .orderBy('helpful_count', 'desc')
    .selectAll()
    .execute() as Array<Record<string, unknown>>

  return { business, hours, status, menu, reviews }
}
