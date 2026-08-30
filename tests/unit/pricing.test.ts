import type { PricedLine } from '../../app/Actions/Order/pricing'
import { describe, expect, test } from 'bun:test'
import { deliveryFee, formatCents, lineTotalCents, priceOrder, splitEvenly } from '../../app/Actions/Order/pricing'

function line(unitPriceCents: number, quantity = 1, modifiers: PricedLine['modifiers'] = []): PricedLine {
  return { productId: 1, name: 'Test', unitPriceCents, quantity, modifiers }
}

const LA = { taxRatePercent: 9.5, taxMode: 'exclusive' as const, platformFeePercent: 10 }
const BERLIN = { taxRatePercent: 19, taxMode: 'inclusive' as const, platformFeePercent: 10 }

describe('lineTotalCents', () => {
  test('multiplies the item and its modifiers by the quantity', () => {
    const withGuac = line(1200, 2, [
      { modifierId: 1, groupName: 'Add', name: 'Guacamole', priceDeltaCents: 250, quantity: 1 },
    ])

    expect(lineTotalCents(withGuac)).toBe((1200 + 250) * 2)
  })

  test('honours a negative modifier', () => {
    // A smaller portion subtracts. The delta is signed for exactly this.
    expect(lineTotalCents(line(800, 1, [
      { modifierId: 2, groupName: 'Protein', name: 'Hongos', priceDeltaCents: -100, quantity: 1 },
    ]))).toBe(700)
  })

  test('counts a repeated modifier once per repeat', () => {
    expect(lineTotalCents(line(500, 1, [
      { modifierId: 3, groupName: 'Extras', name: 'Extra shot', priceDeltaCents: 120, quantity: 2 },
    ]))).toBe(740)
  })
})

describe('priceOrder in a tax-added market', () => {
  test('adds tax to the food and the fees, and not to the tip', () => {
    const pricing = priceOrder({
      lines: [line(2000)],
      fulfilment: 'pickup',
      tipCents: 500,
      ...LA,
    })

    expect(pricing.subtotalCents).toBe(2000)
    expect(pricing.serviceFeeCents).toBe(200)
    // 9.5% of (2000 + 0 + 200), and nothing on the 500 tip.
    expect(pricing.taxCents).toBe(209)
    expect(pricing.totalCents).toBe(2000 + 200 + 209 + 500)
  })

  test('charges no delivery fee for pickup or dine-in', () => {
    for (const fulfilment of ['pickup', 'dine_in']) {
      const pricing = priceOrder({ lines: [line(2000)], fulfilment, distanceMeters: 5000, ...LA })
      expect(pricing.deliveryFeeCents).toBe(0)
    }
  })

  test('rounds the platform fee down', () => {
    // 10% of 1999 is 199.9. Rounding up is the platform taking a cent it did
    // not earn, on every order.
    const pricing = priceOrder({ lines: [line(1999)], fulfilment: 'pickup', ...LA })
    expect(pricing.serviceFeeCents).toBe(199)
  })
})

describe('priceOrder in a tax-inclusive market', () => {
  test('extracts tax from the price rather than adding it', () => {
    const pricing = priceOrder({ lines: [line(2000)], fulfilment: 'pickup', ...BERLIN })

    // The customer pays what the menu said, plus fees; tax is already inside.
    expect(pricing.totalCents).toBe(2000 + pricing.serviceFeeCents)
    // 19% extracted from 2200, not added to it.
    expect(pricing.taxCents).toBe(Math.round(2200 - 2200 / 1.19))
  })

  test('never charges an inclusive market twice', () => {
    const inclusive = priceOrder({ lines: [line(5000)], fulfilment: 'pickup', ...BERLIN })
    const exclusive = priceOrder({ lines: [line(5000)], fulfilment: 'pickup', ...LA })

    expect(inclusive.totalCents).toBeLessThan(exclusive.totalCents)
  })
})

