import { translateFor } from '../Locale/translate'
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
 *
 * The locale is passed in rather than read from a global. The views server
 * resolves it per request and puts it in the template scope, so the generated
 * page hands it down here; a module-level `getLocale()` would answer with
 * whatever the last request happened to set, which is the classic way a server
 * renders one visitor's page in another visitor's language.
 */

/**
 * Weekday names, in the language being served.
 *
 * From `Intl` rather than from the locale files. Seven weekday names per
 * language is exactly the sort of thing every platform already knows, and
 * translating them by hand invites the language where somebody stopped after
 * five. Indexed from Sunday to match the rest of the app, which stores day 0
 * as Sunday.
 */
function dayNames(locale: string): string[] {
  // UTC, explicitly. Without it the formatter uses the server's zone, and a
  // box in Los Angeles reads a UTC midnight as the evening before - so every
  // row in the opening-hours table was labelled with the wrong day.
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' })

  // 2024-01-07 was a Sunday, so this walks Sunday through Saturday.
  return Array.from({ length: 7 }, (_, day) => formatter.format(new Date(Date.UTC(2024, 0, 7 + day))))
}

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
  /** "12 reviews", in the language being served. */
  ratingLabel: string
  /*
   * Three sentences that name the business.
   *
   * Built here rather than by a helper the markup calls, because a `{{ }}`
   * holding a function call is compiled as a client binding - and `vm` is a
   * server value that does not exist in the browser, so the call returned
   * nothing and the paragraph rendered empty. A plain property does resolve
   * server-side, which is what these are.
   */
  notPartnerBody: string
  claimBody: string
  reviewsClosed: string
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

export function placeViewModel(found: any, locale = 'en'): PlaceViewModel {
  const business = found?.business ?? {}
  const hours = found?.hours ?? []
  const status = found?.status ?? { state: 'unknown' }
  const currency = String(found?.currency ?? 'usd')
  const name = String(business.name ?? say('place.not_found', locale))

  return {
    found: Boolean(found),
    pageTitle: found ? `${name} - Smakelo` : `${say('place.not_found', locale)} - Smakelo`,
    pageDescription: found
      ? String(business.description || `${name} in ${business.city}`)
      : say('place.not_found_body', locale),
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
    priceLabel: symbolFor(currency).repeat(Math.max(1, Math.min(4, Number(business.price_tier) || 2))),
    ratingAverage: Number(business.rating_average ?? 0),
    ratingCount: Number(business.rating_count ?? 0),
    ratingLabel: say('business.rating_count', locale, { count: Number(business.rating_count ?? 0) }),
    notPartnerBody: say('place.not_partner_body', locale, { name }),
    claimBody: say('place.claim_body', locale, { name }),
    reviewsClosed: say('place.reviews_closed', locale, { name }),
    hasRating: Number(business.rating_count ?? 0) > 0,
    isPartner: Number(business.is_partner) === 1,
    statusLabel: statusLabel(status, locale),
    prepTimeMinutes: Number(business.prep_time_minutes ?? 0),
    fulfilment: fulfilment(business, locale),
    week: weekTable(hours, locale),
    menu: (found?.menu ?? []).map((section: any) => ({
      section: String(section.section),
      items: section.items.map((item: any) => ({
        name: String(item.name),
        description: String(item.description ?? ''),
        price: money(item.price, currency),
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

/**
 * A price, in the currency of the market the business belongs to.
 *
 * The symbol used to be a literal dollar sign, which was true of every
 * business on the site until there were businesses in Germany. A euro menu
 * priced in dollars is not a cosmetic slip - it is the page stating the wrong
 * amount of money.
 */
function money(cents: unknown, currency: string): string {
  return symbolFor(currency) + (Number(cents ?? 0) / 100).toFixed(2)
}

function symbolFor(currency: string): string {
  return currency.toLowerCase() === 'eur' ? '€' : '$'
}

/**
 * One string, in the language of this render.
 *
 * Through `Actions/Locale/translate` rather than straight to the framework's
 * `t`, because that module loads the translation files on its first call. Calling
 * `t` directly worked only when something else had already loaded them - which
 * the generated place pages happen to do on the line above this module's
 * import, and nothing else does. A caller who imported this module on its own
 * got a view model full of key names.
 */
function say(key: string, locale: string, values?: Record<string, string | number>): string {
  return translateFor(key, locale, values)
}

function statusLabel(status: any, locale: string): string {
  if (status.state === 'unknown')
    return say('business.hours_unknown', locale)

  if (status.state === 'closed') {
    return typeof status.opensInMinutes === 'number' && status.opensInMinutes < 240
      ? say('place.closed_opens_in', locale, { minutes: status.opensInMinutes })
      : say('place.closed_now', locale)
  }

  return typeof status.closesInMinutes === 'number' && status.closesInMinutes < 90
    ? say('place.open_closing_in', locale, { minutes: status.closesInMinutes })
    : say('place.open_now', locale)
}

/** How you can actually get the food, in the order a customer would ask. */
function fulfilment(business: any, locale: string): string[] {
  if (Number(business.is_partner) !== 1)
    return []

  const options: string[] = []

  if (Number(business.offers_delivery) === 1)
    options.push(say('place.fulfilment_delivery', locale, { minutes: Number(business.prep_time_minutes ?? 0) }))

  if (Number(business.offers_pickup) === 1)
    options.push(say('place.fulfilment_pickup', locale))

  if (Number(business.offers_dine_in) === 1)
    options.push(say('place.fulfilment_dine_in', locale))

  if (Number(business.offers_shop) === 1)
    options.push(say('place.fulfilment_shop', locale))

  return options
}

/**
 * One row per weekday, Monday first.
 *
 * A day the business is shut still gets a line: a table that silently omits
 * Sunday reads as an oversight rather than as "closed on Sunday".
 */
function weekTable(hours: any[], locale: string): Array<{ name: string, text: string }> {
  const names = dayNames(locale)

  return [1, 2, 3, 4, 5, 6, 0].map((day) => {
    const intervals = hours
      .filter(hour => hour.dayOfWeek === day && !hour.isClosed)
      .sort((a, b) => a.opensAt - b.opensAt)

    return {
      name: names[day] ?? '',
      text: intervals.length === 0
        ? say('business.closed', locale)
        : intervals.map(hour => say('place.hours_range', locale, { open: formatMinuteOfDay(hour.opensAt), close: formatMinuteOfDay(hour.closesAt) })).join(', '),
    }
  })
}

/** Attach the full icon class; see `iconClass` on PlaceView for why. */
function withIconClass<T extends { icon: string }>(visual: T): T & { iconClass: string } {
  return { ...visual, iconClass: `i-hugeicons-${visual.icon}` }
}
