import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { defineCommand, log } from '@stacksjs/cli'

/**
 * Put the SplatHash decoder where the browser can reach it.
 *
 * Cover images carry a sixteen-byte hash and the page decodes it into the
 * blurred placeholder that fills the frame until the real file arrives. That
 * decode has to happen in the browser, so the module has to be served.
 *
 * Copied from the installed package rather than vendored by hand, so it cannot
 * drift from the encoder that produced the hashes - the two halves have to
 * agree byte for byte or the placeholder is noise. `ts-images/splathash` is a
 * separate entry point precisely so this copy pulls no native codecs with it.
 *
 *   buddy build:splathash
 */
export default defineCommand((cli) => {
  cli
    .command('build:splathash', 'Copy the SplatHash decoder into public/js')
    .action(async () => {
      const from = Bun.resolveSync('ts-images/splathash', process.cwd())
      const outdir = join(process.cwd(), 'public/js')

      mkdirSync(outdir, { recursive: true })

      /*
       * Bundled, not copied.
       *
       * The published entry point is a re-export shim over two shared chunks,
       * so the file on its own is three lines of imports that resolve to
       * nothing once it is served from `public/`. Bundling flattens it into
       * one module with no imports left to resolve.
       */
      const built = await Bun.build({
        entrypoints: [from],
        outdir,
        naming: 'splathash.js',
        target: 'browser',
        format: 'esm',
        minify: true,
      })

      if (!built.success)
        throw new Error(built.logs.map(entry => String(entry)).join('\n'))

      const bytes = Bun.file(join(outdir, 'splathash.js')).size

      log.success(`Bundled the SplatHash decoder into public/js/splathash.js (${(bytes / 1024).toFixed(1)}kb)`)
    })
})
