/**
 * Distance on the ground, for "what is near me".
 *
 * The search engine has no radius filter in any of its drivers, so proximity is
 * answered in SQL and arithmetic rather than by the index. That split is
 * deliberate and worth stating: the index does text relevance, this does
 * geography, and neither tries to do the other's job.
 */

const EARTH_RADIUS_METERS = 6_371_000
const METERS_PER_DEGREE_LATITUDE = 111_320

export interface Coordinates {
  latitude: number
  longitude: number
}

export interface BoundingBox {
  minLatitude: number
  maxLatitude: number
  minLongitude: number
  maxLongitude: number
}

/**
 * Great-circle distance in metres.
 *
 * The haversine rather than the equirectangular approximation: the error of the
 * cheap version grows with distance and with latitude, and the whole point of
 * this number is to sort a list by how far away things are.
 */
export function distanceInMeters(from: Coordinates, to: Coordinates): number {
  const lat1 = toRadians(from.latitude)
  const lat2 = toRadians(to.latitude)
  const deltaLat = toRadians(to.latitude - from.latitude)
  const deltaLon = toRadians(to.longitude - from.longitude)

  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)))
}

/**
 * A square that certainly contains the circle of `radiusMeters` around `center`.
 *
 * This is the half of the search SQLite can do with an index. Filtering to the
 * box first turns "compute the distance to every business in the city" into
 * "compute it for the few hundred in this neighbourhood"; the exact circle is
 * then cut in code, because the box is a superset and always keeps too much at
 * the corners.
 *
 * A degree of longitude shrinks towards the poles, so the longitude span is
 * divided by the cosine of the latitude. Omitting that makes the box too narrow
 * away from the equator and silently drops results - in Los Angeles it would
 * lose about a sixth of the width.
 */
export function boundingBox(center: Coordinates, radiusMeters: number): BoundingBox {
  const latitudeDelta = radiusMeters / METERS_PER_DEGREE_LATITUDE

  // Guard the poles: cos(90°) is 0 and the division would be infinite. Nobody
  // is ordering dinner there, but a NaN in a WHERE clause silently returns
  // nothing, which is a much worse failure than a wide box.
  const cosLatitude = Math.max(Math.cos(toRadians(center.latitude)), 0.000_001)
  const longitudeDelta = radiusMeters / (METERS_PER_DEGREE_LATITUDE * cosLatitude)

  return {
    minLatitude: center.latitude - latitudeDelta,
    maxLatitude: center.latitude + latitudeDelta,
    minLongitude: center.longitude - longitudeDelta,
    maxLongitude: center.longitude + longitudeDelta,
  }
}

/** Whether a point is genuinely inside the circle, not merely inside the box. */
export function isWithin(center: Coordinates, point: Coordinates, radiusMeters: number): boolean {
  return distanceInMeters(center, point) <= radiusMeters
}

/**
 * Metres as a person would say them: "450 m", "1.2 km".
 *
 * Rounded coarsely on purpose. GPS on a phone is not accurate to the metre, and
 * a distance shown to three decimal places claims a precision the input never
 * had.
 */
export function formatDistance(meters: number, locale = 'en'): string {
  if (meters < 1000)
    return `${Math.round(meters / 10) * 10} m`

  const km = meters / 1000
  const rounded = km < 10 ? km.toFixed(1) : String(Math.round(km))

  // German and Dutch both write the decimal comma.
  return `${locale === 'en' ? rounded : rounded.replace('.', ',')} km`
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}
