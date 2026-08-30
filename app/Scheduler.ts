import process from 'node:process'
import { schedule } from '@stacksjs/scheduler'

/**
 * **Scheduler**
 *
 * Define your scheduled tasks here. Jobs, actions, and shell commands
 * can all be scheduled with a fluent, expressive API.
 *
 * @see https://docs.stacksjs.com/scheduling
 */
export default function (): void {
  /*
   * Move CSA shares past their packing day, and wake the ones whose pause has
   * run out. Daily, early, in the market's own timezone: a farm packs by the
   * local calendar, and a job that runs at UTC midnight would roll a Wednesday
   * box on Tuesday afternoon in Los Angeles.
   *
   * The scaffold scheduled a job called 'Inspire' that this app does not have.
   * It typechecked locally, where the generated job types still listed it, and
   * failed in CI, where they did not.
   */
  schedule
    .job('RollCsaBoxes')
    .daily()
    .at('05:00')
    .setTimeZone('America/Los_Angeles')
}

process.on('SIGINT', () => {
  schedule.gracefulShutdown().then(() => process.exit(0))
})
