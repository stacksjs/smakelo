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
  /** Whether clicking it would actually complete. */
  configured: boolean
}

/** The two we offer, in the order they belong in. */
const SOCIAL_PROVIDERS = [
  { name: 'google', label: 'Continue with Google', icon: 'i-hugeicons-google' },
  { name: 'apple', label: 'Continue with Apple', icon: 'i-hugeicons-apple' },
]

/**
 * The sign-in buttons, and which of them would work if somebody clicked.
 *
 * Both are always returned. Which providers a site offers is a fact about the
 * site, and a sign-in page that renders a different set of buttons depending
 * on which secrets happen to be present is one that looks broken in exactly
 * the deployment where something is: keys missing in production is the case
 * you most want to be able to see, and hiding the buttons hides it.
 *
 * `configured` is what the page needs to avoid the other failure - a live
 * button that hands somebody to an error page reading as this site's fault.
 * Rendered, plainly unavailable, and not clickable.
 */
export async function socialButtons(): Promise<SocialButton[]> {
  const configured = await configuredNames()

  return SOCIAL_PROVIDERS.map(provider => ({ ...provider, configured: configured.has(provider.name) }))
}

async function configuredNames(): Promise<Set<string>> {
  try {
    const { configuredSocialProviders } = await import('@stacksjs/socials')

    return new Set(configuredSocialProviders().map(provider => String(provider.name)))
  }
  catch {
    // The package is optional in some builds. Missing is the same outcome as
    // present with no keys: nothing here can be completed.
    return new Set()
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
