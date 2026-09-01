import { db } from '@stacksjs/database'
import { customerForVisitor, existingCustomerFor } from '../Visitor/identity'

/**
 * Joining, pausing and leaving a farm's season.
 *
 * The whole feature turns on one question: is a box coming this week. Members
 * go away in August, and a farm that reads a holiday as a cancellation loses
 * the member and packs a box nobody collects. So pausing is a real state with
 * a date on it, and every screen reads `nextBoxAt` rather than recomputing a
 * schedule it would get subtly wrong.
 */

export interface PlanRow {
  id: number
  name: string
  description: string
  priceCents: number
  cadence: string
  feeds: string
  /*
    * The day as a number, and no name for it.
    *
    * This used to also carry `dayName`, built from an English constant, which
    * put the language on the wrong side of the wire: the same payload is read
    * by a page that may be rendering in German. The screen names the day from
    * this number and its own locale.
    */
  dayOfWeek: number
  offersDelivery: boolean
}

export async function plansFor(businessSlug: string): Promise<PlanRow[]> {
  const business = await db.selectFrom('businesses')
    .where('slug', '=', String(businessSlug))
    .select(['id'])
    .executeTakeFirst() as { id: number } | undefined

  if (!business)
    return []

  const rows = await db.selectFrom('csa_plans')
    .where('business_id', '=', Number(business.id))
    .where('is_active', '=', 1)
    .orderBy('price_cents', 'asc')
    .selectAll()
    .execute() as Array<Record<string, unknown>>

  return rows.map(row => ({
    id: Number(row.id),
    name: String(row.name),
    description: String(row.description ?? ''),
    priceCents: Number(row.price_cents ?? 0),
    cadence: String(row.cadence),
    feeds: String(row.feeds ?? ''),
    dayOfWeek: Number(row.day_of_week ?? 3),
    offersDelivery: Number(row.offers_delivery) === 1,
  }))
}

export interface JoinInput {
  planId: number
  visitorToken: unknown
  name: string
  fulfilment: 'pickup' | 'delivery'
  deliveryAddress?: string
  note?: string
}

export async function join(input: JoinInput): Promise<{ ok: boolean, subscriptionId?: number, nextBoxAt?: string, reason?: string }> {
  const plan = await db.selectFrom('csa_plans')
    .where('id', '=', Number(input.planId))
    .selectAll()
    .executeTakeFirst() as Record<string, unknown> | undefined

  if (!plan || Number(plan.is_active) !== 1)
    return { ok: false, reason: 'That share is not open.' }

  if (input.fulfilment === 'delivery' && Number(plan.offers_delivery) !== 1)
    return { ok: false, reason: 'This farm does not deliver. The box is collected.' }

  if (input.fulfilment === 'delivery' && !String(input.deliveryAddress ?? '').trim())
    return { ok: false, reason: 'Where should the box go?' }

  const customerId = await customerForVisitor(input.visitorToken, input.name)

  if (!customerId)
    return { ok: false, reason: 'Could not identify this browser.' }

  const existing = await db.selectFrom('csa_subscriptions')
    .where('csa_plan_id', '=', Number(plan.id))
    .where('customer_id', '=', customerId)
    .where('status', '!=', 'cancelled')
    .select(['id'])
    .executeTakeFirst() as { id: number } | undefined

  if (existing)
    return { ok: false, reason: 'You are already a member of this share.' }

  const nextBoxAt = nextPackingDay(Number(plan.day_of_week ?? 3))

  await db.insertInto('csa_subscriptions').values({
    uuid: crypto.randomUUID(),
    csa_plan_id: Number(plan.id),
    customer_id: customerId,
    status: 'active',
    fulfilment: input.fulfilment,
    delivery_address: String(input.deliveryAddress ?? '').slice(0, 255),
    next_box_at: nextBoxAt,
    paused_until: '',
    boxes_delivered: 0,
    note: String(input.note ?? '').slice(0, 500),
  } as never).executeTakeFirst()

  const created = await db.selectFrom('csa_subscriptions')
    .where('csa_plan_id', '=', Number(plan.id))
    .where('customer_id', '=', customerId)
    .orderBy('id', 'desc')
    .select(['id'])
    .executeTakeFirst() as { id: number } | undefined

  return { ok: true, subscriptionId: Number(created?.id ?? 0), nextBoxAt }
}

export interface MembershipRow {
  id: number
  status: string
  planName: string
  farmName: string
  farmSlug: string
  priceCents: number
  cadence: string
  fulfilment: string
  nextBoxAt: string
  pausedUntil: string
  boxesDelivered: number
}

