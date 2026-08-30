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

export interface GuardResult {
  name: string
  ok: boolean
  detail: string
  /** What the check would say if it failed, so the screen explains itself. */
  matters: string
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
    name: 'Sandbox payments only',
    ok: !live,
    detail: live
      ? 'A live Stripe key is configured. Checkout will refuse it, but it should not be here.'
      : configured
        ? 'Stripe test keys configured. Checkout runs in sandbox.'
        : 'No payment provider configured. Checkout says so and records the order unpaid.',
    matters: 'The businesses that can be ordered from are invented. A live key would charge a real card on behalf of a restaurant that does not exist.',
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
    name: 'No reviews on real businesses',
    ok: rows.length === 0,
    detail: rows.length === 0
      ? 'Every published review belongs to one of the invented partners.'
      : `${rows.length} review(s) are attached to a real listing.`,
    matters: 'The listings come from open data. Publishing invented opinions under a real restaurant\'s name is the one thing this site must never do.',
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
    name: 'Only partners take orders',
    ok: rows.length === 0,
    detail: rows.length === 0
      ? 'Every order belongs to one of the twelve invented partners.'
      : `${rows.length} order(s) were placed at a real listing.`,
    matters: 'A real business has no idea this site exists and cannot fulfil anything ordered through it.',
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
    name: 'No real contact details stored',
    ok: real.length === 0,
    detail: real.length === 0
      ? `${rows.length} customer row(s), all on reserved demo domains that cannot receive mail.`
      : `${real.length} customer row(s) carry an address that could reach a real inbox.`,
    matters: 'Nobody consented to hear from a demonstration, and an address that resolves is an address something can eventually send to.',
  }
}

/** Every page asks not to be indexed. */
function noindexGuard(): GuardResult {
  const head = join(process.cwd(), 'resources', 'partials', 'head.stx')
  const source = existsSync(head) ? readFileSync(head, 'utf8') : ''
  const present = source.includes('noindex')

  return {
    name: 'Pages carry noindex',
    ok: present,
    detail: present
      ? 'The head partial emits noindex, nofollow on every page.'
      : 'The head partial no longer emits a robots meta tag.',
    matters: 'Fiction about a real restaurant, indexed and ranking, is the outcome this site exists to avoid.',
  }
}

/** And says so again in robots.txt, for the crawlers that read it first. */
function robotsGuard(): GuardResult {
  const robots = join(process.cwd(), 'public', 'robots.txt')
  const source = existsSync(robots) ? readFileSync(robots, 'utf8') : ''
  const disallows = source.includes('Disallow: /')

  return {
    name: 'robots.txt disallows crawling',
    ok: disallows,
    detail: disallows
      ? 'robots.txt disallows everything and explains why.'
      : 'robots.txt is missing or no longer disallows crawling.',
    matters: 'Belt and braces with the meta tag: one stops indexing, the other discourages the fetch.',
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
