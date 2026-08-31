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
 * `invalidateSize()` on its own makes it worse. Its default is to hold the
 * visible centre still by translating the tile pane half the difference, which
 * is right when a sidebar opens beside a map somebody is reading, and wrong
 * here: a map born 456px too narrow gets its pane shoved 228px sideways and
 * keeps it there. `pan: false` declines the compensation, and `setView`
 * recomputes the pane position from the centre and zoom rather than adjusting
 * whatever position it was already in.
 *
 * An observer rather than a call at each site that resizes a map, because they
 * are all the same fact - the box changed - and it is the only one of them
 * that also hears the initial layout, which fires no event at all.
 */
export function keepSized(map: any, element: HTMLElement): void {
  if (typeof ResizeObserver !== 'function')
    return

  new ResizeObserver(() => {
    map.invalidateSize?.({ pan: false, animate: false })
    map.setView?.(map.getCenter(), map.getZoom(), { animate: false })
  }).observe(element)
}
