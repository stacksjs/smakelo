import { defineCommand, log } from '@stacksjs/cli'
import { db } from '@stacksjs/database'
import { dispatchOrder } from '../Actions/Delivery/dispatch'
import { advanceOrder } from '../Actions/Merchant/board'
import { placeOrder } from '../Actions/Order/place'
import { resolveRegion } from '../Actions/Business/regions'
import { ALL_BUSINESSES } from '../../database/data/businesses'
import { MENUS } from '../../database/data/menus'
import { REVIEWS } from '../../database/data/reviews'

/**
 * Seed the demo.
 *
 * `buddy seed` drives model factories, which is the right tool for volume and
 * the wrong one here: the point of this data is that a person chose it. The
 * businesses are real places, the menus read like menus, and the reviews were
 * written rather than generated. Faker would fill the same columns and
 * demonstrate nothing.
 *
 * Idempotent by slug, so it can be re-run against a database that already has
 * some of it - which is what a deploy does.
 */
export default defineCommand((cli) => {
  cli
    .command('seed:demo', 'Load the curated Los Angeles and Nordrhein-Westfalen demo data')
    .option('--fresh', 'Delete existing demo rows first', { default: false })
    .action(async (options: { fresh?: boolean }) => {
      if (options.fresh)
        await clearDemoRows()

      const marketIds = await seedMarkets()
      const businessIds = await seedBusinesses(marketIds)
      const menuItems = await seedMenus(businessIds)
      const reviewCount = await seedReviews(businessIds)
      const tableCount = await seedTables(businessIds)
      const courierCount = await seedCouriers()
      const planCount = await seedCsaPlans(businessIds)
      const history = await seedOrders()

      log.success(`Seeded ${Object.keys(businessIds).length} businesses, ${menuItems} menu items, ${reviewCount} reviews, ${tableCount} tables, ${courierCount} couriers, ${planCount} CSA shares, ${history.orders} orders (${history.dispatched} dispatched)`)
    })
})

/**
 * Empty every table the demo writes to, children before parents.
 *
 * The list used to be shorter and every failure was swallowed by a bare
 * `.catch(() => undefined)`, which hid the thing it should have shouted
 * about: `DELETE FROM businesses` was failing on a foreign key the whole
 * time, because `claims`, `favorites` and `csa_plans` still pointed at rows
 * it was trying to remove.
 *
 * The consequences were quiet and total. Nothing was deleted, so the seeder's
 * "does this slug exist already?" check answered yes for all 452 businesses
 * and skipped every one of them - and with them the opening hours, which are
 * only written when a business is created. `--fresh` therefore emptied
 * `business_hours` and never refilled it, and the whole site went from
 * knowing when 181 places open to knowing when none of them do. It still
 * reported success.
 *
 * So the list is now complete - checked against `pragma foreign_key_list` for
 * everything that references a table below - and a delete that fails says so
 * and stops. A table this app has no migration for is the one tolerated case,
 * because the framework's default schema is wider than what this demo uses.
 */
async function clearDemoRows(): Promise<void> {
  const tables = [
    // Ledger and delivery, which reference orders and couriers.
    'ledger_entries',
    'payments',
    'transactions',
    'order_idempotency',
    'delivery_stops',
    'delivery_routes',
    'courier_pings',
    // Orders and the rows hanging off them.
    'order_item_modifiers',
    'order_items',
    'review_photos',
    'business_reviews',
    'orders',
    'couriers',
    // Menus.
    'modifiers',
    'modifier_groups',
    'product_variants',
    'product_units',
    'products',
    // Everything else that points at a business.
    'csa_subscriptions',
    'csa_plans',
    'claims',
    'favorites',
    'business_hours',
    'business_photos',
    'tabs',
    'tables',
    // The parents.
    'businesses',
    'markets',
  ]

  for (const table of tables) {
    try {
      await db.deleteFrom(table as never).execute()
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      // A table the app has no migration for is fine to skip. Anything else -
      // a foreign key still pointing here, most likely - means the next line
      // of this command would seed on top of rows it believes are gone.
      if (/no such table/i.test(message))
        continue

      throw new Error(`Could not clear ${table}: ${message}. Seeding on top of rows that were meant to be gone produces a database that looks seeded and is not, so this stops here.`)
    }
  }

  log.info(`Cleared ${tables.length} tables`)
}

