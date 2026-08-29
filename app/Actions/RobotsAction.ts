import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'

/**
 * /robots.txt - keep this site out of search results entirely.
 *
 * Overrides the framework default, which allows crawling in production. That
 * default is right for a real product and wrong for this one: Smakelo lists
 * real Los Angeles businesses alongside invented reviews, menus and prices, and
 * a search engine that indexes those pages would put fiction about a real
 * restaurant in front of people looking for the real thing.
 *
 * Deliberately not conditional on APP_ENV. This site is a demonstration in
 * every environment it will ever run in, so there is no environment where
 * allowing crawlers becomes correct.
 */
export default new Action({
  name: 'RobotsAction',
  description: 'Serve a robots.txt that disallows all crawling',
  method: 'GET',

  async handle() {
    return response.text('User-agent: *\nDisallow: /\n', 200, {
      'Cache-Control': 'public, max-age=86400',
    })
  },
})
