import { money, send, visitorToken } from './session'

/**
 * Ordering, on the restaurant's own page.
 *
 * This used to be a separate screen at `/order?business=<slug>`: you read a
 * menu on one page, then followed a link to a second copy of the same menu to
 * actually order from it. Two renderings of one list, one of them behind a
 * query string, and nothing on the first one you could press.
 *
 * So the menu on the place page is the menu you order from. The rows are
 * server-rendered - they are the same rows a reader and a search engine see -
 * and this module adds the parts that only make sense once somebody is
 * choosing: quantities, modifier groups, a note to the kitchen, and the basket
 * itself, which lives in a drawer rather than a column so the menu keeps the
 * width it was designed for.
 *
 * As with `placeHandlers`, the signals are declared by the page and passed in.
 * stx builds a page's setup from the signal declarations it can see in that
 * page's own script; a signal returned from a factory and destructured is
 * invisible to it, and every binding on the page then silently does nothing.
 *
 * Every price shown comes from the server. `/api/orders/quote` runs the same
 * `priceOrder` that placement runs, so the total somebody agrees to and the
 * total they are charged cannot drift apart. Nothing here adds up a bill.
 */

export interface CartSignals {
  slug: string
  /** The menu as the API gives it: modifier groups, allergens, defaults. */
  menu: any
  /** Chosen lines, in the order they were added. */
  cart: any
  cartOpen: any
  /** The item being configured, or null. See `openItem`. */
  config: any
  /** Fulfilment, tip, address and the note for the whole order. */
  checkout: any
  addresses: any
  quote: any
  placed: any
  payment: any
  cartError: any
}

