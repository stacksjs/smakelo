import { beforeAll, describe, expect, test } from 'bun:test'
import { route } from '@stacksjs/router'
import { assertDatabaseHas, factory, refreshDatabase } from '../support/database'

/**
 * The HTTP layer.
 *
 * The actions behind these routes have their own tests. This is the layer
 * above them, which nothing covered: whether a path reaches the handler that
 * was meant, whether a query string arrives as the argument it should,
 * whether a missing thing is a 404 rather than a 200 with nothing in it, and -
 * the part worth the most - whether a route that should be closed is closed.
 *
 * Real requests through the real router. `route.handleRequest` is the same
 * entry point the server uses, so path parameters, query parsing and the JSON
 * envelope are all exercised rather than described.
 *
 * The paths carry no `/api` prefix here because these routes do not: the
 * prefix is added when the API process mounts them.
 */

const database = refreshDatabase({ auth: true })

beforeAll(async () => {
  // Registers all 53 routes on the shared router.
  await import('../../routes/api')
})

async function get(path: string, headers: Record<string, string> = {}): Promise<{ status: number, body: any }> {
  return read(await route.handleRequest(new Request(`http://localhost${path}`, { headers })))
}

/**
 * A POST carries a CSRF token, because every POST here is protected by one.
 *
 * Double-submit: the same value in the `X-CSRF-Token` cookie and the
 * `x-csrf-token` header. A browser will send the cookie automatically and only
 * a page on this origin can read it to set the header, which is what makes the
 * pair worth checking. Sent by default so that a test about who may do
 * something is answered by the permission check rather than by CSRF - and
 * there are tests below for the refusal itself.
 */
const CSRF = 'test-csrf-token-0123456789abcdef'

async function post(path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number, body: any }> {
  return read(await route.handleRequest(new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': CSRF,
      'cookie': `X-CSRF-Token=${CSRF}`,
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })))
}

/** The same POST with nothing to prove it came from a page on this site. */
async function postWithoutCsrf(path: string, body?: unknown): Promise<{ status: number, body: any }> {
  return read(await route.handleRequest(new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })))
}

async function read(response: any): Promise<{ status: number, body: any }> {
  const text = await response?.text?.()

  try {
    return { status: Number(response?.status ?? 0), body: JSON.parse(String(text)) }
  }
  catch {
    return { status: Number(response?.status ?? 0), body: text }
  }
}

/** A partner with a market, so prices and currencies resolve. */
function seedShop(overrides: Record<string, unknown> = {}): { businessId: number, marketId: number } {
  const [marketId] = database.seed('markets', [factory.market()])
  const [businessId] = database.seed('businesses', [factory.business({
    slug: 'a-shop',
    name: 'A Shop',
    is_partner: 1,
    offers_pickup: 1,
    market_id: marketId,
    ...overrides,
  })])

  return { businessId, marketId }
}

