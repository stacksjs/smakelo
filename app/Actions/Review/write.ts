import { db } from '@stacksjs/database'
import { customerForVisitor, existingCustomerFor } from '../Visitor/identity'

/**
 * Writing, rating and answering reviews.
 *
 * The rule that shapes this file: **a review can only be written about one of
 * the invented partner businesses.** The listings are real places taken from
 * open data; they agreed to nothing, and a demo that lets strangers publish
 * opinions attached to a real restaurant's name is not a demo, it is a small
 * defamation engine. The guard lives here rather than in the template, because
 * a hidden button is not a rule.
 */

export interface ReviewInput {
  businessSlug: string
  visitorToken: unknown
  authorName: string
  rating: number
  title: string
  body: string
  dishes?: string
  visitedAt?: string
}

export interface ReviewResult {
  ok: boolean
  reviewId?: number
  verified?: boolean
  reason?: string
}

export async function submitReview(input: ReviewInput): Promise<ReviewResult> {
  const business = await db.selectFrom('businesses')
    .where('slug', '=', String(input.businessSlug))
    .select(['id', 'name', 'is_partner'])
    .executeTakeFirst() as { id: number, name: string, is_partner: number } | undefined

  if (!business)
    return { ok: false, reason: 'That business is not listed.' }

  if (Number(business.is_partner) !== 1) {
    return {
      ok: false,
      reason: `${business.name} is a real place listed from open data. Smakelo will not publish invented reviews about it.`,
    }
  }

  const rating = Math.round(Number(input.rating))

  if (!Number.isFinite(rating) || rating < 1 || rating > 5)
    return { ok: false, reason: 'A rating is one to five stars.' }

  const title = String(input.title ?? '').trim().slice(0, 120)
  const body = String(input.body ?? '').trim().slice(0, 4000)

  // Long enough to say something. A one-word review is a rating with extra
  // steps, and the rating is already captured.
  if (body.length < 20)
    return { ok: false, reason: 'Say a little more than that: twenty characters at least.' }

  const customerId = await customerForVisitor(input.visitorToken, input.authorName)

  if (!customerId)
    return { ok: false, reason: 'Could not identify this browser. Enable cookies and try again.' }

  const already = await db.selectFrom('business_reviews')
    .where('business_id', '=', Number(business.id))
    .where('customer_id', '=', customerId)
    .select(['id'])
    .executeTakeFirst() as { id: number } | undefined

  if (already)
    return { ok: false, reason: 'You have already reviewed this place.' }

  /*
   * The verified badge means something specific: this browser actually ordered
   * from this business through Smakelo. It is looked up rather than claimed,
   * because a badge the writer can assert is decoration.
   */
  const order = await verifiedOrderFor(customerId, Number(business.id))

  await db.insertInto('business_reviews').values({
    uuid: crypto.randomUUID(),
    business_id: Number(business.id),
    customer_id: customerId,
    order_id: order,
    rating,
    title,
    body,
    dishes: String(input.dishes ?? '').trim().slice(0, 200),
    owner_response: '',
    owner_responded_at: null,
    helpful_count: 0,
    is_published: 1,
    visited_at: input.visitedAt ? String(input.visitedAt).slice(0, 10) : null,
  } as never).executeTakeFirst()

  const created = await db.selectFrom('business_reviews')
    .where('business_id', '=', Number(business.id))
    .where('customer_id', '=', customerId)
    .select(['id'])
    .orderBy('id', 'desc')
    .executeTakeFirst() as { id: number } | undefined

  await recomputeRating(Number(business.id))

  return { ok: true, reviewId: Number(created?.id ?? 0), verified: order !== null }
}

/**
 * Vote a review useful, or take the vote back.
 *
 * Pressing it twice removes the vote rather than adding a second one, which is
 * what the button's own state implies it does.
 */
export async function voteOnReview(reviewId: number, visitorToken: unknown, helpful = true): Promise<{ ok: boolean, voted?: boolean, helpfulCount?: number, reason?: string }> {
  const review = await db.selectFrom('business_reviews')
    .where('id', '=', Number(reviewId))
    .select(['id', 'business_id', 'customer_id'])
    .executeTakeFirst() as { id: number, business_id: number, customer_id: number } | undefined

  if (!review)
    return { ok: false, reason: 'No such review.' }

  const customerId = await customerForVisitor(visitorToken)

  if (!customerId)
    return { ok: false, reason: 'Could not identify this browser.' }

  if (Number(review.customer_id) === customerId)
    return { ok: false, reason: 'You cannot vote on your own review.' }

  const existing = await db.selectFrom('review_votes')
    .where('business_review_id', '=', Number(reviewId))
    .where('customer_id', '=', customerId)
    .select(['id'])
    .executeTakeFirst() as { id: number } | undefined

  if (existing) {
    await db.deleteFrom('review_votes').where('id', '=', Number(existing.id)).execute()
  }
  else {
    await db.insertInto('review_votes').values({
      uuid: crypto.randomUUID(),
      business_review_id: Number(reviewId),
      customer_id: customerId,
      helpful: helpful ? 1 : 0,
    } as never).executeTakeFirst()
  }

  const helpfulCount = await countVotes(Number(reviewId))

  // The column stays as the denormalized total the listing pages read, but it
  // is written from the rows rather than incremented, so it cannot drift.
  await db.updateTable('business_reviews')
    .set({ helpful_count: helpfulCount } as never)
    .where('id', '=', Number(reviewId))
    .execute()

  return { ok: true, voted: !existing, helpfulCount }
}

