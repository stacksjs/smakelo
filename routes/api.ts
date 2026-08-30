import { response, route } from '@stacksjs/router'
import { businessBySlug, searchBusinesses } from '../app/Actions/Business/search'
import { menuFor } from '../app/Actions/Order/menu'
import { createOrder, ordersForVisitor, quoteOrder, trackOrder } from '../app/Actions/Order/api'
import { closeTab, sessionForToken } from '../app/Actions/Dine/tables'
import { advanceOrder, boardFor } from '../app/Actions/Merchant/board'
import { allCouriers, consoleFor, setShift } from '../app/Actions/Courier/console'
import { claims, decideClaim, submitClaim } from '../app/Actions/Claim/claims'
import { favoritesFor, toggleFavorite } from '../app/Actions/Favorite/favorites'
import { respondToReview, reviewsFor, statsFor, submitReview, voteOnReview } from '../app/Actions/Review/write'
import type { PartyType } from '../app/Actions/Money/statements'
import { outstandingBalances, recordPayout, statementFor } from '../app/Actions/Money/statements'

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

  // The visitor comes off the header, never out of the body: this is what ties
  // an order to the browser that placed it, and the body is the client's to
  // write whatever it likes into.
  const result = await createOrder({ ...body, visitorToken: visitorOf(request) })

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

/**
 * The merchant's orders board.
 *
 * `GET /api/merchant/{slug}/board`
 *
 * Unauthenticated, and that is a demo decision rather than a design one: there
 * are no merchant accounts here, and gating it would mean inventing a login for
 * a business that does not exist. A real deployment puts this behind the team
 * that owns the business.
 */
route.get('/merchant/{slug}/board', async (request: any) => {
  const slug = String(request?.getParam?.('slug') ?? request?.params?.slug ?? '')
  const board = await boardFor(slug)

  if (!board)
    return response.json({ message: `No business with slug "${slug}".` }, 404)

  return response.json({ data: board })
})

/**
 * Move an order along the kitchen's part of the lifecycle.
 *
 * `POST /api/merchant/orders/{id}/status`
 */
route.post('/merchant/orders/{id}/status', async (request: any) => {
  const orderId = Number(request?.getParam?.('id') ?? request?.params?.id ?? 0)
  const body = typeof request?.all === 'function' ? await request.all() : request?.body ?? {}
  const result = await advanceOrder(orderId, String(body?.status ?? ''))

  if (!result.ok)
    return response.json({ message: result.reason }, 422)

  return response.json({ data: { orderId, status: result.status } })
})

/**
 * The courier console.
 *
 * `GET /api/courier/{id}/console` and `GET /api/couriers-list`
 *
 * Unauthenticated for the same reason as the merchant board: there are no
 * courier accounts in a demo whose couriers are invented. A real deployment
 * resolves the courier from the session, which is what the framework's own
 * ping and stop actions already do.
 */
route.get('/couriers-list', async () => {
  return response.json({ data: await allCouriers() })
})

route.get('/courier/{id}/console', async (request: any) => {
  const id = Number(request?.getParam?.('id') ?? request?.params?.id ?? 0)
  const data = await consoleFor(id)

  if (!data)
    return response.json({ message: 'No such courier.' }, 404)

  return response.json({ data })
})

/** `POST /api/courier/{id}/shift` */
route.post('/courier/{id}/shift', async (request: any) => {
  const id = Number(request?.getParam?.('id') ?? request?.params?.id ?? 0)
  const body = typeof request?.all === 'function' ? await request.all() : request?.body ?? {}
  const result = await setShift(id, Boolean(body?.online))

  if (!result.ok)
    return response.json({ message: result.reason }, 422)

  return response.json({ data: { status: result.status } })
})

/**
 * Advance a stop.
 *
 * `POST /api/courier/stops/{id}/{action}` where action is start, complete or
 * fail. These wrap the framework's own tracking functions, which own the order
 * status, the events and the pickup-versus-dropoff distinction.
 */