describe('finding places', () => {
  test('lists what is there, with a count', async () => {
    seedShop()

    const { status, body } = await get('/businesses')

    expect(status).toBe(200)
    expect(body.count).toBe(1)
    expect(body.data[0].slug).toBe('a-shop')
  })

  test('passes the query string through to the search', async () => {
    // Each of these is a separate parse in the handler, and a filter that
    // silently fails to arrive looks like a search that found nothing.
    seedShop()
    database.seed('businesses', [factory.business({ slug: 'a-cafe', name: 'A Cafe', type: 'cafe' })])

    expect((await get('/businesses?type=cafe')).body.data.map((r: any) => r.slug)).toEqual(['a-cafe'])
    expect((await get('/businesses?q=Shop')).body.data.map((r: any) => r.slug)).toEqual(['a-shop'])
    expect((await get('/businesses?partners_only=1')).body.data.map((r: any) => r.slug)).toEqual(['a-shop'])
    expect((await get('/businesses?limit=1')).body.data.length).toBe(1)
  })

  test('a nonsense number in the query does not become a filter', async () => {
    // `Number('abc')` is NaN, and a NaN radius passed into the search would
    // exclude everything rather than being ignored.
    seedShop()

    expect((await get('/businesses?lat=abc&lng=abc&radius=abc')).body.count).toBe(1)
  })

  test('one business, by slug', async () => {
    seedShop()

    const { status, body } = await get('/businesses/a-shop')

    expect(status).toBe(200)
    expect(body.data.business.slug).toBe('a-shop')
  })

  test('a business nobody has is a 404, not an empty 200', async () => {
    // A 200 with nothing in it tells a client the request worked and the
    // restaurant has no name.
    const { status } = await get('/businesses/nowhere')

    expect(status).toBe(404)
  })

  test('a menu, by slug', async () => {
    const { businessId } = seedShop()
    const [categoryId] = database.seed('categories', [{ name: 'Mains', slug: 'mains', display_order: 1, is_active: 1 }])
    database.seed('products', [factory.product({ name: 'A Dish', business_id: businessId, category_id: categoryId })])

    const { status, body } = await get('/businesses/a-shop/menu')

    expect(status).toBe(200)
    expect(body.data.sections[0].items[0].name).toBe('A Dish')
  })

  test('a menu for a business nobody has is a 404', async () => {
    expect((await get('/businesses/nowhere/menu')).status).toBe(404)
  })
})

function shopWithADish(shop: Record<string, unknown> = {}, product: Record<string, unknown> = {}): { businessId: number, productId: number } {
  const { businessId } = seedShop(shop)
  const [categoryId] = database.seed('categories', [{ name: 'Mains', slug: 'mains', display_order: 1, is_active: 1 }])
  const [productId] = database.seed('products', [factory.product({ name: 'A Dish', price: 1000, business_id: businessId, category_id: categoryId, ...product })])

  return { businessId, productId }
}

