/**
 * The places this site covers.
 *
 * Smakelo started as one city and hardcoded it: Santa Monica's coordinates sat
 * in the home page, in the discover page and in the importer, three copies of
 * the same pair of numbers. Adding a second place made that untenable, so the
 * cities live here and everything else asks.
 *
 * A region is a centre, a radius wide enough to hold the listings around it,
 * and the box the OpenStreetMap importer asks Overpass for. It also names a
 * market, because a market carries the things that are true of a country
 * rather than of a city - its currency, its tax mode and, most visibly, its
 * clock. A restaurant in Wuppertal is open at nine in the morning in Wuppertal,
 * not at nine in the morning in California.
 */

export interface RegionBox {
  south: number
  west: number
  north: number
  east: number
}

export interface Region {
  /** Used in `?region=` and as the seed's region tag on a business. */
  slug: string
  name: string
  /** The market slug in `markets`, which carries currency, tax and timezone. */
  market: string
  /** The language somebody in this region most likely reads. */
  locale: string
  latitude: number
  longitude: number
  /**
   * How far the listing pages look. Wide enough to hold what is actually
   * there: Los Angeles has to reach the farms an hour out of town, and the
   * two German regions are towns rather than counties.
   */
  radiusMeters: number
  /** What Overpass is asked for by `buddy import:places --region <slug>`. */
  box: RegionBox
  /** `addr:city` is often missing in OSM; this is what a listing says instead. */
  cityFallback: string
  /**
   * Where the house number goes. English-speaking countries put it first,
   * most of Europe puts it after the street, and a directory that gets this
   * wrong reads as a translation of an address rather than an address.
   */
  addressStyle: 'number-first' | 'street-first'
}

export const REGIONS: Region[] = [
  {
    slug: 'los-angeles',
    name: 'Los Angeles',
    market: 'los-angeles',
    locale: 'en',
    latitude: 34.0195,
    longitude: -118.4912,
    // Wide enough to include the farms. They are real growers in Ojai,
    // Moorpark and Tehachapi rather than anything in the city, so a tidy
    // city-sized radius would drop the entire farm side of the app off its
    // own home page. Distance is shown per card, so a box coming from an
    // hour away says so.
    radiusMeters: 200_000,
    box: { south: 33.975, west: -118.52, north: 34.06, east: -118.42 },
    cityFallback: 'Los Angeles',
    addressStyle: 'number-first',
  },
  {
    slug: 'wuppertal',
    name: 'Wuppertal',
    market: 'nordrhein-westfalen',
    locale: 'de',
    // The Schwebebahn line runs the length of the valley; this is about the
    // middle of it, between Elberfeld and Barmen.
    latitude: 51.2562,
    longitude: 7.1508,
    radiusMeters: 20_000,
    box: { south: 51.195, west: 7.02, north: 51.315, east: 7.30 },
    cityFallback: 'Wuppertal',
    addressStyle: 'street-first',
  },
  {
    slug: 'gescher',
    name: 'Gescher',
    market: 'nordrhein-westfalen',
    locale: 'de',
    latitude: 51.9556,
    longitude: 7.0053,
    // A town of seventeen thousand. The radius reaches the neighbouring ones -
    // Coesfeld, Stadtlohn, Velen - because a directory of one small town that
    // stops at the parish boundary is a directory of eight places.
    radiusMeters: 18_000,
    box: { south: 51.885, west: 6.88, north: 52.03, east: 7.13 },
    cityFallback: 'Gescher',
    addressStyle: 'street-first',
  },
]

export const DEFAULT_REGION: Region = REGIONS[0] as Region

/** The region with this slug, or nothing. */
export function regionBySlug(slug: string | undefined | null): Region | undefined {
  if (!slug)
    return undefined

  return REGIONS.find(region => region.slug === String(slug).toLowerCase())
}

/**
 * Which region a request should open on.
 *
 * An explicit `?region=` wins, because somebody who asked for Gescher asked
 * for Gescher. Failing that the language decides: a visitor reading the German
 * pages is shown the German places, which is the only reading of "where am I"
 * this app has. Dutch falls through to Los Angeles rather than guessing at a
 * Dutch city there is no data for - a region with nothing in it is worse than
 * one that is honestly somewhere else.
 */
export function resolveRegion(asked?: string | null, locale?: string | null): Region {
  const explicit = regionBySlug(asked)

  if (explicit)
    return explicit

  if (locale) {
    const byLocale = REGIONS.find(region => region.locale === locale)

    if (byLocale)
      return byLocale
  }

  return DEFAULT_REGION
}
