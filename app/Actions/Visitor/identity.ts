import { db, sqliteWriteOptions } from '@stacksjs/database'

/**
 * Guest activity follows the random browser token. An authenticated user owns
 * their account customer and any guest customer records linked at sign-in.
 */
/** Long enough not to collide, short enough to store in a cookie. */
const TOKEN_PATTERN = /^[a-z0-9]{16,64}$/i

export function isVisitorToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_PATTERN.test(token)
}

/**
 * The customer row for a browser, created on first need.
 *
 * `name` is used only when the row is being created, so a person who types a
 * different display name on their second review does not silently rename the
 * author of their first.
 */
export async function customerForVisitor(token: unknown, name = 'Guest'): Promise<number | null> {
  if (!isVisitorToken(token))
    return null

  return await findOrCreateCustomer(`visitor-${token.toLowerCase()}@demo.smakelo.invalid`, name)
}

/** The customer used for new orders by an authenticated account. */
export async function customerForAccount(userId: number): Promise<number | null> {
  const user = await db.selectFrom('users')
    .where('id', '=', userId)
    .select(['name'])
    .executeTakeFirst() as { name: string } | undefined

  return user
    ? await findOrCreateCustomer(`account-${userId}@demo.smakelo.invalid`, user.name, userId)
    : null
}

export async function customerIdsForBuyer(visitorToken: unknown, userId?: number | null): Promise<number[]> {
  if (userId) {
    const rows = await db.selectFrom('customers')
      .where('user_id', '=', userId)
      .select(['id'])
      .execute() as Array<{ id: number }>

    return rows.map(row => Number(row.id))
  }

  const guest = await existingCustomerFor(visitorToken)
  return guest === null ? [] : [guest]
}

async function findOrCreateCustomer(email: string, name: string, userId?: number): Promise<number | null> {
  return await db.transaction(async () => {
    const existing = await db.selectFrom('customers').where('email', '=', email).select(['id'])
      .executeTakeFirst() as { id: number } | undefined

    if (existing)
      return Number(existing.id)

    const created = await db.insertInto('customers').values({
      uuid: crypto.randomUUID(),
      name: cleanName(name),
      email,
      user_id: userId ?? null,
      phone: '',
      status: 'Active',
      avatar: '',
      total_spent: 0,
    } as never).returning(['id']).executeTakeFirst() as { id: number } | undefined

    return created ? Number(created.id) : null
  }, sqliteWriteOptions())
}

/** The row, if this browser has one, without creating it. */
export async function existingCustomerFor(token: unknown): Promise<number | null> {
  if (!isVisitorToken(token))
    return null

  const row = await db.selectFrom('customers')
    .where('email', '=', `visitor-${token.toLowerCase()}@demo.smakelo.invalid`)
    .select(['id'])
    .executeTakeFirst() as { id: number } | undefined

  return row ? Number(row.id) : null
}

function cleanName(name: string): string {
  const trimmed = String(name ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)

  return trimmed.length >= 2 ? trimmed : 'Guest'
}
