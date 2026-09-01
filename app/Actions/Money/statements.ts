import { db } from '@stacksjs/database'

/**
 * What the platform owes, and to whom.
 *
 * Every figure here is a sum over `ledger_entries`, never a recomputation from
 * orders. That is the point of having a ledger: one place decides what a party
 * is owed, and the merchant's statement, the courier's earnings screen and the
 * platform's own books all read it. Recomputing in three places is how three
 * screens end up disagreeing about the same order.
 */

export interface StatementLine {
  orderId: number
  kind: string
  amountCents: number
  description: string
  createdAt: unknown
}

export interface Statement {
  /*
   * Spelled the same as a row of `outstandingBalances`, on purpose. The two
   * endpoints describe the same party and used to name its fields differently
   * - `type`/`id` here, `partyType`/`partyId` there - so a caller handling
   * both had to know which shape it was holding, and one that forgot silently
   * read `undefined`.
   */
  party: { partyType: string, partyId: number, name: string }
  currency: string
  /** Signed sum. Positive is owed to the party. */
  balanceCents: number
  paidOutCents: number
  outstandingCents: number
  byKind: Record<string, number>
  lines: StatementLine[]
}

export type PartyType = 'business' | 'courier' | 'platform' | 'tax'

export async function statementFor(partyType: PartyType, partyId: number): Promise<Statement | null> {
  const name = await partyName(partyType, partyId)

  if (name === null)
    return null

  const rows = await db.selectFrom('ledger_entries')
    .where('party_type', '=', partyType)
    .where('party_id', '=', partyId)
    .orderBy('id', 'desc')
    .selectAll()
    .execute() as Array<Record<string, unknown>>

  const byKind: Record<string, number> = {}
  let balanceCents = 0
  let paidOutCents = 0

  for (const row of rows) {
    const amount = Number(row.amount_cents ?? 0)
    const kind = String(row.kind)

    byKind[kind] = (byKind[kind] ?? 0) + amount
    balanceCents += amount

    // A payout is money that has left, recorded as a negative row. Summing it
    // separately is what lets the screen say "earned, paid, still owed" rather
    // than one number that answers none of those.
    if (kind === 'payout')
      paidOutCents += Math.abs(amount)
  }

  return {
    party: { partyType, partyId, name },
    currency: String(rows[0]?.currency ?? 'usd'),
    balanceCents,
    paidOutCents,
    outstandingCents: balanceCents,
    byKind,
    lines: rows.slice(0, 50).map(row => ({
      orderId: Number(row.order_id ?? 0),
      kind: String(row.kind),
      amountCents: Number(row.amount_cents ?? 0),
      description: String(row.description ?? ''),
      createdAt: row.created_at ?? null,
    })),
  }
}

/**
 * Record a payout.
 *
 * Written as a negative ledger row rather than by clearing the balance,
 * because the history of what was owed and then paid is the part an operator
 * reads when somebody asks where their money went. Clearing a balance answers
 * that question with silence.
 *
 * In this demo nothing moves: Stripe Connect can make the transfer for real
 * (the framework gained `createTransfer` in stacksjs/stacks#2383), but the
 * accounts here belong to invented businesses, so the row is written and the
 * money stays put. The arithmetic is the part worth demonstrating.
 */
export async function recordPayout(
  partyType: 'business' | 'courier',
  partyId: number,
  amountCents: number,
  reference = '',
): Promise<{ ok: boolean, reason?: string, paidCents?: number }> {
  if (!Number.isFinite(amountCents) || amountCents <= 0)
    return { ok: false, reason: 'A payout must be a positive amount.' }

  const statement = await statementFor(partyType, partyId)

  if (!statement)
    return { ok: false, reason: 'No such party.' }

  if (amountCents > statement.outstandingCents)
    return { ok: false, reason: `That is more than the ${statement.outstandingCents} cents outstanding.` }

  await db.insertInto('ledger_entries').values({
    uuid: crypto.randomUUID(),
    order_id: null,
    party_type: partyType,
    party_id: partyId,
    kind: 'payout',
    amount_cents: -Math.round(amountCents),
    currency: statement.currency,
    description: 'Payout',
    external_reference: reference,
  } as never).executeTakeFirst()

  return { ok: true, paidCents: amountCents }
}

/** Everyone the platform owes something to, for the admin view. */
export async function outstandingBalances(): Promise<Array<{
  partyType: string
  partyId: number
  name: string
  balanceCents: number
}>> {
  const rows = await db.selectFrom('ledger_entries')
    .selectAll()
    .execute() as Array<Record<string, unknown>>

  const totals = new Map<string, number>()

  for (const row of rows) {
    const key = `${row.party_type}:${row.party_id}`
    totals.set(key, (totals.get(key) ?? 0) + Number(row.amount_cents ?? 0))
  }

  const balances = []

  for (const [key, balanceCents] of totals) {
    const [partyType = '', rawId] = key.split(':')
    const partyId = Number(rawId)
    const name = await partyName(partyType as PartyType, partyId)

    balances.push({ partyType, partyId, name: name ?? `#${partyId}`, balanceCents })
  }

  return balances.sort((a, b) => b.balanceCents - a.balanceCents)
}

async function partyName(partyType: string, partyId: number): Promise<string | null> {
  if (partyType === 'platform')
    return 'Smakelo'

  // Tax is held, not earned. It gets a statement because "what is sitting here
  // that belongs to the state" is a question somebody eventually asks.
  if (partyType === 'tax')
    return 'Sales tax held for remittance'

  /*
   * An order's delivery money is owed from the moment it is placed, which is
   * before anybody has been assigned to carry it. Those rows sit against
   * courier zero until dispatch reassigns them, and the balance sheet should
   * say what that pile is rather than print a bare `#0` and let a reader guess.
   */
  if (partyType === 'courier' && partyId === 0)
    return 'Awaiting a courier'

  const table = partyType === 'business' ? 'businesses' : 'couriers'

  const row = await db.selectFrom(table as never)
    .where('id', '=', partyId)
    .select(['name'])
    .executeTakeFirst() as { name?: string } | undefined

  return row?.name ? String(row.name) : null
}
