import type { Permission, Role } from '../../Permissions'
import { db } from '@stacksjs/database'
import { permissions, ROLES } from '../../Permissions'

/**
 * Whether somebody may do a thing, and to which business.
 *
 * Every operator surface asks here, and it is the only place that knows how
 * the two halves fit together:
 *
 *   - the **role** the user holds, from the framework's RBAC tables, which
 *     says what kind of verbs they have at all;
 *   - the **team** that owns a business, which says whose menu it is.
 *
 * A merchant has `business.manage` in the abstract and can still only reach
 * the one business their team owns. Asking those separately is how a route
 * ends up checking the first and forgetting the second, so nothing here
 * returns a permission without also taking the business it applies to.
 */

export interface Viewer {
  id: number
  name: string
  email: string
  /** Every role this user holds. Most hold one; nothing requires that. */
  roles: Role[]
  /** The teams they belong to, and what they are within each. */
  teams: Array<{ teamId: number, role: string }>
}

/**
 * Load a user with everything an access decision needs, in two queries.
 *
 * Returns null for an unknown id, which is the same answer as not being signed
 * in - a token for a deleted user should not be more powerful than no token.
 */
export async function viewerFor(userId: number | null | undefined): Promise<Viewer | null> {
  if (!userId)
    return null

  const user = await db.selectFrom('users')
    .where('id', '=', Number(userId))
    .select(['id', 'name', 'email'])
    .executeTakeFirst() as { id: number, name: string, email: string } | undefined

  if (!user)
    return null

  /*
   * Two queries rather than a join, which is how the rest of this codebase
   * reads: the id set is small, and a join here would be the only one in the
   * app.
   */
  const assignments = await db.selectFrom('user_roles')
    .where('user_id', '=', Number(userId))
    .select(['role_id'])
    .execute() as Array<{ role_id: number }>

  const roleRows = assignments.length === 0
    ? []
    : await db.selectFrom('roles')
        .where('id', 'in', assignments.map(row => Number(row.role_id)))
        .select(['name'])
        .execute() as Array<{ name: string }>

  const teamRows = await db.selectFrom('team_members')
    .where('user_id', '=', Number(userId))
    .where('status', '=', 'active')
    .select(['team_id', 'role'])
    .execute() as Array<{ team_id: number, role: string }>

  return {
    id: Number(user.id),
    name: String(user.name),
    email: String(user.email),
    // Anything not in `ROLES` is a row this app does not know about; dropping
    // it is safer than carrying an unknown string into a permission check.
    roles: roleRows.map(row => row.name as Role).filter(name => ROLES.includes(name)),
    teams: teamRows.map(row => ({ teamId: Number(row.team_id), role: String(row.role) })),
  }
}

/** Whether any role this user holds carries the permission. */
export function can(viewer: Viewer | null, permission: Permission): boolean {
  if (!viewer)
    return false

  return viewer.roles.some(role => permissions.roleCan(role, permission))
}

/** The operations team, in the one place worth naming it. */
export function isAdmin(viewer: Viewer | null): boolean {
  return viewer?.roles.includes('admin') ?? false
}

/**
 * Whether this user may act on this business.
 *
 * Both halves, always: the permission says the verb is theirs, the team says
 * the business is. An admin is not exempt - an operator who needs to edit a
 * menu joins that business's team, which leaves a row saying they did.
 */
export async function canActOnBusiness(
  viewer: Viewer | null,
  businessSlug: string,
  permission: Permission,
): Promise<boolean> {
  if (!can(viewer, permission))
    return false

  return await operates(viewer, businessSlug)
}

/** Whether the business belongs to a team this user is in. */
export async function operates(viewer: Viewer | null, businessSlug: string): Promise<boolean> {
  if (!viewer || viewer.teams.length === 0)
    return false

  const business = await db.selectFrom('businesses')
    .where('slug', '=', String(businessSlug))
    .select(['team_id'])
    .executeTakeFirst() as { team_id: number | null } | undefined

  if (!business?.team_id)
    return false

  return viewer.teams.some(team => team.teamId === Number(business.team_id))
}

export interface OperatedBusiness {
  id: number
  slug: string
  name: string
  type: string
  /** Where it is, so a chooser can tell two of somebody's places apart. */
  city: string
  /** What this user is within the team that owns it. */
  role: string
}

/**
 * The businesses this user operates, in the order a switcher should list them.
 *
 * The reason the operator pages no longer need `?business=` in the URL: a
 * merchant with one restaurant is taken to it, and one with three is offered
 * the three. Sorted by name so the list does not reorder itself between
 * renders.
 */
export async function businessesFor(viewer: Viewer | null): Promise<OperatedBusiness[]> {
  if (!viewer || viewer.teams.length === 0)
    return []

  const byTeam = new Map(viewer.teams.map(team => [team.teamId, team.role]))

  const rows = await db.selectFrom('businesses')
    .where('deleted_at', 'is', null)
    .where('team_id', 'in', [...byTeam.keys()])
    .select(['id', 'slug', 'name', 'type', 'city', 'team_id'])
    .execute() as Array<{ id: number, slug: string, name: string, type: string, city: string, team_id: number }>

  return rows
    .map(row => ({
      id: Number(row.id),
      slug: String(row.slug),
      name: String(row.name),
      type: String(row.type),
      city: String(row.city ?? ''),
      role: byTeam.get(Number(row.team_id)) ?? 'member',
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * The courier record this user is, if they are one.
 *
 * A courier screen is about a person rather than a business, so it resolves
 * through `couriers.user_id` rather than through a team.
 */
export async function courierFor(viewer: Viewer | null): Promise<{ id: number, name: string } | null> {
  if (!can(viewer, 'courier.console'))
    return null

  const row = await db.selectFrom('couriers')
    .where('user_id', '=', Number(viewer?.id))
    .select(['id', 'name'])
    .executeTakeFirst() as { id: number, name: string } | undefined

  return row ? { id: Number(row.id), name: String(row.name) } : null
}

/**
 * Whether this user may read a party's statement.
 *
 * `earnings.read.all` sees everybody. Otherwise a party is yours if it is the
 * courier you are, or a business your team owns. The platform's and the tax
 * pile's statements are nobody's but operations'.
 */
export async function canReadStatement(
  viewer: Viewer | null,
  partyType: string,
  partyId: number,
): Promise<boolean> {
  if (can(viewer, 'earnings.read.all'))
    return true

  if (!can(viewer, 'earnings.read.own') || !viewer)
    return false

  if (partyType === 'courier') {
    const courier = await courierFor(viewer)

    return courier?.id === Number(partyId)
  }

  if (partyType === 'business') {
    const business = await db.selectFrom('businesses')
      .where('id', '=', Number(partyId))
      .select(['slug'])
      .executeTakeFirst() as { slug: string } | undefined

    return business ? await operates(viewer, String(business.slug)) : false
  }

  return false
}
