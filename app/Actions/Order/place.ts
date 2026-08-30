import type { PricedLine } from './pricing'
import { db } from '@stacksjs/database'
import { customerForVisitor } from '../Visitor/identity'
import { distanceInMeters } from '../Business/geo'
import { priceOrder } from './pricing'

/**
 * Placing an order.
 *
 * The prices are read from the database rather than taken from the request.
 * That is the whole security model of a checkout: a client that can name a
 * price can name zero, and no amount of validation elsewhere recovers from
 * trusting it. The request says what was chosen; the server says what it costs.
 *
 * Writes the order, its lines, the modifiers as chosen, and the ledger rows
 * that record who is owed what. The ledger is written in the same call because
 * an order whose money is not attributed is an order nobody can pay out.
 */

export interface OrderRequestLine {
  productId: number
  quantity: number
  /** Modifier ids, which are looked up and priced here. */
  modifierIds?: number[]
  notes?: string
}

export interface PlaceOrderInput {
  businessSlug: string
  lines: OrderRequestLine[]
  fulfilment: 'delivery' | 'pickup' | 'dine_in'
  customerName?: string
  customerEmail?: string
  deliveryAddress?: string
  deliveryLatitude?: number
  deliveryLongitude?: number
  tipCents?: number
  /**
   * The browser placing the order, so it can find the order again later. There
   * are no accounts here; see `Visitor/identity.ts` for what this token is and
   * is not.
   */
  visitorToken?: unknown
  scheduledFor?: string | null
  tableId?: number | null
  tabId?: number | null
  notes?: string
}

export interface PlacedOrder {
  ok: true
  orderId: number
  trackingToken: string
  pricing: ReturnType<typeof priceOrder>
}

export interface RejectedOrder {
  ok: false
  reason: string
}

export async function placeOrder(input: PlaceOrderInput): Promise<PlacedOrder | RejectedOrder> {
  const business = await db.selectFrom('businesses')
    .where('slug', '=', input.businessSlug)
    // A listing taken down cannot take an order, the same as it cannot be
    // found. Curation that stops at the search page is not curation.
    .where('deleted_at', 'is', null)
    .selectAll()
    .executeTakeFirst() as Record<string, unknown> | undefined

  if (!business)
    return { ok: false, reason: 'That business is not listed.' }

  // The listing half of the app cannot sell. A real business copied from open
  // data has agreed to nothing, and this is the last place that can be
  // enforced rather than assumed by a hidden button.
  if (Number(business.is_partner) !== 1)
    return { ok: false, reason: 'This business does not take orders through Smakelo.' }

  if (!input.lines?.length)
    return { ok: false, reason: 'An order needs at least one item.' }

  const capability = {
    delivery: Number(business.offers_delivery) === 1,
    pickup: Number(business.offers_pickup) === 1,
    dine_in: Number(business.offers_dine_in) === 1,
  }[input.fulfilment]

  if (!capability)
    return { ok: false, reason: `${business.name} does not offer ${input.fulfilment.replace('_', ' ')}.` }

  const priced = await priceLines(Number(business.id), input.lines)
  if ('reason' in priced)
    return { ok: false, reason: priced.reason }

  const market = await db.selectFrom('markets')
    .where('id', '=', Number(business.market_id))
    .selectAll()
    .executeTakeFirst() as Record<string, unknown> | undefined

  const distanceMeters = input.fulfilment === 'delivery' && typeof input.deliveryLatitude === 'number'
    ? distanceInMeters(
        { latitude: Number(business.latitude), longitude: Number(business.longitude) },
        { latitude: input.deliveryLatitude, longitude: Number(input.deliveryLongitude) },
      )
    : 0

  if (input.fulfilment === 'delivery' && distanceMeters > Number(business.delivery_radius_meters ?? 0))
    return { ok: false, reason: `${business.name} does not deliver that far.` }

  const pricing = priceOrder({
    lines: priced.lines,
    fulfilment: input.fulfilment,
    distanceMeters,
    taxRatePercent: Number(market?.default_tax_rate ?? 0),
    taxMode: String(market?.tax_mode ?? 'exclusive') as 'inclusive' | 'exclusive',
    platformFeePercent: Number(process.env.PLATFORM_FEE_PERCENT ?? 10),
    tipCents: input.tipCents,
    minimumOrderCents: Number(business.minimum_order_cents ?? 0),
  })

  if (pricing.belowMinimum) {
    return {
      ok: false,
      reason: `Delivery from ${business.name} starts at $${(Number(business.minimum_order_cents) / 100).toFixed(2)}.`,
    }
  }

  const trackingToken = crypto.randomUUID().replace(/-/g, '').slice(0, 24)
  const uuid = crypto.randomUUID()

  /*
   * Link the order to whoever placed it, when we can tell. This is what makes
   * an order history possible without accounts, and it is what the verified
   * badge on a review is checked against later.
   */
  const customerId = input.visitorToken
    ? await customerForVisitor(input.visitorToken, input.customerName ?? 'Guest')
    : null

  await db.insertInto('orders').values({
    uuid,
    business_id: Number(business.id),
    status: 'PENDING',
    order_type: input.fulfilment.toUpperCase(),
    subtotal_cents: pricing.subtotalCents,
    tax_amount: pricing.taxCents,
    delivery_fee: pricing.deliveryFeeCents,
    service_fee_cents: pricing.serviceFeeCents,
    tip_amount: pricing.tipCents,
    total_amount: pricing.totalCents,
    discount_amount: 0,
    currency: String(market?.currency ?? 'usd'),
    delivery_address: input.deliveryAddress ?? '',
    delivery_latitude: input.deliveryLatitude ?? null,
    delivery_longitude: input.deliveryLongitude ?? null,
    special_instructions: input.notes ?? '',
    tracking_token: trackingToken,
    scheduled_for: input.scheduledFor ?? null,
    customer_id: customerId,
    table_id: input.tableId ?? null,
    tab_id: input.tabId ?? null,
    estimated_delivery_time: String(readyInMinutes(business, pricing)),
  } as never).executeTakeFirst()

  const order = await db.selectFrom('orders').where('uuid', '=', uuid).select(['id']).executeTakeFirst() as { id: number }
  const orderId = Number(order.id)

  await writeLines(orderId, priced.lines, input.lines)
  await writeLedger(orderId, Number(business.id), pricing, String(market?.currency ?? 'usd'))

  return { ok: true, orderId, trackingToken, pricing }
}

