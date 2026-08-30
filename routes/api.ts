import { response, route } from '@stacksjs/router'
import { businessBySlug, searchBusinesses } from '../app/Actions/Business/search'
import { menuFor } from '../app/Actions/Order/menu'
import { createOrder, quoteOrder, trackOrder } from '../app/Actions/Order/api'
import { closeTab, sessionForToken } from '../app/Actions/Dine/tables'

/**
 * Smakelo's JSON API, mounted under `/api` and answered by the API process.
 *
 * These call the same functions the server-rendered pages do, so a client and
 * a page cannot drift apart on what counts as open, near, or orderable.
 */

/** `GET /api/businesses?lat=&lng=&radius=&q=&type=&open_now=&partners_only=&sort=` */
route.get('/businesses', async (request: any) => {
  const number = (value: unknown): number | undefined => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  const flag = (value: unknown): boolean => value === '1' || value === 'true'

  const results = await searchBusinesses({
    latitude: number(request?.query?.lat),
    longitude: number(request?.query?.lng),
    radiusMeters: number(request?.query?.radius),
    q: request?.query?.q ? String(request.query.q) : undefined,
    type: request?.query?.type ? String(request.query.type) : undefined,
    openNow: flag(request?.query?.open_now),
    partnersOnly: flag(request?.query?.partners_only),
    sort: request?.query?.sort as 'distance' | 'rating' | 'name' | undefined,
    limit: number(request?.query?.limit),
  })

  return response.json({ data: results, count: results.length })
})

/** `GET /api/businesses/{slug}` - one business with hours, menu and reviews. */
route.get('/businesses/{slug}', async (request: any) => {
  const slug = String(request?.getParam?.('slug') ?? request?.params?.slug ?? '')
  const found = await businessBySlug(slug)

  if (!found)
    return response.json({ message: `No business with slug "${slug}".` }, 404)

  return response.json({ data: found })
})

/**
 * The menu for one business, with modifier groups.
 *
 * `GET /api/businesses/{slug}/menu`
 *
 * Separate from the business endpoint because the ordering screen needs the
 * groups and options, and the browse screens never do. Sending them everywhere
 * would triple a payload most callers throw away.
 */
route.get('/businesses/{slug}/menu', async (request: any) => {
  const slug = String(request?.getParam?.('slug') ?? request?.params?.slug ?? '')
  const menu = await menuFor(slug)

  if (!menu)
    return response.json({ message: `No business with slug "${slug}".` }, 404)

  return response.json({ data: menu })
})

/**
 * Place an order.
 *
 * `POST /api/orders`
 *
 * The body names what was chosen; every price is looked up server-side.
 */
route.post('/orders', async (request: any) => {
  const body = typeof request?.all === 'function' ? await request.all() : request?.body ?? {}
  const result = await createOrder(body)

  if (!result.ok)
    return response.json({ message: result.reason }, 422)

  return response.json({
    data: {
      orderId: result.orderId,
      trackingToken: result.trackingToken,
      pricing: result.pricing,
    },
  }, 201)
})

/**
 * Quote an order without placing it.
 *
 * `POST /api/orders/quote`
 *
 * The checkout screen needs the fees before anyone commits, and it must be the
 * same arithmetic that will run on submit, not a second implementation in the
 * browser that drifts from it.
 */
route.post('/orders/quote', async (request: any) => {
  const body = typeof request?.all === 'function' ? await request.all() : request?.body ?? {}
  const quote = await quoteOrder(body)

  if (!quote.ok)
    return response.json({ message: quote.reason }, 422)

  return response.json({ data: quote.pricing })
})

/**
 * An order's public status, by tracking token.
 *
 * `GET /api/orders/track/{token}`
 *
 * Keyed on the token rather than the order id so a customer can watch their
 * order without an account, and cannot watch anybody else's by counting.
 */
route.get('/orders/track/{token}', async (request: any) => {
  const token = String(request?.getParam?.('token') ?? request?.params?.token ?? '')
  const tracked = await trackOrder(token)

  if (!tracked)
    return response.json({ message: 'No order with that tracking code.' }, 404)

  return response.json({ data: tracked })
})

/**
 * Resolve a scanned table code.
 *
 * `GET /api/table-sessions/{token}`
 *
 * Not `/api/tables/{token}`: the Table model's own `useApi` CRUD already owns
 * that shape behind auth, and it wins, so a scan answered 401. A session is a
 * different thing from the table resource anyway.
 *
 * Opens a tab if the table has none. Scanning is what opens a tab: asking
 * someone to press "start a tab" after they have already scanned the code is a
 * step that exists only in the data model.
 */
route.get('/table-sessions/{token}', async (request: any) => {
  const token = String(request?.getParam?.('token') ?? request?.params?.token ?? '')
  const session = await sessionForToken(token)

  if (!session)
    return response.json({ message: 'That code does not match a table.' }, 404)

  return response.json({ data: session })
})

/**
 * Close a tab and divide the bill.
 *
 * `POST /api/tabs/{id}/close`
 */
route.post('/tabs/{id}/close', async (request: any) => {
  const tabId = Number(request?.getParam?.('id') ?? request?.params?.id ?? 0)
  const body = typeof request?.all === 'function' ? await request.all() : request?.body ?? {}
  const mode = String(body?.splitMode ?? 'by_item')

  if (!['even', 'by_item', 'single_payer'].includes(mode))
    return response.json({ message: 'Split mode must be even, by_item or single_payer.' }, 422)

  const result = await closeTab(tabId, mode as 'even' | 'by_item' | 'single_payer', Number(body?.ways ?? 1))

  return response.json({ data: result })
})
