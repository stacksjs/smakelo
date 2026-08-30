import { db } from '@stacksjs/database'
import { log } from '@stacksjs/logging'
import { Job } from '@stacksjs/queue'
import { nextPackingDay } from '../Actions/Csa/membership'

/**
 * Move every share on to its next box.
 *
 * A CSA schedule only stays true if something advances it. Without this, a
 * member's page keeps saying their box is coming on a date that has passed,
 * which is worse than saying nothing: it is the one fact the screen exists to
 * report, and it goes quietly stale.
 *
 * Two things happen here, both idempotent so a missed day or a double run
 * costs nothing:
 *
 * 1. A share whose box date has arrived counts that box and moves to the next
 *    packing day.
 * 2. A share whose pause has run out comes back on its own. Making the member
 *    remember to un-pause would mean the farm quietly loses them at the end of
 *    every holiday.
 */
export default new Job({
  name: 'RollCsaBoxes',
  description: 'Advance CSA shares past their packing day and wake paused ones',
  queue: 'default',
  tries: 2,
  backoff: 120,
  timeout: 60,

  async handle() {
    const today = localToday()
    let rolled = 0
    let woken = 0

    const active = await db.selectFrom('csa_subscriptions')
      .where('status', '=', 'active')
      .selectAll()
      .execute() as Array<Record<string, unknown>>

    for (const share of active) {
      const due = String(share.next_box_at ?? '')

      // Only dates that have actually arrived. A blank date means a share that
      // was never scheduled, which is a different problem and not this job's.
      if (!due || due > today)
        continue

      const plan = await db.selectFrom('csa_plans')
        .where('id', '=', Number(share.csa_plan_id))
        .select(['day_of_week', 'cadence'])
        .executeTakeFirst() as { day_of_week?: number, cadence?: string } | undefined

      await db.updateTable('csa_subscriptions')
        .set({
          boxes_delivered: Number(share.boxes_delivered ?? 0) + 1,
          next_box_at: followingBox(Number(plan?.day_of_week ?? 3), String(plan?.cadence ?? 'weekly')),
        } as never)
        .where('id', '=', Number(share.id))
        .execute()

      rolled += 1
    }

    const paused = await db.selectFrom('csa_subscriptions')
      .where('status', '=', 'paused')
      .selectAll()
      .execute() as Array<Record<string, unknown>>

    for (const share of paused) {
      const until = String(share.paused_until ?? '')

      if (!until || until > today)
        continue

      const plan = await db.selectFrom('csa_plans')
        .where('id', '=', Number(share.csa_plan_id))
        .select(['day_of_week'])
        .executeTakeFirst() as { day_of_week?: number } | undefined

      await db.updateTable('csa_subscriptions')
        .set({
          status: 'active',
          paused_until: '',
          next_box_at: nextPackingDay(Number(plan?.day_of_week ?? 3)),
        } as never)
        .where('id', '=', Number(share.id))
        .execute()

      woken += 1
    }

    if (rolled > 0 || woken > 0)
      log.info(`[job] RollCsaBoxes: ${rolled} boxes counted, ${woken} shares back from a pause`)
  },
})

/**
 * The next box after the one just packed.
 *
 * Weekly is the next packing day; fortnightly and monthly skip ahead, because
 * a fortnightly member handed a box every week is a farm giving away food.
 */
function followingBox(dayOfWeek: number, cadence: string): string {
  const first = nextPackingDay(dayOfWeek)

  if (cadence === 'weekly')
    return first

  const date = new Date(`${first}T12:00:00`)

  date.setDate(date.getDate() + (cadence === 'monthly' ? 28 : 7))

  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${date.getFullYear()}-${month}-${day}`
}

/** Today in the local calendar, which is the one the farm packs by. */
function localToday(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  return `${now.getFullYear()}-${month}-${day}`
}