/**
 * Look up every product and modifier named, and price them from the database.
 *
 * Also the validation pass: an item from another business, a modifier from
 * another item, or an unavailable option all fail here rather than becoming a
 * cheaper order.
 */
async function priceLines(
  businessId: number,
  requested: OrderRequestLine[],
): Promise<{ lines: PricedLine[] } | { reason: string }> {
  const lines: PricedLine[] = []

  for (const line of requested) {
    const quantity = Math.max(1, Math.min(50, Math.round(Number(line.quantity) || 1)))

    const product = await db.selectFrom('products')
      .where('id', '=', Number(line.productId))
      .selectAll()
      .executeTakeFirst() as Record<string, unknown> | undefined

    if (!product)
      return { reason: 'One of those items is no longer on the menu.' }

    // A product belonging to another business would otherwise let someone
    // order a farm box at a coffee shop's prices.
    if (Number(product.business_id) !== businessId)
      return { reason: 'One of those items belongs to a different business.' }

    if (Number(product.is_available) !== 1)
      return { reason: `${product.name} is not available right now.` }

    const modifiers: PricedLine['modifiers'] = []

    for (const modifierId of line.modifierIds ?? []) {
      const modifier = await db.selectFrom('modifiers')
        .where('id', '=', Number(modifierId))
        .selectAll()
        .executeTakeFirst() as Record<string, unknown> | undefined

      if (!modifier || Number(modifier.is_available) !== 1)
        return { reason: 'One of those options is not available.' }

      const group = await db.selectFrom('modifier_groups')
        .where('id', '=', Number(modifier.modifier_group_id))
        .selectAll()
        .executeTakeFirst() as Record<string, unknown> | undefined

      // The option has to belong to a group on the item being ordered.
      if (!group || Number(group.product_id) !== Number(product.id))
        return { reason: 'One of those options does not belong to that item.' }

      modifiers.push({
        modifierId: Number(modifier.id),
        groupName: String(group.name),
        name: String(modifier.name),
        priceDeltaCents: Number(modifier.price_delta_cents ?? 0),
        quantity: 1,
      })
    }

    const requiredGroups = await db.selectFrom('modifier_groups')
      .where('product_id', '=', Number(product.id))
      .where('min_selections', '>', 0)
      .selectAll()
      .execute() as Array<Record<string, unknown>>

    for (const group of requiredGroups) {
      const chosen = modifiers.filter(modifier => modifier.groupName === String(group.name)).length

      if (chosen < Number(group.min_selections))
        return { reason: `${product.name} needs a choice for "${group.name}".` }

      if (chosen > Number(group.max_selections))
        return { reason: `Too many choices for "${group.name}".` }
    }

    lines.push({
      productId: Number(product.id),
      name: String(product.name),
      unitPriceCents: Number(product.price ?? 0),
      quantity,
      modifiers,
    })
  }

  return { lines }
}