describe('placing an order over HTTP', () => {
  test('a quote prices it without writing anything', async () => {
    // The difference between quoting and ordering is the whole point of
    // having two endpoints: a quote that placed an order would charge people
    // for opening a basket.
    const { productId } = shopWithADish()

    const { status, body } = await post('/orders/quote', {
      businessSlug: 'a-shop',
      fulfilment: 'pickup',
      lines: [{ productId, quantity: 2 }],
    })

    expect(status).toBe(200)
    expect(body.data.subtotalCents).toBe(2000)

    const orders = database.connection().query<{ n: number }, []>('SELECT COUNT(*) n FROM orders').get()

    expect(orders!.n).toBe(0)
  })

  test('quote and placement price the same bounded quantity', async () => {
    const { productId } = shopWithADish()
    const order = {
      businessSlug: 'a-shop',
      fulfilment: 'pickup',
      lines: [{ productId, quantity: 51 }],
    }

    const quote = await post('/orders/quote', order)
    const placed = await post('/orders', order)

    expect(quote.status).toBe(200)
    expect(placed.status).toBe(201)
    expect(quote.body.data).toEqual(placed.body.data.pricing)
    expect(quote.body.data.subtotalCents).toBe(50_000)
  })

  test('quote rejects a dish the kitchen marked unavailable', async () => {
    const { productId } = shopWithADish({}, { is_available: 0 })
    const order = {
      businessSlug: 'a-shop',
      fulfilment: 'pickup',
      lines: [{ productId, quantity: 1 }],
    }

    const quote = await post('/orders/quote', order)
    const placed = await post('/orders', order)

    expect(quote.status).toBe(422)
    expect(quote.body.message).toBe('A Dish is not available right now.')
    expect(placed.body.message).toBe(quote.body.message)
  })

  test('delivery needs an address at both checkout steps', async () => {
    const { productId } = shopWithADish({ offers_delivery: 1 })
    const order = {
      businessSlug: 'a-shop',
      fulfilment: 'delivery',
      deliveryAddress: '   ',
      lines: [{ productId, quantity: 1 }],
    }

    const quote = await post('/orders/quote', order)
    const placed = await post('/orders', order)

    expect(quote.status).toBe(422)
    expect(quote.body.message).toBe('Enter a delivery address with a street and number.')
    expect(placed.body.message).toBe(quote.body.message)
  })

  test('quote rejects a fulfilment mode the kitchen does not offer', async () => {
    const { productId } = shopWithADish({ offers_delivery: 0 })
    const order = {
      businessSlug: 'a-shop',
      fulfilment: 'delivery',
      lines: [{ productId, quantity: 1 }],
    }

    const quote = await post('/orders/quote', order)
    const placed = await post('/orders', order)

    expect(quote.status).toBe(422)
    expect(quote.body.message).toBe('A Shop does not offer delivery.')
    expect(placed.body.message).toBe(quote.body.message)
  })

  test('a scanned table takes a round and splits its bill using its own code', async () => {
    const { businessId, productId } = shopWithADish({ offers_dine_in: 1 })
    const code = crypto.randomUUID().replaceAll('-', '')
    const otherCode = crypto.randomUUID().replaceAll('-', '')
    const [tableId] = database.seed('tables', [
      { uuid: crypto.randomUUID(), business_id: businessId, label: '7', seats: 3, qr_token: code, is_active: 1 },
      { uuid: crypto.randomUUID(), business_id: businessId, label: '8', seats: 2, qr_token: otherCode, is_active: 1 },
    ])

    const scan = await get(`/table-sessions/${code}`)
    expect(scan.status).toBe(200)
    const tabId = scan.body.data.tab.id
    const order = {
      businessSlug: 'a-shop',
      fulfilment: 'dine_in',
      lines: [{ productId, quantity: 1 }],
      tabId,
    }

    expect((await post('/orders/quote', { ...order, tableCode: otherCode })).status).toBe(422)
    expect((await post('/orders/quote', { ...order, tableCode: code })).status).toBe(200)
    const placed = await post('/orders', { ...order, tableCode: code })
    expect(placed.status).toBe(201)

    const round = (await get(`/table-sessions/${code}`)).body.data.rounds[0]
    expect(round.orderId).toBe(placed.body.data.orderId)
    expect(round.items[0].name).toBe('A Dish')

    const close = `/tabs/${tabId}/close`
    expect((await post(close, { tableCode: otherCode, splitMode: 'even' })).status).toBe(422)
    const bill = await post(close, { tableCode: code, splitMode: 'even' })
    expect(bill.status).toBe(200)
    expect(bill.body.data.shares).toHaveLength(3)
    expect(bill.body.data.shares.reduce((total: number, cents: number) => total + cents, 0)).toBe(round.totalCents)
    expect((await post('/orders', { ...order, tableCode: code })).status).toBe(422)

    const saved = database.connection().query('SELECT table_id, tab_id FROM orders WHERE id = ?').get(round.orderId)
    expect(saved).toEqual({ table_id: tableId, tab_id: tabId })
  })

  test('an order is created and comes back with a way to follow it', async () => {
    const { productId } = shopWithADish()

    const { status, body } = await post('/orders', {
      businessSlug: 'a-shop',
      fulfilment: 'pickup',
      lines: [{ productId, quantity: 1 }],
    })

    expect(status).toBe(201)
    expect(body.data.trackingToken).toMatch(/^[0-9a-f]{24}$/)

    const orders = database.connection().query<{ n: number }, []>('SELECT COUNT(*) n FROM orders').get()

    expect(orders!.n).toBe(1)
  })

  test('a refused order is a 4xx, not a 500', async () => {
    // The difference matters to a client: one is "fix your request" and the
    // other is "try again later".
    shopWithADish()

    const { status, body } = await post('/orders', {
      businessSlug: 'a-shop',
      fulfilment: 'pickup',
      lines: [{ productId: 999_999, quantity: 1 }],
    })

    expect(status).toBeGreaterThanOrEqual(400)
    expect(status).toBeLessThan(500)
    expect(String(body.message)).toMatch(/no longer on the menu/)
  })

  test('tracking a token nobody has is a 404', async () => {
    expect((await get('/orders/track/deadbeefdeadbeefdeadbeef')).status).toBe(404)
  })

  test('tracking a real token finds the order', async () => {
    const { productId } = shopWithADish()
    const placed = await post('/orders', { businessSlug: 'a-shop', fulfilment: 'pickup', lines: [{ productId, quantity: 1 }] })

    const { status, body } = await get(`/orders/track/${placed.body.data.trackingToken}`)

    expect(status).toBe(200)
    expect(body.data.status).toBe('PENDING')
    expect(body.data.totalCents).toBe(placed.body.data.pricing.totalCents)
    expect(body.data.business.slug).toBe('a-shop')
  })

  test('the receipt provides a review QR only after handover', async () => {
    const { productId } = shopWithADish()
    const order = await post('/orders', { businessSlug: 'a-shop', fulfilment: 'pickup', lines: [{ productId, quantity: 1 }] })
    const { orderId, trackingToken } = order.body.data
    const tracking = `/orders/track/${trackingToken}`

    expect((await get(`${tracking}/review-code`)).status).toBe(404)
    database.connection().query("UPDATE orders SET status = 'DELIVERED' WHERE id = ?").run(orderId)

    expect((await get(tracking)).body.data.reviewPath).toBe('/places/a-shop#reviews')

    const qr = await route.handleRequest(new Request(`http://localhost${tracking}/review-code`))
    expect(qr.status).toBe(200)
    expect(qr.headers.get('content-type')).toContain('image/svg+xml')
    expect(await qr.text()).toContain('<svg')
  })
})

