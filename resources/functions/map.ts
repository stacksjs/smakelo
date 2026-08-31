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
 * Not OpenStreetMap's own raster any more. That tileset is drawn to be read on
 * its own - saturated greens, heavy road casings, motorway shields - and next
 * to a page of food photographs it fought them for attention. Desaturating it
 * in CSS made it quieter without making it better: the same heavy geometry,
 * greyed, and still a 256px image on a display with twice the pixels.
 *
 * Wikimedia's `osm-intl` is drawn as a background - pale land, soft parks,
 * quiet water, roads with a hairline casing - and it serves `@2x`, which is
 * the half of this that CSS could never fix. It is the closest of the
 * no-key rasters to the map people already know how to read.
 *
 * CARTO's Voyager is closer still and was the first choice; their basemaps now
 * answer without a key and return a tile with API KEY REQUIRED written across
 * it, which a status check happily calls a 200. Esri's light grey canvas is
 * free and keyless but nearly monochrome.
 *
 * ONE PLACE TO CHANGE. Wikimedia ask that third parties not lean on their
 * tile servers, and this is a third party. For anything with real traffic,
 * put a keyed provider here - MapTiler, Stadia and Thunderforest all serve a
 * style like this one - and nothing else in the app needs to know.
 */
const BASEMAP = 'https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}@2x.png'

/**
 * Add the basemap.
 *
 * There is no dark variant of this tileset, so dark mode inverts it in CSS -
 * see the `.tsmap-tile` rule in the head partial. That is the one thing a
 * filter is genuinely good for: turning a light map dark is a change to every
 * pixel, which is what a filter does, rather than an attempt to restyle
 * cartography that was already drawn.
 */
export function basemap(tileLayerFactory: any, map: any): void {
  tileLayerFactory(BASEMAP, {
    maxZoom: 19,
    // The tiles are 512px images standing in for 256px ones. Saying so is what
    // keeps labels at their intended size instead of half of it.
    tileSize: 256,
    detectRetina: false,
  }).addTo(map)
}
