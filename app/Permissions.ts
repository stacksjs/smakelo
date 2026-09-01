import { defineRolePermissions } from '@stacksjs/auth'

/**
 * Who may do what, by role.
 *
 * Two different questions decide whether somebody may act on this site, and
 * keeping them apart is what makes the answer explainable:
 *
 *   - **What kind of account is this?** A role, held by the user, listed here.
 *     It answers "may a merchant edit a menu at all", and the answer is the
 *     same for every merchant.
 *   - **Whose menu is it?** A team, and whether this user is in it. A business
 *     belongs to a team (`businesses.team_id`) and a user is a member of it
 *     (`team_members`), which is the framework's own tenancy primitive.
 *
 * A permission alone is never enough for anything a business owns.
 * `app/Actions/Account/access.ts` is where the two are checked together, and
 * every route that touches a business goes through it.
 *
 * The grants live in source rather than in the `role_permissions` table on
 * purpose. Which verbs a merchant has is a statement about how this app works
 * - it belongs in a diff and a review, not in a row somebody edited on a
 * Tuesday. Role *assignment* is data and does live in the database, through
 * the framework's RBAC tables.
 */

export type Role = 'admin' | 'merchant' | 'farmer' | 'courier' | 'customer'

export type Permission =
  /* The operations surface. */
  | 'guards.read'
  | 'listings.curate'
  | 'claims.read'
  | 'claims.decide'
  /* A business, always in combination with membership of the team that owns it. */
  | 'business.manage'
  | 'business.board'
  | 'business.codes'
  | 'shares.manage'
  /* Money. `own` is the party you are; `all` is everybody's. */
  | 'earnings.read.own'
  | 'earnings.read.all'
  | 'payouts.record'
  /* Carrying orders. */
  | 'courier.console'
  /* Being a person on the site, which every account also is. */
  | 'orders.place'
  | 'reviews.write'
  | 'favorites.write'

/** What anybody with an account can do, whatever else they are. */
const EVERYONE = ['orders.place', 'reviews.write', 'favorites.write'] as const

/** Running a business: the menu, the board, the table codes, your own money. */
const RUNS_A_BUSINESS = [
  'business.manage',
  'business.board',
  'business.codes',
  'earnings.read.own',
] as const

export const permissions = defineRolePermissions<Role, Permission>({
  /*
   * The operations team. Reads every guard, curates any listing, decides
   * claims, sees every party's ledger and records payouts. Deliberately not
   * given `business.manage`: an operator who needs to edit a menu joins that
   * business's team, which leaves a membership row saying so.
   */
  admin: [
    'guards.read',
    'listings.curate',
    'claims.read',
    'claims.decide',
    'earnings.read.all',
    'earnings.read.own',
    'payouts.record',
    ...EVERYONE,
  ],

  merchant: [...RUNS_A_BUSINESS, ...EVERYONE],

  /*
   * A farm runs a business and also sells the season: plans, subscriptions,
   * and the boxes that come off them. Everything a merchant has, plus that.
   */
  farmer: [...RUNS_A_BUSINESS, 'shares.manage', ...EVERYONE],

  courier: ['courier.console', 'earnings.read.own', ...EVERYONE],

  customer: [...EVERYONE],
})

/** Every role, in the order a list of accounts reads best. */
export const ROLES: Role[] = ['admin', 'merchant', 'farmer', 'courier', 'customer']

/** What each role is, for the seeder and for anything that lists them. */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: 'Operations. Guard checks, listing curation, claims, every ledger, payouts.',
  merchant: 'Runs a restaurant, cafe, bakery, bar or shop: menu, hours, orders board, table codes, own earnings.',
  farmer: 'Runs a farm: everything a merchant has, plus CSA plans and the shares people take.',
  courier: 'Carries orders: shifts, position, the stop in hand, own earnings.',
  customer: 'Orders, saves places, writes reviews, takes a share.',
}

/** Every permission, and what it lets somebody do. */
export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  'guards.read': 'Read the operations page: whether the site is keeping its own promises.',
  'listings.curate': 'Take a listing down, or put it back.',
  'claims.read': 'Read the claims people file about their own listing.',
  'claims.decide': 'Approve or reject a claim.',
  'business.manage': 'Edit a business you operate: its menu, its hours, how it takes orders.',
  'business.board': 'Work the orders board of a business you operate.',
  'business.codes': 'Print the table codes of a business you operate.',
  'shares.manage': 'See and run the season of a farm you operate: the plans, the members, the boxes to pack.',
  'earnings.read.own': 'Read the statement of a party you are.',
  'earnings.read.all': 'Read every party\'s statement.',
  'payouts.record': 'Record a payout against a balance.',
  'courier.console': 'Work the courier screen: shifts, position, the stop in hand.',
  'orders.place': 'Place an order.',
  'reviews.write': 'Write a review of somewhere you ordered from.',
  'favorites.write': 'Save a place.',
}

/** Every permission this app defines, in the order above. */
export const PERMISSIONS = Object.keys(PERMISSION_DESCRIPTIONS) as Permission[]

/**
 * The guard these roles belong to.
 *
 * One guard, because this app has one kind of session. The framework supports
 * several and every RBAC call takes the name, so it is spelled once here
 * rather than defaulted at twenty call sites.
 */
export const GUARD = 'web'
