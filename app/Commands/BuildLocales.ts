import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { defineCommand, log } from '@stacksjs/cli'

/**
 * Turn the locale files into something a browser can fetch.
 *
 * `locales/*.yml` stays the source of truth, because that is the file a person
 * edits and the format the framework's i18n loader reads. This writes the same
 * content to `public/locales/*.json` so the interface can pick up a language
 * without a server round trip per string.
 *
 * The keys are flattened on the way through (`nav.discover`), which is what the
 * markup references, so a missing key is visible as a missing key rather than
 * as an empty element.
 */
export default defineCommand((cli) => {
  cli
    .command('build:locales', 'Compile locales/*.yml into public/locales/*.json')
    .action(async () => {
      const source = join(process.cwd(), 'locales')
      const target = join(process.cwd(), 'public', 'locales')

      if (!existsSync(target))
        mkdirSync(target, { recursive: true })

      const files = readdirSync(source).filter(name => name.endsWith('.yml'))
      const written: string[] = []
      let reference: string[] = []

      for (const file of files) {
        const locale = file.replace(/\.yml$/, '')
        const flat = flatten(parseYaml(readFileSync(join(source, file), 'utf8')))
        const keys = Object.keys(flat).sort()

        /*
         * English is the reference. A locale missing a key falls back to it at
         * runtime, which is the right behaviour and also the reason a missing
         * key can sit unnoticed for months; saying so at build time is cheap.
         */
        if (locale === 'en')
          reference = keys
        else if (reference.length > 0)
          reportGaps(locale, reference, keys)

        writeFileSync(join(target, `${locale}.json`), `${JSON.stringify(flat, null, 2)}\n`)
        written.push(`${locale} (${keys.length})`)
      }

      log.success(`Wrote ${written.join(', ')} to public/locales`)
    })
})

function reportGaps(locale: string, reference: string[], keys: string[]): void {
  const missing = reference.filter(key => !keys.includes(key))
  const extra = keys.filter(key => !reference.includes(key))

  if (missing.length > 0)
    log.warn(`${locale} is missing ${missing.length}: ${missing.slice(0, 6).join(', ')}`)

  if (extra.length > 0)
    log.warn(`${locale} has ${extra.length} keys English does not: ${extra.slice(0, 6).join(', ')}`)
}

/**
 * Enough YAML for these files, and no more.
 *
 * The locale files are two levels of plain `key: value` with no anchors, lists
 * or block scalars, so a parser for exactly that is a dozen lines and adds no
 * dependency. If they ever grow past it, this should be swapped for the
 * framework's loader rather than extended.
 */
function parseYaml(text: string): Record<string, any> {
  const out: Record<string, any> = {}
  let section = ''

  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '')

    if (!line || line.trimStart().startsWith('#'))
      continue

    const top = line.match(/^([a-z0-9_]+):\s*(.*)$/i)

    if (top) {
      const [, key, value] = top

      if (value) {
        out[key as string] = unquote(value)
        section = ''
      }
      else {
        section = key as string
        out[section] = {}
      }

      continue
    }

    const nested = line.match(/^\s+([a-z0-9_]+):\s*(.*)$/i)

    if (nested && section) {
      const [, key, value] = nested
      out[section][key as string] = unquote(value ?? '')
    }
  }

  return out
}

function unquote(value: string): string {
  const trimmed = value.trim()

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith('\'') && trimmed.endsWith('\'')))
    return trimmed.slice(1, -1)

  return trimmed
}

function flatten(tree: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {}

  for (const [key, value] of Object.entries(tree)) {
    if (value && typeof value === 'object') {
      for (const [inner, text] of Object.entries(value))
        out[`${key}.${inner}`] = String(text)
    }
    else {
      out[key] = String(value)
    }
  }

  return out
}
