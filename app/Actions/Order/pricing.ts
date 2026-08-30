/**
 * What an order costs, and who each part of it belongs to.
 *
 * Every amount is in cents and every split is computed here, once, so the
 * number the customer is shown at checkout and the numbers written to the
 * ledger come from the same arithmetic. Two implementations of "what is the
 * service fee" is how a marketplace ends up owing money it never charged.
 */

export interface PricedLine {
  productId: number
  name: string
  unitPriceCents: number
  quantity: number
  modifiers: Array<{ modifierId: number, groupName: string, name: string, priceDeltaCents: number, quantity: number }>
}

export interface PricingInput {
  lines: PricedLine[]
  /** 'delivery' | 'pickup' | 'dine_in'. Only delivery carries a delivery fee. */
  fulfilment: string
  /** Straight-line metres from the business to the customer, for delivery. */
  distanceMeters?: number
  /** Percent, from the market. */
  taxRatePercent: number
  /** Whether menu prices already include tax (EU) or have it added (US). */
  taxMode: 'inclusive' | 'exclusive'
  /** Percent of subtotal the platform keeps. */
  platformFeePercent: number
  tipCents?: number
  /** Cents. An order under this cannot be delivered. */
  minimumOrderCents?: number
}

export interface Pricing {
  subtotalCents: number
  taxCents: number
  /** Carried through so the ledger knows whether tax sat inside the menu price. */
  taxMode: 'inclusive' | 'exclusive'
  deliveryFeeCents: number
  serviceFeeCents: number
  tipCents: number
  totalCents: number
  /** What each party is owed once the customer has paid. */
  split: {
    businessCents: number
    courierCents: number
    platformCents: number
  }
  belowMinimum: boolean
}

/** Flat base plus a rate per km, rounded to a sensible unit. */
const DELIVERY_BASE_CENTS = 299
const DELIVERY_PER_KM_CENTS = 85
const DELIVERY_MAX_CENTS = 1200

export function priceOrder(input: PricingInput): Pricing {
  const subtotalCents = input.lines.reduce((sum, line) => sum + lineTotalCents(line), 0)

  const deliveryFeeCents = input.fulfilment === 'delivery'
    ? deliveryFee(input.distanceMeters ?? 0)
    : 0

  // Rounded down, like every other percentage here. Rounding a fee up is the
  // platform taking a cent it did not earn, thirty thousand times.
  const serviceFeeCents = Math.floor((subtotalCents * input.platformFeePercent) / 100)
  const tipCents = Math.max(0, Math.round(input.tipCents ?? 0))

  /*
   * Tax is charged on the food and the fees a customer pays to receive it, not
   * on the tip, which is a gift rather than a purchase.
   *
   * Inclusive markets are the awkward half: the menu price already contains
   * tax, so tax is extracted from the subtotal rather than added to it, and the
   * total is the subtotal. Adding it again would silently charge a German
   * customer 19% twice.
   */
  const taxableCents = subtotalCents + deliveryFeeCents + serviceFeeCents

  const taxCents = input.taxMode === 'inclusive'
    ? Math.round(taxableCents - taxableCents / (1 + input.taxRatePercent / 100))
    : Math.round((taxableCents * input.taxRatePercent) / 100)

  const totalCents = input.taxMode === 'inclusive'
    ? taxableCents + tipCents
    : taxableCents + taxCents + tipCents

  return {
    subtotalCents,
    taxCents,
    taxMode: input.taxMode,
    deliveryFeeCents,
    serviceFeeCents,
    tipCents,
    totalCents,
    split: {
      /*
       * The merchant is paid for the food in full.
       *
       * The platform's cut is the service fee the customer already paid on top,
       * not a second bite out of the merchant's revenue. The first version of
       * this did both - charged the customer a service fee AND deducted the
       * same amount from the merchant - which is one fee collected twice, and
       * left the shares 500 cents short of what the customer handed over. A
       * conservation test caught it; nothing about the checkout screen would
       * have.
       *
       * Tax collected is not the merchant's revenue and is not in this figure.
       */
      businessCents: subtotalCents,
      // The courier gets the delivery fee and every cent of the tip. A platform
      // that takes a percentage of a tip is taking from the wrong person.
      courierCents: deliveryFeeCents + tipCents,
      platformCents: serviceFeeCents,
    },
    belowMinimum: input.fulfilment === 'delivery'
      && subtotalCents < (input.minimumOrderCents ?? 0),
  }
}

/** One line, including everything chosen on it. */
export function lineTotalCents(line: PricedLine): number {
  const modifiers = line.modifiers.reduce(
    (sum, modifier) => sum + modifier.priceDeltaCents * modifier.quantity,
    0,
  )

  return (line.unitPriceCents + modifiers) * line.quantity
}

/**
 * Distance-based, capped.
 *
 * The framework's `ShippingRate` is weight-banded, which describes a parcel and
 * says nothing useful about carrying dinner three miles. The cap matters more
 * than the rate: an uncapped per-km fee quietly asks fourteen dollars to
 * deliver a nine-dollar burrito from a farm an hour away, and the customer
 * blames the restaurant.
 */
export function deliveryFee(distanceMeters: number): number {
  const km = Math.max(0, distanceMeters) / 1000
  const raw = DELIVERY_BASE_CENTS + Math.round(km * DELIVERY_PER_KM_CENTS)

  return Math.min(raw, DELIVERY_MAX_CENTS)
}

/**
 * Split a bill evenly without losing or inventing a cent.
 *
 * Thirds of a dollar do not exist, so the remainder is handed out one cent at a
 * time to the earliest payers rather than rounded per share. Rounding each
 * share independently is how three people paying for $10.00 are charged $10.02.
 */
export function splitEvenly(totalCents: number, ways: number): number[] {
  if (ways < 1)
    return []

  const base = Math.floor(totalCents / ways)
  const remainder = totalCents - base * ways

  return Array.from({ length: ways }, (_, index) => base + (index < remainder ? 1 : 0))
}

/** Cents as money, for anything a person reads. */
export function formatCents(cents: number, currency = 'usd'): string {
  const symbol = currency === 'eur' ? '€' : '$'
  const amount = (Math.abs(cents) / 100).toFixed(2)

  return `${cents < 0 ? '-' : ''}${symbol}${amount}`
}