/**
 * The markets.
 *
 * A market is a country's worth of rules: its currency, whether tax is quoted
 * inside the price or added at the till, and - the one a visitor notices - its
 * clock. Los Angeles and Nordrhein-Westfalen are both live, because both have
 * listings; Berlin and Amsterdam are still here and still inactive, proving
 * the schema and nothing else.
 *
 * Two active markets is the point at which "the market" stopped being a
 * singular thing anybody could ask for. Everything downstream now asks which
 * one, per business.
 */
async function seedMarkets(): Promise<Record<string, number>> {
  const markets = [
    { name: 'Los Angeles', slug: 'los-angeles', city: 'Los Angeles', country_code: 'US', currency: 'usd', tax_mode: 'exclusive', default_tax_rate: 9.5, timezone: 'America/Los_Angeles', locale: 'en', center_latitude: 34.0195, center_longitude: -118.4912, is_active: 1 },
    { name: 'Nordrhein-Westfalen', slug: 'nordrhein-westfalen', city: 'Wuppertal', country_code: 'DE', currency: 'eur', tax_mode: 'inclusive', default_tax_rate: 19, timezone: 'Europe/Berlin', locale: 'de', center_latitude: 51.2562, center_longitude: 7.1508, is_active: 1 },
    { name: 'Berlin', slug: 'berlin', city: 'Berlin', country_code: 'DE', currency: 'eur', tax_mode: 'inclusive', default_tax_rate: 19, timezone: 'Europe/Berlin', locale: 'de', center_latitude: 52.5200, center_longitude: 13.4050, is_active: 0 },
    { name: 'Amsterdam', slug: 'amsterdam', city: 'Amsterdam', country_code: 'NL', currency: 'eur', tax_mode: 'inclusive', default_tax_rate: 9, timezone: 'Europe/Amsterdam', locale: 'nl', center_latitude: 52.3676, center_longitude: 4.9041, is_active: 0 },
  ]

  const ids: Record<string, number> = {}

  for (const market of markets) {
    const existing = await db.selectFrom('markets').where('slug', '=', market.slug).select(['id']).executeTakeFirst() as { id: number } | undefined

    if (existing) {
      ids[market.slug] = Number(existing.id)
      continue
    }

    await db.insertInto('markets').values({ uuid: crypto.randomUUID(), ...market } as never).executeTakeFirst()

    const row = await db.selectFrom('markets').where('slug', '=', market.slug).select(['id']).executeTakeFirst() as { id: number }
    ids[market.slug] = Number(row.id)
  }

  return ids
}

