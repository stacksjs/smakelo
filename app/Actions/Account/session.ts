import { db } from '@stacksjs/database'
import { existingCustomerFor } from '../Visitor/identity'

/**
 * Who is signed in, and what they could sign in with.
 *
 * Accounts are optional here. Everything on this site works from a browser
 * token: saved places, orders, reviews, shares. Signing in binds that token to
 * an account so the same list appears on a second device, which is the only
 * thing an account actually buys a customer and the only thing it is sold as.
 */

export interface SocialButton {
  name: string
  label: string
  icon: string
}

/**
 * Which providers would work if somebody clicked them.
 *
 * Asked of the framework rather than hardcoded, because a button for a
 * provider with no client secret sends a visitor to an error page that reads
 * to them as this site being broken. No keys, no button, no explanation
 * needed.
 */
export async function socialButtons(): Promise<SocialButton[]> {
  try {
    const { configuredSocialProviders } = await import('@stacksjs/socials')

    const icons: Record<string, string> = {
      google: 'i-hugeicons-google',
      apple: 'i-hugeicons-apple',
      github: 'i-hugeicons-github',
      facebook: 'i-hugeicons-facebook-01',
    }

    return configuredSocialProviders()
      .filter(provider => provider.name === 'google' || provider.name === 'apple')
      .map(provider => ({
        name: String(provider.name),
        label: `Continue with ${String(provider.name).charAt(0).toUpperCase()}${String(provider.name).slice(1)}`,
        icon: icons[String(provider.name)] ?? 'i-hugeicons-user-circle',
      }))
  }
  catch {
    // The package is optional in some builds. A missing social package means
    // no social buttons, which is the same outcome as no keys.
    return []
  }
}

export interface AccountState {
  user: { id: number, name: string, email: string } | null
  providers: SocialButton[]
  /** How much of this browser's activity would follow them to an account. */
  carries: { saved: number, orders: number, reviews: number, shares: number }
}

export async function accountState(userId: number | null, visitorToken: unknown): Promise<AccountState> {
  const user = userId ? await userById(userId) : null

  return {
    user,
    providers: await socialButtons(),
    carries: await visitorActivity(visitorToken),
  }
}

async function userById(id: number): Promise<{ id: number, name: string, email: string } | null> {
  const row = await db.selectFrom('users')
    .where('id', '=', Number(id))
    .select(['id', 'name', 'email'])
    .executeTakeFirst() as { id: number, name?: string, email?: string } | undefined

  if (!row)
    return null

  return { id: Number(row.id), name: String(row.name ?? ''), email: String(row.email ?? '') }
}

/**
 * What this browser has accumulated.
 *
 * Shown on the sign-in page so "create an account" is a proposition with a
 * number attached rather than an instruction. Somebody with nothing saved is
 * told plainly that there is nothing to keep yet.
 */
async function visitorActivity(visitorToken: unknown): Promise<{ saved: number, orders: number, reviews: number, shares: number }> {
  const customerId = await existingCustomerFor(visitorToken)

  if (!customerId)
    return { saved: 0, orders: 0, reviews: 0, shares: 0 }

  const count = async (table: string): Promise<number> => {
    const rows = await db.selectFrom(table as never)
      .where('customer_id', '=', customerId)
      .select(['id'])
      .execute() as Array<{ id: number }>

    return rows.length
  }

  return {
    saved: await count('favorites'),
    orders: await count('orders'),
    reviews: await count('business_reviews'),
    shares: await count('csa_subscriptions'),
  }
}

/**
 * Bind this browser's history to an account.
 *
 * Signing in on a device that has already been used is the normal case, not
 * the exception: somebody orders as a guest, likes it, and makes an account.
 * Their saved places and orders should still be there afterwards, so the
 * visitor's customer row is linked to the user rather than a second empty one
 * being created beside it.
 */
export async function linkVisitorToUser(userId: number, visitorToken: unknown): Promise<{ ok: boolean, linked: boolean }> {
  const customerId = await existingCustomerFor(visitorToken)

  if (!customerId)
    return { ok: true, linked: false }

  const already = await db.selectFrom('customers')
    .where('user_id', '=', Number(userId))
    .select(['id'])
    .executeTakeFirst() as { id: number } | undefined

  // A user already tied to a different customer row keeps it. Merging two
  // histories is a decision with no obviously right answer, and quietly
  // picking one would lose the other.
  if (already && Number(already.id) !== customerId)
    return { ok: true, linked: false }

  await db.updateTable('customers')
    .set({ user_id: Number(userId) } as never)
    .where('id', '=', customerId)
    .execute()

  return { ok: true, linked: true }
}
