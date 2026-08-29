/**
 * "Open now", which is harder than it looks.
 *
 * Three things make it awkward, and all three are ordinary rather than exotic:
 *
 *   1. The answer is in the business's timezone, not the visitor's. Someone
 *      browsing Los Angeles from Berlin must see what is open there.
 *   2. A bar that closes at 2am is open on Friday at 1am under *Thursday's*
 *      row, not Friday's. Intervals cross midnight, so checking only today's
 *      rows says a place is shut while people are still inside it.
 *   3. Unknown hours are not closed hours. A listing nobody has recorded hours
 *      for should not be filtered out as though it were shut for the night.
 */

export interface OpeningInterval {
  dayOfWeek: number
  /** Minutes after local midnight. */
  opensAt: number
  /** Minutes after local midnight; may exceed 1440 when it closes after midnight. */
  closesAt: number
  isClosed: boolean
}

export type OpenState = 'open' | 'closed' | 'unknown'

export interface OpenStatus {
  state: OpenState
  /** Minutes until it closes, when open and the closing time is known. */
  closesInMinutes?: number
  /** Minutes until it opens, when closed and a next opening is known. */
  opensInMinutes?: number
}

const MINUTES_PER_DAY = 1440

/**
 * Local weekday and minute-of-day for a moment in a given IANA timezone.
 *
 * Uses `Intl` rather than offset arithmetic so daylight saving is handled by
 * the platform's tz database. Hand-rolled offsets are wrong twice a year, and
 * wrong in the direction that says a restaurant is closed while it is open.
 */
export function localTime(at: Date, timezone: string): { dayOfWeek: number, minuteOfDay: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at)

  const lookup = (type: string): string => parts.find(p => p.type === type)?.value ?? ''
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const dayOfWeek = days.indexOf(lookup('weekday'))

  // `hour12: false` yields 24 rather than 0 for midnight in some runtimes.
  const hour = Number(lookup('hour')) % 24
  const minute = Number(lookup('minute'))

  return { dayOfWeek, minuteOfDay: hour * 60 + minute }
}

/**
 * Whether a business is open at `at`, and for how much longer.
 *
 * Yesterday's intervals are re-checked with today's clock shifted forward a
 * day, which is what catches the after-midnight case: Thursday 22:00-26:00
 * contains Friday 01:00 once Friday's 60 becomes 1500.
 */
export function openStatus(intervals: OpeningInterval[], timezone: string, at: Date = new Date()): OpenStatus {
  const usable = intervals.filter(i => !i.isClosed && i.closesAt > i.opensAt)
  if (intervals.length === 0)
    return { state: 'unknown' }

  const { dayOfWeek, minuteOfDay } = localTime(at, timezone)
  const yesterday = (dayOfWeek + 6) % 7

  for (const interval of usable) {
    if (interval.dayOfWeek === dayOfWeek && minuteOfDay >= interval.opensAt && minuteOfDay < interval.closesAt)
      return { state: 'open', closesInMinutes: interval.closesAt - minuteOfDay }

    // Still inside an interval that began yesterday and runs past midnight.
    if (interval.dayOfWeek === yesterday && interval.closesAt > MINUTES_PER_DAY) {
      const shifted = minuteOfDay + MINUTES_PER_DAY
      if (shifted >= interval.opensAt && shifted < interval.closesAt)
        return { state: 'open', closesInMinutes: interval.closesAt - shifted }
    }
  }

  const next = minutesUntilNextOpening(usable, dayOfWeek, minuteOfDay)
  return next == null ? { state: 'closed' } : { state: 'closed', opensInMinutes: next }
}

/**
 * How long until the next opening, searching forward a week.
 *
 * A week rather than a day because a place open only on Saturdays - farm stands
 * and markets, which this app has - would otherwise report no next opening at
 * all from a Sunday.
 */
function minutesUntilNextOpening(intervals: OpeningInterval[], dayOfWeek: number, minuteOfDay: number): number | null {
  let best: number | null = null

  for (let offset = 0; offset < 7; offset++) {
    const day = (dayOfWeek + offset) % 7

    for (const interval of intervals) {
      if (interval.dayOfWeek !== day)
        continue

      const until = offset * MINUTES_PER_DAY + interval.opensAt - minuteOfDay
      if (until >= 0 && (best == null || until < best))
        best = until
    }
  }

  return best
}

/** Minutes after midnight as `HH:MM`, for display. */
export function formatMinuteOfDay(minutes: number): string {
  const wrapped = minutes % MINUTES_PER_DAY
  const hour = Math.floor(wrapped / 60)
  const minute = wrapped % 60

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}
