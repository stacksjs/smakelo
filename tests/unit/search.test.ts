import { describe, expect, test } from 'bun:test'
import { searchBusinesses } from '../../app/Actions/Business/search'
import { factory, refreshDatabase } from '../support/database'

/**
 * Finding a place.
 *
 * This is the query the whole site is built on - the home page, /discover, the
 * map, every category tile - and until there was a database a test could write
 * to, none of it was covered. What it does is not obvious from reading it
 * either: a bounding box in SQL narrowed by an exact circle in code, text
 * matched over four columns with every word required, a soft-deleted row that
 * has to disappear from everywhere at once, and coordinates that are rounded
 * on the way out for one type and not the others.
 *
 * Each of those fails quietly. A radius that keeps the box's corners returns
 * somewhere half a mile too far and looks like a rounding error; a text search
 * that ORs its words returns every coffee shop in the county and looks like
 * bad ranking.
 */

const database = refreshDatabase()

/* Santa Monica pier, near enough. */
const CENTRE = { latitude: 34.0094, longitude: -118.4973 }

/** A point `metres` due north of the centre. */
function north(metres: number): { latitude: number, longitude: number } {
  return { latitude: CENTRE.latitude + metres / 111_320, longitude: CENTRE.longitude }
}

describe('what comes back at all', () => {
  test('a soft-deleted listing is gone from the search', async () => {
    // Curation sets `deleted_at` rather than deleting the row. Taking a
    // business down from one screen and leaving it on the search is worse than
    // not offering to take it down.
    database.seed('businesses', [
      factory.business({ slug: 'open-one', name: 'Still Here' }),
      factory.business({ slug: 'taken-down', name: 'Taken Down', deleted_at: '2026-01-01 00:00:00' }),
    ])

    const found = await searchBusinesses()

    expect(found.map(result => result.slug)).toEqual(['open-one'])
  })

  test('a type filter returns only that type', async () => {
    database.seed('businesses', [
      factory.business({ slug: 'a-cafe', type: 'cafe' }),
      factory.business({ slug: 'a-bakery', type: 'bakery' }),
    ])

    const found = await searchBusinesses({ type: 'cafe' })

    expect(found.map(result => result.slug)).toEqual(['a-cafe'])
  })

  test('partnersOnly drops everything that cannot take an order', async () => {
    database.seed('businesses', [
      factory.business({ slug: 'listing', is_partner: 0 }),
      factory.business({ slug: 'partner', is_partner: 1 }),
    ])

    const found = await searchBusinesses({ partnersOnly: true })

    expect(found.map(result => result.slug)).toEqual(['partner'])
  })

  test('a limit is honoured', async () => {
    database.seed('businesses', Array.from({ length: 5 }, (_, index) =>
      factory.business({ slug: `place-${index}` })))

    expect((await searchBusinesses({ limit: 3 })).length).toBe(3)
  })
})

describe('matching words', () => {
  test('looks in the name, the cuisine, the description and the city', async () => {
    database.seed('businesses', [
      factory.business({ slug: 'by-name', name: 'Kaffeehaus' }),
      factory.business({ slug: 'by-cuisine', name: 'A', cuisine: 'Kaffeehaus, Frühstück' }),
      factory.business({ slug: 'by-description', name: 'B', description: 'An old Kaffeehaus on the corner.' }),
      factory.business({ slug: 'by-city', name: 'C', city: 'Kaffeehaus Town' }),
      factory.business({ slug: 'unrelated', name: 'D' }),
    ])

    const found = await searchBusinesses({ q: 'kaffeehaus' })

    expect(found.map(result => result.slug).sort())
      .toEqual(['by-city', 'by-cuisine', 'by-description', 'by-name'])
  })

  test('every word has to appear, not any of them', async () => {
    // ORing the words turns "venice coffee" into every coffee shop in the
    // county, which reads as bad ranking rather than as the wrong operator.
    database.seed('businesses', [
      factory.business({ slug: 'both', name: 'Venice Coffee' }),
      factory.business({ slug: 'one-word', name: 'Venice Pizza' }),
    ])

    const found = await searchBusinesses({ q: 'venice coffee' })

    expect(found.map(result => result.slug)).toEqual(['both'])
  })

  test('case and surrounding space do not matter', async () => {
    database.seed('businesses', [factory.business({ slug: 'found', name: 'Gjelina' })])

    expect((await searchBusinesses({ q: '  GJELINA  ' })).map(r => r.slug)).toEqual(['found'])
  })
})