describe('what is closed to a stranger', () => {
  /*
   * Every one of these gates on a viewer. A route that forgets is not a
   * failing test anywhere else in the suite - the action behind it assumes it
   * was allowed to run, because that is the router's job.
   *
   * 401 rather than 403 when nobody is signed in, because those are different
   * problems: one is answered by signing in and the other never is.
   */
  const closed: Array<[string, string]> = [
    ['GET', '/merchant/a-shop/board'],
    ['POST', '/merchant/orders/1/status'],
    ['POST', '/courier/stops/1/start'],
    ['POST', '/courier/1/ping'],
    ['POST', '/courier/1/pings'],
    ['GET', '/money/balances'],
    ['GET', '/money/business/1'],
    ['POST', '/money/business/1/payout'],
    ['GET', '/claims'],
    ['POST', '/claims/1/approve'],
    ['GET', '/manage/a-shop'],
    ['GET', '/manage/a-shop/codes'],
    ['GET', '/manage/a-shop/shares'],
    ['POST', '/manage/a-shop/hours'],
    ['POST', '/manage/a-shop/fulfilment'],
    ['GET', '/admin/guards'],
    ['GET', '/admin/listings'],
    ['GET', '/admin/courier-coverage'],
    ['POST', '/admin/courier-coverage/1/1'],
    ['POST', '/admin/listings/a-shop/hide'],
  ]

  for (const [method, path] of closed) {
    test(`${method} ${path} turns away somebody who is not signed in`, async () => {
      seedShop()

      const { status } = method === 'GET' ? await get(path) : await post(path, {})

      expect(status).toBe(401)
    })
  }
})

