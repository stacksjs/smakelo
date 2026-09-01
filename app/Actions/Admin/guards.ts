import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { db } from '@stacksjs/database'
import { assessKeys } from '../Payment/checkout'

/**
 * Check the demo's promises against the database, rather than trusting them.
 *
 * Smakelo makes a small number of claims about itself: real businesses are
 * listed and nothing more, no invented review carries a real restaurant's
 * name, no real payment can be taken, and no contact details were collected
 * from anybody. Each of those is enforced somewhere in the code, and each
 * could be broken by a change three files away without anything failing.
 *
 * So they are checked here, against what is actually stored, and the answer is
 * a screen anybody can open. A guard nobody can see the state of is a guard
 * you find out about afterwards.
 */

/**
 * A guard's finding: which check, whether it holds, and which of its messages
 * applies.
 *
 * Facts rather than sentences. The screen that shows this may be rendering in
 * German, and a process that runs no request has no way to know that - so the
 * words live with the interface, keyed off `key` and `detailKey`, and the
 * numbers a message needs travel beside it.
 */
export interface GuardResult {
  /** Stable name for the check; the screen titles and explains it from this. */
  key: string
  ok: boolean
  /** Which of this guard's messages applies. */
  detailKey: string
  /** What that message interpolates, when it interpolates anything. */
  detailValues?: Record<string, number>
}

export async function runGuards(): Promise<{ results: GuardResult[], allPassed: boolean }> {
  const results: GuardResult[] = []

  results.push(await paymentGuard())
  results.push(await reviewGuard())
  results.push(await orderGuard())
  results.push(await contactGuard())
  results.push(noindexGuard())
  results.push(robotsGuard())

  return { results, allPassed: results.every(result => result.ok) }
}

/** No live Stripe key, ever. */
async function paymentGuard(): Promise<GuardResult> {
  const { config } = await import('@stacksjs/config')
  const payment = config.payment as Record<string, any> | undefined

  const secret = String(payment?.stripe?.secretKey ?? '')
  const publishable = String(payment?.stripe?.publishableKey ?? '')
  const verdict = assessKeys(secret, publishable)

  const configured = !('reason' in verdict)
  const live = secret.startsWith('sk_live_') || publishable.startsWith('pk_live_')

  return {
    key: 'payments',
    ok: !live,
    detailKey: live ? 'live_key' : configured ? 'test_keys' : 'no_provider',
  }
}

/** No review on a business that never agreed to be here. */
async function reviewGuard(): Promise<GuardResult> {
  const partnerIds = await partnerIdSet()

  const reviews = await db.selectFrom('business_reviews')
    .select(['id', 'business_id'])
    .execute() as Array<{ id: number, business_id: number }>

  const rows = reviews.filter(review => !partnerIds.has(Number(review.business_id)))

  return {
    key: 'reviews',
    ok: rows.length === 0,
    detailKey: rows.length === 0 ? 'clean' : 'attached',
    detailValues: { count: rows.length },
  }
}

/** No order at a business that never signed up. */
async function orderGuard(): Promise<GuardResult> {
  const partnerIds = await partnerIdSet()

  const orders = await db.selectFrom('orders')
    .select(['id', 'business_id'])
    .execute() as Array<{ id: number, business_id: number }>

  const rows = orders.filter(order => !partnerIds.has(Number(order.business_id)))

  return {
    key: 'orders',
    ok: rows.length === 0,
    detailKey: rows.length === 0 ? 'clean' : 'placed',
    detailValues: { count: rows.length },
  }
}

/**
 * No real contact details, from anybody.
 *
 * Visitor customers are created with an address under `.invalid`, which RFC
 * 2606 reserves and no resolver will ever answer, so nothing here can send mail
 * to a real person even by accident.
 */
async function contactGuard(): Promise<GuardResult> {
  const rows = await db.selectFrom('customers')
    .selectAll()
    .execute() as Array<Record<string, unknown>>

  const real = rows.filter((row) => {
    const email = String(row.email ?? '')

    return email && !email.endsWith('@demo.smakelo.invalid') && !email.endsWith('.test')
  })

  return {
    key: 'contact',
    ok: real.length === 0,
    detailKey: real.length === 0 ? 'reserved' : 'reachable',
    detailValues: { count: real.length === 0 ? rows.length : real.length },
  }
}

/** Every page asks not to be indexed. */
function noindexGuard(): GuardResult {
  const head = join(process.cwd(), 'resources', 'partials', 'head.stx')
  const source = existsSync(head) ? readFileSync(head, 'utf8') : ''
  const present = source.includes('noindex')

  return {
    key: 'noindex',
    ok: present,
    detailKey: present ? 'present' : 'missing',
  }
}

/** And says so again in robots.txt, for the crawlers that read it first. */
function robotsGuard(): GuardResult {
  const robots = join(process.cwd(), 'public', 'robots.txt')
  const source = existsSync(robots) ? readFileSync(robots, 'utf8') : ''
  const disallows = source.includes('Disallow: /')

  return {
    key: 'robots',
    ok: disallows,
    detailKey: disallows ? 'disallows' : 'missing',
  }
}

/**
 * Which businesses are the invented partners.
 *
 * Read as a set and compared in code rather than joined. The rest of this
 * codebase reads that way, and a guard is the last place to introduce a query
 * shape nobody else here uses.
 */
async function partnerIdSet(): Promise<Set<number>> {
  const rows = await db.selectFrom('businesses')
    .where('is_partner', '=', 1)
    .select(['id'])
    .execute() as Array<{ id: number }>

  return new Set(rows.map(row => Number(row.id)))
}
