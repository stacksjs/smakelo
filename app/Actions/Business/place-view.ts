import { formatMinuteOfDay } from './hours'
import { visualFor } from './identity'

/**
 * Everything a place page renders, computed once.
 *
 * The template does no arithmetic and calls no functions: it reads strings and
 * arrays off this object. That is not a style preference. The generated place
 * pages each include one shared partial, and a partial inherits the including
 * page's scope, so anything the markup needs must exist as a plain name in that
 * scope. Precomputing here keeps 35 generated pages down to four lines each.
 */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export interface PlaceViewModel {
  found: boolean
  pageTitle: string
  pageDescription: string
  canonicalPath: string
  name: string
  slug: string
  type: string
  /** The photograph and the colour behind it; see Business/identity.ts. */
  photoId: string
  photo: string
  photoWide: string
  photoThumb: string
  hue: number
  hueEnd: number
  icon: string
  /** The full class, so the template never builds one: Crosswind generates an
   * icon's CSS from literals it can find in source, and a class assembled in
   * the template is applied but never generated. */
  iconClass: string
  monogram: string
  /** How much of the five stars to fill, so the template does no arithmetic. */
  ratingPercent: number
  description: string
  cuisine: string
  address: string
  city: string
  /** Address and city, joined by what is actually there. */
  location: string
  priceLabel: string
  ratingAverage: number
  ratingCount: number
  hasRating: boolean
  isPartner: boolean
  statusLabel: string
  prepTimeMinutes: number
  fulfilment: string[]
  week: Array<{ name: string, text: string }>
  menu: Array<{ section: string, items: Array<{ name: string, description: string, price: string }> }>
  reviews: Array<{
    title: string
    body: string
    rating: number
    dishes: string
    ownerResponse: string
    helpful: number
  }>
  mapPoint: string
}

export function placeViewModel(found: any): PlaceViewModel {
  const business = found?.business ?? {}
  const hours = found?.hours ?? []
  const status = found?.status ?? { state: 'unknown' }
  const name = String(business.name ?? 'Not found')

  return {
    found: Boolean(found),
    pageTitle: found ? `${name} - Smakelo` : 'Not found - Smakelo',
    pageDescription: found
      ? String(business.description || `${name} in ${business.city}`)
      : 'That place is not listed.',
    canonicalPath: `/places/${String(business.slug ?? '')}`,
    name,
    slug: String(business.slug ?? ''),
    ...withIconClass(visualFor({ name: business.name, slug: business.slug, type: business.type, cuisine: business.cuisine })),
    ratingPercent: Math.round((Number(business.rating_average ?? 0) / 5) * 100),
    type: String(business.type ?? ''),
    description: String(business.description ?? ''),
    cuisine: String(business.cuisine ?? ''),
    address: String(business.address ?? ''),
    city: String(business.city ?? ''),
    /*
     * Joined here rather than as `{{ address }}, {{ city }}` in the template.
     * 106 of the 280 listings have no street address - they came out of open
     * data that way - and the template's comma was rendering a leading one on
     * every one of them: ", Los Angeles".
     */
    location: [String(business.address ?? '').trim(), String(business.city ?? '').trim()].filter(Boolean).join(', '),
    priceLabel: '$'.repeat(Math.max(1, Math.min(4, Number(business.price_tier) || 2))),
    ratingAverage: Number(business.rating_average ?? 0),
    ratingCount: Number(business.rating_count ?? 0),
    hasRating: Number(business.rating_count ?? 0) > 0,
    isPartner: Number(business.is_partner) === 1,
    statusLabel: statusLabel(status),
    prepTimeMinutes: Number(business.prep_time_minutes ?? 0),
    fulfilment: fulfilment(business),
    week: weekTable(hours),
    menu: (found?.menu ?? []).map((section: any) => ({
      section: String(section.section),
      items: section.items.map((item: any) => ({
        name: String(item.name),
        description: String(item.description ?? ''),
        price: money(item.price),
      })),
    })),
    reviews: (found?.reviews ?? []).map((review: any) => ({
      title: String(review.title ?? ''),
      body: String(review.body ?? ''),
      rating: Number(review.rating ?? 0),
      dishes: String(review.dishes ?? ''),
      ownerResponse: String(review.owner_response ?? ''),
      helpful: Number(review.helpful_count ?? 0),
    })),
    /*
     * Carries the slug as well as the coordinates.
     *
     * The client script needs the slug to call the API, and reading it from a
     * data attribute avoids interpolating it into `<script client>`, which the
     * views build does not process (stacksjs/stacks#2391). Building it here in
     * TypeScript also sidesteps `{{ vm.slug }}` rendering empty in the dev
     * server (stacksjs/stacks#2392).
     */
    mapPoint: JSON.stringify({
      lat: Number(business.latitude ?? 0),
      lng: Number(business.longitude ?? 0),
      name,
      slug: String(business.slug ?? ''),
    }),
  }
}

function money(cents: unknown): string {
  return `$${(Number(cents ?? 0) / 100).toFixed(2)}`
}

function statusLabel(status: any): string {
  if (status.state === 'unknown')
    return 'Hours not recorded'

  if (status.state === 'closed') {
    return typeof status.opensInMinutes === 'number' && status.opensInMinutes < 240
      ? `Closed, opens in ${status.opensInMinutes} min`
      : 'Closed right now'
  }

  return typeof status.closesInMinutes === 'number' && status.closesInMinutes < 90
    ? `Open, closing in ${status.closesInMinutes} min`
    : 'Open now'
}

/** How you can actually get the food, in the order a customer would ask. */
function fulfilment(business: any): string[] {
  if (Number(business.is_partner) !== 1)
    return []

  const options: string[] = []

  if (Number(business.offers_delivery) === 1)
    options.push(`Delivery, about ${Number(business.prep_time_minutes ?? 0)} min to prepare`)

  if (Number(business.offers_pickup) === 1)
    options.push('Pickup')

  if (Number(business.offers_dine_in) === 1)
    options.push('Dine in, order from the table')

  if (Number(business.offers_shop) === 1)
    options.push('Weekly boxes and produce')

  return options
}

/**
 * One row per weekday, Monday first.
 *
 * A day the business is shut still gets a line: a table that silently omits
 * Sunday reads as an oversight rather than as "closed on Sunday".
 */
function weekTable(hours: any[]): Array<{ name: string, text: string }> {
  return [1, 2, 3, 4, 5, 6, 0].map((day) => {
    const intervals = hours
      .filter(hour => hour.dayOfWeek === day && !hour.isClosed)
      .sort((a, b) => a.opensAt - b.opensAt)

    return {
      name: DAY_NAMES[day] ?? '',
      text: intervals.length === 0
        ? 'Closed'
        : intervals.map(hour => `${formatMinuteOfDay(hour.opensAt)} to ${formatMinuteOfDay(hour.closesAt)}`).join(', '),
    }
  })
}

/** Attach the full icon class; see `iconClass` on PlaceView for why. */
function withIconClass<T extends { icon: string }>(visual: T): T & { iconClass: string } {
  return { ...visual, iconClass: `i-hugeicons-${visual.icon}` }
}