describe('how near it is', () => {
  test('measures the distance from the centre', async () => {
    database.seed('businesses', [factory.business({ slug: 'up-the-road', ...north(1000) })])

    const [found] = await searchBusinesses({ ...CENTRE, radiusMeters: 5000 })

    expect(found.distanceMeters).toBeGreaterThan(950)
    expect(found.distanceMeters).toBeLessThan(1050)
  })

  test('the radius is a circle, not the box around it', async () => {
    // The bounding box is what SQL can index, and it keeps its corners: a
    // place on the diagonal is inside the box and outside the radius. Without
    // the second pass the search returns somewhere up to 40% too far away,
    // which reads as a rounding error rather than a missing filter.
    const metres = 900
    const corner = {
      latitude: CENTRE.latitude + metres / 111_320,
      longitude: CENTRE.longitude + metres / (111_320 * Math.cos(CENTRE.latitude * Math.PI / 180)),
    }

    database.seed('businesses', [
      factory.business({ slug: 'inside', ...north(900) }),
      factory.business({ slug: 'on-the-diagonal', ...corner }),
    ])

    const found = await searchBusinesses({ ...CENTRE, radiusMeters: 1000 })

    // The diagonal one is ~1270m away: inside the box, outside the circle.
    expect(found.map(result => result.slug)).toEqual(['inside'])
  })

  test('somewhere beyond the radius is not returned', async () => {
    database.seed('businesses', [
      factory.business({ slug: 'near', ...north(500) }),
      factory.business({ slug: 'far', ...north(20_000) }),
    ])

    const found = await searchBusinesses({ ...CENTRE, radiusMeters: 2000 })

    expect(found.map(result => result.slug)).toEqual(['near'])
  })

  test('without a centre there is no distance to report', async () => {
    database.seed('businesses', [factory.business({ slug: 'anywhere' })])

    const [found] = await searchBusinesses()

    expect(found.distanceMeters).toBe(null)
  })
})

describe('the order they come back in', () => {
  test('nearest first when a centre was given', async () => {
    database.seed('businesses', [
      factory.business({ slug: 'far', ...north(3000) }),
      factory.business({ slug: 'near', ...north(300) }),
      factory.business({ slug: 'middle', ...north(1500) }),
    ])

    const found = await searchBusinesses({ ...CENTRE, radiusMeters: 10_000 })

    expect(found.map(result => result.slug)).toEqual(['near', 'middle', 'far'])
  })

  test('best rated first when there is no centre', async () => {
    database.seed('businesses', [
      factory.business({ slug: 'ok', rating_average: 3 }),
      factory.business({ slug: 'great', rating_average: 5 }),
      factory.business({ slug: 'fine', rating_average: 4 }),
    ])

    const found = await searchBusinesses()

    expect(found.map(result => result.slug)).toEqual(['great', 'fine', 'ok'])
  })

  test('by name when asked', async () => {
    database.seed('businesses', [
      factory.business({ slug: 'c', name: 'Charlie' }),
      factory.business({ slug: 'a', name: 'Alpha' }),
      factory.business({ slug: 'b', name: 'Bravo' }),
    ])

    const found = await searchBusinesses({ sort: 'name' })

    expect(found.map(result => result.name)).toEqual(['Alpha', 'Bravo', 'Charlie'])
  })
})

describe('what it publishes about where a place is', () => {
  test('a home kitchen loses its street and gains a rounded point', async () => {
    database.seed('businesses', [
      factory.business({
        slug: 'a-home-kitchen',
        type: 'home_kitchen',
        address: 'Palms Blvd',
        city: 'Mar Vista',
        latitude: 34.0086,
        longitude: -118.4312,
      }),
    ])

    const [found] = await searchBusinesses({ type: 'home_kitchen' })

    expect(found.address).toBe('')
    expect(found.city).toBe('Mar Vista')
    expect(found.latitude).toBe(34.01)
    expect(found.approximateLocation).toBe(true)
  })

  test('every other type keeps both', async () => {
    database.seed('businesses', [
      factory.business({ slug: 'a-restaurant', address: 'Palms Blvd', latitude: 34.0086 }),
    ])

    const [found] = await searchBusinesses({ type: 'restaurant' })

    expect(found.address).toBe('Palms Blvd')
    expect(found.latitude).toBe(34.0086)
    expect(found.approximateLocation).toBe(false)
  })

  test('the distance is still measured from the real position', async () => {
    // Rounding for display must not cost a kilometre of accuracy in "1.2 km
    // away". A home kitchen 500m off should report ~500m, not the ~1km its
    // published coordinates would give.
    database.seed('businesses', [
      factory.business({ slug: 'near-kitchen', type: 'home_kitchen', ...north(500) }),
    ])

    const [found] = await searchBusinesses({ ...CENTRE, radiusMeters: 5000, type: 'home_kitchen' })

    expect(found.distanceMeters).toBeGreaterThan(450)
    expect(found.distanceMeters).toBeLessThan(550)
  })
})
