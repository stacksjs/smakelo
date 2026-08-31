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