describe('what a signed-in stranger still may not do', () => {
  /**
   * Somebody signed in, holding the roles named.
   *
   * Roles rather than permissions, because that is how the app grants: the
   * role names live in the database and the map from a role to what it may do
   * lives in `app/Permissions.ts`. Seeding a `role_permissions` row for a
   * made-up role name therefore grants nothing at all, which is a confusing
   * way to write a test that passes for the wrong reason.
   */
  async function signIn(roles: string[] = []): Promise<string> {
    const [userId] = database.seed('users', [{
      name: 'A User',
      email: `user-${Math.random().toString(36).slice(2, 8)}@example.invalid`,
      password: 'x',
      uuid: crypto.randomUUID(),
    }])

    database.seed('oauth_clients', [{
      name: 'Personal Access Client',
      secret: 'test',
      provider: 'users',
      redirect: '',
      personal_access_client: 1,
      password_client: 0,
      revoked: 0,
    }])

    for (const name of roles) {
      const [roleId] = database.seed('roles', [{ name, guard_name: 'web', description: '' }])

      database.seed('user_roles', [{ user_id: userId, role_id: roleId }])
    }

    const { createToken } = await import('@stacksjs/auth')
    const token: any = await createToken(userId, 'test', ['*'])

    return String(token?.plainTextToken ?? token?.plainText ?? token?.token ?? token)
  }

  test('being signed in is not the same as being allowed', async () => {
    // 403, not 401: this person is known and still may not do it. Answering
    // 401 would send them to a sign-in page they are already past.
    seedShop()
    const token = await signIn()

    const { status, body } = await get('/admin/guards', { authorization: `Bearer ${token}` })

    expect(status).toBe(403)
    expect(String(body.message)).toMatch(/not yours to do/)
  })

  test('and having the permission is', async () => {
    seedShop()
    const token = await signIn(['admin'])

    const { status, body } = await get('/admin/guards', { authorization: `Bearer ${token}` })

    expect(status).toBe(200)
    expect(body.data.results).toHaveLength(6)
    expect(body.data.results.find((check: { key: string }) => check.key === 'payments'))
      .toMatchObject({ title: 'Sandbox payments only', detail: expect.any(String) })
  })

  test('a role that runs a restaurant does not run the site', async () => {
    // A merchant may manage their own business and nothing else. The
    // operations pages are a different role, and the check is per action
    // rather than per sign-in.
    seedShop()
    const token = await signIn(['merchant'])

    expect((await get('/admin/guards', { authorization: `Bearer ${token}` })).status).toBe(403)
    expect((await get('/admin/listings', { authorization: `Bearer ${token}` })).status).toBe(403)
    expect((await get('/admin/courier-coverage', { authorization: `Bearer ${token}` })).status).toBe(403)
    expect((await post('/admin/courier-coverage/1/1', { enabled: true }, { authorization: `Bearer ${token}` })).status).toBe(403)
  })

  test('operations can grant and remove market coverage for a linked courier', async () => {
    const [marketId] = database.seed('markets', [factory.market()])
    const [userId] = database.seed('users', [{ name: 'Courier', email: 'coverage@example.invalid', password: 'x' }])
    const [courierId] = database.seed('couriers', [factory.courier({ user_id: userId })])
    const token = await signIn(['admin'])
    const headers = { authorization: `Bearer ${token}` }
    const path = `/admin/courier-coverage/${courierId}/${marketId}`

    expect((await post(path, { enabled: 'true' }, headers)).status).toBe(422)
    expect((await post(path, { enabled: true }, headers)).status).toBe(200)
    expect((await get('/admin/courier-coverage', headers)).body.data.couriers[0].marketIds).toEqual([marketId])
    expect((await post(path, { enabled: false }, headers)).status).toBe(200)
    expect((await get('/admin/courier-coverage', headers)).body.data.couriers[0].marketIds).toEqual([])
  })

  test('guests and merchants cannot decide a listing claim', async () => {
    seedShop({ is_partner: 0 })
    const { body } = await post('/businesses/a-shop/claim', {
      name: 'A Claimant',
      email: 'claimant@example.invalid',
    })
    const path = `/claims/${body.data.claimId}/approved`
    const token = await signIn(['merchant'])

    expect((await post(path, {})).status).toBe(401)
    expect((await post(path, {}, { authorization: `Bearer ${token}` })).status).toBe(403)
  })

  test('an admin can decide a pending listing claim once', async () => {
    const { businessId } = seedShop({ is_partner: 0 })
    const approve = await post('/businesses/a-shop/claim', {
      name: 'A Claimant',
      email: 'claimant@example.invalid',
    })
    const [otherId] = database.seed('businesses', [factory.business({ slug: 'other-listing', is_partner: 0 })])
    const reject = await post('/businesses/other-listing/claim', {
      name: 'Another Claimant',
      email: 'another@example.invalid',
    })
    const approvePath = `/claims/${approve.body.data.claimId}`
    const rejectPath = `/claims/${reject.body.data.claimId}`
    const headers = { authorization: `Bearer ${await signIn(['admin'])}` }

    expect((await post(`${approvePath}/approved`, {}, headers)).status).toBe(200)
    expect((await post(`${rejectPath}/rejected`, {}, headers)).status).toBe(200)
    expect((await post(`${approvePath}/rejected`, {}, headers)).status).toBe(422)
    assertDatabaseHas('businesses', { id: businessId, is_claimed: 1 })
    assertDatabaseHas('businesses', { id: otherId, is_claimed: 0 })
    assertDatabaseHas('claims', { id: approve.body.data.claimId, status: 'approved' })
    assertDatabaseHas('claims', { id: reject.body.data.claimId, status: 'rejected' })
  })

  test('buyer history includes signed-in and linked guest orders across devices', async () => {
    const { productId } = shopWithADish()
    const order = { businessSlug: 'a-shop', fulfilment: 'pickup', lines: [{ productId, quantity: 1 }] }
    const guest = { 'x-visitor': 'guestfromfirstbrowser1234' }
    const otherDevice = { 'x-visitor': 'guestfromotherbrowser1234' }
    const guestOrder = await post('/orders', order, guest)
    const buyer = { authorization: `Bearer ${await signIn()}` }
    const stranger = { authorization: `Bearer ${await signIn()}` }

    expect(guestOrder.status).toBe(201)
    expect((await get('/orders/mine', guest)).body.data.map((entry: { id: number }) => entry.id)).toEqual([guestOrder.body.data.orderId])
    expect((await post('/account/link', {}, { ...guest, ...buyer })).body.data.linked).toBe(true)
    expect((await post('/account/link', {}, { ...guest, ...stranger })).body.data.linked).toBe(false)
    expect((await get('/orders/mine', guest)).body.data).toEqual([])

    const accountOrder = await post('/orders', order, { ...otherDevice, ...buyer })
    expect(accountOrder.status).toBe(201)
    expect((await get('/orders/mine', buyer)).body.data.map((entry: { id: number }) => entry.id))
      .toEqual([accountOrder.body.data.orderId, guestOrder.body.data.orderId])
    expect((await get('/orders/mine', { ...guest, ...stranger })).body.data).toEqual([])
    expect((await get('/orders/mine', otherDevice)).body.data).toEqual([])
  })

  test('saved places follow an account and merging guest lists does not duplicate them', async () => {
    seedShop()
    const guest = { 'x-visitor': 'guestfavoritesbrowser1234' }
    const buyer = { authorization: `Bearer ${await signIn()}` }
    const other = { authorization: `Bearer ${await signIn()}` }
    const favorite = '/businesses/a-shop/save'

    expect((await post(favorite, { saved: true }, guest)).body.data.saved).toBe(true)
    expect((await post(favorite, { saved: true }, buyer)).body.data.saved).toBe(true)
    expect((await post('/account/link', {}, { ...guest, ...buyer })).body.data.linked).toBe(true)

    const saved = await get('/saved', buyer)
    expect(saved.body.data.map((place: { slug: string }) => place.slug)).toEqual(['a-shop'])
    expect((await get('/account', buyer)).body.data.carries.saved).toBe(1)
    expect((await get('/saved', guest)).body.data).toEqual([])
    expect((await get('/saved', { ...guest, ...other })).body.data).toEqual([])

    expect((await post(favorite, { saved: false }, buyer)).body.data.saved).toBe(false)
    expect((await post(favorite, { saved: false }, buyer)).body.data.saved).toBe(false)
    expect((await get('/saved', buyer)).body.data).toEqual([])
  })

  test('delivery addresses follow the buyer and stay private after linking a browser', async () => {
    const guest = { 'x-visitor': 'guestaddressesbrowser1234' }
    const buyer = { authorization: `Bearer ${await signIn()}` }
    const other = { authorization: `Bearer ${await signIn()}` }

    const first = await post('/addresses', { label: 'First', line: '100 Demo Street' }, guest)
    expect(first.status).toBe(201)
    expect((await get('/addresses', guest)).body.data[0]).toMatchObject({ line: '100 Demo Street', isDefault: true, latitude: null, longitude: null })
    expect((await post('/account/link', {}, { ...guest, ...buyer })).body.data.linked).toBe(true)
    expect((await get('/addresses', guest)).body.data).toEqual([])
    expect((await get('/addresses', { ...guest, ...other })).body.data).toEqual([])

    const second = await post('/addresses', { label: 'Second', line: '200 Demo Street' }, buyer)
    expect(second.status).toBe(201)
    expect((await get('/addresses', buyer)).body.data.map((address: { isDefault: boolean }) => address.isDefault)).toEqual([true, false])

    const removeFirst = `/addresses/${first.body.data.id}/remove`
    expect((await post(removeFirst, {}, guest)).status).toBe(404)
    expect((await post(removeFirst, {}, other)).status).toBe(404)
    expect((await post(removeFirst, {}, buyer)).status).toBe(200)

    const next = await post('/addresses', { line: '300 Demo Street' }, buyer)
    expect(next.status).toBe(201)
    expect((await get('/addresses', buyer)).body.data[0]).toMatchObject({ line: '200 Demo Street', isDefault: true })

    const newGuest = await post('/addresses', { line: '400 Demo Street' }, guest)
    expect(newGuest.status).toBe(201)
    expect((await get('/addresses', guest)).body.data).toHaveLength(1)
    expect((await get('/addresses', buyer)).body.data).toHaveLength(2)
  })

  test('a browser linked before credential retirement starts a new guest profile', async () => {
    const token = 'legacylinkedbrowser123456'
    const buyer = { authorization: `Bearer ${await signIn()}` }
    const { body } = await get('/account', buyer)
    const [legacyCustomer] = database.seed('customers', [{
      uuid: crypto.randomUUID(),
      name: 'Previous guest',
      email: `visitor-${token}@demo.smakelo.invalid`,
      user_id: body.data.user.id,
      avatar: '',
    }])
    database.seed('addresses', [{ line: '100 Legacy Avenue', customer_id: legacyCustomer, is_default: 1 }])

    const guest = { 'x-visitor': token }
    expect((await get('/addresses', guest)).body.data).toEqual([])
    expect((await post('/addresses', { line: '200 Guest Avenue' }, guest)).status).toBe(201)
    expect((await get('/addresses', guest)).body.data[0]).toMatchObject({ line: '200 Guest Avenue' })
    expect((await get('/addresses', buyer)).body.data[0]).toMatchObject({ line: '100 Legacy Avenue' })
  })

  test('a farm membership stays accessible to the account after its guest credential is retired', async () => {
    const { businessId } = seedShop({ type: 'farm' })
    const [planId] = database.seed('csa_plans', [{
      name: 'Weekly share',
      business_id: businessId,
      price_cents: 2500,
      is_active: 1,
    }])
    const guest = { 'x-visitor': 'guestcsamemberbrowser1234' }
    const buyer = { authorization: `Bearer ${await signIn()}` }
    const membership = await post('/csa/join', { planId, name: 'A buyer' }, guest)

    expect(membership.status).toBe(201)
    expect((await post('/account/link', {}, { ...guest, ...buyer })).body.data.linked).toBe(true)
    expect((await get('/csa/mine', guest)).body.data).toEqual([])
    expect((await get('/csa/mine', buyer)).body.data[0]).toMatchObject({ planName: 'Weekly share', status: 'active' })
    expect((await post('/csa/join', { planId }, buyer)).status).toBe(422)

    const action = `/csa/${membership.body.data.subscriptionId}/pause`
    expect((await post(action, { until: '2040-12-18' }, guest)).status).toBe(422)
    expect((await post(action, { until: '2040-12-18' }, buyer)).body.data.status).toBe('paused')
  })

  test('a completed account order verifies a review on another device', async () => {
    const { productId } = shopWithADish()
    const buyer = { authorization: `Bearer ${await signIn()}` }
    const order = await post('/orders', {
      businessSlug: 'a-shop',
      fulfilment: 'pickup',
      lines: [{ productId, quantity: 1 }],
    }, buyer)

    expect(order.status).toBe(201)
    database.connection().query("UPDATE orders SET status = 'DELIVERED' WHERE id = ?").run(order.body.data.orderId)

    const path = '/businesses/a-shop/reviews'
    const review = { rating: 5, authorName: 'A User', body: 'My pickup order was ready and the food was fresh.' }
    const posted = await post(path, review, { 'x-visitor': 'guestfromotherbrowser1234', ...buyer })

    expect(posted.body.data).toMatchObject({ verified: true })
    expect((await get(path, buyer)).body.data.reviews[0]).toMatchObject({ verified: true, mine: true })
    expect((await get(path)).body.data.reviews[0]).toMatchObject({ verified: true, mine: false })
    expect((await post(path, review, buyer)).status).toBe(422)
  })

  test('a made-up token is nobody', async () => {
    const { status } = await get('/admin/guards', { authorization: 'Bearer not-a-real-token' })

    expect(status).toBe(401)
  })

  test('managing a business you have no part in is refused', async () => {
    // The permission is not enough on its own: `canActOnBusiness` also checks
    // the team, which is what stops one restaurant editing another's menu.
    seedShop()
    const token = await signIn(['merchant'])

    expect((await get('/manage/a-shop', { authorization: `Bearer ${token}` })).status).toBe(403)
  })
})

