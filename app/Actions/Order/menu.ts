import { db } from '@stacksjs/database'

/**
 * A business's menu, shaped for the ordering screen.
 *
 * Sections in the order the kitchen sends them, items with their modifier
 * groups, and each group's constraints so the client can enforce them while
 * someone is choosing rather than only on submit. The server enforces them
 * again at placement, because a client-side rule is a courtesy and not a check.
 */

export interface MenuOption {
  id: number
  name: string
  priceDeltaCents: number
  isDefault: boolean
}

export interface MenuGroup {
  id: number
  name: string
  description: string
  min: number
  max: number
  options: MenuOption[]
}

export interface MenuItem {
  id: number
  name: string
  description: string
  priceCents: number
  prepMinutes: number
  allergens: string[]
  groups: MenuGroup[]
}

export interface Menu {
  business: {
    id: number
    slug: string
    name: string
    currency: string
    prepTimeMinutes: number
    minimumOrderCents: number
    offersDelivery: boolean
    offersPickup: boolean
    offersDineIn: boolean
    latitude: number
    longitude: number
  }
  sections: Array<{ name: string, items: MenuItem[] }>
}

export async function menuFor(slug: string): Promise<Menu | null> {
  const business = await db.selectFrom('businesses')
    .where('slug', '=', slug)
    .selectAll()
    .executeTakeFirst() as Record<string, unknown> | undefined

  if (!business)
    return null

  const market = await db.selectFrom('markets')
    .where('id', '=', Number(business.market_id))
    .select(['currency'])
    .executeTakeFirst() as { currency?: string } | undefined

  const businessId = Number(business.id)

  const rows = await db.selectFrom('products')
    .where('business_id', '=', businessId)
    .where('is_available', '=', 1)
    .selectAll()
    .execute() as Array<Record<string, unknown>>

  const categories = await db.selectFrom('categories').selectAll().execute() as Array<Record<string, unknown>>
  const categoryById = new Map(categories.map(category => [Number(category.id), category]))

  // One query for every group and option on this menu, rather than two per
  // item. A menu is a page; it should not be a hundred round trips.
  const groups = await db.selectFrom('modifier_groups')
    .where('product_id', 'in', rows.map(row => Number(row.id)))
    .selectAll()
    .execute() as Array<Record<string, unknown>>

  const options = groups.length > 0
    ? await db.selectFrom('modifiers')
        .where('modifier_group_id', 'in', groups.map(group => Number(group.id)))
        .where('is_available', '=', 1)
        .selectAll()
        .execute() as Array<Record<string, unknown>>
    : []

  const optionsByGroup = new Map<number, MenuOption[]>()
  for (const option of options) {
    const groupId = Number(option.modifier_group_id)
    const list = optionsByGroup.get(groupId) ?? []
    list.push({
      id: Number(option.id),
      name: String(option.name),
      priceDeltaCents: Number(option.price_delta_cents ?? 0),
      isDefault: Number(option.is_default) === 1,
    })
    optionsByGroup.set(groupId, list)
  }

  const groupsByProduct = new Map<number, MenuGroup[]>()
  for (const group of groups) {
    const productId = Number(group.product_id)
    const list = groupsByProduct.get(productId) ?? []
    list.push({
      id: Number(group.id),
      name: String(group.name),
      description: String(group.description ?? ''),
      min: Number(group.min_selections ?? 0),
      max: Number(group.max_selections ?? 1),
      options: optionsByGroup.get(Number(group.id)) ?? [],
    })
    groupsByProduct.set(productId, list)
  }

  const sections = new Map<string, { order: number, items: MenuItem[] }>()

  for (const row of rows) {
    const category = categoryById.get(Number(row.category_id))
    const name = String(category?.name ?? 'Menu')
    const section = sections.get(name) ?? { order: Number(category?.display_order ?? 99), items: [] }

    section.items.push({
      id: Number(row.id),
      name: String(row.name),
      description: String(row.description ?? ''),
      priceCents: Number(row.price ?? 0),
      prepMinutes: Number(row.preparation_time ?? 0),
      allergens: parseAllergens(row.allergens),
      groups: groupsByProduct.get(Number(row.id)) ?? [],
    })

    sections.set(name, section)
  }

  return {
    business: {
      id: businessId,
      slug: String(business.slug),
      name: String(business.name),
      currency: String(market?.currency ?? 'usd'),
      prepTimeMinutes: Number(business.prep_time_minutes ?? 0),
      minimumOrderCents: Number(business.minimum_order_cents ?? 0),
      offersDelivery: Number(business.offers_delivery) === 1,
      offersPickup: Number(business.offers_pickup) === 1,
      offersDineIn: Number(business.offers_dine_in) === 1,
      latitude: Number(business.latitude),
      longitude: Number(business.longitude),
    },
    sections: [...sections.entries()]
      .sort((a, b) => a[1].order - b[1].order)
      .map(([name, section]) => ({ name, items: section.items })),
  }
}

/**
 * Allergens are stored as a JSON string.
 *
 * Parsed defensively: the column is a plain string, and a row written by hand
 * or by an older seed can hold anything. An allergen list that throws would
 * take down the whole menu, which is a worse outcome than showing none.
 */
function parseAllergens(value: unknown): string[] {
  if (typeof value !== 'string' || value.trim() === '')
    return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  }
  catch {
    return []
  }
}
