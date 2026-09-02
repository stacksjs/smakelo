import { describe, expect, test } from 'bun:test'
import { menuFor } from '../../app/Actions/Order/menu'
import { factory, refreshDatabase } from '../support/database'

/**
 * The menu, as the ordering screen gets it.
 *
 * `menuFor` is the only thing standing between four tables and a screen
 * somebody orders from, and it was untested. Its job is mostly assembly -
 * sections in the kitchen's order, each item with the modifier groups that
 * belong to it and the constraints those groups carry - and assembly code
 * fails by attaching the right data to the wrong parent, which renders
 * perfectly and sells the wrong thing.
 *
 * The constraints matter more than they look. `min` and `max` are what the
 * ordering drawer enforces while somebody is choosing; the server checks them
 * again at placement, so a group that arrives with the wrong numbers is not a
 * security hole - it is a customer who cannot order a pizza because the size
 * they picked was silently dropped.
 */

const database = refreshDatabase()

function seedBusiness(overrides: Record<string, unknown> = {}): number {
  const [marketId] = database.seed('markets', [{
    name: 'Los Angeles',
    slug: 'los-angeles',
    city: 'Los Angeles',
    country_code: 'US',
    currency: 'usd',
    timezone: 'America/Los_Angeles',
    locale: 'en',
    center_latitude: 34.0195,
    center_longitude: -118.4912,
    is_active: 1,
  }])

  const [businessId] = database.seed('businesses', [factory.business({
    slug: 'a-kitchen',
    name: 'A Kitchen',
    cuisine: 'Italian, Pasta',
    is_partner: 1,
    offers_pickup: 1,
    market_id: marketId,
    ...overrides,
  })])

  return businessId
}

function seedCategory(name: string, order: number): number {
  const [id] = database.seed('categories', [{ name, slug: name.toLowerCase(), display_order: order, is_active: 1 }])

  return id
}

describe('a business that is not there', () => {
  test('gives nothing rather than an empty menu', async () => {
    // An empty menu and a missing business are different answers, and the
    // ordering screen shows different things for them.
    expect(await menuFor('nobody')).toBe(null)
  })
})

describe('sections', () => {
  test('come back in the order the kitchen sends them', async () => {
    // `display_order`, not insertion order and not alphabetical: a menu that
    // opens on desserts is a menu somebody has to scroll back up.
    const businessId = seedBusiness()
    const starters = seedCategory('Starters', 1)
    const mains = seedCategory('Mains', 2)
    const puddings = seedCategory('Puddings', 3)

    database.seed('products', [
      factory.product({ name: 'Tiramisu', business_id: businessId, category_id: puddings }),
      factory.product({ name: 'Bread', business_id: businessId, category_id: starters }),
      factory.product({ name: 'Ragu', business_id: businessId, category_id: mains }),
    ])

    const menu = await menuFor('a-kitchen')

    expect(menu!.sections.map(section => section.name)).toEqual(['Starters', 'Mains', 'Puddings'])
  })

  test('hold only their own items', async () => {
    const businessId = seedBusiness()
    const starters = seedCategory('Starters', 1)
    const mains = seedCategory('Mains', 2)

    database.seed('products', [
      factory.product({ name: 'Bread', business_id: businessId, category_id: starters }),
      factory.product({ name: 'Ragu', business_id: businessId, category_id: mains }),
    ])

    const menu = await menuFor('a-kitchen')

    expect(menu!.sections.find(s => s.name === 'Starters')!.items.map(i => i.name)).toEqual(['Bread'])
    expect(menu!.sections.find(s => s.name === 'Mains')!.items.map(i => i.name)).toEqual(['Ragu'])
  })
})

