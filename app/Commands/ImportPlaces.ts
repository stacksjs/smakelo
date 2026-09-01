import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineCommand, log } from '@stacksjs/cli'
import type { Region } from '../Actions/Business/regions'
import { REGIONS, regionBySlug } from '../Actions/Business/regions'

/**
 * Import real businesses from OpenStreetMap, one region at a time.
 *
 * The listing half of Smakelo is real places or it is nothing: a directory of
 * invented restaurants demonstrates a directory of invented restaurants. OSM
 * is the right source because it is open (ODbL, attributed on every page) and
 * because its data is contributed by people who go to these places.
 *
 * The result is written to a checked-in file rather than fetched at seed time.
 * A deploy that depends on Overpass being up is a deploy that fails on a
 * Tuesday for reasons nobody can act on, and a demo whose contents change
 * under it is one where a screenshot stops matching.
 *
 * One file per region, named after it, because that is the unit somebody
 * re-imports: Wuppertal gaining a restaurant should not rewrite the Los
 * Angeles file and put four hundred unrelated lines in the diff.
 *
 * These places have not agreed to anything. They are listed and searchable and
 * that is all: no reviews, no orders, and a claim form that leads with taking
 * the listing down.
 */

interface OsmElement {
  id: number
  lat: number
  lon: number
  tags: Record<string, string>
}

/** The export name and file each region's listings are written to. */
function fileFor(region: Region): { path: string, constant: string } {
  const suffix = region.slug === 'los-angeles' ? '' : `-${region.slug}`
  const constant = region.slug === 'los-angeles'
    ? 'OSM_LISTINGS'
    : `OSM_LISTINGS_${region.slug.toUpperCase().replace(/-/g, '_')}`

  return { path: `osm-listings${suffix}.ts`, constant }
}

function queryFor(region: Region): string {
  const box = `${region.box.south},${region.box.west},${region.box.north},${region.box.east}`

  return `[out:json][timeout:90];
(
  node["amenity"~"^(restaurant|cafe)$"]["name"](${box});
  node["shop"~"^(bakery|greengrocer|farm)$"]["name"](${box});
);
out body 400;`
}

export default defineCommand((cli) => {
  cli
    .command('import:places', 'Fetch real listings for a region from OpenStreetMap')
    .option('--region <slug>', `Which region: ${REGIONS.map(region => region.slug).join(', ')}`, { default: 'los-angeles' })
    .option('--limit <count>', 'How many to keep', { default: 250 })
    .action(async (options: { region?: string, limit?: number }) => {
      const region = regionBySlug(options.region)

      if (!region) {
        log.error(`No region called "${options.region}". Known regions: ${REGIONS.map(entry => entry.slug).join(', ')}.`)
        return
      }

      log.info(`Asking Overpass for restaurants, cafes and food shops around ${region.name}...`)

      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // Overpass answers 406 to a request with no User-Agent. Saying who
          // is asking is also just good manners toward a volunteer-run service.
          'User-Agent': 'Smakelo/0.1 (demonstration app; https://smakelo.stacksjs.com)',
        },
        body: `data=${encodeURIComponent(queryFor(region))}`,
      })

      if (!response.ok) {
        log.error(`Overpass answered ${response.status}. The checked-in file is unchanged.`)
        return
      }

      const payload = await response.json() as { elements?: OsmElement[] }
      const elements = payload.elements ?? []

      log.info(`Overpass returned ${elements.length} places`)

      const seen = new Set<string>()
      const listings = []

      for (const element of elements) {
        const listing = shape(element, region)

        if (!listing)
          continue

        // Two nodes for one restaurant is normal in OSM: a building and a
        // point, or an old entry nobody deleted. Slug collision catches most
        // of it; the rest is not worth a fuzzy match on a demo.
        if (seen.has(listing.slug))
          continue

        seen.add(listing.slug)
        listings.push(listing)

        if (listings.length >= Number(options.limit ?? 250))
          break
      }

      const file = fileFor(region)
      const target = join(process.cwd(), 'database', 'data', file.path)

      writeFileSync(target, render(listings, region, file.constant))

      const withHours = listings.filter(listing => listing.hours.length > 0).length

      log.success(`Wrote ${listings.length} ${region.name} listings (${withHours} with hours) to database/data/${file.path}`)
    })
})