/**
 * The order's lines, with each modifier's name and price copied onto them.
 *
 * Copied rather than referenced because the menu changes: guacamole goes up, an
 * option is renamed, a group is deleted, and none of that may retroactively
 * rewrite what somebody was charged.
 */
async function writeLines(orderId: number, priced: PricedLine[], requested: OrderRequestLine[]): Promise<void> {
  for (let index = 0; index < priced.length; index++) {
    const line = priced[index]!
    const modifierTotal = line.modifiers.reduce((sum, modifier) => sum + modifier.priceDeltaCents * modifier.quantity, 0)

    // No uuid: the framework's OrderItem carries only `useTimestamps`, so the
    // column does not exist on this table.
    await db.insertInto('order_items').values({
      order_id: orderId,
      product_id: line.productId,
      quantity: line.quantity,
      price: line.unitPriceCents + modifierTotal,
      special_instructions: requested[index]?.notes ?? '',
    } as never).executeTakeFirst()

    const item = await db.selectFrom('order_items')
      .where('order_id', '=', orderId)
      .select(['id'])
      .orderBy('id', 'desc')
      .executeTakeFirst() as { id: number }

    for (const modifier of line.modifiers) {
      await db.insertInto('order_item_modifiers').values({
        uuid: crypto.randomUUID(),
        order_item_id: Number(item.id),
        modifier_id: modifier.modifierId,
        group_name: modifier.groupName,
        name: modifier.name,
        price_delta_cents: modifier.priceDeltaCents,
        quantity: modifier.quantity,
      } as never).executeTakeFirst()
    }
  }
}

/**
 * One row per party per order.
 *
 * The courier is unknown at this point, so their rows carry party id 0 and are
 * reassigned when a courier accepts. Writing them now rather than later keeps
 * the order's money fully described from the moment it exists.
 */
async function writeLedger(
  orderId: number,
  businessId: number,
  pricing: ReturnType<typeof priceOrder>,
  currency: string,
): Promise<void> {
  const rows: Array<{ partyType: string, partyId: number, kind: string, amountCents: number, description: string }> = [
    { partyType: 'business', partyId: businessId, kind: 'order_revenue', amountCents: pricing.split.businessCents, description: 'Food and drink' },
    { partyType: 'platform', partyId: 0, kind: 'service_fee', amountCents: pricing.split.platformCents, description: 'Service fee' },
  ]

  if (pricing.deliveryFeeCents > 0)
    rows.push({ partyType: 'courier', partyId: 0, kind: 'delivery_fee', amountCents: pricing.deliveryFeeCents, description: 'Delivery' })

  if (pricing.tipCents > 0)
    rows.push({ partyType: 'courier', partyId: 0, kind: 'tip', amountCents: pricing.tipCents, description: 'Tip' })

  /*
   * Tax is collected from the customer and belongs to nobody here: California
   * makes the marketplace the facilitator, so the platform holds it and remits
   * it. Leaving it off the ledger meant every order's rows summed to less than
   * the customer was charged, and the difference had no owner - which is the
   * exact shape of an accounting error nobody notices until an audit.
   *
   * On an inclusive market the tax is already inside the menu price, so it is
   * carved out of the merchant's share rather than added on top.
   */
  if (pricing.taxCents > 0) {
    rows.push({ partyType: 'tax', partyId: 0, kind: 'tax_collected', amountCents: pricing.taxCents, description: 'Sales tax held for remittance' })

    if (pricing.taxMode === 'inclusive')
      rows.push({ partyType: 'business', partyId: businessId, kind: 'tax_withheld', amountCents: -pricing.taxCents, description: 'Tax inside the menu price' })
  }

  for (const row of rows) {
    if (row.amountCents === 0)
      continue

    await db.insertInto('ledger_entries').values({
      uuid: crypto.randomUUID(),
      order_id: orderId,
      party_type: row.partyType,
      party_id: row.partyId,
      kind: row.kind,
      amount_cents: row.amountCents,
      currency,
      description: row.description,
      external_reference: '',
    } as never).executeTakeFirst()
  }
}

/** Prep time plus a rough ride, so the first estimate is not a lie by omission. */
function readyInMinutes(business: Record<string, unknown>, pricing: ReturnType<typeof priceOrder>): number {
  const prep = Number(business.prep_time_minutes ?? 20)
  const ride = pricing.deliveryFeeCents > 0 ? 12 : 0

  return prep + ride
}