route.post('/courier/stops/{id}/{action}', async (request: any) => {
  const stopId = Number(request?.getParam?.('id') ?? 0)
  const action = String(request?.getParam?.('action') ?? '')
  const body = typeof request?.all === 'function' ? await request.all() : request?.body ?? {}

  const { shippings } = await import('@stacksjs/commerce')

  if (action === 'start') {
    const stop = await shippings.tracking.startStop(stopId)

    if (!stop)
      return response.json({ message: 'No such stop.' }, 404)

    /*
     * Setting off starts the run.
     *
     * Until a route is active, pings from its courier find no active route, so
     * positions are stored and no ETA is ever recomputed and no arrival fires -
     * a courier who looks stationary on the customer's map while actually
     * driving. Dispatch cannot do this: it does not know when they set off.
     */
    await shippings.tracking.startRoute(Number(stop.delivery_route_id))

    return response.json({ data: stop })
  }

  if (action === 'complete') {
    const stop = await shippings.tracking.completeStop(stopId, String(body?.notes ?? '') || undefined)
    return stop ? response.json({ data: stop }) : response.json({ message: 'No such stop.' }, 404)
  }

  if (action === 'fail') {
    const reason = String(body?.reason ?? '').trim()

    if (!reason)
      return response.json({ message: 'A failed stop needs a reason.' }, 422)

    const stop = await shippings.tracking.failStop(stopId, reason)
    return stop ? response.json({ data: stop }) : response.json({ message: 'No such stop.' }, 404)
  }

  return response.json({ message: 'Action must be start, complete or fail.' }, 422)
})

/**
 * Statements.
 *
 * `GET /api/money/{partyType}/{id}` and `GET /api/money/balances`
 *
 * Every figure is a sum over the ledger, never recomputed from orders: one
 * place decides what a party is owed, and every screen reads it.
 */
route.get('/money/balances', async () => {
  return response.json({ data: await outstandingBalances() })
})

route.get('/money/{partyType}/{id}', async (request: any) => {
  const partyType = String(request?.getParam?.('partyType') ?? '')
  const partyId = Number(request?.getParam?.('id') ?? 0)

  if (!['business', 'courier', 'platform', 'tax'].includes(partyType))
    return response.json({ message: 'Party must be business, courier, platform or tax.' }, 422)

  const statement = await statementFor(partyType as PartyType, partyId)

  if (!statement)
    return response.json({ message: 'No such party.' }, 404)

  return response.json({ data: statement })
})

/** `POST /api/money/{partyType}/{id}/payout` */
route.post('/money/{partyType}/{id}/payout', async (request: any) => {
  const partyType = String(request?.getParam?.('partyType') ?? '')
  const partyId = Number(request?.getParam?.('id') ?? 0)
  const body = typeof request?.all === 'function' ? await request.all() : request?.body ?? {}

  if (!['business', 'courier'].includes(partyType))
    return response.json({ message: 'Only a business or a courier is paid out.' }, 422)

  const result = await recordPayout(partyType as 'business' | 'courier', partyId, Number(body?.amountCents ?? 0))

  if (!result.ok)
    return response.json({ message: result.reason }, 422)

  return response.json({ data: { paidCents: result.paidCents } })
})

/**
 * Reviews, saved places and claims.
 *
 * These carry an `x-visitor` header: a random token the browser mints and
 * keeps, standing in for the account this demo deliberately does not have.
 * It identifies a browser rather than a person and is forgeable, which is
 * fine for what rides on it and is said out loud in `Visitor/identity.ts`.
 */
function visitorOf(request: any): string {
  return String(request?.headers?.get?.('x-visitor') ?? request?.headers?.['x-visitor'] ?? '')
}

/** `GET /api/businesses/{slug}/reviews` */
route.get('/businesses/{slug}/reviews', async (request: any) => {
  const place = await businessBySlug(String(request?.getParam?.('slug') ?? ''))

  if (!place)
    return response.json({ message: 'That business is not listed.' }, 404)

  const businessId = Number(place.business.id)

  const [list, stats] = await Promise.all([
    reviewsFor(businessId, visitorOf(request)),
    statsFor(businessId),
  ])

  // Only the invented partners can be reviewed. The client asks rather than
  // assumes, so the composer is never rendered where it would be refused.
  const canReview = Number(place.business.is_partner) === 1

  return response.json({ data: { reviews: list, stats, canReview } })
})

