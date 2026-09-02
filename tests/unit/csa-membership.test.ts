import { describe, expect, test } from 'bun:test'
import { join, membershipsFor, plansFor, setMembershipState } from '../../app/Actions/Csa/membership'
import { assertDatabaseCount, assertDatabaseHas, factory, refreshDatabase } from '../support/database'

/**
 * Joining and leaving a farm share.
 *
 * A subscription rather than an order: it recurs, it can be paused, and the
 * only identity behind it is a browser token. That last part is why the
 * ownership checks here matter more than they look - `setMembershipState`
 * takes a subscription id from a request, and without checking whose it is,
 * anybody could pause or cancel anybody's box by counting upwards.
 *
 * `nextPackingDay` already has tests in csa.test.ts, which is where the
 * calendar arithmetic lives. This is the half that reads and writes rows.
 */

const database = refreshDatabase()

/** A visitor token has to look like one; see Visitor/identity.ts. */
const VISITOR = 'aaaabbbbccccdddd'
const SOMEBODY_ELSE = 'eeeeffffgggghhhh'

function seedFarm(plan: Record<string, unknown> = {}): { businessId: number, planId: number } {
  const [marketId] = database.seed('markets', [factory.market()])
  const [businessId] = database.seed('businesses', [factory.business({
    slug: 'a-farm',
    name: 'A Farm',
    type: 'farm',
    is_partner: 1,
    market_id: marketId,
  })])

  const [planId] = database.seed('csa_plans', [factory.csaPlan({ business_id: businessId, ...plan })])

  return { businessId, planId }
}

describe('the shares on offer', () => {
  test('are the ones a farm has open', async () => {
    const { businessId } = seedFarm({ name: 'Weekly Box' })
    database.seed('csa_plans', [factory.csaPlan({ name: 'Closed Box', business_id: businessId, is_active: 0 })])

    const plans = await plansFor('a-farm')

    expect(plans.map(plan => plan.name)).toEqual(['Weekly Box'])
  })

  test('are nothing for a farm nobody has', async () => {
    expect(await plansFor('nowhere')).toEqual([])
  })
})

describe('joining', () => {
  test('creates a membership and says when the first box comes', async () => {
    const { planId } = seedFarm()

    const result = await join({ planId, visitorToken: VISITOR, name: 'A Member', fulfilment: 'pickup' })

    expect(result.ok).toBe(true)
    expect(result.nextBoxAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    assertDatabaseHas('csa_subscriptions', { id: result.subscriptionId, status: 'active', fulfilment: 'pickup' })
  })

  test('a share that is not open cannot be joined', async () => {
    const { planId } = seedFarm({ is_active: 0 })

    const result = await join({ planId, visitorToken: VISITOR, name: 'A Member', fulfilment: 'pickup' })

    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/not open/)
    assertDatabaseCount('csa_subscriptions', 0)
  })

  test('a plan that does not exist cannot be joined', async () => {
    const result = await join({ planId: 999_999, visitorToken: VISITOR, name: 'A Member', fulfilment: 'pickup' })

    expect(result.ok).toBe(false)
    assertDatabaseCount('csa_subscriptions', 0)
  })

  test('delivery cannot be chosen from a farm that only lets you collect', async () => {
    // Most of them do not deliver. Accepting it here would promise a box to a
    // door nobody is driving to.
    const { planId } = seedFarm({ offers_delivery: 0 })

    const result = await join({ planId, visitorToken: VISITOR, name: 'A Member', fulfilment: 'delivery', deliveryAddress: '1 Somewhere' })

    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/does not deliver/)
    assertDatabaseCount('csa_subscriptions', 0)
  })

  test('delivery without an address is refused', async () => {
    const { planId } = seedFarm({ offers_delivery: 1 })

    const result = await join({ planId, visitorToken: VISITOR, name: 'A Member', fulfilment: 'delivery', deliveryAddress: '   ' })

    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/Where should the box go/)
  })

  test('a browser that cannot be identified gets nothing', async () => {
    // The token is the only identity here, and one that does not look like a
    // token cannot be turned into a customer to hang the membership off.
    const { planId } = seedFarm()

    const result = await join({ planId, visitorToken: 'nope', name: 'A Member', fulfilment: 'pickup' })

    expect(result.ok).toBe(false)
    assertDatabaseCount('csa_subscriptions', 0)
  })

  test('joining the same share twice is refused', async () => {
    // Two memberships means two boxes and two charges for somebody who
    // pressed the button twice.
    const { planId } = seedFarm()

    expect((await join({ planId, visitorToken: VISITOR, name: 'A Member', fulfilment: 'pickup' })).ok).toBe(true)

    const second = await join({ planId, visitorToken: VISITOR, name: 'A Member', fulfilment: 'pickup' })

    expect(second.ok).toBe(false)
    expect(second.reason).toMatch(/already a member/)
    assertDatabaseCount('csa_subscriptions', 1)
  })

  test('but rejoining after cancelling is allowed', async () => {
    // A cancelled membership is a decision that has been made and unmade;
    // refusing to let somebody come back would be a shop that locks the door
    // behind anyone who leaves.
    const { planId } = seedFarm()

    const first = await join({ planId, visitorToken: VISITOR, name: 'A Member', fulfilment: 'pickup' })
    await setMembershipState(first.subscriptionId!, VISITOR, 'cancel')

    const again = await join({ planId, visitorToken: VISITOR, name: 'A Member', fulfilment: 'pickup' })

    expect(again.ok).toBe(true)
    assertDatabaseCount('csa_subscriptions', 2)
  })

  test('two different people may join the same share', async () => {
    const { planId } = seedFarm()

    expect((await join({ planId, visitorToken: VISITOR, name: 'One', fulfilment: 'pickup' })).ok).toBe(true)
    expect((await join({ planId, visitorToken: SOMEBODY_ELSE, name: 'Two', fulfilment: 'pickup' })).ok).toBe(true)

    assertDatabaseCount('csa_subscriptions', 2)
  })
})

