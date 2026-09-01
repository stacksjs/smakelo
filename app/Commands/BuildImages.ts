import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { defineCommand, log } from '@stacksjs/cli'
import { generatePictureSet } from 'ts-images'
import { everyPhotoId, photoSourceUrl } from '../Actions/Business/imagery'

/**
 * Fetch every photograph the site uses and process it into files we serve.
 *
 * The site used to point `<img src>` straight at Unsplash's CDN: no build
 * step, resizing done by their query string, and a third party in the request
 * path of every card on every page. That is a dependency on somebody else's
 * uptime, terms and privacy behaviour for pictures that never change.
 *
 * So they are fetched once, here, and served from `public/`. `ts-images` does
 * the work: it resizes to the widths the layouts actually ask for, encodes
 * each width as AVIF and WebP and keeps whichever came out smaller, and
 * returns a SplatHash - a sixteen-byte summary of the picture that decodes
 * into a blurred data URL. That data URL is what fills the frame while the
 * real file arrives, so a card is never a blank rectangle and never jumps.
 *
 * The manifest is written next to the images and read by the views, so
 * nothing at request time has to know how any of this was produced.
 *
 * Idempotent and safe to re-run; it overwrites what it wrote last time.
 *
 *   buddy build:images
 */

/** The widths the layouts ask for, and nothing else. */
const WIDTHS = [
  { label: 'sm', width: 400 },
  { label: 'md', width: 800 },
  { label: 'lg', width: 1600 },
]

export interface ImageEntry {
  /** Smallest variant, for `src`. */
  src: string
  /** Every variant, for `srcset`. */
  srcset: string
  width: number
  height: number
  /**
   * The SplatHash itself, base64, not the image it decodes to.
   *
   * Decoded it is a few kilobytes; a page of sixty cards cannot carry sixty of
   * those in its markup. Twenty-four characters can, and the browser decodes
   * them as the cards come into view.
   */
  blur: string
}

export default defineCommand((cli) => {
  cli
    .command('build:images', 'Fetch and process every photograph the site serves')
    .action(async () => {
      const ids = everyPhotoId()
      const outDir = join(process.cwd(), 'public/img/photos')

      mkdirSync(outDir, { recursive: true })
      log.info(`Processing ${ids.length} photographs into public/img/photos`)

      const manifest: Record<string, ImageEntry> = {}
      let failed = 0

      for (const [index, id] of ids.entries()) {
        try {
          // Asked for at the largest width we emit; every smaller variant is
          // resized down from it rather than fetched again.
          const response = await fetch(photoSourceUrl(id, 1600))

          if (!response.ok)
            throw new Error(`HTTP ${response.status}`)

          const bytes = new Uint8Array(await response.arrayBuffer())

          const set = await generatePictureSet({
            input: bytes,
            outDir,
            name: id,
            widths: WIDTHS,
            formats: ['avif', 'webp'],
            quality: 70,
          })

          // Widest last: `srcset` is a set, but the ordering makes the emitted
          // attribute readable when someone looks at the HTML.
          const variants = [...set.variants].sort((a, b) => a.width - b.width)

          manifest[id] = {
            src: `/img/photos/${variants[0]!.path.split('/').pop()}`,
            srcset: variants.map(v => `/img/photos/${v.path.split('/').pop()} ${v.width}w`).join(', '),
            width: set.width,
            height: set.height,
            blur: set.splatHash,
          }

          log.info(`  ${index + 1}/${ids.length}  ${id}  ${variants.map(v => `${v.width}w ${v.format}`).join('  ')}`)
        }
        catch (error) {
          // One photograph that will not fetch is not a reason to abandon the
          // other seventy-six. The manifest simply has no entry, and the views
          // fall back to the coloured ground they already draw underneath.
          failed++
          log.warn(`  ${id}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

      log.success(`Wrote ${Object.keys(manifest).length} entries${failed ? `, ${failed} failed` : ''}`)
    })
})
