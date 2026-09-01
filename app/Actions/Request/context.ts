import { config } from '@stacksjs/config'

/**
 * What the views server knows about the request being rendered.
 *
 * stx puts a handful of names into the scope of a page it renders for a
 * request - `locale`, `query`, `cookies`, `host` - and a view that reads them
 * directly works only on that path. The same views are also rendered with no
 * request in hand: stx does a pass at boot, and `stx build` renders the whole
 * site that way. There those names do not hold a default, they do not exist,
 * and `query?.region` throws a ReferenceError before the optional chain is
 * reached. stx catches it, abandons the whole `<script server>`, and renders
 * the page's layout around undefined values - which is why a page can be
 * missing every one of its numbers and still return 200.
 *
 * So the pages ask here instead. Every function answers in both contexts: the
 * request when there is one, and a sensible empty or configured default when
 * there is not.
 */

interface ServeContext {
  locale?: unknown
  search?: unknown
  query?: unknown
}

/** The context stx publishes for the request it is currently rendering. */
function serveContext(): ServeContext | undefined {
  return (globalThis as { __stxServeContext?: ServeContext }).__stxServeContext
}

/**
 * The query string of the request being rendered, as a plain object.
 *
 * Empty outside a request, which is the honest answer: a page being built
 * statically was not asked for with any parameters.
 */
export function requestQuery(): Record<string, string> {
  const context = serveContext()
  const provided = context?.query

  if (provided && typeof provided === 'object')
    return provided as Record<string, string>

  const search = context?.search ?? (globalThis as { __stxServeSearch?: unknown }).__stxServeSearch

  if (typeof search !== 'string' || !search)
    return {}

  return Object.fromEntries(new URLSearchParams(search))
}

/**
 * The locale of the request being rendered.
 *
 * The URL prefix, the cookie or the Accept-Language header decided this, and
 * the views server resolved it before the page was reached. Outside a request
 * there is no visitor to have a preference, and the answer is the locale the
 * app is configured in.
 */
export function requestLocale(): string {
  const requested = serveContext()?.locale

  if (typeof requested === 'string' && requested)
    return requested

  return config.app?.locale ?? 'en'
}

