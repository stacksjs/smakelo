import { defineCommand, log } from '@stacksjs/cli'
import { shippings } from '@stacksjs/commerce'
import { db } from '@stacksjs/database'
import { distanceInMeters } from '../Actions/Business/geo'
import { dispatchOrder } from '../Actions/Delivery/dispatch'

/**
 * Drive a delivery from the kitchen to the door.
 *
 * The couriers on this site are invented, so nobody's phone is sending GPS.
 * This walks one along the route instead, posting positions through the same
 * `recordCourierPing` a real device would, so the tracking page, the ETA and
 * the arrival threshold are all exercised by the real pipeline rather than by
 * a mock of it. What is simulated is the phone, not the tracking.
 *
 * Straight lines between the two points, because the demo needs a courier that
 * moves and not a routing engine. The pipeline cannot tell the difference; a
 * viewer can, which is why the site says the couriers are invented.
 */
export default defineCommand((cli) => {
  cli
    .command('simulate:delivery', 'Walk a courier through a delivery, pinging as a real device would')
    .option('--order <id>', 'Order id. Defaults to the newest delivery awaiting a courier.')
    .option('--steps <count>', 'Positions per leg', { default: 12 })
    .option('--interval <ms>', 'Milliseconds between pings', { default: 900 })
    .action(async (options: { order?: string, steps?: number, interval?: number }) => {
      const orderId = options.order ? Number(options.order) : await newestUndispatchedDelivery()

      if (!orderId) {
        log.error('No delivery order to simulate. Place one with order_type DELIVERY first.')
        return
      }

      const dispatched = await dispatchOrder(orderId)

      if (!dispatched.ok) {
        log.error(`Could not dispatch order ${orderId}: ${dispatched.reason}`)
        return
      }

      log.info(`Order ${orderId} assigned to ${dispatched.courierName}`)

      const routeId = Number(dispatched.routeId)
      const courierId = Number(dispatched.courierId)

      await shippings.tracking.startRoute(routeId)

      const stops = await db.selectFrom('delivery_stops')
        .where('delivery_route_id', '=', routeId)
        .orderBy('sequence', 'asc')
        .selectAll()
        .execute() as Array<Record<string, unknown>>

      // Start the courier a little away from the restaurant, so the first leg
      // is a journey rather than an arrival.
      let position = offsetFrom(
        { latitude: Number(stops[0].latitude), longitude: Number(stops[0].longitude) },
        1500,
      )

      await ping(courierId, position)

      for (const stop of stops) {
        if (stop.latitude == null) {
          log.warn(`Stop ${stop.id} has no coordinates; skipping its leg.`)
          continue
        }

        const target = { latitude: Number(stop.latitude), longitude: Number(stop.longitude) }
        const label = String(stop.type) === 'pickup' ? 'to the kitchen' : 'to the customer'

        log.info(`Driving ${label} (${Math.round(distanceInMeters(position, target))} m)`)

        await shippings.tracking.startStop(Number(stop.id))

        const steps = Math.max(2, Number(options.steps ?? 12))

        for (let step = 1; step <= steps; step++) {
          position = interpolate(position, target, step / steps)
          const result = await ping(courierId, position)

          if (result?.crossedNearby)
            log.info('  nearby')

          if (result?.crossedArrival)
            log.info('  arrived')

          await sleep(Number(options.interval ?? 900))
        }

        await shippings.tracking.completeStop(Number(stop.id))
        log.success(`${String(stop.type) === 'pickup' ? 'Collected' : 'Delivered'}`)
      }

      await db.updateTable('couriers')
        .set({ status: 'active' } as never)
        .where('id', '=', courierId)
        .execute()

      log.success('Run complete.')
    })
})

async function ping(courierId: number, position: { latitude: number, longitude: number }) {
  try {
    return await shippings.tracking.recordCourierPing({
      courierId,
      latitude: position.latitude,
      longitude: position.longitude,
      // A real phone reports its accuracy; anything worse than 250 m is stored
      // but does not move the courier. Ten metres is a good fix.
      accuracy: 10,
      speed: 8,
    })
  }
  catch (error) {
    log.error(`Ping failed: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

/** A point `fraction` of the way from `from` to `to`. */
function interpolate(
  from: { latitude: number, longitude: number },
  to: { latitude: number, longitude: number },
  fraction: number,
): { latitude: number, longitude: number } {
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * fraction,
    longitude: from.longitude + (to.longitude - from.longitude) * fraction,
  }
}

/** A point roughly `meters` north-east of another, to start the run from. */
function offsetFrom(point: { latitude: number, longitude: number }, meters: number) {
  const degrees = meters / 111_320

  return {
    latitude: point.latitude + degrees,
    longitude: point.longitude + degrees / Math.cos((point.latitude * Math.PI) / 180),
  }
}

async function newestUndispatchedDelivery(): Promise<number | null> {
  const orders = await db.selectFrom('orders')
    .where('order_type', '=', 'DELIVERY')
    .orderBy('id', 'desc')
    .select(['id'])
    .execute() as Array<{ id: number }>

  for (const order of orders) {
    const stop = await db.selectFrom('delivery_stops')
      .where('order_id', '=', Number(order.id))
      .select(['id'])
      .executeTakeFirst() as { id: number } | undefined

    if (!stop)
      return Number(order.id)
  }

  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
