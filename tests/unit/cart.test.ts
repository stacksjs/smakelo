import { beforeEach, describe, expect, test } from 'bun:test'
import { cartHandlers } from '../../resources/functions/cart'

/**
 * Ordering, now that it happens on the restaurant's own page.
 *
 * These are the rules a customer runs into without knowing they exist: a
 * required choice that has to be answered, a maximum that has to hold, and a
 * minus button that has to take one off the thing they just added rather than
 * off some other line of the same dish configured differently. Every one of
 * them fails silently - the basket simply holds something other than what was
 * asked for, and nobody finds out until the food arrives.
 *
 * The server re-checks all of it at placement, so none of this is what keeps a
 * bad order out of the kitchen. It is what keeps the basket honest while
 * somebody is still filling it.
 *
 * Prices here are only what goes on a button. Every total a customer agrees to
 * comes from `/api/orders/quote`, which runs the same `priceOrder` that
 * placement runs - see tests/unit/pricing.test.ts for that.
 */

/** A signal, as the page hands them over: a getter with a `set`. */
function signal<T>(initial: T): any {
  let value = initial
  const read: any = () => value
  read.set = (next: T) => { value = next }

  return read
}

/*
 * A menu with the shapes that matter: a dish with nothing to choose, one with
 * a required single-choice group, and one with an optional group that allows
 * two of its three options.
 */
const PLAIN = {
  id: 1,
  name: 'Focaccia',
  priceCents: 600,
  photo: '',
  photoBlur: '',
  allergens: ['gluten'],
  groups: [],
}

const SIZED = {
  id: 2,
  name: 'Cacio e Pepe',
  priceCents: 1900,
  photo: '',
  photoBlur: '',
  allergens: [],
  groups: [{
    id: 10,
    name: 'Portion',
    description: '',
    min: 1,
    max: 1,
    options: [
      { id: 100, name: 'Regular', priceDeltaCents: 0, isDefault: true },
      { id: 101, name: 'Large', priceDeltaCents: 500, isDefault: false },
    ],
  }],
}

const TOPPED = {
  id: 3,
  name: 'Margherita',
  priceCents: 1400,
  photo: '',
  photoBlur: '',
  allergens: [],
  groups: [{
    id: 20,
    name: 'Extras',
    description: '',
    min: 0,
    max: 2,
    options: [
      { id: 200, name: 'Olives', priceDeltaCents: 150, isDefault: false },
      { id: 201, name: 'Anchovy', priceDeltaCents: 250, isDefault: false },
      { id: 202, name: 'Basil', priceDeltaCents: 100, isDefault: false },
    ],
  }],
}

const MENU = {
  business: {
    name: 'Nonna Pia',
    currency: 'usd',
    offersDelivery: true,
    offersPickup: true,
    offersDineIn: false,
  },
  sections: [{ name: 'Pasta', items: [PLAIN, SIZED, TOPPED] }],
}

function build() {
  const page = {
    slug: 'nonna-pia',
    menu: signal<any>(MENU),
    cart: signal<any[]>([]),
    cartOpen: signal(false),
    config: signal<any>(null),
    checkout: signal<any>({ fulfilment: 'pickup', tipCents: 0, note: '', address: null, addressLine: '', addressLabel: '', addressError: '' }),
    addresses: signal<any[]>([]),
    quote: signal<any>(null),
    placed: signal<any>(null),
    payment: signal<any>({ configured: null, reason: '', status: '' }),
    cartError: signal(''),
  }

  return { page, cart: cartHandlers(page) }
}

/*
 * Adding a line asks the server to re-price the basket. The quote is covered
 * by its own tests; here it only has to not be a network call.
 */
beforeEach(() => {
  ;(globalThis as any).document = { cookie: '' }
  ;(globalThis as any).localStorage = { getItem: () => null, setItem: () => undefined }
  ;(globalThis as any).fetch = async () => new Response(JSON.stringify({ data: null }), { status: 200 })
})

