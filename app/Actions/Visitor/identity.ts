import { db } from '@stacksjs/database'

/**
 * Who is doing this, in an app with no accounts.
 *
 * Smakelo has no sign-in: inventing one for a demo nobody can register for
 * would be theatre. But a review, a saved place and a helpful vote all need an
 * owner, or the button either lies about its state or lets one person press it
 * forever. So a browser mints a random token, keeps it, and sends it back; the
 * first time it does something that needs an owner, a customer row is created
 * for it.
 *
 * The token is supplied by the client and is therefore trivially forgeable.
 * That is a real limitation, stated rather than hidden: it identifies a
 * browser, not a person, and it is exactly as trustworthy as the demo needs.
 * A deployment with accounts resolves the customer from the session and none
 * of the rest of this changes.
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

  const email = `visitor-${token.toLowerCase()}@demo.smakelo.invalid`

  const existing = await db.selectFrom('customers')
    .where('email', '=', email)
    .select(['id'])
    .executeTakeFirst() as { id: number } | undefined

  if (existing)
    return Number(existing.id)

  await db.insertInto('customers').values({
    uuid: crypto.randomUUID(),
    name: cleanName(name),
    // `.invalid` is reserved by RFC 2606 and can never resolve, so nothing here
    // can accidentally send mail to a real address.
    email,
    phone: '',
    status: 'Active',
    avatar: '',
    total_spent: 0,
  } as never).executeTakeFirst()

  const created = await db.selectFrom('customers')
    .where('email', '=', email)
    .select(['id'])
    .executeTakeFirst() as { id: number } | undefined

  return created ? Number(created.id) : null
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