describe('the open endpoints stay open', () => {
  test('anyone may read a farm\'s shares', async () => {
    const { businessId } = seedShop({ type: 'farm' })
    database.seed('csa_plans', [factory.csaPlan({ business_id: businessId })])

    const { status, body } = await get('/csa/a-shop/plans')

    expect(status).toBe(200)
    expect(body.data.length).toBe(1)
  })

  test('anyone may read a business\'s reviews', async () => {
    // The reviews come back with the summary beside them rather than as a
    // bare list, so a page can draw the stars without a second request.
    seedShop()

    const { status, body } = await get('/businesses/a-shop/reviews')

    expect(status).toBe(200)
    expect(Array.isArray(body.data.reviews)).toBe(true)
    expect(body.data.stats.count).toBe(0)
    expect(body.data.stats.distribution.length).toBe(5)
  })

  test('the demo accounts hand out their own password, on purpose', async () => {
    // Worth being explicit about, because it looks like a leak and is not:
    // every account behind this endpoint is invented, they exist so a visitor
    // can sign in and look around, and they all share one documented password.
    // The test is here so that changing what this returns is a decision rather
    // than an accident.
    const { status, body } = await get('/demo-accounts')

    expect(status).toBe(200)
    expect(body.data.password).toBe('smakelo-demo')
    expect(Array.isArray(body.data.accounts)).toBe(true)
  })
})

