import { describe, expect, test } from 'bun:test'
import { boundingBox, distanceInMeters, formatDistance, isWithin } from '../../app/Actions/Business/geo'

// Real places, so the expected distances can be checked against a map.
const SANTA_MONICA_PIER = { latitude: 34.0089, longitude: -118.4973 }
const VENICE_BEACH = { latitude: 33.9850, longitude: -118.4695 }
const DOWNTOWN_LA = { latitude: 34.0522, longitude: -118.2437 }

describe('distanceInMeters', () => {
  test('measures a short hop along the coast', () => {
    // Santa Monica Pier to Venice Beach is a little over 3.5 km.
    const d = distanceInMeters(SANTA_MONICA_PIER, VENICE_BEACH)
    expect(d).toBeGreaterThan(3400)
    expect(d).toBeLessThan(3900)
  })

  test('measures across the city', () => {
    // The pier to downtown is about 23 km.
    const d = distanceInMeters(SANTA_MONICA_PIER, DOWNTOWN_LA)
    expect(d).toBeGreaterThan(22_000)
    expect(d).toBeLessThan(24_500)
  })

  test('is zero to itself and symmetric', () => {
    expect(distanceInMeters(VENICE_BEACH, VENICE_BEACH)).toBe(0)
    expect(distanceInMeters(VENICE_BEACH, DOWNTOWN_LA))
      .toBeCloseTo(distanceInMeters(DOWNTOWN_LA, VENICE_BEACH), 6)
  })
})

describe('boundingBox', () => {
  test('contains every point inside the radius', () => {
    const radius = 4000
    const box = boundingBox(SANTA_MONICA_PIER, radius)

    // Venice is within 4km of the pier, so the box must not exclude it -
    // the box is a prefilter, and anything it drops is never distance-checked.
    expect(VENICE_BEACH.latitude).toBeGreaterThanOrEqual(box.minLatitude)
    expect(VENICE_BEACH.latitude).toBeLessThanOrEqual(box.maxLatitude)
    expect(VENICE_BEACH.longitude).toBeGreaterThanOrEqual(box.minLongitude)
    expect(VENICE_BEACH.longitude).toBeLessThanOrEqual(box.maxLongitude)
  })

  test('widens longitude with latitude', () => {
    // A degree of longitude is shorter away from the equator, so the same
    // radius must span more degrees. Without the cosine correction the box is
    // too narrow in Los Angeles and quietly loses results.
    const equator = boundingBox({ latitude: 0, longitude: 0 }, 5000)
    const losAngeles = boundingBox({ latitude: 34.05, longitude: 0 }, 5000)

    const equatorWidth = equator.maxLongitude - equator.minLongitude
    const laWidth = losAngeles.maxLongitude - losAngeles.minLongitude

    expect(laWidth).toBeGreaterThan(equatorWidth)
    // cos(34.05°) is about 0.829, so the box is roughly 1.2x wider.
    expect(laWidth / equatorWidth).toBeCloseTo(1 / Math.cos((34.05 * Math.PI) / 180), 2)
  })

  test('survives the pole instead of dividing by zero', () => {
    const box = boundingBox({ latitude: 90, longitude: 0 }, 1000)
    expect(Number.isFinite(box.minLongitude)).toBe(true)
    expect(Number.isFinite(box.maxLongitude)).toBe(true)
  })
})

describe('isWithin', () => {
  test('cuts the corners the bounding box keeps', () => {
    const radius = 3000
    const box = boundingBox(SANTA_MONICA_PIER, radius)
    // The box corner is inside the square but outside the circle - which is
    // exactly why the circle is checked separately.
    const corner = { latitude: box.maxLatitude, longitude: box.maxLongitude }

    expect(isWithin(SANTA_MONICA_PIER, corner, radius)).toBe(false)
    expect(isWithin(SANTA_MONICA_PIER, { latitude: 34.0089, longitude: -118.4873 }, radius)).toBe(true)
  })
})

describe('formatDistance', () => {
  test('rounds metres to a precision GPS can support', () => {
    expect(formatDistance(447)).toBe('450 m')
    expect(formatDistance(12)).toBe('10 m')
  })

  test('switches to kilometres and keeps one decimal while it matters', () => {
    expect(formatDistance(1240)).toBe('1.2 km')
    expect(formatDistance(23_400)).toBe('23 km')
  })

  test('writes the decimal comma in German and Dutch', () => {
    expect(formatDistance(1240, 'de')).toBe('1,2 km')
    expect(formatDistance(1240, 'nl')).toBe('1,2 km')
  })
})
