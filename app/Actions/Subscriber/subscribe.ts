import { db } from '@stacksjs/database'

/**
 * Take an email address for the "tell me when somewhere near me delivers" form.
 *
 * Writes to the framework's `subscribers` table rather than a table of this
 * app's own. Declaring a `Subscriber` model here would have shadowed the
 * framework's, and the generated migration for it was narrower than the table
 * that already exists - no `status`, no `unsubscribed_at`. Since the page
 * promises you can leave at any time, the columns that record leaving are the
 * ones worth keeping.
 *
 * Deliberately hard to use as an oracle. The same answer comes back whether
 * the address was new or already on the list, because the alternative is an
 * endpoint that tells anybody who asks whether a given person signed up here -
 * and it is unauthenticated, so anybody can ask.
 *
 * That is also why a duplicate is not an error. Somebody who submits twice
 * because they forgot is not doing anything wrong, and the honest answer to
 * "please remember this address" when it is already remembered is yes.
 */

export interface SubscribeResult {
  ok: boolean
  /** Present only when the address itself could not be accepted. */
  error?: string
}

const SOURCES = new Set(['home', 'place', 'footer'])

/**
 * The table's own word for "on the list", checked by a constraint on the
 * column. The others it allows are `unsubscribed`, `pending` and `bounced`,
 * and both of the last two are states somebody re-subscribing should come out
 * of - a bounced address that is offered again is worth trying again.
 */
const ON_THE_LIST = 'subscribed'

export async function subscribe(rawEmail: unknown, rawSource: unknown): Promise<SubscribeResult> {
  const email = String(rawEmail ?? '').trim().toLowerCase()

  if (!isPlausibleEmail(email))
    return { ok: false, error: 'That does not look like an email address.' }

  // An unrecognised source is recorded as unknown rather than rejected: it is
  // our own field for our own diagnostics, and it should never be the reason
  // somebody's signup fails.
  const source = SOURCES.has(String(rawSource ?? '')) ? String(rawSource) : 'unknown'

  const existing = await db
    .selectFrom('subscribers')
    .select(['id', 'status'])
    .where('email', '=', email)
    .executeTakeFirst()

  // Somebody re-subscribing after leaving is the one case that has to write:
  // their row exists, and without this they would be told yes and stay off.
  if (existing) {
    if (existing.status !== ON_THE_LIST) {
      await db
        .updateTable('subscribers')
        .set({ status: ON_THE_LIST, unsubscribed_at: null } as never)
        .where('id', '=', existing.id)
        .execute()
    }

    return { ok: true }
  }

  try {
    await db
      .insertInto('subscribers')
      .values({ uuid: crypto.randomUUID(), email, source, status: ON_THE_LIST } as never)
      .execute()
  }
  catch (error) {
    // Two submissions of the same new address can race past the check above
    // and collide on the unique index. Both people meant "remember this", and
    // it is remembered, so both are told yes.
    //
    // Anything else - the table missing, the database refusing the write - is
    // a failure, and swallowing it would report success while dropping the
    // address on the floor, which is the one outcome this form must not have.
    if (!isUniqueViolation(error))
      return { ok: false, error: 'That did not save. Try again in a moment.' }
  }

  return { ok: true }
}

/** Both spellings the drivers use; neither exposes a typed error code. */
function isUniqueViolation(error: unknown): boolean {
  const text = String((error as { message?: unknown })?.message ?? error).toLowerCase()

  return text.includes('unique') || text.includes('duplicate')
}

/**
 * A shape check, not a validity check.
 *
 * Whether an address can receive mail is not knowable from the string, and the
 * regexes that try get longer without getting righter. This rejects the
 * things that are certainly not addresses and lets the rest through, which is
 * as far as parsing can honestly go.
 */
function isPlausibleEmail(value: string): boolean {
  if (value.length < 6 || value.length > 200)
    return false

  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(value)
}