describe('what a member can see', () => {
  test('their own memberships and nobody else\'s', async () => {
    const { planId } = seedFarm()

    const mine = await join({ planId, visitorToken: VISITOR, name: 'One', fulfilment: 'pickup' })
    await join({ planId, visitorToken: SOMEBODY_ELSE, name: 'Two', fulfilment: 'pickup' })

    const rows = await membershipsFor(VISITOR)

    expect(rows.map(row => row.id)).toEqual([mine.subscriptionId!])
  })

  test('nothing at all for a browser that has joined nothing', async () => {
    seedFarm()

    expect(await membershipsFor(VISITOR)).toEqual([])
  })
})

describe('pausing, resuming and leaving', () => {
  async function seedMembership(): Promise<{ subscriptionId: number, planId: number }> {
    const { planId } = seedFarm()
    const result = await join({ planId, visitorToken: VISITOR, name: 'A Member', fulfilment: 'pickup' })

    return { subscriptionId: result.subscriptionId!, planId }
  }

  test('somebody else\'s membership is not yours to touch', async () => {
    // The id comes from a request and the ids are sequential. Without this
    // check, counting upwards cancels the whole farm's members one at a time.
    //
    // The other browser joins a share of its own first, so it has a customer
    // row: an unknown browser is turned away one step earlier, and this test
    // is about the ownership check rather than that one.
    const { subscriptionId, planId } = await seedMembership()
    await join({ planId, visitorToken: SOMEBODY_ELSE, name: 'Two', fulfilment: 'pickup' })

    const result = await setMembershipState(subscriptionId, SOMEBODY_ELSE, 'cancel')

    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/belongs to someone else/)
    assertDatabaseHas('csa_subscriptions', { id: subscriptionId, status: 'active' })
  })

  test('a browser that cannot be identified changes nothing', async () => {
    const { subscriptionId } = await seedMembership()

    const result = await setMembershipState(subscriptionId, 'nope', 'cancel')

    expect(result.ok).toBe(false)
    assertDatabaseHas('csa_subscriptions', { id: subscriptionId, status: 'active' })
  })

  test('pausing takes the next box off without ending the membership', async () => {
    const { subscriptionId } = await seedMembership()

    const result = await setMembershipState(subscriptionId, VISITOR, 'pause', '2026-10-01')

    expect(result.ok).toBe(true)
    assertDatabaseHas('csa_subscriptions', { id: subscriptionId, status: 'paused', paused_until: '2026-10-01', next_box_at: '' })
  })

  test('pausing needs a date that is one', async () => {
    // "until when" with no answer is a membership paused forever, which is a
    // cancellation nobody agreed to.
    const { subscriptionId } = await seedMembership()

    for (const until of ['', 'next spring', '01-10-2026']) {
      const result = await setMembershipState(subscriptionId, VISITOR, 'pause', until)

      expect(result.ok).toBe(false)
      expect(result.reason).toMatch(/A date, please/)
    }

    assertDatabaseHas('csa_subscriptions', { id: subscriptionId, status: 'active' })
  })

  test('resuming puts the next box back on the calendar', async () => {
    const { subscriptionId } = await seedMembership()

    await setMembershipState(subscriptionId, VISITOR, 'pause', '2026-10-01')
    const result = await setMembershipState(subscriptionId, VISITOR, 'resume')

    expect(result.ok).toBe(true)
    expect(result.nextBoxAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    assertDatabaseHas('csa_subscriptions', { id: subscriptionId, status: 'active', paused_until: '' })
  })

  test('cancelling clears the schedule with it', async () => {
    // A cancelled membership with a date still on it shows up in a farm's
    // packing list for a box nobody is collecting.
    const { subscriptionId } = await seedMembership()

    const result = await setMembershipState(subscriptionId, VISITOR, 'cancel')

    expect(result.ok).toBe(true)
    assertDatabaseHas('csa_subscriptions', { id: subscriptionId, status: 'cancelled', next_box_at: '', paused_until: '' })
  })

  test('a cancelled membership cannot be resumed', async () => {
    // Coming back is a new membership, which is what `join` is for. Reviving
    // this one would skip the check that the share is still open.
    const { subscriptionId } = await seedMembership()

    await setMembershipState(subscriptionId, VISITOR, 'cancel')
    const result = await setMembershipState(subscriptionId, VISITOR, 'resume')

    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/already ended/)
    assertDatabaseHas('csa_subscriptions', { id: subscriptionId, status: 'cancelled' })
  })

  test('a membership nobody has', async () => {
    // A known browser asking about an id that is not there - otherwise the
    // unknown-browser refusal answers first and this proves nothing.
    await seedMembership()

    const result = await setMembershipState(999_999, VISITOR, 'cancel')

    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/No such membership/)
  })
})