describe('the split', () => {
  test('gives the courier the whole tip and the delivery fee', () => {
    const pricing = priceOrder({
      lines: [line(3000)],
      fulfilment: 'delivery',
      distanceMeters: 2000,
      tipCents: 600,
      ...LA,
    })

    expect(pricing.split.courierCents).toBe(pricing.deliveryFeeCents + 600)
    // A platform taking a percentage of a tip is taking from the wrong person.
    expect(pricing.split.platformCents).toBe(pricing.serviceFeeCents)
  })

  test('pays the merchant the food in full', () => {
    // The platform's cut is the service fee the customer paid on top, not a
    // second deduction from the merchant. Taking both is one fee collected
    // twice, which is what the conservation test below exists to catch.
    const pricing = priceOrder({ lines: [line(4000)], fulfilment: 'pickup', ...LA })
    expect(pricing.split.businessCents).toBe(4000)
  })

  test('the shares account for every cent the customer pays, except tax', () => {
    const pricing = priceOrder({
      lines: [line(2500, 2)],
      fulfilment: 'delivery',
      distanceMeters: 3200,
      tipCents: 400,
      ...LA,
    })

    const shares = pricing.split.businessCents + pricing.split.courierCents + pricing.split.platformCents

    // Tax is collected on behalf of the state and belongs to nobody here.
    expect(shares).toBe(pricing.totalCents - pricing.taxCents)
  })

  test('every cent has an owner once tax is counted as one', () => {
    /*
     * The stronger form of the test above, and the one that matters to the
     * ledger: the four parties together account for the whole charge with
     * nothing left over. The first version of the ledger wrote no tax row, so
     * every order's rows summed to less than the customer paid and the
     * difference belonged to nobody. That is invisible on a receipt and
     * obvious on a balance sheet.
     */
    for (const fulfilment of ['delivery', 'pickup'] as const) {
      const pricing = priceOrder({
        lines: [line(1850, 3), line(640)],
        fulfilment,
        distanceMeters: 2400,
        tipCents: fulfilment === 'delivery' ? 350 : 0,
        ...LA,
      })

      const owned = pricing.split.businessCents
        + pricing.split.courierCents
        + pricing.split.platformCents
        + pricing.taxCents

      expect(owned).toBe(pricing.totalCents)
    }
  })

  test('an inclusive market takes tax out of the price rather than adding it', () => {
    // Berlin prices include VAT, so the merchant's share is not the whole menu
    // price: the tax inside it is held for the state. The ledger models that
    // with a negative row against the business, and the arithmetic has to
    // still land on the total.
    const pricing = priceOrder({ lines: [line(2000, 2)], fulfilment: 'pickup', ...BERLIN })

    // The rows the ledger actually writes for an inclusive market: the merchant
    // credited the gross menu price, the tax collected into the state's pile,
    // and that same tax withheld back off the merchant, since it was never
    // theirs to begin with.
    const taxCollected = pricing.taxCents
    const taxWithheld = -pricing.taxCents

    const ledger = pricing.split.businessCents
      + pricing.split.courierCents
      + pricing.split.platformCents
      + taxCollected
      + taxWithheld

    expect(ledger).toBe(pricing.totalCents)
    expect(pricing.taxCents).toBeGreaterThan(0)
    expect(pricing.taxMode).toBe('inclusive')
  })
})

describe('deliveryFee', () => {
  test('grows with distance', () => {
    expect(deliveryFee(4000)).toBeGreaterThan(deliveryFee(1000))
  })

  test('is capped, so a farm an hour away does not cost more than the food', () => {
    expect(deliveryFee(90_000)).toBe(deliveryFee(200_000))
    expect(deliveryFee(90_000)).toBeLessThanOrEqual(1200)
  })
})

describe('minimum order', () => {
  test('flags a delivery below the minimum without refusing pickup', () => {
    const args = { lines: [line(1500)], minimumOrderCents: 2500, ...LA }

    expect(priceOrder({ ...args, fulfilment: 'delivery', distanceMeters: 1000 }).belowMinimum).toBe(true)
    expect(priceOrder({ ...args, fulfilment: 'pickup' }).belowMinimum).toBe(false)
  })
})

describe('splitEvenly', () => {
  test('never loses or invents a cent', () => {
    for (const [total, ways] of [[1000, 3], [999, 7], [1, 4], [123_45, 6]] as const) {
      const shares = splitEvenly(total, ways)
      expect(shares).toHaveLength(ways)
      expect(shares.reduce((a, b) => a + b, 0)).toBe(total)
    }
  })

  test('hands the remainder out a cent at a time rather than rounding each share', () => {
    // Rounding each share independently is how three people splitting $10.00
    // are charged $10.02 between them.
    expect(splitEvenly(1000, 3)).toEqual([334, 333, 333])
  })

  test('returns nothing for a nonsensical party size', () => {
    expect(splitEvenly(1000, 0)).toEqual([])
  })
})

describe('formatCents', () => {
  test('writes the market currency', () => {
    expect(formatCents(1250)).toBe('$12.50')
    expect(formatCents(1250, 'eur')).toBe('€12.50')
  })

  test('keeps the sign outside the symbol', () => {
    expect(formatCents(-500)).toBe('-$5.00')
  })
})
