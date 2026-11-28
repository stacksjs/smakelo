import { db } from '@stacksjs/database'
import { customerIdsForBuyer, existingCustomerFor } from '../Visitor/identity'

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
    carries: await visitorActivity(visitorToken, user?.id),
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
async function visitorActivity(visitorToken: unknown, userId?: number): Promise<{ saved: number, orders: number, reviews: number, shares: number }> {
  const customerId = await existingCustomerFor(visitorToken)
  const buyerIds = await customerIdsForBuyer(visitorToken, userId)

  const count = async (table: string, ids: number[]): Promise<number> => {
    if (ids.length === 0)
      return 0

    const rows = await db.selectFrom(table as never)
      .where('customer_id', 'in', ids)
      .select(['id'])
      .execute() as Array<{ id: number }>

    return rows.length
  }
  const browserIds = customerId === null ? [] : [customerId]

  return {
    saved: await count('favorites', browserIds),
    orders: await count('orders', buyerIds),
    reviews: await count('business_reviews', buyerIds),
    shares: await count('csa_subscriptions', browserIds),
  }
}

/** Attach unclaimed guest history without reassigning another account's data. */
export async function linkVisitorToUser(userId: number, visitorToken: unknown): Promise<{ ok: boolean, linked: boolean }> {
  const customerId = await existingCustomerFor(visitorToken)

  if (!customerId)
    return { ok: true, linked: false }

  const updated = await db.updateTable('customers')
    .set({ user_id: userId } as never)
    .where('id', '=', customerId)
    .where('user_id', 'is', null)
    .returning(['id'])
    .executeTakeFirst()

  return { ok: true, linked: Boolean(updated) }
}