export function cartHandlers(page: CartSignals) {
  const { slug } = page

  /*
   * The words this module writes, in the language the server served.
   *
   * The English text is the second argument rather than a fallback to the key,
   * so a string no page carries reads as English rather than as its own name.
   */
  function say(key: string, english: string): string {
    const smakelo = (globalThis as any).Smakelo

    return smakelo && smakelo.t ? smakelo.t(key, english) : english
  }

  /** Update one field of a grouped signal, keeping the rest. */
  function patch(signal: any, field: string, value: unknown): void {
    signal.set({ ...signal(), [field]: value })
  }

  const setCheckout = (field: string, value: unknown) => patch(page.checkout, field, value)
  const setConfig = (field: string, value: unknown) => patch(page.config, field, value)

  function currency(): string {
    return page.menu() ? page.menu().business.currency : 'usd'
  }

  /** A price, in the currency this business trades in. */
  function price(cents: number): string {
    return money(cents, currency())
  }

  /*
   * Every item on the menu, by id.
   *
   * The rows on the page are rendered from the server's view model, which
   * carries a name, a price and a photograph - enough to read. Ordering needs
   * the parts a reader does not see: modifier groups, their minimums and
   * maximums, and the allergens. Those come from the menu API, which is
   * fetched once when the page loads, and this is how a row's id finds them.
   */
  function itemsById(): Map<number, any> {
    const index = new Map<number, any>()
    const menu = page.menu()

    if (!menu)
      return index

    for (const section of menu.sections) {
      for (const item of section.items)
        index.set(item.id, item)
    }

    return index
  }

  function itemById(id: number): any {
    return itemsById().get(Number(id)) ?? null
  }

  /** Whatever a group marks as default, so the common order is already valid. */
  function defaultChoices(item: any): Record<number, number[]> {
    const chosen: Record<number, number[]> = {}

    for (const group of item.groups ?? [])
      chosen[group.id] = group.options.filter((option: any) => option.isDefault).map((option: any) => option.id)

    return chosen
  }

  async function loadMenu(): Promise<void> {
    const response = await fetch(`/api/businesses/${encodeURIComponent(slug)}/menu`)

    if (!response.ok)
      return

    const { data } = await response.json()

    page.menu.set(data)

    /*
     * Start on whichever way of getting the food this place actually offers.
     * Defaulting to pickup at a delivery-only kitchen would show an address
     * field to nobody and hide it from everybody who needs it.
     */
    setCheckout('fulfilment', data.business.offersPickup
      ? 'pickup'
      : data.business.offersDelivery ? 'delivery' : 'dine_in')
  }

  async function loadAddresses(): Promise<void> {
    const response = await fetch('/api/addresses', { headers: { 'x-visitor': visitorToken() } })

    if (!response.ok)
      return

    const { data } = await response.json()

    page.addresses.set(data)

    // Somebody with one address should never be asked to pick it.
    const preferred = data.find((address: any) => address.isDefault) ?? data[0]

    if (preferred && !page.checkout().address)
      chooseAddress(preferred)
  }

  /* ---------------------------------------------------------------- rows -- */

  /**
   * How many of this dish are in the basket, across every line of it.
   *
   * A margherita with olives and one without are two lines - they are two
   * different things to cook - but the row on the menu is one row, and the
   * number on it is the answer to "how many of these am I getting".
   */
  function qtyOf(id: number): number {
    return page.cart()
      .filter((line: any) => line.productId === Number(id))
      .reduce((total: number, line: any) => total + line.quantity, 0)
  }

  /**
   * The plus button on a menu row.
   *
   * An item with choices to make opens the drawer instead of going straight
   * in: adding a pizza that needs a size picked would put a line in the basket
   * that the server refuses at placement, and the refusal would arrive at the
   * end, on the order, rather than at the row that caused it.
   *
   * An item already in the basket takes the shortcut even when it has groups,
   * because the choices have already been made once and repeating the drawer
   * to say "the same again" is the slower answer to the more common question.
   */
  function addOne(id: number): void {
    const item = itemById(id)

    if (!item)
      return

    const existing = lastLineFor(id)

    if (existing >= 0) {
      setLineQuantity(existing, page.cart()[existing].quantity + 1)
      return
    }

    if ((item.groups ?? []).length > 0) {
      openItem(id)
      return
    }

    addLine(item, 1, defaultChoices(item), '')
  }

  /**
   * The minus button.
   *
   * Takes one off the most recently added line of that dish rather than the
   * first, so pressing plus and then minus undoes what was just done instead
   * of quietly editing a different line configured some other way.
   */
  function removeOne(id: number): void {
    const index = lastLineFor(id)

    if (index < 0)
      return

    const line = page.cart()[index]

    if (line.quantity > 1)
      setLineQuantity(index, line.quantity - 1)
    else
      removeLine(index)
  }

  function lastLineFor(id: number): number {
    const lines = page.cart()

    for (let index = lines.length - 1; index >= 0; index--) {
      if (lines[index].productId === Number(id))
        return index
    }

    return -1
  }

  /* ------------------------------------------------------------- the item -- */

  /**
   * Open one dish to configure it.
   *
   * The drawer is built from a copy of the choices rather than editing the
   * basket in place: somebody who opens an item, changes their mind about the
   * toppings and closes it again has not ordered anything, and should not have
   * changed anything either.
   */
  function openItem(id: number): void {
    const item = itemById(id)

    if (!item)
      return

    page.config.set({
      item,
      quantity: 1,
      choices: defaultChoices(item),
      note: '',
      error: '',
    })
  }

  function closeItem(): void {
    page.config.set(null)
  }

  function chosenIn(groupId: number, optionId: number): boolean {
    const config = page.config()

    if (!config)
      return false

    return (config.choices[groupId] ?? []).includes(optionId)
  }

  /**
   * Tick or untick one option.
   *
   * The group's own rules are enforced here so the drawer cannot be left in a
   * state the server would reject - a required group emptied, or a third
   * topping on a menu that allows two. The server checks all of it again at
   * placement, because a rule enforced in a browser is a courtesy, not a check.
   */
  function toggleChoice(group: any, optionId: number): void {
    const config = page.config()

    if (!config)
      return

    const chosen = config.choices[group.id] ?? []
    let next: number[]

    if (chosen.includes(optionId)) {
      // Unticking the last choice in a required group would leave an order
      // that cannot be placed, so the last one stays.
      if (chosen.length <= group.min)
        return

      next = chosen.filter((id: number) => id !== optionId)
    }
    else if (group.max === 1) {
      next = [optionId]
    }
    else if (chosen.length >= group.max) {
      return
    }
    else {
      next = [...chosen, optionId]
    }

    setConfig('choices', { ...config.choices, [group.id]: next })
  }

  function setConfigQuantity(quantity: number): void {
    setConfig('quantity', Math.max(1, Math.min(50, quantity)))
  }

  /**
   * What one of these costs as currently configured.
   *
   * Shown on the drawer's button so the price moves as options are ticked. It
   * is not what anybody is charged: the quote endpoint prices the order, and
   * this is only the number on the button that made them press it.
   */
  function configPriceCents(): number {
    const config = page.config()

    if (!config)
      return 0

    let cents = config.item.priceCents

    for (const group of config.item.groups ?? []) {
      for (const optionId of config.choices[group.id] ?? []) {
        const option = group.options.find((candidate: any) => candidate.id === optionId)

        if (option)
          cents += option.priceDeltaCents
      }
    }

    return cents * config.quantity
  }

  function configPrice(): string {
    return price(configPriceCents())
  }

  /** Add what the drawer is showing, if every required group has an answer. */
  function addConfigured(): void {
    const config = page.config()

    if (!config)
      return

    for (const group of config.item.groups ?? []) {
      if ((config.choices[group.id] ?? []).length < group.min) {
        setConfig('error', say('cart.group_needs_choice', 'Pick an option for "{group}".').replace('{group}', group.name))
        return
      }
    }

    addLine(config.item, config.quantity, config.choices, config.note)
    page.config.set(null)
  }

  /* ------------------------------------------------------------ the basket -- */

  /**
   * Put a line in the basket.
   *
   * The option names travel with the line so the basket can say what it holds
   * without going back to the menu for every row, and the ids travel with it
   * because the ids are what the server prices.
   */
  function addLine(item: any, quantity: number, choices: Record<number, number[]>, note: string): void {
    const modifierIds: number[] = []
    const labels: string[] = []

    for (const group of item.groups ?? []) {
      for (const optionId of choices[group.id] ?? []) {
        modifierIds.push(optionId)

        const option = group.options.find((candidate: any) => candidate.id === optionId)

        if (option)
          labels.push(option.name)
      }
    }

    page.cartError.set('')
    page.cart.set([...page.cart(), {
      productId: item.id,
      name: item.name,
      photo: item.photo,
      photoBlur: item.photoBlur,
      unitCents: item.priceCents,
      quantity,
      modifierIds,
      labels,
      notes: note,
    }])

    refreshQuote()
  }

  function setLineQuantity(index: number, quantity: number): void {
    if (quantity < 1) {
      removeLine(index)
      return
    }

    page.cart.set(page.cart().map((line: any, position: number) =>
      position === index ? { ...line, quantity: Math.min(50, quantity) } : line))

    refreshQuote()
  }

  function setLineNote(index: number, note: string): void {
    page.cart.set(page.cart().map((line: any, position: number) =>
      position === index ? { ...line, notes: note.slice(0, 300) } : line))
  }

  function removeLine(index: number): void {
    page.cart.set(page.cart().filter((_: any, position: number) => position !== index))
    refreshQuote()
  }

  function clearCart(): void {
    page.cart.set([])
    page.quote.set(null)
    page.cartError.set('')
  }

  function openCart(): void {
    page.cartOpen.set(true)
    refreshQuote()
  }

  function closeCart(): void {
    page.cartOpen.set(false)
  }

  /** What one line costs, for the row in the basket. */
  function linePrice(line: any): string {
    const menuItem = itemById(line.productId)
    let cents = line.unitCents

    for (const group of menuItem?.groups ?? []) {
      for (const optionId of line.modifierIds) {
        const option = group.options.find((candidate: any) => candidate.id === optionId)

        if (option)
          cents += option.priceDeltaCents
      }
    }

    return price(cents * line.quantity)
  }

  /* ---------------------------------------------------------- the checkout -- */

  function setFulfilment(value: string): void {
    setCheckout('fulfilment', value)
    refreshQuote()
  }

  function setTip(cents: number): void {
    setCheckout('tipCents', cents)
    refreshQuote()
  }

  function chooseAddress(address: any): void {
    page.checkout.set({
      ...page.checkout(),
      address,
      addressLine: address.line,
      addressLabel: address.label,
    })

    refreshQuote()
  }

  async function saveAddress(): Promise<void> {
    const response = await send('/api/addresses', {
      label: page.checkout().addressLabel,
      line: page.checkout().addressLine,
    })

    const payload = await response.json()

    if (!response.ok) {
      setCheckout('addressError', payload.message)
      return
    }

    setCheckout('addressError', '')
    chooseAddress(payload.data)
    loadAddresses()
  }

  /**
   * The address travels with the quote as well as with the order.
   *
   * The delivery fee is worked out from the distance, so quoting without an
   * address and charging with one would move the total at the last step, which
   * is the one moment nobody forgives.
   */
  function deliveryFields(): Record<string, unknown> {
    const checkout = page.checkout()

    if (checkout.fulfilment !== 'delivery')
      return {}

    return {
      deliveryAddress: checkout.addressLine || (checkout.address ? checkout.address.line : ''),
      deliveryLatitude: checkout.address ? checkout.address.latitude : undefined,
      deliveryLongitude: checkout.address ? checkout.address.longitude : undefined,
    }
  }

  function lines(): Array<Record<string, unknown>> {
    return page.cart().map((line: any) => ({
      productId: line.productId,
      quantity: line.quantity,
      modifierIds: line.modifierIds,
      notes: line.notes,
    }))
  }

  async function refreshQuote(): Promise<void> {
    if (page.cart().length === 0) {
      page.quote.set(null)
      return
    }

    const response = await send('/api/orders/quote', {
      businessSlug: slug,
      fulfilment: page.checkout().fulfilment,
      tipCents: page.checkout().tipCents,
      notes: page.checkout().note,
      lines: lines(),
      ...deliveryFields(),
    })

    const payload = await response.json()

    page.quote.set(response.ok ? payload.data : null)
    page.cartError.set(response.ok ? '' : payload.message || '')
  }

  async function placeOrder(): Promise<void> {
    const response = await send('/api/orders', {
      businessSlug: slug,
      fulfilment: page.checkout().fulfilment,
      tipCents: page.checkout().tipCents,
      notes: page.checkout().note,
      lines: lines(),
      ...deliveryFields(),
    })

    const payload = await response.json()

    if (!response.ok) {
      page.cartError.set(payload.message || say('checkout.could_not_place', 'That order could not be placed.'))
      return
    }

    page.placed.set(payload.data)

    /*
     * Placing and paying are separate steps on purpose: the kitchen board
     * shows the order either way, which is what happens in a restaurant when
     * a card is declined.
     */
    startPayment(payload.data.orderId)
  }

  async function startPayment(orderId: number): Promise<void> {
    const response = await send(`/api/payment/${orderId}/intent`)
    const { data } = await response.json()

    page.payment.set({ ...data, status: '' })

    if (!data.configured || !data.clientSecret)
      return

    whenPresent('card-element', () => mountStripe(data))
  }

  /* Stripe mounts a real element, so it waits for the branch that holds it. */
  function whenPresent(id: string, done: () => void, attempts = 20): void {
    if (document.getElementById(id)) {
      done()
      return
    }

    if (attempts > 0)
      setTimeout(() => whenPresent(id, done, attempts - 1), 50)
  }

  let elements: any = null
  let stripe: any = null

  /**
   * Payment.
   *
   * Sandbox only. The server refuses live Stripe keys outright, so the worst a
   * misconfiguration can do here is fail to take a test payment.
   */
  async function mountStripe(setup: any): Promise<void> {
    const globals = globalThis as any

    if (!globals.Stripe) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = 'https://js.stripe.com/v3/'
        script.onload = resolve
        script.onerror = reject
        document.head.append(script)
      }).catch(() => undefined)
    }

    const mount = document.getElementById('card-element')

    if (!globals.Stripe || !mount)
      return

    stripe = globals.Stripe(setup.publishableKey)
    elements = stripe.elements({ clientSecret: setup.clientSecret })
    elements.create('payment').mount(mount)
  }

  async function payNow(): Promise<void> {
    if (!stripe || !elements)
      return

    setPayment('status', say('checkout.talking_to_stripe', 'Talking to Stripe…'))

    const result = await stripe.confirmPayment({ elements, redirect: 'if_required' })

    if (result.error) {
      setPayment('status', result.error.message)
      return
    }

    // Tell the server which intent to look at. It asks Stripe whether the
    // money arrived rather than believing this page about it.
    const confirmed = await send('/api/payment/confirm', { transactionId: result.paymentIntent.id })

    setPayment('status', confirmed.ok
      ? say('checkout.paid_test_mode', 'Paid, in test mode. No money moved.')
      : (await confirmed.json()).message)
  }

  const setPayment = (field: string, value: unknown) => patch(page.payment, field, value)

  /* ------------------------------------------------------------- wording -- */

  /** What a dish contains, named in the language being read. */
  function allergenLine(allergens: string[]): string {
    const named = (allergens || []).map(code => say(`allergen.${code}`, String(code)))

    return say('checkout.contains', 'Contains {allergens}').replace('{allergens}', named.join(', '))
  }

  /** Whether a group must be answered, and how many it takes. */
  function groupRule(group: any): string {
    const rule = group.min > 0
      ? say('checkout.group_required', 'required')
      : say('checkout.group_optional', 'optional')

    if (!(group.max > 1))
      return rule

    return rule + say('checkout.group_up_to', ', up to {max}').replace('{max}', group.max)
  }

  /** What an option adds, when it adds anything. */
  function optionPrice(option: any): string {
    if (!option.priceDeltaCents)
      return ''

    return (option.priceDeltaCents > 0 ? ' +' : ' ') + price(option.priceDeltaCents)
  }

  /** The line under "order placed", with the restaurant's name in it. */
  function placedBody(name: string): string {
    return say('checkout.placed_body', '{name} has it, and the kitchen has started. You can follow it from here.')
      .replace('{name}', name)
  }

  function fulfilmentChoices(): Array<{ value: string, label: string }> {
    const business = page.menu() ? page.menu().business : null

    if (!business)
      return []

    return [
      business.offersDelivery ? { value: 'delivery', label: say('order.delivery', 'Delivery') } : null,
      business.offersPickup ? { value: 'pickup', label: say('order.pickup', 'Pickup') } : null,
      business.offersDineIn ? { value: 'dine_in', label: say('order.dine_in', 'Dine in') } : null,
    ].filter(Boolean) as Array<{ value: string, label: string }>
  }

  function tipChoices(): Array<{ cents: number, label: string }> {
    return [0, 200, 400, 600].map(cents => ({
      cents,
      label: cents === 0 ? say('checkout.none', 'None') : price(cents),
    }))
  }

  function load(): void {
    loadMenu()
    loadAddresses()
  }

  return {
    load,
    loadMenu,
    itemById,
    qtyOf,
    addOne,
    removeOne,
    openItem,
    closeItem,
    chosenIn,
    toggleChoice,
    setConfig,
    setConfigQuantity,
    configPrice,
    addConfigured,
    openCart,
    closeCart,
    setLineQuantity,
    setLineNote,
    removeLine,
    clearCart,
    linePrice,
    setCheckout,
    setFulfilment,
    setTip,
    chooseAddress,
    saveAddress,
    placeOrder,
    payNow,
    price,
    allergenLine,
    groupRule,
    optionPrice,
    placedBody,
    fulfilmentChoices,
    tipChoices,
  }
}