function shape(element: OsmElement, region: Region) {
  const tags = element.tags ?? {}
  const name = String(tags.name ?? '').trim()

  if (!name || name.length > 60 || !Number.isFinite(element.lat))
    return null

  const type = ({
    restaurant: 'restaurant',
    cafe: 'cafe',
    bakery: 'bakery',
    greengrocer: 'grocery',
    farm: 'farm',
  } as Record<string, string>)[tags.amenity ?? tags.shop ?? ''] ?? 'restaurant'

  const parts = [tags['addr:housenumber'], tags['addr:street']]
  const street = (region.addressStyle === 'street-first' ? parts.reverse() : parts)
    .filter(Boolean)
    .join(' ')

  /*
   * A listing with no street is kept, because the map pin is the thing that
   * matters and OSM's coordinates are good. It just says less.
   */
  return {
    name,
    // Two towns three thousand miles apart both have a Ristorante Roma, and a
    // slug is the primary key the seeder deduplicates on. Prefixing everything
    // outside the first region keeps the older Los Angeles slugs - and the
    // URLs somebody may have linked to - exactly as they were.
    slug: region.slug === 'los-angeles' ? slugify(name) : `${region.slug}-${slugify(name)}`,
    type,
    cuisine: cuisine(tags),
    description: '',
    address: street,
    city: tags['addr:city'] || region.cityFallback,
    postalCode: tags['addr:postcode'] || '',
    latitude: Number(element.lat.toFixed(6)),
    longitude: Number(element.lon.toFixed(6)),
    priceTier: 2,
    region: region.slug,
    hours: parseHours(String(tags.opening_hours ?? '')),
  }
}

/** OSM's `cuisine` tag is semicolon-separated and lowercase with underscores. */
function cuisine(tags: Record<string, string>): string {
  const raw = String(tags.cuisine ?? '').split(';').filter(Boolean).slice(0, 2)

  if (raw.length === 0)
    return tags.amenity === 'cafe' ? 'Coffee' : ''

  return raw
    .map(word => word.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()))
    .join(', ')
}

/**
 * Parse the common shapes of OSM `opening_hours`, and only those.
 *
 * The full grammar has holidays, seasons, sunset offsets and comments. A
 * partial parser that guesses would produce a business that claims to be open
 * when it is shut, which is worse than one that says nothing: `openStatus`
 * already treats absent hours as unknown rather than as closed, so leaving
 * them out is the honest failure.
 */
function parseHours(value: string): Array<{ day: number, open: number, close: number }> {
  if (!value)
    return []

  if (value.trim() === '24/7')
    return [0, 1, 2, 3, 4, 5, 6].map(day => ({ day, open: 0, close: 1440 }))

  const DAYS: Record<string, number> = { su: 0, mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6 }
  const out: Array<{ day: number, open: number, close: number }> = []

  for (const rule of value.split(';')) {
    const match = rule.trim().match(/^([A-Za-z,\-]+)\s+(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/)

    if (!match)
      continue

    const [, dayPart, openHour, openMinute, closeHour, closeMinute] = match
    const open = Number(openHour) * 60 + Number(openMinute)
    const close = Number(closeHour) * 60 + Number(closeMinute)

    for (const token of String(dayPart).split(',')) {
      const range = token.trim().toLowerCase().split('-')
      const from = DAYS[range[0] ?? '']
      const to = range.length > 1 ? DAYS[range[1] ?? ''] : from

      if (from === undefined || to === undefined)
        continue

      // Ranges wrap: "Th-Mo" is Thursday through Monday, not an error.
      for (let day = from; ; day = (day + 1) % 7) {
        out.push({ day, open, close })

        if (day === to)
          break
      }
    }
  }

  // One entry per day wins: a place with a lunch and a dinner rule would need
  // split hours, which this app models but this parser will not guess at.
  const byDay = new Map<number, { day: number, open: number, close: number }>()

  for (const entry of out) {
    if (!byDay.has(entry.day))
      byDay.set(entry.day, entry)
  }

  return [...byDay.values()].sort((a, b) => a.day - b.day)
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function render(listings: unknown[], region: Region, constant: string): string {
  return `/**
 * Real places around ${region.name}, imported from OpenStreetMap.
 *
 * Generated by \`buddy import:places --region ${region.slug}\`. Do not edit by
 * hand: the curated listings live in \`businesses.ts\`, which is where a
 * correction belongs.
 *
 * These businesses have agreed to nothing. They are listed and searchable and
 * that is all: no reviews, no orders, and a claim form that leads with taking
 * the listing down. Data from OpenStreetMap contributors, ODbL.
 */

import type { SeedBusiness } from './businesses'

export const ${constant}: SeedBusiness[] = ${JSON.stringify(listings, null, 2)}
`
}