describe('a POST from somewhere else', () => {
  /*
   * Without this, any site a customer happens to have open can place orders,
   * cancel memberships and hide listings in their name - the browser attaches
   * their cookies either way, and the only thing a cross-origin page cannot do
   * is read this origin's cookie to echo it back in a header.
   */
  test('is refused without the token, even on an open endpoint', async () => {
    const { status, body } = await postWithoutCsrf('/subscribe', { email: 'someone@example.invalid' })

    expect(status).toBe(403)
    expect(String(body.message)).toMatch(/CSRF/i)
  })

  test('is refused when the header does not match the cookie', async () => {
    // A header alone proves nothing: the point is that it equals a cookie only
    // a page on this origin could have read.
    const response = await route.handleRequest(new Request('http://localhost/subscribe', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': 'one-value',
        'cookie': 'X-CSRF-Token=a-different-value',
      },
      body: JSON.stringify({ email: 'someone@example.invalid' }),
    }))

    expect(Number(response?.status)).toBe(403)
  })

  test('and writes nothing when it is refused', async () => {
    await postWithoutCsrf('/subscribe', { email: 'someone@example.invalid' })

    const rows = database.connection().query<{ n: number }, []>('SELECT COUNT(*) n FROM subscribers').get()

    expect(rows!.n).toBe(0)
  })
})

describe('routes that do not exist', () => {
  test('are a 404 rather than a crash', async () => {
    const { status } = await get('/not-a-route-at-all')

    expect(status).toBe(404)
  })
})
