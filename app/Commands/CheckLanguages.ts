import { defineCommand, log } from '@stacksjs/cli'
import { config } from '@stacksjs/config'
import { loadFromDirectory } from '@stacksjs/i18n'
import { projectPath } from '@stacksjs/path'

/**
 * Say which strings a language is missing.
 *
 * The pages read `locales/*.yml` through the framework's own loader, which is
 * forgiving on purpose: a key a language has not been given falls back to the
 * default locale rather than rendering an empty element. That is the right
 * behaviour at runtime and the reason a missing translation can sit unnoticed
 * for months, because the page looks finished - just in the wrong language, in
 * one corner, to the people least likely to report it.
 *
 * So this asks the question out loud. It loads the same files the same way the
 * server does - no second parser, which is what this replaced - walks the
 * default locale's keys, and reports what the others do not answer.
 *
 * Exits non-zero when something is missing, so CI can decide whether that is
 * allowed to ship.
 */
export default defineCommand((cli) => {
  cli
    .command('lang:check', 'Report translation keys missing from a locale')
    .option('--strict', 'Also fail on keys a locale has that the default does not', { default: false })
    .action(async (options: { strict?: boolean }) => {
      // The framework loader, reading the same files the server reads at boot.
      const translations = await loadFromDirectory({
        directory: projectPath('locales'),
        extensions: ['.yml', '.yaml', '.json'],
      })

      const fallback = config.app?.locale ?? 'en'
      const locales = Object.keys(translations).sort()

      if (!locales.includes(fallback)) {
        log.error(`The default locale "${fallback}" has no file in locales/. Nothing to compare against.`)
        process.exitCode = 1
        return
      }

      const reference = keysOf(translations[fallback])

      log.info(`${fallback} is the reference: ${reference.length} keys.`)

      let complete = true

      for (const locale of locales) {
        if (locale === fallback)
          continue

        const keys = new Set(keysOf(translations[locale]))
        const missing = reference.filter(key => !keys.has(key))
        const extra = [...keys].filter(key => !reference.includes(key))

        if (missing.length > 0) {
          complete = false
          log.warn(`${locale} is missing ${missing.length}: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ', …' : ''}`)
        }

        if (extra.length > 0) {
          if (options.strict)
            complete = false

          log.warn(`${locale} has ${extra.length} keys ${fallback} does not: ${extra.slice(0, 8).join(', ')}${extra.length > 8 ? ', …' : ''}`)
        }

        if (missing.length === 0 && extra.length === 0)
          log.success(`${locale} is complete.`)
      }

      if (!complete)
        process.exitCode = 1
    })
})

/** Every dotted leaf key a locale defines, e.g. `nav.discover`. */
function keysOf(tree: unknown): string[] {
  if (!tree || typeof tree !== 'object')
    return []

  const out: string[] = []

  const walk = (node: Record<string, unknown>, prefix: string): void => {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key

      if (value && typeof value === 'object')
        walk(value as Record<string, unknown>, path)
      else
        out.push(path)
    }
  }

  walk(tree as Record<string, unknown>, '')

  return out.sort()
}
