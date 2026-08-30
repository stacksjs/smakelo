import { shippings } from '@stacksjs/commerce'

/**
 * Where the courier is.
 *
 * One position, or a batch of them recorded while the phone had no signal.
 * Both go through the framework's `recordCourierPing`, which is what advances
 * the route, moves the marker on the customer's tracking page, and recomputes
 * the arrival estimate. Writing to `courier_pings` directly would put a dot on
 * a map and change nothing else.
 */

export interface PingInput {
  latitude: number
  longitude: number
  accuracy?: number
  speed?: number
  heading?: number
  /** Milliseconds since the epoch, for a position recorded earlier. */
  recordedAt?: number
}

export async function recordPing(courierId: number, input: PingInput): Promise<{ ok: boolean, reason?: string }> {
  const check = plausible(input)

  if (check)
    return { ok: false, reason: check }

  await shippings.tracking.recordCourierPing({
    courierId,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracy: Number(input.accuracy ?? 25),
    speed: Number(input.speed ?? 0),
  })

  return { ok: true }
}

/**
 * Drain a recording made while the app was in the background.
 *
 * A phone in a pocket, in a lift, in a car park with no signal, keeps recording
 * and hands over the whole track when it reconnects. They arrive oldest first
 * so the route advances in the order it actually happened; replaying them
 * newest-first would walk the courier backwards through their own delivery.
 *
 * A batch that is partly bad is accepted for the parts that are good. Rejecting
 * the lot because one fix came back with a wild accuracy would throw away the
 * only record of a delivery nobody was watching.
 */
export async function recordBatch(courierId: number, positions: PingInput[]): Promise<{ ok: boolean, accepted: number, rejected: number }> {
  const ordered = [...positions].sort((a, b) => Number(a.recordedAt ?? 0) - Number(b.recordedAt ?? 0))

  let accepted = 0
  let rejected = 0

  for (const position of ordered) {
    const result = await recordPing(courierId, position)

    if (result.ok)
      accepted += 1
    else
      rejected += 1
  }

  return { ok: true, accepted, rejected }
}

/**
 * Refuse a position that cannot be true.
 *
 * A phone with no fix reports 0,0 with a huge accuracy, and an island in the
 * Gulf of Guinea on a courier's track is worse than a gap in it.
 */
function plausible(input: PingInput): string | null {
  const { latitude, longitude } = input

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
    return 'That is not a position.'

  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180)
    return 'That position is off the planet.'

  if (latitude === 0 && longitude === 0)
    return 'Null Island is not a delivery address; the phone had no fix.'

  if (input.accuracy !== undefined && Number(input.accuracy) > 250)
    return 'Too vague to place. Stored positions have to mean something.'

  return null
}
