/**
 * What we publish about where a business is.
 *
 * Almost every listing here is premises. A restaurant's door number is on the
 * door, in the phone book and in OpenStreetMap; printing it tells nobody
 * anything they could not already find, and leaving it out would make the
 * listing useless.
 *
 * A home kitchen is somebody's flat. The person cooking gave us their address
 * so food could be collected from it, which is not the same as permission to
 * publish where they live - and a home cook who finds their front door on a
 * public page, with the hours they are alone in the house beside it, does not
 * make that mistake twice.
 *
 * The rule lives here rather than at each place that renders an address,
 * because the first version of it did not: the place page withheld the street
 * and the search API went on returning it, so the protection held on the page
 * somebody read and not on the endpoint behind it. One module, imported by
 * both, is the only version of this that cannot drift.
 *
 * None of this is access control. The row still holds the address, and
 * everything that legitimately needs it reads the row: the courier dispatch,
 * and the order confirmation shown to the person who is actually coming to
 * collect. This governs what is published to anyone who asks.
 */

/** Types whose address is somebody's home rather than premises. */
const PRIVATE_ADDRESS_TYPES = new Set(['home_kitchen'])

export function hidesAddress(type: unknown): boolean {
  return PRIVATE_ADDRESS_TYPES.has(String(type ?? ''))
}

/**
 * The street line, or nothing.
 *
 * Empty rather than a placeholder, so a caller that joins it with the city
 * produces "Mar Vista" and not "Hidden, Mar Vista".
 */
export function publicAddress(address: unknown, type: unknown): string {
  if (hidesAddress(type))
    return ''

  return String(address ?? '').trim()
}

/**
 * Address and city, joined by what is actually there.
 *
 * Joined here rather than as `{{ address }}, {{ city }}` in a template. 106 of
 * the imported listings have no street address - they came out of open data
 * that way - and the template's comma rendered a leading one on every one of
 * them: ", Los Angeles". A home kitchen now takes the same path, because a
 * withheld address is indistinguishable from an absent one at this point.
 */
export function publicLocation(address: unknown, city: unknown, type: unknown): string {
  return [publicAddress(address, type), String(city ?? '').trim()].filter(Boolean).join(', ')
}

/**
 * Where to draw it, and how precisely.
 *
 * Withholding the street line and then dropping a pin on the front door would
 * be a privacy notice with a map to the thing it claims to protect. So a home
 * kitchen's coordinates are rounded to two decimal places - a little over a
 * kilometre - and the surfaces that draw it use `approximate` to choose a
 * shape that admits as much.
 *
 * Rounded rather than randomly offset. An offset re-rolled on every render can
 * be averaged back to the true position by anyone willing to reload; rounding
 * is stable, and the point it produces is a grid square that thousands of
 * homes share.
 *
 * Callers that need the real position - a distance, a delivery radius - should
 * compute it from the row before calling this. Rounding a coordinate for
 * display does not have to cost a kilometre of accuracy in a search result.
 */
export function publicCoordinates(latitude: unknown, longitude: unknown, type: unknown): { latitude: number, longitude: number, approximate: boolean } {
  const lat = Number(latitude ?? 0)
  const lng = Number(longitude ?? 0)

  if (!hidesAddress(type))
    return { latitude: lat, longitude: lng, approximate: false }

  return {
    latitude: Math.round(lat * 100) / 100,
    longitude: Math.round(lng * 100) / 100,
    approximate: true,
  }
}