export async function membershipsFor(visitorToken: unknown): Promise<MembershipRow[]> {
  const customerId = await existingCustomerFor(visitorToken)

  if (!customerId)
    return []

  const rows = await db.selectFrom('csa_subscriptions')
    .where('customer_id', '=', customerId)
    .orderBy('id', 'desc')
    .selectAll()
    .execute() as Array<Record<string, unknown>>

  const out: MembershipRow[] = []

  for (const row of rows) {
    const plan = await db.selectFrom('csa_plans')
      .where('id', '=', Number(row.csa_plan_id))
      .selectAll()
      .executeTakeFirst() as Record<string, unknown> | undefined

    const farm = plan
      ? await db.selectFrom('businesses').where('id', '=', Number(plan.business_id)).select(['name', 'slug']).executeTakeFirst() as { name?: string, slug?: string } | undefined
      : undefined

    out.push({
      id: Number(row.id),
      status: String(row.status),
      planName: String(plan?.name ?? ''),
      farmName: String(farm?.name ?? ''),
      farmSlug: String(farm?.slug ?? ''),
      priceCents: Number(plan?.price_cents ?? 0),
      cadence: String(plan?.cadence ?? ''),
      fulfilment: String(row.fulfilment),
      nextBoxAt: String(row.next_box_at ?? ''),
      pausedUntil: String(row.paused_until ?? ''),
      boxesDelivered: Number(row.boxes_delivered ?? 0),
    })
  }

  return out
}

/**
 * Pause, resume, or leave.
 *
 * Pausing takes a date because "pause indefinitely" is how a farm ends up
 * holding a share nobody has told them about. Resuming clears the date and
 * moves the next box to the following packing day, so a member coming back
 * mid-week is not told their box arrived yesterday.
 */
export async function setMembershipState(
  subscriptionId: number,
  visitorToken: unknown,
  action: 'pause' | 'resume' | 'cancel',
  until = '',
): Promise<{ ok: boolean, status?: string, nextBoxAt?: string, reason?: string }> {
  const customerId = await existingCustomerFor(visitorToken)

  if (!customerId)
    return { ok: false, reason: 'Could not identify this browser.' }

  const row = await db.selectFrom('csa_subscriptions')
    .where('id', '=', Number(subscriptionId))
    .selectAll()
    .executeTakeFirst() as Record<string, unknown> | undefined

  if (!row)
    return { ok: false, reason: 'No such membership.' }

  // Somebody else's membership is not yours to pause, even in a demo where the
  // identity is only a browser token.
  if (Number(row.customer_id) !== customerId)
    return { ok: false, reason: 'That membership belongs to someone else.' }

  if (String(row.status) === 'cancelled')
    return { ok: false, reason: 'That membership has already ended.' }

  const plan = await db.selectFrom('csa_plans')
    .where('id', '=', Number(row.csa_plan_id))
    .select(['day_of_week'])
    .executeTakeFirst() as { day_of_week?: number } | undefined

  if (action === 'cancel') {
    await db.updateTable('csa_subscriptions')
      .set({ status: 'cancelled', next_box_at: '', paused_until: '' } as never)
      .where('id', '=', Number(row.id))
      .execute()

    return { ok: true, status: 'cancelled' }
  }

  if (action === 'pause') {
    const date = String(until ?? '').slice(0, 10)

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      return { ok: false, reason: 'Pause until when? A date, please.' }

    await db.updateTable('csa_subscriptions')
      .set({ status: 'paused', paused_until: date, next_box_at: '' } as never)
      .where('id', '=', Number(row.id))
      .execute()

    return { ok: true, status: 'paused' }
  }

  const nextBoxAt = nextPackingDay(Number(plan?.day_of_week ?? 3))

  await db.updateTable('csa_subscriptions')
    .set({ status: 'active', paused_until: '', next_box_at: nextBoxAt } as never)
    .where('id', '=', Number(row.id))
    .execute()

  return { ok: true, status: 'active', nextBoxAt }
}

/**
 * The next day the farm packs, as YYYY-MM-DD.
 *
 * Today does not count: a member who joins on Wednesday morning is not getting
 * into a box that was packed at dawn.
 *
 * Formatted from local parts rather than `toISOString`, which converts to UTC
 * first. West of Greenwich any evening is already tomorrow in UTC, so the
 * first version of this told every member their Wednesday box came on
 * Thursday - a wrong answer to the only question this feature exists to
 * answer, and one that would have looked like an off-by-one in the schedule
 * rather than a timezone bug.
 */
export function nextPackingDay(dayOfWeek: number, from = new Date()): string {
  const date = new Date(from.getTime())
  const ahead = (dayOfWeek - date.getDay() + 7) % 7

  date.setDate(date.getDate() + (ahead === 0 ? 7 : ahead))

  return localDate(date)
}