describe('adding from a menu row', () => {
  test('a dish with nothing to choose goes straight in', () => {
    const { page, cart } = build()

    cart.addOne(PLAIN.id)

    expect(page.cart().length).toBe(1)
    expect(page.cart()[0].name).toBe('Focaccia')
    // No drawer: there is nothing in it to answer.
    expect(page.config()).toBe(null)
  })

  test('a dish with a required choice opens instead of guessing', () => {
    const { page, cart } = build()

    cart.addOne(SIZED.id)

    // Adding it blind would put a line in the basket that the server refuses
    // at placement - and the refusal would arrive at the end, on the order,
    // rather than at the row that caused it.
    expect(page.cart().length).toBe(0)
    expect(page.config().item.name).toBe('Cacio e Pepe')
  })

  test('the second one skips the drawer', () => {
    const { page, cart } = build()

    cart.openItem(SIZED.id)
    cart.addConfigured()
    cart.addOne(SIZED.id)

    // The choices were made once already; asking again is the slower answer
    // to "the same again".
    expect(page.cart().length).toBe(1)
    expect(page.cart()[0].quantity).toBe(2)
    expect(page.config()).toBe(null)
  })

  test('an id that is not on this menu does nothing', () => {
    const { page, cart } = build()

    cart.addOne(9999)

    expect(page.cart().length).toBe(0)
    expect(page.config()).toBe(null)
  })
})

describe('the number on a menu row', () => {
  test('counts every line of that dish', () => {
    const { cart } = build()

    // Two of the same pizza, configured differently: two lines to cook, one
    // row on the menu, and the number on it answers "how many am I getting".
    cart.openItem(TOPPED.id)
    cart.toggleChoice(TOPPED.groups[0], 200)
    cart.addConfigured()

    cart.openItem(TOPPED.id)
    cart.toggleChoice(TOPPED.groups[0], 201)
    cart.setConfigQuantity(3)
    cart.addConfigured()

    expect(cart.qtyOf(TOPPED.id)).toBe(4)
  })

  test('is zero for a dish that is not in the basket', () => {
    const { cart } = build()

    cart.addOne(PLAIN.id)

    expect(cart.qtyOf(SIZED.id)).toBe(0)
  })
})

describe('taking one back off', () => {
  test('takes it off the line that was added last', () => {
    const { page, cart } = build()

    cart.openItem(TOPPED.id)
    cart.toggleChoice(TOPPED.groups[0], 200)
    cart.addConfigured()

    cart.openItem(TOPPED.id)
    cart.toggleChoice(TOPPED.groups[0], 201)
    cart.setConfigQuantity(2)
    cart.addConfigured()

    cart.removeOne(TOPPED.id)

    // Pressing plus then minus should undo what was just done, rather than
    // quietly editing an older line configured some other way.
    expect(page.cart()[0].labels).toEqual(['Olives'])
    expect(page.cart()[0].quantity).toBe(1)
    expect(page.cart()[1].quantity).toBe(1)
  })

  test('the last one removes the line rather than leaving a zero', () => {
    const { page, cart } = build()

    cart.addOne(PLAIN.id)
    cart.removeOne(PLAIN.id)

    expect(page.cart()).toEqual([])
  })

  test('does nothing for a dish that was never added', () => {
    const { page, cart } = build()

    cart.addOne(PLAIN.id)
    cart.removeOne(SIZED.id)

    expect(page.cart().length).toBe(1)
  })
})

describe('choosing options', () => {
  test('a required group starts on its default', () => {
    const { page, cart } = build()

    cart.openItem(SIZED.id)

    // Otherwise the commonest order needs an answer to a question with an
    // obvious one.
    expect(page.config().choices[10]).toEqual([100])
  })

  test('a single-choice group swaps rather than accumulates', () => {
    const { page, cart } = build()

    cart.openItem(SIZED.id)
    cart.toggleChoice(SIZED.groups[0], 101)

    expect(page.config().choices[10]).toEqual([101])
  })

  test('the last choice in a required group cannot be unticked', () => {
    const { page, cart } = build()

    cart.openItem(SIZED.id)
    cart.toggleChoice(SIZED.groups[0], 100)

    // Emptying it would leave a basket the server refuses, and the refusal
    // would arrive at placement rather than here.
    expect(page.config().choices[10]).toEqual([100])
  })

  test('an optional group can be emptied', () => {
    const { page, cart } = build()

    cart.openItem(TOPPED.id)
    cart.toggleChoice(TOPPED.groups[0], 200)
    cart.toggleChoice(TOPPED.groups[0], 200)

    expect(page.config().choices[20]).toEqual([])
  })

  test('a maximum holds', () => {
    const { page, cart } = build()

    cart.openItem(TOPPED.id)
    cart.toggleChoice(TOPPED.groups[0], 200)
    cart.toggleChoice(TOPPED.groups[0], 201)
    cart.toggleChoice(TOPPED.groups[0], 202)

    expect(page.config().choices[20]).toEqual([200, 201])
  })

  test('closing the drawer changes nothing', () => {
    const { page, cart } = build()

    cart.addOne(PLAIN.id)
    cart.openItem(TOPPED.id)
    cart.toggleChoice(TOPPED.groups[0], 200)
    cart.closeItem()

    // Somebody who opens an item, changes their mind and closes it again has
    // not ordered anything and should not have changed anything either.
    expect(page.cart().length).toBe(1)
    expect(page.config()).toBe(null)
  })
})

