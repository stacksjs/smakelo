import type { CloudConfig } from '@stacksjs/types'
import type { CloudConfig as TsCloudConfig } from '@stacksjs/ts-cloud'
import { env } from '@stacksjs/env'

const APP_SLUG = 'smakelo'
const APP_DOMAIN = env.APP_DOMAIN || 'smakelo.stacksjs.com'

/**
 * Cloud configuration.
 *
 * A TENANT on the shared Hetzner box the `stacks` project owns
 * (`cloud.attachTo`), not a box of its own. Two rules follow, and both have
 * caused outages here before:
 *
 *   1. `project.slug` names the files this deploy OWNS on the box:
 *      `/etc/rpx/sites.d/<slug>.json` and `rpx-cert-renew-<slug>.*`. The
 *      fragment is replaced wholesale, so a slug colliding with another tenant
 *      - or with `stacks` itself - deletes that tenant's routes.
 *   2. Ports must be clear of every other tenant. 3210/3218 came from a live
 *      `ss -lntp` on the box, where everything from 3000 to 3201 was already
 *      taken. Reading another tenant's config file instead is how two services
 *      end up quietly bound to one port.
 */
export const tsCloud: TsCloudConfig = {
  project: {
    name: APP_SLUG,
    slug: APP_SLUG,
    region: 'us-east-1',
  },

  stateDir: 'storage/cloud',

  cloud: {
    provider: 'hetzner',
    // Join the box the `stacks` project provisions instead of creating one.
    attachTo: 'stacks',
  },

  mode: 'server',

  environments: {
    production: {
      type: 'production',
      deployBranch: 'main',
      region: 'us-east-1',
      variables: {
        APP_ENV: 'production',
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
      },
    },
  },

  infrastructure: {
    /**
     * DNS lives on Cloudflare, which is authoritative for the whole
     * `stacksjs.com` zone — this app owns four names on it, not the zone.
     *
     * `domain` is the zone apex rather than this app's host: it is what tells
     * ts-cloud where `smakelo.stacksjs.com` lives, instead of leaving it to
     * guess from the last two labels (which is right here and wrong the moment a
     * name has a multi-label suffix).
     *
     * `records` stays empty on purpose. Reconciliation is upsert-only, so a
     * record declared here is one this app will publish on EVERY deploy — and the
     * zone's mail, DKIM and certificate-validation records belong to the zone
     * owner, not to a tenant. Declaring them here would mean four apps racing to
     * own the same SPF policy.
     */
    dns: {
      provider: 'cloudflare',
      domain: 'stacksjs.com',
    },

    compute: {
      instances: 1,
      size: 'small',
      disk: {
        size: 20,
        type: 'ssd',
        encrypted: true,
      },
      webServer: 'rpx',
      proxy: {
        engine: 'rpx',
        // Emits this tenant's own cert units rather than sitting on the box's
        // fallback certificate.
        onDemandTls: true,

        /**
         * Serve the frontends from Cloudflare's edge.
         *
         * `frontedHosts` is listed rather than defaulted, and the name missing
         * from it is the point. Cloudflare terminates TLS at the edge,
         * so a proxied host needs an edge certificate covering its name — and
         * Universal SSL (the free plan's certificate) issues exactly the apex
         * plus ONE wildcard level: `stacksjs.com` and `*.stacksjs.com`.
         *
         * `smakelo.stacksjs.com` sits one label under the apex, so the
         * wildcard covers it. `www.smakelo.stacksjs.com` sits two levels down,
         * which no wildcard in that certificate matches; it would need
         * `*.smakelo.stacksjs.com` from Advanced Certificate Manager.
         *
         * Proxying them regardless does not degrade gracefully — Cloudflare
         * answers the handshake with no certificate for the name and the host
         * stops serving HTTPS entirely, while port 80 still redirects and the
         * origin stays healthy, so nothing that does not speak TLS notices.
         * ts-cloud now refuses to proxy an uncovered host, but naming the set
         * here keeps the redirects DNS-only by intent rather than by rescue.
         *
         * No `secret`: rpx enforces a single origin-guard header/value for the
         * entire gateway, so a co-tenant on this box cannot bring its own. If
         * this app declared one and `stacks` declared another, ts-cloud leaves
         * THIS app's hosts unguarded rather than guarding them with a value the
         * gateway would reject — which would reject every request instead. The
         * origin guard therefore belongs to whoever owns the box.
         */
        cdn: {
          provider: 'cloudflare',
          frontedHosts: ['smakelo.stacksjs.com'],
          cloudflare: {
            /**
             * These are ZONE-WIDE, and this app is a tenant on a zone with
             * roughly twenty other sites — so the set here is deliberately the
             * subset that is safe for all of them. Every host on the zone is
             * already HTTPS-only behind a real Let's Encrypt certificate, so
             * `strict` and `alwaysUseHttps` change nothing for anyone else.
             *
             * HSTS is NOT set. `includeSubdomains` on the apex would commit
             * every name under `stacksjs.com` to HTTPS-only in every visitor's
             * browser for a year, including names this app has never heard of
             * and any that are added later without a certificate ready. That is
             * a zone owner's decision to make once, not a side effect of
             * deploying a tenant.
             */
            settings: {
              ssl: 'strict',
              alwaysUseHttps: true,
              minTlsVersion: '1.2',
              brotli: true,
              http3: true,
              // Cloudflare turns this on for new zones and it rewrites the HTML
              // the origin sent: `mailto:` links become spans a script decodes.
              // This site's primary call to action is emailing the club, and
              // through the edge those links had silently become
              // JavaScript-dependent. Delivery is the CDN's job; editing the
              // document is not.
              emailObfuscation: false,
            },
            cache: {
              // Build output is fingerprinted, so the bytes at a URL never
              // change and a long edge TTL is free.
              assetEdgeTtl: 2592000,
              /*
               * HTML is not cached at the edge at all.
               *
               * Two things break when it is, and both were live here. A cached
               * response cannot carry a per-visitor `Set-Cookie`, so the CSRF
               * token never reached the browser and every order POST came back
               * 403 while the page itself looked perfect. And the discover page
               * states how many places are open right now, which an hour-old
               * copy answers wrongly for an hour.
               *
               * The pages are cheap to render and the origin is one box away.
               * Fingerprinted assets keep their thirty days above; those are
               * the bytes worth caching.
               */
              documentEdgeTtl: 0,
            },
            // Purge the edge for these hosts at the end of every deploy, so a
            // release is visible immediately rather than after the document TTL
            // lapses. This is the default; it is spelled out because it is the
            // thing most likely to be turned off by accident.
            purgeOnDeploy: true,
          },
        },
      },
    },
  },

  sites: {
    /**
     * The stx app server.
     *
     * `preStart` migrates, seeds and then regenerates the place pages, in that
     * order, because each needs the one before it: the seed needs tables, and
     * the generated pages are one file per seeded business. Regenerating on
     * every release is what keeps the pages and the data from drifting apart -
     * a page for a business no longer in the seed would route to nothing.
     *
     * The database lives outside the atomic release directories, so a deploy
     * never swaps it out from under the running service.
     */
    main: {
      root: '.',
      path: '/',
      domain: APP_DOMAIN,
      start: 'bun node_modules/@stacksjs/buddy/dist/serve-entry.js',
      port: 3210,
      preStart: [
        'bun install --frozen-lockfile',
        'mkdir -p /var/lib/smakelo',
        /*
         * The schema is rebuilt from the corpus on every deploy, and then
         * reseeded.
         *
         * Heavy-handed for a real product and right for this one: every row
         * here comes from `seed:demo`, so there is nothing a rebuild can lose
         * that the next line does not immediately restore. Orders a visitor
         * placed between deploys do go, which is the honest behaviour for a
         * demonstration whose orders reach nobody.
         *
         * It also fixes the failure this replaces. `migrate` applies pending
         * files, so after the corpus was regenerated wholesale the ALTERs
         * collided with columns that already existed, the run aborted, and the
         * trailing `|| true` swallowed it - leaving production on a schema
         * without `orders.business_id` while the deploy reported success. Every
         * order POST then answered 500 against a site that looked perfect.
         */
        'bun node_modules/@stacksjs/buddy/dist/cli.js migrate:fresh --force',
        'bun node_modules/@stacksjs/buddy/dist/cli.js seed:demo',
        'bun node_modules/@stacksjs/buddy/dist/cli.js build:places',
        // The interface reads its German and Dutch from public/locales/*.json,
        // compiled from locales/*.yml. Without this step the switcher fetches
        // a 404 and every page silently stays English.
        'bun node_modules/@stacksjs/buddy/dist/cli.js build:locales',
        // The production server serves what the build produced, so a page added
        // without this simply 404s. It runs after build:places because that is
        // what writes the per-business views the build then compiles.
        'bunx --bun @stacksjs/stx build --pages resources/views --out dist',
      ],
      env: {
        HOST: '127.0.0.1',
        APP_ENV: 'production',
        NODE_ENV: 'production',
        APP_NAME: 'Smakelo',
        APP_URL: APP_DOMAIN,
        APP_KEY: env.APP_KEY || '',
        PORT_API: '3218',
        API_URL: 'http://127.0.0.1:3218',
        // Only the framework's auth routes (login, register, logout, refresh).
        // Naming a bundle narrows the surface: without it an app also mounts
        // the dashboard storefront, reviews, AI and voice routes it never uses.
        STACKS_DEFAULT_ROUTES: 'auth',
        DB_CONNECTION: 'sqlite',
        /*
         * Both names, on purpose. The app reads DB_DATABASE_PATH for sqlite;
         * ts-cloud's pre-flight looks for DB_DATABASE and warned on every
         * deploy that it could not tell where the database lived, which is the
         * kind of warning that trains you to ignore warnings. The path is
         * outside the release directory either way, so a deploy never
         * discards it.
         */
        DB_DATABASE: '/var/lib/smakelo/smakelo.sqlite',
        DB_DATABASE_PATH: '/var/lib/smakelo/smakelo.sqlite',
        /*
         * Lift the production guard on `migrate:fresh`, deliberately.
         *
         * The guard is right by default and wrong here. It exists to stop a
         * command wiping a database somebody cares about, and every row in this
         * one comes from `seed:demo`, which runs on the very next line of
         * preStart. The framework cannot know that, so this says it out loud
         * rather than the deploy quietly routing around the check.
         *
         * If this app ever holds a row a person would miss, delete this line
         * before anything else.
         */
        DB_MIGRATE_FRESH: 'allow',
      },
    },

    // People type it. A redirect rather than a second copy, so one host stays
    // canonical.
    wwwMain: {
      domain: 'www.smakelo.stacksjs.com',
      redirect: 'https://smakelo.stacksjs.com',
    },

    // API (bun-router). Deliberately no `domain`/`path`: the rpx gateway skips
    // domain-less sites, so this stays loopback-only and is reached only
    // through the app's same-origin /api proxy.
    api: {
      root: '.',
      start: 'bun node_modules/@stacksjs/actions/dist/serve/api.js',
      port: 3218,
      preStart: ['bun install --frozen-lockfile'],
      env: {
        HOST: '127.0.0.1',
        APP_ENV: 'production',
        NODE_ENV: 'production',
        APP_NAME: 'Smakelo',
        APP_URL: APP_DOMAIN,
        APP_KEY: env.APP_KEY || '',
        // Only the framework's auth routes (login, register, logout, refresh).
        // Naming a bundle narrows the surface: without it an app also mounts
        // the dashboard storefront, reviews, AI and voice routes it never uses.
        STACKS_DEFAULT_ROUTES: 'auth',
        DB_CONNECTION: 'sqlite',
        /*
         * Both names, on purpose. The app reads DB_DATABASE_PATH for sqlite;
         * ts-cloud's pre-flight looks for DB_DATABASE and warned on every
         * deploy that it could not tell where the database lived, which is the
         * kind of warning that trains you to ignore warnings. The path is
         * outside the release directory either way, so a deploy never
         * discards it.
         */
        DB_DATABASE: '/var/lib/smakelo/smakelo.sqlite',
        DB_DATABASE_PATH: '/var/lib/smakelo/smakelo.sqlite',
      },
    },
  },
}

const config: CloudConfig = {}

export default config
