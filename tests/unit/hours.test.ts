import type { OpeningInterval } from '../../app/Actions/Business/hours'
import { describe, expect, test } from 'bun:test'
import { formatMinuteOfDay, localTime, openStatus } from '../../app/Actions/Business/hours'

const LA = 'America/Los_Angeles'

function hours(dayOfWeek: number, opensAt: number, closesAt: number, isClosed = false): OpeningInterval {
  return { dayOfWeek, opensAt, closesAt, isClosed }
}

/** A UTC instant, so the test says what it means regardless of where it runs. */
function utc(iso: string): Date {
  return new Date(iso)
}

describe('localTime', () => {
  test('answers in the business timezone, not the machine one', () => {
    // 2026-03-05 was a Thursday. 20:00 UTC is 12:00 in Los Angeles.
    const { dayOfWeek, minuteOfDay } = localTime(utc('2026-03-05T20:00:00Z'), LA)
    expect(dayOfWeek).toBe(4)
    expect(minuteOfDay).toBe(12 * 60)
  })

  test('rolls the weekday back when UTC has already turned over', () => {
    // Friday 03:00 UTC is still Thursday 19:00 in Los Angeles, and a place
    // open Thursday evening must not be judged against Friday's hours.
    const { dayOfWeek, minuteOfDay } = localTime(utc('2026-03-06T03:00:00Z'), LA)
    expect(dayOfWeek).toBe(4)
    expect(minuteOfDay).toBe(19 * 60)
  })

  test('follows daylight saving rather than a fixed offset', () => {
    // Los Angeles is UTC-8 in January and UTC-7 in July.
    expect(localTime(utc('2026-01-15T20:00:00Z'), LA).minuteOfDay).toBe(12 * 60)
    expect(localTime(utc('2026-07-15T20:00:00Z'), LA).minuteOfDay).toBe(13 * 60)
  })
})

describe('openStatus', () => {
  test('is open inside an ordinary interval, and says when it closes', () => {
    // Thursday 11:00-22:00, checked at Thursday noon.
    const status = openStatus([hours(4, 660, 1320)], LA, utc('2026-03-05T20:00:00Z'))
    expect(status.state).toBe('open')
    expect(status.closesInMinutes).toBe(600)
  })

  test('is closed before opening, and says how long until it opens', () => {
    // Thursday 11:00-22:00, checked at Thursday 09:00.
    const status = openStatus([hours(4, 660, 1320)], LA, utc('2026-03-05T17:00:00Z'))
    expect(status.state).toBe('closed')
    expect(status.opensInMinutes).toBe(120)
  })

  test('is still open after midnight under the previous day\'s interval', () => {
    // Thursday 18:00 until 02:00 Friday, expressed as 1080-1560, checked at
    // Friday 01:00 local. Looking only at Friday's rows would call this shut
    // while people are still being served.
    const status = openStatus([hours(4, 1080, 1560)], LA, utc('2026-03-06T09:00:00Z'))
    expect(status.state).toBe('open')
    expect(status.closesInMinutes).toBe(60)
  })

  test('is closed after an overnight interval has ended', () => {
    // Same Thursday 18:00-02:00, checked at Friday 03:00 local.
    const status = openStatus([hours(4, 1080, 1560)], LA, utc('2026-03-06T11:00:00Z'))
    expect(status.state).toBe('closed')
  })

  test('reports unknown when nobody recorded any hours', () => {
    // Distinct from closed on purpose: an imported listing with no hours must
    // not be filtered out of an "open now" search as though it were shut.
    expect(openStatus([], LA, utc('2026-03-05T20:00:00Z')).state).toBe('unknown')
  })

  test('treats an explicitly closed day as closed, not unknown', () => {
    const status = openStatus([hours(4, 0, 0, true)], LA, utc('2026-03-05T20:00:00Z'))
    expect(status.state).toBe('closed')
  })

  test('handles a split day with a break between services', () => {
    // Lunch 11:00-14:00 and dinner 17:00-22:00, checked at 15:00 - inside the
    // gap, which a single opens/closes pair per day could not express.
    const service = [hours(4, 660, 840), hours(4, 1020, 1320)]
    const gap = openStatus(service, LA, utc('2026-03-05T23:00:00Z'))
    expect(gap.state).toBe('closed')
    expect(gap.opensInMinutes).toBe(120)

    expect(openStatus(service, LA, utc('2026-03-05T21:00:00Z')).state).toBe('open')
  })

  test('finds the next opening a week out for a weekend-only stand', () => {
    // A farm stand open Saturdays 08:00-13:00, checked on a Sunday: searching
    // only tomorrow would report no next opening at all.
    //
    // Sunday 2026-01-11, deliberately in January: Los Angeles is on standard
    // time, so 20:00 UTC is 12:00 local and the arithmetic below is readable.
    // The first draft of this test used the second Sunday in March, which is
    // the day the clocks go forward, and was off by exactly one hour.
    const status = openStatus([hours(6, 480, 780)], LA, utc('2026-01-11T20:00:00Z'))
    expect(status.state).toBe('closed')
    expect(status.opensInMinutes).toBe(6 * 1440 + 480 - 12 * 60)
  })
})

describe('formatMinuteOfDay', () => {
  test('renders a wall clock', () => {
    expect(formatMinuteOfDay(540)).toBe('09:00')
    expect(formatMinuteOfDay(1320)).toBe('22:00')
  })

  test('wraps a past-midnight close back to a real clock time', () => {
    expect(formatMinuteOfDay(1560)).toBe('02:00')
  })
})