/**
 * The owner's reply, one per review.
 *
 * There are no merchant accounts in this demo, so ownership is asserted by
 * arriving through the merchant surface for that business rather than proven.
 * That is stated plainly instead of dressed up: a real deployment gates this
 * on the team that owns the business, and the shape of the call does not change.
 */
export async function respondToReview(reviewId: number, businessSlug: string, text: string): Promise<{ ok: boolean, reason?: string }> {
  const review = await db.selectFrom('business_reviews')
    .where('id', '=', Number(reviewId))
    .select(['id', 'business_id'])
    .executeTakeFirst() as { id: number, business_id: number } | undefined

  if (!review)
    return { ok: false, reason: 'No such review.' }

  const business = await db.selectFrom('businesses')
    .where('slug', '=', String(businessSlug))
    .select(['id'])
    .executeTakeFirst() as { id: number } | undefined

  if (!business || Number(business.id) !== Number(review.business_id))
    return { ok: false, reason: 'That review belongs to a different business.' }

  const response = String(text ?? '').trim().slice(0, 1500)

  if (response.length < 10)
    return { ok: false, reason: 'A reply that short reads worse than no reply.' }

  await db.updateTable('business_reviews')
    .set({ owner_response: response, owner_responded_at: new Date().toISOString() } as never)
    .where('id', '=', Number(reviewId))
    .execute()

  return { ok: true }
}

export interface ReviewStats {
  count: number
  average: number
  /** Five buckets, one star to five, in that order. */
  distribution: number[]
}

/** The bar chart next to the average, which one number cannot replace. */
export async function statsFor(businessId: number): Promise<ReviewStats> {
  const rows = await db.selectFrom('business_reviews')
    .where('business_id', '=', Number(businessId))
    .where('is_published', '=', 1)
    .select(['rating'])
    .execute() as Array<{ rating: number }>

  const distribution = [0, 0, 0, 0, 0]

  for (const row of rows) {
    const index = Math.min(5, Math.max(1, Number(row.rating))) - 1
    distribution[index] = (distribution[index] ?? 0) + 1
  }

  const total = rows.reduce((sum, row) => sum + Number(row.rating), 0)

  return {
    count: rows.length,
    average: rows.length === 0 ? 0 : Math.round((total / rows.length) * 10) / 10,
    distribution,
  }
}

/** Reviews for a business, newest first, with this visitor's own votes marked. */
export async function reviewsFor(businessId: number, visitorToken?: unknown): Promise<Array<Record<string, unknown>>> {
  const rows = await db.selectFrom('business_reviews')
    .where('business_id', '=', Number(businessId))
    .where('is_published', '=', 1)
    .orderBy('id', 'desc')
    .selectAll()
    .execute() as Array<Record<string, unknown>>

  const customerId = await existingCustomerFor(visitorToken)

  const mine = customerId
    ? new Set((await db.selectFrom('review_votes')
        .where('customer_id', '=', customerId)
        .select(['business_review_id'])
        .execute() as Array<{ business_review_id: number }>).map(row => Number(row.business_review_id)))
    : new Set<number>()

  const out = []

  for (const row of rows) {
    const author = row.customer_id
      ? await db.selectFrom('customers').where('id', '=', Number(row.customer_id)).select(['name']).executeTakeFirst() as { name?: string } | undefined
      : undefined

    out.push({
      id: Number(row.id),
      rating: Number(row.rating),
      title: String(row.title ?? ''),
      body: String(row.body ?? ''),
      dishes: String(row.dishes ?? ''),
      ownerResponse: String(row.owner_response ?? ''),
      helpfulCount: Number(row.helpful_count ?? 0),
      verified: row.order_id != null,
      authorName: String(author?.name ?? 'Guest'),
      visitedAt: row.visited_at ?? null,
      createdAt: row.created_at ?? null,
      votedByMe: mine.has(Number(row.id)),
      mine: customerId != null && Number(row.customer_id) === customerId,
    })
  }

  return out
}

async function countVotes(reviewId: number): Promise<number> {
  const rows = await db.selectFrom('review_votes')
    .where('business_review_id', '=', Number(reviewId))
    .where('helpful', '=', 1)
    .select(['id'])
    .execute() as Array<{ id: number }>

  return rows.length
}

/** An order this customer placed at this business that actually happened. */
async function verifiedOrderFor(customerId: number, businessId: number): Promise<number | null> {
  const row = await db.selectFrom('orders')
    .where('customer_id', '=', customerId)
    .where('business_id', '=', businessId)
    .where('status', 'in', ['SHIPPED', 'DELIVERED', 'COMPLETED'])
    .orderBy('id', 'desc')
    .select(['id'])
    .executeTakeFirst() as { id: number } | undefined

  return row ? Number(row.id) : null
}

async function recomputeRating(businessId: number): Promise<void> {
  const stats = await statsFor(businessId)

  await db.updateTable('businesses')
    .set({ rating_average: stats.average, rating_count: stats.count } as never)
    .where('id', '=', businessId)
    .execute()
}
