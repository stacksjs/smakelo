import { response, route } from '@stacksjs/router'
import { businessBySlug, searchBusinesses } from '../app/Actions/Business/search'

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
