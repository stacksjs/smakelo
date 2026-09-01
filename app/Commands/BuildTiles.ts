import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { defineCommand, log } from '@stacksjs/cli'
import { REGIONS } from '../Actions/Business/regions'

/**
 * Fetch the map tiles this site needs and store them so we serve them.
 *
 * The map is vector tiles rendered in the browser, which is what lets the
 * cartography be ours. The tiles themselves were still somebody else's
 * service in the request path of every map on the site - and a service that
 * can rate-limit, change terms, or go down, for data that does not change.
 *
 * So they are fetched once and served from `public/tiles`. Only the ground the
 * site actually shows: a padded box around each region, from the world down to
 * `MAX_ZOOM`. Past that the map overzooms - vector geometry scales cleanly, so
 * a z13 tile drawn at z16 is sharp, just carrying less detail than a z16 tile
 * would have.
 *
 * The data is OpenStreetMap's, under ODbL, which asks for attribution and
 * allows redistribution. The site credits it under every map.
 *
 *   buddy build:tiles
 */

/**
 * The deepest zoom stored.
 *
 * Each level is roughly four times the tiles of the one above, so this number
 * is the whole size question. 13 keeps street names and the road network at
 * the zooms the place pages use; 14 would be about four times the bytes for
 * detail that only shows when somebody deliberately zooms in on one building.
 */
const MAX_ZOOM = 13

/** How far outside each region's box to keep tiles, in degrees. */
const PADDING = 0.08

function tileX(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** z)
}

function tileY(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180

  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)
}

export default defineCommand((cli) => {
  cli
    .command('build:tiles', 'Fetch the map tiles the site serves')
    .action(async () => {
      const meta = await fetch('https://tiles.openfreemap.org/planet').then(r => r.json()) as { tiles: string[] }
      const template = meta.tiles[0]!
      const outRoot = join(process.cwd(), 'public/tiles')

      log.info(`Source ${template}`)

      // One set, not one per region: the boxes overlap at low zoom, and a tile
      // fetched twice is a tile stored twice.
      const wanted = new Set<string>()

      for (const region of REGIONS) {
        const box = {
          south: region.box.south - PADDING,
          north: region.box.north + PADDING,
          west: region.box.west - PADDING,
          east: region.box.east + PADDING,
        }

        for (let z = 0; z <= MAX_ZOOM; z++) {
          for (let x = tileX(box.west, z); x <= tileX(box.east, z); x++) {
            for (let y = tileY(box.north, z); y <= tileY(box.south, z); y++)
              wanted.add(`${z}/${x}/${y}`)
          }
        }
      }

      log.info(`${wanted.size} tiles to fetch`)

      let bytes = 0
      let failed = 0
      let done = 0

      for (const key of wanted) {
        const [z, x, y] = key.split('/')
        const to = join(outRoot, `${key}.pbf`)

        try {
          const response = await fetch(template.replace('{z}', z!).replace('{x}', x!).replace('{y}', y!))

          if (!response.ok)
            throw new Error(`HTTP ${response.status}`)

          const body = new Uint8Array(await response.arrayBuffer())

          // An empty tile is a real answer - ocean, or past the edge of the
          // data - and storing it is what stops the map asking again.
          mkdirSync(dirname(to), { recursive: true })
          writeFileSync(to, body)
          bytes += body.byteLength
        }
        catch (error) {
          failed++
          log.warn(`  ${key}: ${error instanceof Error ? error.message : String(error)}`)
        }

        if (++done % 100 === 0)
          log.info(`  ${done}/${wanted.size}  ${(bytes / 1024 / 1024).toFixed(1)}MB`)
      }

      writeFileSync(join(outRoot, 'meta.json'), `${JSON.stringify({ maxzoom: MAX_ZOOM, tiles: wanted.size }, null, 2)}\n`)

      log.success(`${wanted.size - failed} tiles, ${(bytes / 1024 / 1024).toFixed(1)}MB${failed ? `, ${failed} failed` : ''}`)
    })
})