async function seedBusinesses(marketIds: Record<string, number>): Promise<Record<string, number>> {
  const ids: Record<string, number> = {}

  for (const seed of ALL_BUSINESSES) {
    const existing = await db.selectFrom('businesses').where('slug', '=', seed.slug).select(['id']).executeTakeFirst() as { id: number } | undefined

    if (existing) {
      ids[seed.slug] = Number(existing.id)
      continue
    }

    const partner = seed.partner === true

    /*
     * The business belongs to the market of the region it sits in, which is
     * how a restaurant in Wuppertal comes to be open at nine in the morning in
     * Wuppertal rather than at nine in the morning in California. A row with
     * no region is a Los Angeles row from before there was a second one.
     */
    const region = resolveRegion(seed.region)
    const marketId = marketIds[region.market] ?? marketIds['los-angeles'] as number

    await db.insertInto('businesses').values({
      uuid: crypto.randomUUID(),
      market_id: marketId,
      name: seed.name,
      slug: seed.slug,
      type: seed.type,
      description: seed.description,
      cuisine: seed.cuisine,
      price_tier: seed.priceTier,
      address: seed.address,
      city: seed.city,
      postal_code: seed.postalCode ?? '',
      latitude: seed.latitude,
      longitude: seed.longitude,
      phone: '',
      website: '',
      hero_image: '',
      // Only invented partners can transact. A real business listed from open
      // data has agreed to nothing, so it gets discovery and nothing else.
      is_partner: partner ? 1 : 0,
      is_claimed: partner ? 1 : 0,
      offers_delivery: partner && seed.type !== 'farm' ? 1 : partner ? 1 : 0,
      offers_pickup: partner ? 1 : 0,
      offers_dine_in: partner && (seed.type === 'restaurant' || seed.type === 'cafe') ? 1 : 0,
      offers_shop: partner && seed.type === 'farm' ? 1 : 0,
      self_delivery: partner && seed.type === 'farm' ? 1 : 0,
      delivery_radius_meters: seed.type === 'farm' ? 40_000 : 8000,
      minimum_order_cents: seed.type === 'farm' ? 2500 : 0,
      prep_time_minutes: seed.type === 'cafe' ? 8 : seed.type === 'farm' ? 0 : 25,
      rating_average: 0,
      rating_count: 0,
      source: partner ? 'partner' : 'curated',
      source_id: '',
    } as never).executeTakeFirst()

    const row = await db.selectFrom('businesses').where('slug', '=', seed.slug).select(['id']).executeTakeFirst() as { id: number }
    ids[seed.slug] = Number(row.id)

    for (const h of seed.hours ?? []) {
      await db.insertInto('business_hours').values({
        uuid: crypto.randomUUID(),
        business_id: row.id,
        day_of_week: h.day,
        opens_at: h.open,
        closes_at: h.close,
        is_closed: 0,
      } as never).executeTakeFirst()
    }
  }

  return ids
}

/**
 * Menus, as products scoped to a business, with their modifier groups.
 *
 * Categories carry the sections, so a menu renders in the order the kitchen
 * sends it rather than alphabetically.
 */