describe('which items appear', () => {
  test('one that is not available is left off', async () => {
    // The kitchen has run out. It should not be orderable, and a row that is
    // still on the menu greyed out is a row somebody will try to press.
    const businessId = seedBusiness()
    const category = seedCategory('Mains', 1)

    database.seed('products', [
      factory.product({ name: 'On', business_id: businessId, category_id: category, is_available: 1 }),
      factory.product({ name: 'Off', business_id: businessId, category_id: category, is_available: 0 }),
    ])

    const menu = await menuFor('a-kitchen')

    expect(menu!.sections.flatMap(s => s.items).map(i => i.name)).toEqual(['On'])
  })

  test('another business\'s items do not leak in', async () => {
    const mine = seedBusiness()
    const category = seedCategory('Mains', 1)
    const [theirs] = database.seed('businesses', [factory.business({ slug: 'someone-else' })])

    database.seed('products', [
      factory.product({ name: 'Mine', business_id: mine, category_id: category }),
      factory.product({ name: 'Theirs', business_id: theirs, category_id: category }),
    ])

    const menu = await menuFor('a-kitchen')

    expect(menu!.sections.flatMap(s => s.items).map(i => i.name)).toEqual(['Mine'])
  })
})

describe('modifier groups', () => {
  test('attach to the item they belong to, with their constraints', async () => {
    // Assembly code fails by hanging the right data off the wrong parent,
    // which renders perfectly and sells the wrong thing.
    const businessId = seedBusiness()
    const category = seedCategory('Mains', 1)

    const [pizzaId, saladId] = database.seed('products', [
      factory.product({ name: 'Pizza', business_id: businessId, category_id: category }),
      factory.product({ name: 'Salad', business_id: businessId, category_id: category }),
    ])

    const [sizeId] = database.seed('modifier_groups', [
      { name: 'Size', description: 'How big', min_selections: 1, max_selections: 1, product_id: pizzaId, position: 1 },
    ])
    const [dressingId] = database.seed('modifier_groups', [
      { name: 'Dressing', min_selections: 0, max_selections: 2, product_id: saladId, position: 1 },
    ])

    database.seed('modifiers', [
      { name: 'Regular', price_delta_cents: 0, is_default: 1, is_available: 1, modifier_group_id: sizeId, position: 1 },
      { name: 'Large', price_delta_cents: 500, is_default: 0, is_available: 1, modifier_group_id: sizeId, position: 2 },
      { name: 'Ranch', price_delta_cents: 100, is_default: 0, is_available: 1, modifier_group_id: dressingId, position: 1 },
    ])

    const items = (await menuFor('a-kitchen'))!.sections.flatMap(section => section.items)
    const pizza = items.find(item => item.name === 'Pizza')!
    const salad = items.find(item => item.name === 'Salad')!

    expect(pizza.groups.map(group => group.name)).toEqual(['Size'])
    expect(pizza.groups[0]!.min).toBe(1)
    expect(pizza.groups[0]!.max).toBe(1)
    expect(pizza.groups[0]!.options.map(option => option.name)).toEqual(['Regular', 'Large'])

    expect(salad.groups.map(group => group.name)).toEqual(['Dressing'])
    expect(salad.groups[0]!.max).toBe(2)
    expect(salad.groups[0]!.options.map(option => option.name)).toEqual(['Ranch'])
  })

  test('carry the default and the price difference', async () => {
    // The drawer preselects the default so the common order is two taps, and
    // shows the delta so the price moves as options are ticked.
    const businessId = seedBusiness()
    const category = seedCategory('Mains', 1)
    const [productId] = database.seed('products', [factory.product({ name: 'Pizza', business_id: businessId, category_id: category })])
    const [groupId] = database.seed('modifier_groups', [{ name: 'Size', min_selections: 1, max_selections: 1, product_id: productId, position: 1 }])

    database.seed('modifiers', [
      { name: 'Regular', price_delta_cents: 0, is_default: 1, is_available: 1, modifier_group_id: groupId, position: 1 },
      { name: 'Large', price_delta_cents: 500, is_default: 0, is_available: 1, modifier_group_id: groupId, position: 2 },
    ])

    const [group] = (await menuFor('a-kitchen'))!.sections[0]!.items[0]!.groups

    expect(group!.options.find(o => o.name === 'Regular')!.isDefault).toBe(true)
    expect(group!.options.find(o => o.name === 'Large')!.priceDeltaCents).toBe(500)
  })

  test('an unavailable option is not offered', async () => {
    const businessId = seedBusiness()
    const category = seedCategory('Mains', 1)
    const [productId] = database.seed('products', [factory.product({ name: 'Pizza', business_id: businessId, category_id: category })])
    const [groupId] = database.seed('modifier_groups', [{ name: 'Extras', min_selections: 0, max_selections: 2, product_id: productId, position: 1 }])

    database.seed('modifiers', [
      { name: 'Olives', price_delta_cents: 100, is_default: 0, is_available: 1, modifier_group_id: groupId, position: 1 },
      { name: 'Anchovy', price_delta_cents: 200, is_default: 0, is_available: 0, modifier_group_id: groupId, position: 2 },
    ])

    const [group] = (await menuFor('a-kitchen'))!.sections[0]!.items[0]!.groups

    expect(group!.options.map(option => option.name)).toEqual(['Olives'])
  })

  test('an item with nothing to choose has no groups', async () => {
    const businessId = seedBusiness()
    const category = seedCategory('Mains', 1)

    database.seed('products', [factory.product({ name: 'Bread', business_id: businessId, category_id: category })])

    expect((await menuFor('a-kitchen'))!.sections[0]!.items[0]!.groups).toEqual([])
  })
})

