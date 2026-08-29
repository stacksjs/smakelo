import { defineCommand, log } from '@stacksjs/cli'
import { db } from '@stacksjs/database'
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
    .command('seed:demo', 'Load the curated Los Angeles demo data')
    .option('--fresh', 'Delete existing demo rows first', { default: false })
    .action(async (options: { fresh?: boolean }) => {
      if (options.fresh) {
        // Children first: nothing here relies on cascade being configured.
        for (const table of ['order_item_modifiers', 'modifiers', 'modifier_groups', 'review_photos', 'business_reviews', 'business_hours', 'business_photos', 'products', 'businesses', 'markets'])
          await db.deleteFrom(table as never).execute().catch(() => undefined)

        log.info('Cleared existing demo rows')
      }

      const marketId = await seedMarkets()
      const businessIds = await seedBusinesses(marketId)
      const menuItems = await seedMenus(businessIds)
      const reviewCount = await seedReviews(businessIds)

      log.success(`Seeded ${Object.keys(businessIds).length} businesses, ${menuItems} menu items, ${reviewCount} reviews`)
    })
})

/** The three markets. Only Los Angeles is active; the others prove the schema. */
async function seedMarkets(): Promise<number> {
  const markets = [
    { name: 'Los Angeles', slug: 'los-angeles', city: 'Los Angeles', country_code: 'US', currency: 'usd', tax_mode: 'exclusive', default_tax_rate: 9.5, timezone: 'America/Los_Angeles', locale: 'en', center_latitude: 34.0195, center_longitude: -118.4912, is_active: 1 },
    { name: 'Berlin', slug: 'berlin', city: 'Berlin', country_code: 'DE', currency: 'eur', tax_mode: 'inclusive', default_tax_rate: 19, timezone: 'Europe/Berlin', locale: 'de', center_latitude: 52.5200, center_longitude: 13.4050, is_active: 0 },
    { name: 'Amsterdam', slug: 'amsterdam', city: 'Amsterdam', country_code: 'NL', currency: 'eur', tax_mode: 'inclusive', default_tax_rate: 9, timezone: 'Europe/Amsterdam', locale: 'nl', center_latitude: 52.3676, center_longitude: 4.9041, is_active: 0 },
  ]

  for (const market of markets) {
    const existing = await db.selectFrom('markets').where('slug', '=', market.slug).select(['id']).executeTakeFirst() as { id: number } | undefined
    if (!existing)
      await db.insertInto('markets').values({ uuid: crypto.randomUUID(), ...market } as never).executeTakeFirst()
  }

  const la = await db.selectFrom('markets').where('slug', '=', 'los-angeles').select(['id']).executeTakeFirst() as { id: number }
  return Number(la.id)
}

async function seedBusinesses(marketId: number): Promise<Record<string, number>> {
  const ids: Record<string, number> = {}

  for (const seed of ALL_BUSINESSES) {
    const existing = await db.selectFrom('businesses').where('slug', '=', seed.slug).select(['id']).executeTakeFirst() as { id: number } | undefined

    if (existing) {
      ids[seed.slug] = Number(existing.id)
      continue
    }

    const partner = seed.partner === true

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