describe('what the button says it costs', () => {
  test('includes what the options add, per item', () => {
    const { cart } = build()

    cart.openItem(SIZED.id)
    cart.toggleChoice(SIZED.groups[0], 101)

    expect(cart.configPrice()).toBe('$24.00')
  })

  test('multiplies by how many', () => {
    const { cart } = build()

    cart.openItem(SIZED.id)
    cart.toggleChoice(SIZED.groups[0], 101)
    cart.setConfigQuantity(2)

    expect(cart.configPrice()).toBe('$48.00')
  })

  test('a basket line shows what that line costs', () => {
    const { page, cart } = build()

    cart.openItem(TOPPED.id)
    cart.toggleChoice(TOPPED.groups[0], 200)
    cart.toggleChoice(TOPPED.groups[0], 201)
    cart.setConfigQuantity(2)
    cart.addConfigured()

    // 1400 + 150 + 250, twice.
    expect(cart.linePrice(page.cart()[0])).toBe('$36.00')
  })

  test('quantity cannot be dragged below one or into absurdity', () => {
    const { page, cart } = build()

    cart.openItem(PLAIN.id)
    cart.setConfigQuantity(0)
    expect(page.config().quantity).toBe(1)

    cart.setConfigQuantity(999)
    expect(page.config().quantity).toBe(50)
  })
})

describe('adding what the drawer shows', () => {
  test('refuses while a required group is unanswered', () => {
    const { page, cart } = build()

    cart.openItem(SIZED.id)
    // Reach past `toggleChoice`, which will not empty a required group, to the
    // state a menu with no default would start in.
    cart.setConfig('choices', { 10: [] })
    cart.addConfigured()

    expect(page.cart().length).toBe(0)
    expect(page.config().error).toContain('Portion')
  })

  test('carries the chosen ids, their names and the note', () => {
    const { page, cart } = build()

    cart.openItem(TOPPED.id)
    cart.toggleChoice(TOPPED.groups[0], 201)
    cart.setConfig('note', 'well done please')
    cart.addConfigured()

    const line = page.cart()[0]

    // The ids are what the server prices; the names are so the basket can say
    // what it holds without going back to the menu for every row.
    expect(line.modifierIds).toEqual([201])
    expect(line.labels).toEqual(['Anchovy'])
    expect(line.notes).toBe('well done please')
  })

  test('a note longer than the column is cut, not dropped', () => {
    const { page, cart } = build()

    cart.addOne(PLAIN.id)
    cart.setLineNote(0, 'x'.repeat(400))

    // The API takes 300 characters. Losing the note entirely because it was
    // long is worse than losing its tail.
    expect(page.cart()[0].notes.length).toBe(300)
  })
})

describe('the basket', () => {
  test('a quantity of zero removes the line', () => {
    const { page, cart } = build()

    cart.addOne(PLAIN.id)
    cart.setLineQuantity(0, 0)

    expect(page.cart()).toEqual([])
  })

  test('clearing empties the quote with it', () => {
    const { page, cart } = build()

    cart.addOne(PLAIN.id)
    page.quote.set({ totalCents: 600 })
    cart.clearCart()

    // A total left behind on an empty basket is a number from a basket that no
    // longer exists.
    expect(page.cart()).toEqual([])
    expect(page.quote()).toBe(null)
  })
})

describe('how the food is got', () => {
  test('offers only what this kitchen does', () => {
    const { cart } = build()

    expect(cart.fulfilmentChoices().map((choice: any) => choice.value)).toEqual(['delivery', 'pickup'])
  })

  test('offers nothing before the menu has arrived', () => {
    const { page, cart } = build()

    page.menu.set(null)

    expect(cart.fulfilmentChoices()).toEqual([])
  })
})

describe('wording', () => {
  test('names what a dish contains', () => {
    const { cart } = build()

    expect(cart.allergenLine(['gluten', 'dairy'])).toBe('Contains gluten, dairy')
  })

  test('says whether a group must be answered', () => {
    const { cart } = build()

    expect(cart.groupRule(SIZED.groups[0])).toBe('required')
    expect(cart.groupRule(TOPPED.groups[0])).toBe('optional, up to 2')
  })

  test('shows what an option adds, and stays quiet when it adds nothing', () => {
    const { cart } = build()

    expect(cart.optionPrice({ priceDeltaCents: 500 })).toBe(' +$5.00')
    expect(cart.optionPrice({ priceDeltaCents: 0 })).toBe('')
  })
})