/** `POST /api/businesses/{slug}/reviews` */
route.post('/businesses/{slug}/reviews', async (request: any) => {
  const body = typeof request?.all === 'function' ? await request.all() : request?.body ?? {}

  const result = await submitReview({
    businessSlug: String(request?.getParam?.('slug') ?? ''),
    visitorToken: visitorOf(request),
    authorName: String(body?.authorName ?? 'Guest'),
    rating: Number(body?.rating ?? 0),
    title: String(body?.title ?? ''),
    body: String(body?.body ?? ''),
    dishes: String(body?.dishes ?? ''),
    visitedAt: body?.visitedAt ? String(body.visitedAt) : undefined,
  })

  if (!result.ok)
    return response.json({ message: result.reason }, 422)

  return response.json({ data: { reviewId: result.reviewId, verified: result.verified } })
})

/** `POST /api/reviews/{id}/helpful` */
route.post('/reviews/{id}/helpful', async (request: any) => {
  const result = await voteOnReview(Number(request?.getParam?.('id') ?? 0), visitorOf(request))

  if (!result.ok)
    return response.json({ message: result.reason }, 422)

  return response.json({ data: { voted: result.voted, helpfulCount: result.helpfulCount } })
})

/** `POST /api/reviews/{id}/respond` */
route.post('/reviews/{id}/respond', async (request: any) => {
  const body = typeof request?.all === 'function' ? await request.all() : request?.body ?? {}

  const result = await respondToReview(
    Number(request?.getParam?.('id') ?? 0),
    String(body?.businessSlug ?? ''),
    String(body?.text ?? ''),
  )

  if (!result.ok)
    return response.json({ message: result.reason }, 422)

  return response.json({ data: { ok: true } })
})

/** `GET /api/saved` and `POST /api/businesses/{slug}/save` */
route.get('/saved', async (request: any) => {
  return response.json({ data: await favoritesFor(visitorOf(request)) })
})

route.post('/businesses/{slug}/save', async (request: any) => {
  const result = await toggleFavorite(String(request?.getParam?.('slug') ?? ''), visitorOf(request))

  if (!result.ok)
    return response.json({ message: result.reason }, 422)

  return response.json({ data: { saved: result.saved } })
})

/** `POST /api/businesses/{slug}/claim`, `GET /api/claims`, `POST /api/claims/{id}/{decision}` */
route.post('/businesses/{slug}/claim', async (request: any) => {
  const body = typeof request?.all === 'function' ? await request.all() : request?.body ?? {}

  const result = await submitClaim({
    businessSlug: String(request?.getParam?.('slug') ?? ''),
    claimantName: String(body?.name ?? ''),
    claimantEmail: String(body?.email ?? ''),
    message: String(body?.message ?? ''),
  })

  if (!result.ok)
    return response.json({ message: result.reason }, 422)

  return response.json({ data: { claimId: result.claimId } })
})

route.get('/claims', async (request: any) => {
  const status = request?.query?.status ? String(request.query.status) : undefined

  return response.json({ data: await claims(status as 'pending' | 'approved' | 'rejected' | undefined) })
})

route.post('/claims/{id}/{decision}', async (request: any) => {
  const result = await decideClaim(
    Number(request?.getParam?.('id') ?? 0),
    String(request?.getParam?.('decision') ?? '') as 'approved' | 'rejected',
  )

  if (!result.ok)
    return response.json({ message: result.reason }, 422)

  return response.json({ data: { ok: true } })
})

/** `GET /api/orders/mine` - what this browser has ordered. */
route.get('/orders/mine', async (request: any) => {
  return response.json({ data: await ordersForVisitor(visitorOf(request)) })
})