/** YYYY-MM-DD in the local calendar, which is the one the farm packs by. */
function localDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${date.getFullYear()}-${month}-${day}`
}

export interface SeasonPlan {
  id: number
  name: string
  priceCents: number
  cadence: string
  dayOfWeek: number
  /** Members on this plan, by state. */
  active: number
  paused: number
  cancelled: number
  /** What the active members are worth per box, in cents. */
  perBoxCents: number
}

export interface SeasonMember {
  id: number
  name: string
  planName: string
  status: string
  fulfilment: string
  nextBoxAt: string
  pausedUntil: string
  boxesDelivered: number
}

export interface Season {
  plans: SeasonPlan[]
  members: SeasonMember[]
  /** Boxes to pack for the next packing day, which is the number a farm acts on. */
  boxesNext: number
  activeMembers: number
  pausedMembers: number
}

/**
 * A farm's own view of its season.
 *
 * The customer side of this feature has been here since the shares page: who
 * has a box, when the next one comes, and whether it is paused. The farm side
 * was not, which made `shares.manage` a permission that opened nothing - and
 * left the one operator on this platform whose business is a subscription with
 * no way to see the subscriptions.
 *
 * The number a farm actually acts on is at the top: how many boxes to pack.
 * Everything else on the screen explains that number.
 */
export async function seasonFor(businessSlug: string): Promise<Season | null> {
  const business = await db.selectFrom('businesses')
    .where('slug', '=', String(businessSlug))
    .select(['id'])
    .executeTakeFirst() as { id: number } | undefined

  if (!business)
    return null

  const plans = await db.selectFrom('csa_plans')
    .where('business_id', '=', Number(business.id))
    .orderBy('price_cents', 'asc')
    .selectAll()
    .execute() as Array<Record<string, unknown>>

  if (plans.length === 0)
    return { plans: [], members: [], boxesNext: 0, activeMembers: 0, pausedMembers: 0 }

  const byPlan = new Map(plans.map(plan => [Number(plan.id), plan]))

  const subscriptions = await db.selectFrom('csa_subscriptions')
    .where('csa_plan_id', 'in', [...byPlan.keys()])
    .orderBy('id', 'desc')
    .selectAll()
    .execute() as Array<Record<string, unknown>>

  /*
   * The member's name, from the customer row.
   *
   * One query for the lot rather than one per subscription: a farm with a
   * hundred members is a farm this screen should still open for.
   */
  const customerIds = [...new Set(subscriptions.map(row => Number(row.customer_id)).filter(Boolean))]

  const customers = customerIds.length === 0
    ? []
    : await db.selectFrom('customers')
        .where('id', 'in', customerIds)
        .select(['id', 'name'])
        .execute() as Array<{ id: number, name: string }>

  const nameById = new Map(customers.map(row => [Number(row.id), String(row.name ?? '')]))

  const counts = new Map<number, { active: number, paused: number, cancelled: number }>()

  for (const id of byPlan.keys())
    counts.set(id, { active: 0, paused: 0, cancelled: 0 })

  const members: SeasonMember[] = []

  for (const row of subscriptions) {
    const plan = byPlan.get(Number(row.csa_plan_id))
    const status = String(row.status)
    const tally = counts.get(Number(row.csa_plan_id))

    if (tally && (status === 'active' || status === 'paused' || status === 'cancelled'))
      tally[status]++

    members.push({
      id: Number(row.id),
      name: nameById.get(Number(row.customer_id)) || '',
      planName: String(plan?.name ?? ''),
      status,
      fulfilment: String(row.fulfilment),
      nextBoxAt: String(row.next_box_at ?? ''),
      pausedUntil: String(row.paused_until ?? ''),
      boxesDelivered: Number(row.boxes_delivered ?? 0),
    })
  }

  const planRows: SeasonPlan[] = plans.map((plan) => {
    const tally = counts.get(Number(plan.id)) ?? { active: 0, paused: 0, cancelled: 0 }

    return {
      id: Number(plan.id),
      name: String(plan.name),
      priceCents: Number(plan.price_cents ?? 0),
      cadence: String(plan.cadence),
      dayOfWeek: Number(plan.day_of_week ?? 3),
      active: tally.active,
      paused: tally.paused,
      cancelled: tally.cancelled,
      perBoxCents: tally.active * Number(plan.price_cents ?? 0),
    }
  })

  /*
   * Boxes to pack: the active members, not the subscriptions.
   *
   * A paused share is the whole reason this count is not just "how many people
   * signed up" - somebody away in August is still a member and is not a box.
   */
  return {
    plans: planRows,
    members: members.filter(member => member.status !== 'cancelled'),
    boxesNext: planRows.reduce((total, plan) => total + plan.active, 0),
    activeMembers: planRows.reduce((total, plan) => total + plan.active, 0),
    pausedMembers: planRows.reduce((total, plan) => total + plan.paused, 0),
  }
}