describe('allergens', () => {
  test('are parsed out of the column', async () => {
    const businessId = seedBusiness()
    const category = seedCategory('Mains', 1)

    database.seed('products', [
      factory.product({ name: 'Pasta', business_id: businessId, category_id: category, allergens: '["gluten","egg"]' }),
    ])

    expect((await menuFor('a-kitchen'))!.sections[0]!.items[0]!.allergens).toEqual(['gluten', 'egg'])
  })

  test('a malformed list costs that dish its allergens, not the whole menu', async () => {
    // The column is a plain string and a row written by hand can hold
    // anything. Throwing here would take down the menu, which is a worse
    // outcome than showing none - though neither is good, which is why the
    // parse is defensive rather than trusting.
    const businessId = seedBusiness()
    const category = seedCategory('Mains', 1)

    database.seed('products', [
      factory.product({ name: 'Broken', business_id: businessId, category_id: category, allergens: 'not json at all' }),
      factory.product({ name: 'Fine', business_id: businessId, category_id: category, allergens: '["dairy"]' }),
    ])

    const items = (await menuFor('a-kitchen'))!.sections[0]!.items

    expect(items.find(item => item.name === 'Broken')!.allergens).toEqual([])
    expect(items.find(item => item.name === 'Fine')!.allergens).toEqual(['dairy'])
  })

  test('valid JSON that is not a list is also refused', () => {
    // The distinct case from the one above, and the reason the guard is not
    // just a try/catch: `"gluten"`, `42` and `{}` all parse without throwing
    // and none of them is an allergen list. Handed straight through, the
    // ordering screen calls `.map` on a string and the menu goes blank.
    const businessId = seedBusiness()
    const category = seedCategory('Mains', 1)

    database.seed('products', [
      factory.product({ name: 'A String', business_id: businessId, category_id: category, allergens: '"gluten"' }),
      factory.product({ name: 'An Object', business_id: businessId, category_id: category, allergens: '{"gluten":true}' }),
      factory.product({ name: 'A Number', business_id: businessId, category_id: category, allergens: '42' }),
    ])

    return menuFor('a-kitchen').then((menu) => {
      for (const item of menu!.sections[0]!.items)
        expect(item.allergens).toEqual([])
    })
  })
})

describe('what the business itself carries', () => {
  test('the currency comes from its market', async () => {
    // Prices are rendered against this. A euro menu priced in dollars is not a
    // formatting bug to the person paying.
    const [marketId] = database.seed('markets', [{
      name: 'Wuppertal',
      slug: 'wuppertal',
      city: 'Wuppertal',
      country_code: 'DE',
      currency: 'eur',
      timezone: 'Europe/Berlin',
      locale: 'de',
      center_latitude: 51.2562,
      center_longitude: 7.1508,
      is_active: 1,
    }])

    database.seed('businesses', [factory.business({ slug: 'german-place', market_id: marketId })])

    expect((await menuFor('german-place'))!.business.currency).toBe('eur')
  })

  test('the fulfilment flags come through as booleans', async () => {
    database.seed('businesses', [factory.business({
      slug: 'pickup-only',
      offers_pickup: 1,
      offers_delivery: 0,
      offers_dine_in: 0,
    })])

    const { business } = (await menuFor('pickup-only'))!

    expect(business.offersPickup).toBe(true)
    expect(business.offersDelivery).toBe(false)
    expect(business.offersDineIn).toBe(false)
  })
})
