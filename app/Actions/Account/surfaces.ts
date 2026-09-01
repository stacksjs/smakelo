import type { Permission } from '../../Permissions'
import type { OperatedBusiness, Viewer } from './access'
import { db } from '@stacksjs/database'
import { permissions } from '../../Permissions'
import { businessesFor, courierFor, isAdmin } from './access'

/**
 * What a signed-in person can actually open.
 *
 * Every operator screen used to be reached by knowing a URL - `/manage`
 * needed `?business=marisol-cocina`, `/courier` needed an id off a list of
 * every courier in the system. That works for somebody reading the source and
 * for nobody else, and with the routes now behind a team it does not work at
 * all: guessing a slug gets a 403.
 *
 * So the account answers the question instead. One call says who you are, what
 * you run, and which screens that entitles you to, and the pages resolve
 * themselves from it: a merchant with one restaurant lands on it, one with two
 * is offered both.
 */

export interface Surface {
  /** What to call it on a link. */
  key: string
  href: string
  /** Which business it is about, when it is about one. */
  businessSlug?: string
}

export interface MeState {
  user: { id: number, name: string, email: string }
  roles: string[]
  permissions: Permission[]
  businesses: OperatedBusiness[]
  courier: { id: number, name: string } | null
  /** The screens to offer, already filtered to what this person may open. */
  surfaces: Surface[]
}

/**
 * Everything the operator surfaces need, in one call.
 *
 * The permission list is included because the pages branch on it - a farm's
 * manage screen shows shares and a restaurant's does not - and shipping the
 * answer beats every page re-deriving it from a role name.
 */
export async function meState(viewer: Viewer | null): Promise<MeState | null> {
  if (!viewer)
    return null

  const businesses = await businessesFor(viewer)
  const courier = await courierFor(viewer)

  const granted = new Set<Permission>()

  for (const role of viewer.roles)
    for (const permission of permissions.forRole(role))
      granted.add(permission)

const surfaces: Surface[] = []

  /*
   * Grouped by business rather than by screen.
   *
   * Somebody who runs two places reads this list as two groups of four, not as
   * four pairs: the question they are answering is "which of my restaurants",
   * and only then "which screen". Everything that is not about one business -
   * the courier screen, operations, the whole balance sheet - comes after.
   */
  for (const business of businesses) {
    if (granted.has('business.board'))
      surfaces.push({ key: 'kitchen', href: `/kitchen?business=${business.slug}`, businessSlug: business.slug })

    if (granted.has('business.manage'))
      surfaces.push({ key: 'manage', href: `/manage?business=${business.slug}`, businessSlug: business.slug })

    if (granted.has('business.codes'))
      surfaces.push({ key: 'codes', href: `/codes/${business.slug}`, businessSlug: business.slug })

    // A business's own statement, unless this person reads every party's - in
    // which case one link to the balance sheet says more than one per place.
    if (granted.has('earnings.read.own') && !granted.has('earnings.read.all'))
      surfaces.push({ key: 'earnings', href: `/earnings?party=business:${business.id}`, businessSlug: business.slug })
  }

  if (courier) {
    surfaces.push({ key: 'courier', href: `/courier?courier=${courier.id}` })

    if (granted.has('earnings.read.own') && !granted.has('earnings.read.all'))
      surfaces.push({ key: 'earnings', href: `/earnings?party=courier:${courier.id}` })
  }

  if (granted.has('earnings.read.all'))
    surfaces.push({ key: 'earnings', href: '/earnings' })

  if (granted.has('guards.read'))
    surfaces.push({ key: 'admin', href: '/admin' })

  if (granted.has('claims.read'))
    surfaces.push({ key: 'claims', href: '/claims' })

  return {
    user: { id: viewer.id, name: viewer.name, email: viewer.email },
    roles: viewer.roles,
    permissions: [...granted],
    businesses,
    courier,
    surfaces,
  }
}

/**
 * The one password every seeded account shares.
 *
 * Published with the accounts, because all of them are invented and the point
 * is to be able to open the merchant, farm, courier and operations screens
 * without being handed anything out of band. The seeder imports it from here
 * so the sign-in page cannot end up offering a password that was changed in
 * the seeder and nowhere else.
 */
export const DEMO_PASSWORD = 'smakelo-demo'

export interface DemoAccount {
  email: string
  name: string
  role: string
  /** What they run, so the list explains itself. */
  runs: string[]
  isAdmin: boolean
}

/**
 * The accounts this demo was seeded with.
 *
 * Published, deliberately. Every account here is invented, on a `.test` domain
 * that cannot receive mail, and they exist so somebody can look at the
 * merchant, farm, courier and operations screens without being handed
 * credentials out of band. A site with real customers would not have this
 * endpoint; a demonstration that hides its own front door is not one.
 *
 * Read from the database rather than from the seeder's list, so it says what
 * is actually there.
 */
export async function demoAccounts(): Promise<DemoAccount[]> {
  const users = await db.selectFrom('users')
    .select(['id', 'name', 'email'])
    .execute() as Array<{ id: number, name: string, email: string }>

  const accounts: DemoAccount[] = []

  for (const user of users) {
    if (!String(user.email).endsWith('.test'))
      continue

    const viewer = await import('./access').then(module => module.viewerFor(Number(user.id)))

    if (!viewer)
      continue

    const businesses = await businessesFor(viewer)
    const courier = await courierFor(viewer)

    accounts.push({
      email: String(user.email),
      name: String(user.name),
      role: viewer.roles[0] ?? 'customer',
      runs: [...businesses.map(business => business.name), ...(courier ? [courier.name] : [])],
      isAdmin: isAdmin(viewer),
    })
  }

  // Operations first, then the people who run something, then everyone else.
  const order = ['admin', 'merchant', 'farmer', 'courier', 'customer']

  return accounts.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || a.name.localeCompare(b.name))
}
