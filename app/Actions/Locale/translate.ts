import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { TranslationMessages } from '@stacksjs/i18n'
import { addTranslations, configure, t as translateKey } from '@stacksjs/i18n'
import { config } from '@stacksjs/config'
import { projectPath } from '@stacksjs/path'
import { requestLocale } from '../Request/context'

/**
 * What language a render is in, and what a key says in it.
 *
 * The views server puts a `locale` and a `t` into the scope of every page it
 * renders, and for a while the views read those directly. That works for a
 * render that happens because somebody asked for a page, and only then. stx
 * also renders views with no request in hand - it does a pass at boot, and
 * `stx build` does the whole site that way - and there `locale` is not a
 * variable that holds the wrong value, it is a variable that does not exist.
 * A `<script server>` that names it throws before it reaches the template, at
 * which point stx renders the page's entire layout around undefined values
 * and says so only in a log line nobody is reading.
 *
 * So the pages ask this instead. It answers in every context, because it takes
 * the request when there is one and falls back to the configured default when
 * there is not.
 *
 * Imported explicitly rather than read off `globalThis`, for the same reason:
 * the framework injects `t` into globals when a server boots, and the build
 * command deliberately skips that injection to stay fast. An import is
 * available wherever the module is.
 */

/**
 * The translation files, read once per process.
 *
 * The framework's own loader is the right tool and cannot be used here: it is
 * async, and a second top-level `await` in an stx `<script server>` stops the
 * script reaching the template at all. So the files are read synchronously and
 * handed to the framework's translator, which owns everything after that -
 * lookup, interpolation, fallback to the default locale. The parser is Bun's,
 * which is the same one `@stacksjs/i18n` uses.
 *
 * `addTranslations` merges, so a process where the framework has already
 * loaded these (any server boot does) ends up with exactly the same table.
 */
let loaded = false

function loadTranslations(): void {
  if (loaded)
    return

  loaded = true

  /*
   * The fallback the app is configured with, not the translator's own default.
   * They happen to be the same word today, which is exactly why this is worth
   * setting: a change to config/app.ts would otherwise be honoured by a server
   * and ignored by a build.
   */
  configure({
    locale: config.app?.locale ?? 'en',
    fallbackLocale: config.app?.fallbackLocale ?? config.app?.locale ?? 'en',
  })

  const directory = projectPath('locales')

  if (!existsSync(directory))
    return

  for (const file of readdirSync(directory)) {
    if (!/\.ya?ml$/.test(file))
      continue

    try {
      const messages = Bun.YAML.parse(readFileSync(join(directory, file), 'utf8'))

      if (messages && typeof messages === 'object' && !Array.isArray(messages))
        addTranslations(basename(file, extname(file)), messages as TranslationMessages)
    }
    catch {
      // A file that will not parse leaves its language on the default rather
      // than taking the whole render down. `buddy lang:check` is where that
      // gets noticed.
    }
  }
}

/** The locale this render is for; see Request/context.ts. */
export function currentLocale(): string {
  return requestLocale()
}

/**
 * One string, in the locale of this render.
 *
 * Shadows the `t` the server injects, on purpose: the call sites read the same
 * either way, and this one also works in the contexts where the injected one
 * is not there.
 */
export function t(key: string, values?: Record<string, string | number>): string {
  loadTranslations()

  return translateKey(key, values, currentLocale())
}

/** The same lookup for a locale the caller has already resolved. */
export function translateFor(key: string, locale: string, values?: Record<string, string | number>): string {
  loadTranslations()

  return translateKey(key, values, locale)
}
