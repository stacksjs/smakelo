import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { HOME_KITCHENS, NRW_HOME_KITCHENS } from '../../database/data/businesses'
import { MENUS } from '../../database/data/menus'
import { visualFor } from '../../app/Actions/Business/identity'
import { placeViewModel } from '../../app/Actions/Business/place-view'

/**
 * Home kitchens.
 *
 * The one business type here that is somebody's flat rather than premises, and
 * the whole reason it needs its own tests: every other type can have its
 * address printed, its door pinned on a map and its row imported from open
 * data, and a home kitchen can have none of those. Each of those protections
 * is a small conditional somewhere, and a small conditional is exactly what a
 * later refactor drops without noticing - the page still renders, it just
 * renders somebody's home address.
 */

const ALL_HOME_KITCHENS = [...HOME_KITCHENS, ...NRW_HOME_KITCHENS]

/** A business row as the database hands it to the view model. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Amma\'s Table',
    slug: 'ammas-table',
    type: 'home_kitchen',
    address: 'Palms Blvd',
    city: 'Mar Vista',
    latitude: 34.0086,
    longitude: -118.4312,
    ...overrides,
  }
}

function viewModel(overrides: Record<string, unknown> = {}) {
  return placeViewModel({ business: row(overrides), hours: [], status: { state: 'unknown' }, currency: 'usd', menu: [], reviews: [] })
}

describe('a home kitchen is always invented', () => {
  test('every seeded one is a partner', () => {
    // A listing copied from open data has agreed to nothing. That is tolerable
    // for a restaurant, which is a public premises either way, and not for a
    // flat: the only reason a home kitchen can be here at all is that the
    // person cooking put it here.
    for (const kitchen of ALL_HOME_KITCHENS)
      expect(kitchen.partner).toBe(true)
  })

  test('no home kitchen was imported from open data', () => {
    const imported = readFileSync('database/data/osm-listings.ts', 'utf8')
      + readFileSync('database/data/osm-listings-wuppertal.ts', 'utf8')
      + readFileSync('database/data/osm-listings-gescher.ts', 'utf8')

    expect(imported).not.toContain('home_kitchen')
  })
})

describe('the address is held back', () => {
  test('the page shows the neighbourhood and not the street', () => {
    const vm = viewModel()

    expect(vm.location).toBe('Mar Vista')
    expect(vm.location).not.toContain('Palms Blvd')
    expect(vm.addressWithheld).toBe(true)
  })

  test('every other type still shows its street', () => {
    // The listing is useless without it, and a restaurant's door number is on
    // the door, in the phone book and in OpenStreetMap already.
    const vm = viewModel({ type: 'restaurant' })

    expect(vm.location).toBe('Palms Blvd, Mar Vista')
    expect(vm.addressWithheld).toBe(false)
  })

  test('a home kitchen with no city does not render a stray comma', () => {
    const vm = viewModel({ city: '' })

    expect(vm.location).toBe('')
  })
})

describe('the map does not point at the front door', () => {
  test('coordinates are rounded to about a kilometre', () => {
    const point = JSON.parse(viewModel().mapPoint)

    // Withholding the street line and then pinning the house would be a
    // privacy notice with a map to the thing it protects.
    expect(point.lat).toBe(34.01)
    expect(point.lng).toBe(-118.43)
    expect(point.approximate).toBe(true)
  })

  test('the rounding is stable rather than re-rolled', () => {
    // An offset that changes on each render can be averaged back to the true
    // position by anyone willing to reload. A grid square cannot.
    const first = JSON.parse(viewModel().mapPoint)
    const second = JSON.parse(viewModel().mapPoint)

    expect(first.lat).toBe(second.lat)
    expect(first.lng).toBe(second.lng)
  })

  test('every other type keeps its exact position', () => {
    const point = JSON.parse(viewModel({ type: 'restaurant' }).mapPoint)

    expect(point.lat).toBe(34.0086)
    expect(point.lng).toBe(-118.4312)
    expect(point.approximate).toBe(false)
  })

  test('the rounding actually moves the point off the address', () => {
    // A round number that happens to survive rounding would make this test
    // pass while proving nothing, so the seeds must not sit on the grid.
    for (const kitchen of ALL_HOME_KITCHENS) {
      const exact = `${kitchen.latitude},${kitchen.longitude}`
      const rounded = `${Math.round(kitchen.latitude * 100) / 100},${Math.round(kitchen.longitude * 100) / 100}`

      expect(rounded).not.toBe(exact)
    }
  })
})

describe('the shape of a home kitchen', () => {
  test('it has a menu, and a short one', () => {
    // A home kitchen with forty dishes is a restaurant with a domestic
    // address; the short menu is the feature, not a gap in the seed.
    for (const kitchen of ALL_HOME_KITCHENS) {
      const menu = MENUS[kitchen.slug]

      expect(menu).toBeDefined()

      const items = menu!.flatMap(section => section.items)

      expect(items.length).toBeGreaterThan(0)
      expect(items.length).toBeLessThanOrEqual(6)
    }
  })

  test('it cooks on some days and not others', () => {
    // Hours that run all week would take orders on days nobody is at the
    // stove, which is the one promise a one-person kitchen cannot absorb.
    for (const kitchen of ALL_HOME_KITCHENS) {
      expect(kitchen.hours).toBeDefined()
      expect(kitchen.hours!.length).toBeLessThan(7)
    }
  })

  test('it gets its own icon', () => {
    // `restaurant-01` is crossed cutlery, which reads as a place with tables.
    const visual = visualFor({ name: 'Mittagstisch bei Rita', slug: 'mittagstisch-bei-rita', type: 'home_kitchen', cuisine: '' })

    expect(visual.icon).toBe('pot-01')
  })

  test('a cuisine still wins over the type', () => {
    // The type icon is only the fallback. Every one of these fell through to
    // it at first, which made all six listings identical - the one thing an
    // icon exists to prevent - so the cuisines they introduced were added to
    // the list.
    const named = [
      ['Sri Lankan, Rice and Curry', 'rice-bowl-01'],
      ['Oaxacan, Tamales', 'taco-01'],
      ['Filipino, Home Cooking', 'rice-bowl-01'],
      ['Polnisch, Pierogi', 'noodles'],
    ]

    for (const [cuisine, icon] of named)
      expect(visualFor({ name: 'x', slug: 'x', type: 'home_kitchen', cuisine }).icon).toBe(icon)
  })

  test('a kitchen whose cuisine is just "home cooking" keeps the pot', () => {
    // Nothing in a library of food photographs answers "Westphalian lunch",
    // and inventing a needle for it would be picking a picture at random. The
    // pot is the honest answer, and it is the category's own icon.
    for (const cuisine of ['Türkisch, Hausmannskost', 'Westfälisch, Mittagstisch'])
      expect(visualFor({ name: 'x', slug: 'x', type: 'home_kitchen', cuisine }).icon).toBe('pot-01')
  })

  test('the new needles do not restyle anything that already existed', () => {
    // The list returns its first match, so an appended needle is only safe
    // while no older listing contains the word.
    const before = visualFor({ name: 'Marisol Cocina', slug: 'marisol-cocina', type: 'restaurant', cuisine: 'Mexican, Oaxacan' })

    expect(before.icon).toBe('taco-01')
  })
})

describe('the category is spelled the same everywhere', () => {
  const locales = ['en', 'de', 'nl']

  test('every language names it', () => {
    // An untranslated type falls back to its own key, so a missing label
    // renders the tile as "Home_kitchen" rather than failing.
    for (const locale of locales) {
      const yaml = readFileSync(`locales/${locale}.yml`, 'utf8')

      expect(yaml).toContain('home_kitchen:')
    }
  })

  test('the model, the seed and the database agree on the spelling', () => {
    const model = readFileSync('app/Models/Business.ts', 'utf8')
    const seeds = readFileSync('database/data/businesses.ts', 'utf8')

    // The column has a CHECK constraint listing the valid types. A seed
    // spelled 'home-kitchen' would be rejected at insert, not at build.
    expect(model).toContain('\'home_kitchen\'')
    expect(seeds).toContain('type: \'home_kitchen\'')

    for (const kitchen of ALL_HOME_KITCHENS)
      expect(kitchen.type).toBe('home_kitchen')
  })

  test('the feature page is linked from the footer', () => {
    // A documented feature nobody can navigate to is a file in the repo.
    const footer = readFileSync('resources/partials/footer.stx', 'utf8')

    expect(footer).toContain('/home-kitchens')
  })
})

/**
 * The same rule, on every surface that publishes a location.
 *
 * The first version of this protected the place page and left the search API
 * returning the street, which is the failure worth a test of its own: the page
 * a person reads looked correct while the endpoint behind it - the one a
 * scraper would actually use - handed out the address of every home kitchen on
 * the site. The rule now lives in one module; these check that both callers
 * still go through it.
 */
