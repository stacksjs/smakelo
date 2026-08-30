import { db } from '@stacksjs/database'

/**
 * "This is my business."
 *
 * The listings are real places copied from open data, so the most likely person
 * to arrive at this form is somebody who runs one of them and would rather not
 * be listed at all. That is a reasonable thing to want, and it is the first
 * thing the funnel handles: a claim can ask to take the listing down as readily
 * as to take it over.
 *
 * Nothing here sends mail. The claimant's address is stored so an operator can
 * reply by hand, and the demo guard is absolute: Smakelo never writes to a
 * business's own contact details, which it did not ask to hand over.
 */

export type ClaimStatus = 'pending' | 'approved' | 'rejected'

export interface ClaimInput {
  businessSlug: string
  claimantName: string
  claimantEmail: string
  message: string
}

export async function submitClaim(input: ClaimInput): Promise<{ ok: boolean, claimId?: number, reason?: string }> {
  const business = await db.selectFrom('businesses')
    .where('slug', '=', String(input.businessSlug))
    .select(['id', 'name', 'is_partner'])
    .executeTakeFirst() as { id: number, name: string, is_partner: number } | undefined

  if (!business)
    return { ok: false, reason: 'That business is not listed.' }

  if (Number(business.is_partner) === 1)
    return { ok: false, reason: `${business.name} is an invented business made for this demo. There is nothing to claim.` }

  const name = String(input.claimantName ?? '').trim().slice(0, 120)
  const email = String(input.claimantEmail ?? '').trim().slice(0, 200)
  const message = String(input.message ?? '').trim().slice(0, 2000)

  if (name.length < 2)
    return { ok: false, reason: 'A name, please.' }

  // Deliberately loose. A stricter pattern rejects real addresses more often
  // than it catches fake ones, and the only thing riding on this is whether an
  // operator can write back.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return { ok: false, reason: 'That does not look like an email address.' }

  const pending = await db.selectFrom('claims')
    .where('business_id', '=', Number(business.id))
    .where('status', '=', 'pending')
    .select(['id'])
    .executeTakeFirst() as { id: number } | undefined

  if (pending)
    return { ok: false, reason: 'Somebody has already asked about this listing and it is being looked at.' }

  await db.insertInto('claims').values({
    uuid: crypto.randomUUID(),
    business_id: Number(business.id),
    status: 'pending',
    claimant_name: name,
    claimant_email: email,
    message,
    decided_at: null,
  } as never).executeTakeFirst()

  const created = await db.selectFrom('claims')
    .where('business_id', '=', Number(business.id))
    .orderBy('id', 'desc')
    .select(['id'])
    .executeTakeFirst() as { id: number } | undefined

  return { ok: true, claimId: Number(created?.id ?? 0) }
}

export interface ClaimRow {
  id: number
  status: string
  businessSlug: string
  businessName: string
  claimantName: string
  claimantEmail: string
  message: string
  createdAt: unknown
  decidedAt: unknown
}

export async function claims(status?: ClaimStatus): Promise<ClaimRow[]> {
  let query = db.selectFrom('claims').orderBy('id', 'desc')

  if (status)
    query = query.where('status', '=', status)

  const rows = await query.selectAll().execute() as Array<Record<string, unknown>>
  const out: ClaimRow[] = []

  for (const row of rows) {
    const business = await db.selectFrom('businesses')
      .where('id', '=', Number(row.business_id))
      .select(['slug', 'name'])
      .executeTakeFirst() as { slug?: string, name?: string } | undefined

    out.push({
      id: Number(row.id),
      status: String(row.status),
      businessSlug: String(business?.slug ?? ''),
      businessName: String(business?.name ?? ''),
      claimantName: String(row.claimant_name ?? ''),
      claimantEmail: String(row.claimant_email ?? ''),
      message: String(row.message ?? ''),
      createdAt: row.created_at ?? null,
      decidedAt: row.decided_at ?? null,
    })
  }

  return out
}

/**
 * Decide a claim.
 *
 * Approving does not hand over the ordering side. A claimed listing stays a
 * listing: it gains an owner who can respond to reviews and ask for corrections,
 * and it still cannot take an order, because becoming a partner in a demo that
 * will never process a real payment would mean nothing.
 */
export async function decideClaim(claimId: number, decision: 'approved' | 'rejected'): Promise<{ ok: boolean, reason?: string }> {
  if (!['approved', 'rejected'].includes(decision))
    return { ok: false, reason: 'A claim is approved or rejected.' }

  const claim = await db.selectFrom('claims')
    .where('id', '=', Number(claimId))
    .select(['id', 'status', 'business_id'])
    .executeTakeFirst() as { id: number, status: string, business_id: number } | undefined

  if (!claim)
    return { ok: false, reason: 'No such claim.' }

  if (claim.status !== 'pending')
    return { ok: false, reason: `That claim was already ${claim.status}.` }

  await db.updateTable('claims')
    .set({ status: decision, decided_at: new Date().toISOString() } as never)
    .where('id', '=', Number(claimId))
    .execute()

  if (decision === 'approved') {
    await db.updateTable('businesses')
      .set({ is_claimed: 1 } as never)
      .where('id', '=', Number(claim.business_id))
      .execute()
  }

  return { ok: true }
}
