import type { SiteI18nOptions } from '@stacksjs/stx'

/**
 * **Site Configuration**
 *
 * Read by the views server - `buddy dev` and `buddy serve` both call
 * `siteConfigPath()`, which prefers this file - and used for one thing here:
 * telling stx that this site speaks three languages.
 *
 * With this in place the server does the work that used to be a script in the
 * page:
 *
 *   - `/de/discover` and `/nl/discover` render the same view with the locale
 *     set, and English keeps the unprefixed URLs.
 *   - Every in-page link is rewritten into the locale being served, so a visit
 *     that starts in German stays in German without the page knowing.
 *   - `t('nav.discover')` in a view resolves against `locales/*.yml` for the
 *     locale of the request.
 *   - The switch in the footer is bound by the server: `pickerSelector` finds
 *     it, `[data-lang]` on each link says which language it offers.
 *
 * `url` is deliberately absent. Naming it hands stx the whole site config,
 * which then injects its own SEO meta and theme bootstrap into every page -
 * both of which this app already writes by hand in `partials/head.stx`, and
 * one of which (the canonical/robots block) it writes differently on purpose.
 * i18n is all this file is for.
 */
export default {
  name: 'Smakelo',

  i18n: {
    // English is the default, so it keeps the bare paths. The other two are
    // prefixed, which is what makes a German page a linkable thing rather
    // than a preference stored in one browser.
    locales: ['en', 'de', 'nl'],
    defaultLocale: 'en',

    // Named in their own language. A flag would be wrong: German is not
    // Germany, and Dutch is not only the Netherlands.
    labels: { en: 'English', de: 'Deutsch', nl: 'Nederlands' },

    // `locales/*.yml`, the same files the framework's own loader reads at
    // boot. One source, two readers, no compile step between them.
    translationsDir: 'locales',
    format: 'yml',

    // The switch in the footer.
    pickerSelector: '#lang-switch',
  } satisfies SiteI18nOptions,
}