describe('every surface publishes the same thing', () => {
  test('the search API shapes its results through the rule', () => {
    // Asserted against the source rather than by running a search, because a
    // search needs a seeded database and CI has none - the first version of
    // this called `searchBusinesses`, passed on a developer machine and
    // returned zero rows on the runner, which is a test that only ever fails
    // where nobody is looking.
    //
    // What matters is that this file cannot go back to reading the row
    // directly. The rule's own behaviour is covered below, and on real data by
    // the place-page tests above.
    const source = readFileSync('app/Actions/Business/search.ts', 'utf8')

    expect(source).toContain('publicAddress(row.address, row.type)')
    expect(source).toContain('publicCoordinates(row.latitude, row.longitude, row.type)')
    expect(source).toContain('approximateLocation: point.approximate')

    // The street straight off the row is exactly what this replaced.
    expect(source).not.toContain('address: String(row.address')
  })

  test('the distance is still measured from the real position', () => {
    // Rounding for display must not cost a kilometre of accuracy in "1.2 km
    // away", so the distance is computed before the coordinates are blurred.
    const source = readFileSync('app/Actions/Business/search.ts', 'utf8')
    const distance = source.indexOf('distanceInMeters(')
    const blur = source.indexOf('publicCoordinates(')

    expect(distance).toBeGreaterThan(-1)
    expect(blur).toBeGreaterThan(distance)
  })

  test('the rule is stated in one place', async () => {
    const { hidesAddress, publicAddress, publicCoordinates } = await import('../../app/Actions/Business/privacy')

    expect(hidesAddress('home_kitchen')).toBe(true)
    expect(hidesAddress('restaurant')).toBe(false)
    expect(publicAddress('Palms Blvd', 'home_kitchen')).toBe('')
    expect(publicAddress('Palms Blvd', 'restaurant')).toBe('Palms Blvd')
    expect(publicCoordinates(34.0086, -118.4312, 'home_kitchen')).toEqual({ latitude: 34.01, longitude: -118.43, approximate: true })
  })
})

describe('the badge above the name', () => {
  test('opens out the underscore', async () => {
    // CSS upper-cases the badge, so the raw column value read as HOME_KITCHEN.
    const { placeViewModel } = await import('../../app/Actions/Business/place-view')
    const vm = placeViewModel({ business: row(), hours: [], status: { state: 'unknown' }, currency: 'usd', menu: [], reviews: [] })

    expect(vm.typeLabel).toBe('home kitchen')
  })

  test('leaves every existing type exactly as it was', async () => {
    // The `types.*` strings are plural, written for the category tiles.
    // Reaching for them here would have relabelled the badge on all 452
    // existing pages as a side effect of adding one type.
    const { placeViewModel } = await import('../../app/Actions/Business/place-view')

    for (const type of ['restaurant', 'cafe', 'bakery', 'farm', 'bar', 'grocery']) {
      const vm = placeViewModel({ business: row({ type }), hours: [], status: { state: 'unknown' }, currency: 'usd', menu: [], reviews: [] })

      expect(vm.typeLabel).toBe(type)
    }
  })
})
