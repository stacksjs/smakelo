import { describe, expect, test } from 'bun:test'
import { nextPackingDay } from '../../app/Actions/Csa/membership'

/**
 * A CSA member has one question: when is the next box. Getting it wrong by a
 * day sends somebody to a farm on the wrong afternoon.
 */
describe('nextPackingDay', () => {
  const dayOf = (date: string) => new Date(`${date}T12:00:00`).getDay()

  test('lands on the day the farm actually packs', () => {
    // Every weekday, asked from every weekday, has to come back as that day.
    for (let target = 0; target < 7; target++) {
      for (let offset = 0; offset < 7; offset++) {
        const from = new Date(2026, 7, 24 + offset, 18, 30)

        expect(dayOf(nextPackingDay(target, from))).toBe(target)
      }
    }
  })

  test('is not thrown by an evening west of Greenwich', () => {
    /*
     * The bug this exists to catch: formatting via toISOString converts to UTC
     * first, and a Saturday evening in Los Angeles is already Sunday in UTC,
     * so every date came back a day late.
     */
    const saturdayEvening = new Date(2026, 7, 29, 18, 51)

    expect(dayOf(nextPackingDay(3, saturdayEvening))).toBe(3)
    expect(nextPackingDay(3, saturdayEvening)).toBe('2026-09-02')
  })

  test('skips today, because that box is already packed', () => {
    // A Wednesday member joining on Wednesday waits a week.
    const wednesday = new Date(2026, 7, 26, 9, 0)

    expect(nextPackingDay(3, wednesday)).toBe('2026-09-02')
  })

  test('gives the nearest matching day, never one further out', () => {
    const monday = new Date(2026, 7, 24, 9, 0)

    expect(nextPackingDay(6, monday)).toBe('2026-08-29')
  })
})