async function seedMenus(businessIds: Record<string, number>): Promise<number> {
  let items = 0

  for (const [slug, sections] of Object.entries(MENUS)) {
    const businessId = businessIds[slug]
    if (!businessId)
      continue

    let sectionPosition = 0

    for (const section of sections) {
      sectionPosition += 1
      const categorySlug = `${slug}-${section.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

      let category = await db.selectFrom('categories').where('slug', '=', categorySlug).select(['id']).executeTakeFirst() as { id: number } | undefined

      if (!category) {
        await db.insertInto('categories').values({
          uuid: crypto.randomUUID(),
          name: section.name,
          slug: categorySlug,
          description: '',
          image_url: '',
          is_active: 1,
          display_order: sectionPosition,
        } as never).executeTakeFirst()

        category = await db.selectFrom('categories').where('slug', '=', categorySlug).select(['id']).executeTakeFirst() as { id: number }
      }

      for (const item of section.items) {
        const existing = await db.selectFrom('products').where('name', '=', item.name).where('business_id', '=', businessId).select(['id']).executeTakeFirst() as { id: number } | undefined
        if (existing)
          continue

        await db.insertInto('products').values({
          uuid: crypto.randomUUID(),
          business_id: businessId,
          category_id: category.id,
          name: item.name,
          description: item.description,
          price: item.priceCents,
          image_url: '',
          is_available: 1,
          inventory_count: 0,
          preparation_time: item.prepMinutes ?? 0,
          allergens: JSON.stringify(item.allergens ?? []),
          nutritional_info: '{}',
        } as never).executeTakeFirst()

        const product = await db.selectFrom('products').where('name', '=', item.name).where('business_id', '=', businessId).select(['id']).executeTakeFirst() as { id: number }
        items += 1

        let groupPosition = 0
        for (const group of item.modifierGroups ?? []) {
          groupPosition += 1

          await db.insertInto('modifier_groups').values({
            uuid: crypto.randomUUID(),
            product_id: product.id,
            name: group.name,
            description: group.description ?? '',
            min_selections: group.min,
            max_selections: group.max,
            allows_quantity: 0,
            position: groupPosition,
          } as never).executeTakeFirst()

          const groupRow = await db.selectFrom('modifier_groups').select(['id']).orderBy('id', 'desc').executeTakeFirst() as { id: number }

          let optionPosition = 0
          for (const option of group.options) {
            optionPosition += 1
            await db.insertInto('modifiers').values({
              uuid: crypto.randomUUID(),
              modifier_group_id: groupRow.id,
              name: option.name,
              price_delta_cents: option.priceDeltaCents ?? 0,
              is_default: option.isDefault ? 1 : 0,
              is_available: 1,
              position: optionPosition,
            } as never).executeTakeFirst()
          }
        }
      }
    }
  }

  return items
}

/**
 * Reviews, and only ever against a partner.
 *
 * Seeding an invented review onto a real restaurant would be putting words in
 * a stranger's mouth on a public page, so the data file has none and this loop
 * would skip them anyway.
 */
async function seedReviews(businessIds: Record<string, number>): Promise<number> {
  let count = 0

  for (const [slug, reviews] of Object.entries(REVIEWS)) {
    const businessId = businessIds[slug]
    if (!businessId)
      continue

    for (const review of reviews) {
      const existing = await db.selectFrom('business_reviews')
        .where('business_id', '=', businessId)
        .where('title', '=', review.title)
        .select(['id'])
        .executeTakeFirst() as { id: number } | undefined

      if (existing)
        continue

      await db.insertInto('business_reviews').values({
        uuid: crypto.randomUUID(),
        business_id: businessId,
        customer_id: await reviewerId(review.author),
        rating: review.rating,
        title: review.title,
        body: review.body,
        dishes: review.dishes ?? '',
        owner_response: review.ownerResponse ?? '',
        owner_responded_at: review.ownerResponse ? new Date().toISOString() : null,
        helpful_count: review.helpful ?? 0,
        is_published: 1,
        visited_at: null,
      } as never).executeTakeFirst()

      count += 1
    }

    await recomputeRating(businessId)
  }

  return count
}

/**
 * Rating aggregates live on the business.
 *
 * A list of thirty places would otherwise run thirty aggregate queries per
 * page, and the map wants them for every pin in view.
 */
async function recomputeRating(businessId: number): Promise<void> {
  const rows = await db.selectFrom('business_reviews')
    .where('business_id', '=', businessId)
    .where('is_published', '=', 1)
    .select(['rating'])
    .execute() as Array<{ rating: number }>

  if (rows.length === 0)
    return

  const total = rows.reduce((sum, row) => sum + Number(row.rating), 0)

  await db.updateTable('businesses')
    .set({
      rating_average: Math.round((total / rows.length) * 10) / 10,
      rating_count: rows.length,
    } as never)
    .where('id', '=', businessId)
    .execute()
}

/**
 * Tables for the places that seat people.
 *
 * Each carries its own QR token. Generated rather than written into the seed
 * data because a token is a secret, and a secret committed to a repository is
 * not one.
 */
async function seedTables(businessIds: Record<string, number>): Promise<number> {
  let count = 0

  for (const [slug, businessId] of Object.entries(businessIds)) {
    const business = await db.selectFrom('businesses').where('id', '=', businessId).select(['offers_dine_in']).executeTakeFirst() as { offers_dine_in?: number } | undefined

    if (Number(business?.offers_dine_in) !== 1)
      continue

    const existing = await db.selectFrom('tables').where('business_id', '=', businessId).select(['id']).executeTakeFirst() as { id: number } | undefined

    if (existing)
      continue

    for (let number = 1; number <= 6; number++) {
      await db.insertInto('tables').values({
        uuid: crypto.randomUUID(),
        business_id: businessId,
        label: String(number),
        qr_token: crypto.randomUUID().replace(/-/g, ''),
        seats: number <= 2 ? 2 : 4,
        is_active: 1,
      } as never).executeTakeFirst()

      count += 1
    }
  }

  return count
}

/**
 * Couriers.
 *
 * Invented people with invented vehicles, positioned around Santa Monica so a
 * dispatch has somebody plausible to pick. They are `Courier` rows in the
 * framework's own table - the rename in stacksjs/stacks#2382 is what let this
 * app call them what they are.
 */
async function seedCouriers(): Promise<number> {
  const couriers = [
    { name: 'Rosa Delgado', vehicle: 'Vespa 2141', lat: 34.0195, lng: -118.4912 },
    { name: 'Tomas Neal', vehicle: 'Bike 0071', lat: 34.0089, lng: -118.4973 },
    { name: 'Priya Raman', vehicle: 'Vespa 3382', lat: 33.9903, lng: -118.4664 },
    { name: 'Bea Whitfield', vehicle: 'Bike 0114', lat: 34.0270, lng: -118.4880 },
    { name: 'Ade Okonjo', vehicle: 'Car 8820', lat: 34.0161, lng: -118.4956 },
    { name: 'Sam Ruiz', vehicle: 'Bike 0203', lat: 33.9928, lng: -118.4741 },
    { name: 'Nia Fletcher', vehicle: 'Vespa 5566', lat: 34.0316, lng: -118.4977 },
    { name: 'Ivan Petrov', vehicle: 'Car 4417', lat: 34.0104, lng: -118.4917 },
  ]

  let count = 0

  for (const courier of couriers) {
    const existing = await db.selectFrom('couriers').where('name', '=', courier.name).select(['id']).executeTakeFirst() as { id: number } | undefined

    if (existing)
      continue

    await db.insertInto('couriers').values({
      uuid: crypto.randomUUID(),
      name: courier.name,
      phone: '+15550000000',
      vehicle_number: courier.vehicle,
      license: 'DEMO',
      status: 'active',
      latitude: courier.lat,
      longitude: courier.lng,
      heading: 0,
      speed: 0,
    } as never).executeTakeFirst()

    count += 1
  }

  return count
}

/**
 * Order history, placed rather than fabricated.
 *
 * Every order here goes through `placeOrder()`, the same function the checkout
 * calls, so the prices, the modifier rules, the fee split and the ledger rows
 * are produced by the code that will be blamed if they are wrong. Writing rows
 * into `orders` directly would be faster and would demonstrate nothing: a
 * seeded ledger that the real path could never produce is worse than no ledger,
 * because it looks like evidence.
 *
 * The result is a kitchen with tickets on it, couriers carrying something, and
 * statements with figures in them, on any fresh database.
 */
async function seedOrders(): Promise<{ orders: number, dispatched: number }> {
  const existing = await db.selectFrom('orders').select(['id']).executeTakeFirst() as { id: number } | undefined

  // Idempotent like the rest of the seeder: a deploy re-runs this, and doubling
  // the history every time would make the money screens quietly wrong.
  if (existing)
    return { orders: 0, dispatched: 0 }

  const customers = [
    { name: 'Dana Whitlock', email: 'dana@example.test', address: '1453 4th St, Santa Monica, CA 90401', latitude: 34.0163, longitude: -118.4938 },
    { name: 'Marcus Bell', email: 'marcus@example.test', address: '820 Pico Blvd, Santa Monica, CA 90405', latitude: 34.0119, longitude: -118.4835 },
    { name: 'Yuki Tanaka', email: 'yuki@example.test', address: '2301 Wilshire Blvd, Santa Monica, CA 90403', latitude: 34.0288, longitude: -118.4791 },
    { name: 'Aisha Rahman', email: 'aisha@example.test', address: '11640 San Vicente Blvd, Los Angeles, CA 90049', latitude: 34.0533, longitude: -118.4695 },
    { name: 'Peter Lindqvist', email: 'peter@example.test', address: '601 Montana Ave, Santa Monica, CA 90403', latitude: 34.0294, longitude: -118.4990 },
  ]

  const slugs = ['marisol-cocina', 'little-bird-ramen', 'the-salted-anchor', 'fog-and-filter', 'nonna-pia', 'golden-hour-diner', 'ember-coffee-roasters', 'saffron-and-sumac']

  /*
   * A tiny LCG rather than Math.random, so two people running the seeder see
   * the same demo and a screenshot keeps matching the database.
   */
  let seed = 20260829
  const next = (bound: number): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed % bound
  }

  let orders = 0
  let dispatched = 0

  for (let index = 0; index < 24; index++) {
    const slug = slugs[index % slugs.length] as string
    const business = await db.selectFrom('businesses').where('slug', '=', slug).select(['id']).executeTakeFirst() as { id: number } | undefined

    if (!business)
      continue

    const products = await db.selectFrom('products')
      .where('business_id', '=', Number(business.id))
      .orderBy('id', 'asc')
      .select(['id'])
      .execute() as Array<{ id: number }>

    if (products.length === 0)
      continue

    const customer = customers[index % customers.length] as typeof customers[number]
    const lineCount = 1 + next(3)
    const lines = []

    for (let line = 0; line < lineCount; line++) {
      const product = products[next(products.length)]

      if (product)
        lines.push({ productId: Number(product.id), quantity: 1 + next(2), modifierIds: await requiredChoices(Number(product.id), next), notes: '' })
    }

    // Two thirds delivery, the rest pickup: enough of each that both halves of
    // the merchant's day are visible on the board.
    const fulfilment = index % 3 === 2 ? 'pickup' : 'delivery'

    const placed = await placeOrder({
      businessSlug: slug,
      lines,
      fulfilment,
      customerName: customer.name,
      customerEmail: customer.email,
      deliveryAddress: fulfilment === 'delivery' ? customer.address : undefined,
      deliveryLatitude: fulfilment === 'delivery' ? customer.latitude : undefined,
      deliveryLongitude: fulfilment === 'delivery' ? customer.longitude : undefined,
      tipCents: fulfilment === 'delivery' ? [0, 200, 300, 500][next(4)] : 0,
    })

    if (!placed.ok)
      continue

    orders += 1

    /*
     * Walk most of the history forward so the board is not 24 tickets of
     * "just arrived". The last few stay early on purpose: a kitchen screen
     * with nothing waiting teaches a reviewer nothing about the kitchen screen.
     */
    const stage = index < 18 ? 'done' : index < 21 ? 'cooking' : 'new'

    if (stage === 'new')
      continue

    await advanceOrder(placed.orderId, 'PROCESSING')

    if (stage !== 'done')
      continue

    await advanceOrder(placed.orderId, 'SHIPPED')

    if (fulfilment === 'delivery') {
      const result = await dispatchOrder(placed.orderId)

      if (result.ok)
        dispatched += 1
    }
  }

  return { orders, dispatched }
}

/**
 * Answer the questions a product insists on being asked.
 *
 * A group with `min_selections` of one is a question the kitchen needs answered
 * before it can cook: which size, how the eggs. `placeOrder` rejects an order
 * that skips one, correctly, which meant a seeder passing no modifiers quietly
 * dropped three quarters of its history on the floor and reported success.
 *
 * Picking the marked default keeps the seeded orders looking like orders a
 * person placed rather than every line taking the most expensive upgrade.
 */
async function requiredChoices(productId: number, next: (bound: number) => number): Promise<number[]> {
  const groups = await db.selectFrom('modifier_groups')
    .where('product_id', '=', productId)
    .where('min_selections', '>=', 1)
    .orderBy('position', 'asc')
    .select(['id', 'min_selections'])
    .execute() as Array<{ id: number, min_selections: number }>

  const chosen: number[] = []

  for (const group of groups) {
    const options = await db.selectFrom('modifiers')
      .where('modifier_group_id', '=', Number(group.id))
      .orderBy('position', 'asc')
      .select(['id', 'is_default'])
      .execute() as Array<{ id: number, is_default: number }>

    if (options.length === 0)
      continue

    // Mostly the default, occasionally something else, so the tickets on the
    // kitchen board are not twenty identical lines.
    const preferred = options.find(option => Number(option.is_default) === 1) ?? options[0]
    const pick = next(4) === 0 ? options[next(options.length)] ?? preferred : preferred

    for (let taken = 0; taken < Math.max(1, Number(group.min_selections)); taken++) {
      const option = taken === 0 ? pick : options[taken]

      if (option && !chosen.includes(Number(option.id)))
        chosen.push(Number(option.id))
    }
  }

  return chosen
}

/**
 * The farms' shares.
 *
 * A CSA promises a size and a cadence and deliberately does not promise
 * contents: in March the grower does not know what will be ready in July. The
 * descriptions say so, because a member who expects a fixed list is a member
 * who complains in a bad year, which is the season a farm most needs them.
 */
async function seedCsaPlans(businessIds: Record<string, number>): Promise<number> {
  const plans = [
    {
      slug: 'cardoon-farm',
      name: 'Small Share',
      description: 'Six or seven kinds of vegetable, whatever is ready. Some weeks that means three kinds of squash.',
      priceCents: 2800,
      cadence: 'weekly',
      feeds: 'One or two people',
      dayOfWeek: 3,
      offersDelivery: true,
    },
    {
      slug: 'cardoon-farm',
      name: 'Family Share',
      description: 'Ten to twelve kinds. Feeds four, or two who cook a lot and waste nothing.',
      priceCents: 4600,
      cadence: 'weekly',
      feeds: 'Four people',
      dayOfWeek: 3,
      offersDelivery: true,
    },
    {
      slug: 'cardoon-farm',
      name: 'Every Other Week',
      description: 'The family share, fortnightly. For people who travel, or who still have chard.',
      priceCents: 4600,
      cadence: 'biweekly',
      feeds: 'Four people',
      dayOfWeek: 3,
      offersDelivery: false,
    },
    {
      slug: 'two-crows-orchard',
      name: 'Fruit Share',
      description: 'Ten pounds of stone fruit in summer, citrus in winter, and a fortnight in spring when there is neither.',
      priceCents: 3400,
      cadence: 'weekly',
      feeds: 'A household that eats fruit',
      dayOfWeek: 6,
      offersDelivery: false,
    },
    {
      slug: 'two-crows-orchard',
      name: 'Monthly Box',
      description: 'One large box a month, picked the morning it goes out. Ojai is an hour away and it shows.',
      priceCents: 5200,
      cadence: 'monthly',
      feeds: 'Two people, or one who preserves',
      dayOfWeek: 6,
      offersDelivery: true,
    },
  ]

  let count = 0

  for (const plan of plans) {
    const businessId = businessIds[plan.slug]

    if (!businessId)
      continue

    const existing = await db.selectFrom('csa_plans')
      .where('business_id', '=', businessId)
      .where('name', '=', plan.name)
      .select(['id'])
      .executeTakeFirst() as { id: number } | undefined

    if (existing)
      continue

    await db.insertInto('csa_plans').values({
      uuid: crypto.randomUUID(),
      business_id: businessId,
      name: plan.name,
      description: plan.description,
      price_cents: plan.priceCents,
      cadence: plan.cadence,
      feeds: plan.feeds,
      day_of_week: plan.dayOfWeek,
      offers_delivery: plan.offersDelivery ? 1 : 0,
      is_active: 1,
    } as never).executeTakeFirst()

    count += 1
  }

  return count
}

/**
 * The customer row behind a seeded reviewer.
 *
 * Invented people, on the same reserved `.invalid` domain the visitor
 * identities use, so the operations page's "no real contact details" guard
 * still passes over them. Reused by name, so one person reviewing two places
 * is one person.
 */
async function reviewerId(name: string): Promise<number | null> {
  const email = `seed-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}@demo.smakelo.invalid`

  const existing = await db.selectFrom('customers')
    .where('email', '=', email)
    .select(['id'])
    .executeTakeFirst() as { id: number } | undefined

  if (existing)
    return Number(existing.id)

  await db.insertInto('customers').values({
    uuid: crypto.randomUUID(),
    name,
    email,
    phone: '',
    status: 'Active',
    avatar: '',
    total_spent: 0,
  } as never).executeTakeFirst()

  const created = await db.selectFrom('customers')
    .where('email', '=', email)
    .select(['id'])
    .executeTakeFirst() as { id: number } | undefined

  return created ? Number(created.id) : null
}
