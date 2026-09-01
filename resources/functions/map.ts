import type { Palette } from './basemap-style'
import { basemapStyle, DARK, LIGHT } from './basemap-style'

/**
 * The one thing every map on this site has to be told.
 *
 * A map measures its container once, when it is constructed, and then trusts
 * that measurement. Every map here is built inside a box the browser has not
 * finished sizing - a grid column, a card that is still laying out, a panel
 * that is hidden until an order arrives - so the measurement it keeps is of a
 * box that is about to change. It lays its tiles out for the old size and
 * paints them offset, with white gaps where the next row should be.
 *
 * `pan: false` because the default is to hold the visible centre still by
 * translating the tile pane half the difference. That is right when a sidebar
 * opens beside a map somebody is reading, and wrong here: a map born 456px too
 * narrow would keep its pane shoved sideways for the rest of the session.
 *
 * `invalidateSize` is also the *only* thing called. Following it with a
 * `setView` back to the current centre and zoom reads as a harmless
 * belt-and-braces reset and is not: every call builds a fresh tile container
 * with its own offset, the old ones are not reliably pruned, and the tiles end
 * up spread down a diagonal - y = -23, 233, 745, 1257, 1513 inside a 444px
 * box. The map then reports every tile present, loaded and fully opaque while
 * covering 44% of itself, which is a state no amount of squinting at
 * `naturalWidth` will catch. Coverage has to be measured from
 * `getBoundingClientRect`, because that is the only reading that includes what
 * the ancestor transforms did.
 *
 * An observer rather than a call at each site that resizes a map, because they
 * are all the same fact - the box changed - and it is the only one of them
 * that also hears the initial layout, which fires no event at all.
 */
export function keepSized(map: any, element: HTMLElement): void {
  if (typeof ResizeObserver !== 'function')
    return

  let queued = 0

  // Coalesced to one call a frame: laying out a grid column produces a burst
  // of size changes, and there is nothing to gain from answering each one.
  const observer = new ResizeObserver(() => {
    if (queued)
      return

    queued = requestAnimationFrame(() => {
      queued = 0
      map.invalidateSize?.({ pan: false, animate: false })
    })
  })

  observer.observe(element)
}

/**
 * The basemap.
 *
 * Vector tiles drawn in the browser, not a picture of somebody else's map.
 *
 * Every raster basemap this went through failed the same way. OpenStreetMap's
 * own is drawn to be read on its own and fought the photographs beside it;
 * desaturating it in CSS made it quieter without making it better, and could
 * not touch a 256px image on a display with twice the pixels. Wikimedia's is
 * sharp at @2x and still a picture: its colours and its typeface were decided
 * when the tile was drawn, so dark mode could only ever be an inversion.
 *
 * Vector tiles carry the geometry and leave the drawing to us. The palettes
 * are in ./basemap-style, and the labels are set in the page's own typeface,
 * because the glyphs are rasterised from a browser font rather than shipped as
 * pictures of letters.
 *
 * The tiles are ours too. They were fetched once by `buddy build:tiles` and
 * are served from this origin, so no third party sits in the request path of
 * a map - nothing to rate-limit us, change its terms, or go down for data that
 * does not change. The data underneath is OpenStreetMap's, under ODbL, which
 * is what the line beneath every map credits.
 *
 * `MAX_ZOOM` is the deepest zoom stored. Past it the map overzooms, which for
 * vector tiles means drawing the same geometry larger rather than magnifying a
 * bitmap: sharp, with the detail the stored zoom had.
 */
const TILES = '/tiles/{z}/{x}/{y}.pbf'
const MAX_ZOOM = 13

function prefersDark(): boolean {
  try {
    return matchMedia('(prefers-color-scheme: dark)').matches
  }
  catch {
    return false
  }
}

function paletteNow(): Palette {
  return prefersDark() ? DARK : LIGHT
}

/**
 * Add the basemap, and keep it on the right side of the theme.
 *
 * The ground colour is the element's own background rather than a layer: the
 * tiles paint what is on the land, and what is under all of it is one flat
 * colour that should be there before a single tile arrives.
 */
export async function basemap(vectorTileLayerFactory: any, map: any, element: HTMLElement): Promise<void> {
  const paint = (palette: Palette) => { element.style.background = palette.land }

  paint(paletteNow())

  const layer = vectorTileLayerFactory({
    url: TILES,
    // Past this there are no tiles to fetch; the grid keeps going and draws a
    // slice of the deepest ancestor, which is what every vector map does.
    sourceMaxZoom: MAX_ZOOM,
    maxZoom: 19,
    renderer: 'canvas2d',
    layers: basemapStyle(paletteNow()),
  })

  layer.addTo(map)

  try {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      const palette = paletteNow()

      paint(palette)
      layer.setStyleLayers?.(basemapStyle(palette))
    })
  }
  catch {
    // A browser without matchMedia listeners keeps the theme it loaded with.
  }
}
