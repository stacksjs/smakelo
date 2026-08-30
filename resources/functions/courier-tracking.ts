import { send } from './session'

/**
 * Streaming the courier's position.
 *
 * Two paths, because a delivery does not happen with the screen on. In a
 * browser this is `watchPosition`, which stops the moment the tab is
 * backgrounded. In the native shell (`config/mobile.ts`) the bridge keeps
 * recording with the phone pocketed and hands over the whole track when the app
 * comes back, which is most of a delivery.
 *
 * Both feed the same endpoint, so the customer's map does not know or care
 * which one is running.
 */

export interface TrackingHandle {
  stop: () => void
  native: boolean
}

interface CraftBridge {
  geolocation?: {
    watchPosition?: (cb: (position: any) => void, err?: (error: any) => void, options?: any) => number
    clearWatch?: (id: number) => void
    startRecording?: () => Promise<void>
    stopRecording?: () => Promise<void>
    readRecording?: (since?: number) => Promise<any[]>
  }
}

function bridge(): CraftBridge['geolocation'] | null {
  const craft = (globalThis as any).craft ?? (globalThis as any).Craft

  return craft?.geolocation ?? null
}

/**
 * Start reporting where this courier is.
 *
 * `minIntervalMs` throttles: a phone will happily report twice a second, and a
 * courier's marker does not need to move more often than the map redraws.
 */
export function startTracking(courierId: number, minIntervalMs = 5000): TrackingHandle {
  const native = bridge()

  let lastSentAt = 0
  let watchId: number | null = null
  let drainTimer: ReturnType<typeof setInterval> | null = null

  async function report(position: any): Promise<void> {
    const now = Date.now()

    if (now - lastSentAt < minIntervalMs)
      return

    lastSentAt = now

    await send(`/api/courier/${courierId}/ping`, {
      latitude: position.coords?.latitude ?? position.latitude,
      longitude: position.coords?.longitude ?? position.longitude,
      accuracy: position.coords?.accuracy ?? position.accuracy,
      speed: position.coords?.speed ?? position.speed ?? 0,
      heading: position.coords?.heading ?? position.heading ?? 0,
    })
  }

  if (native?.watchPosition) {
    watchId = native.watchPosition(report, () => undefined, { enableHighAccuracy: true })

    /*
     * Background recording, drained on a timer.
     *
     * The cursor is the timestamp of the last position handed over, kept in
     * storage rather than memory: the point of background recording is that
     * the app may have been killed in between, and a cursor that dies with the
     * process would replay the whole track or skip it.
     */
    native.startRecording?.().catch(() => undefined)

    drainTimer = setInterval(async () => {
      const since = Number(localStorage.getItem('smakelo.track.cursor') || 0)
      const recorded = await native.readRecording?.(since).catch(() => [])

      if (!recorded || recorded.length === 0)
        return

      const positions = recorded.map((entry: any) => ({
        latitude: entry.latitude ?? entry.coords?.latitude,
        longitude: entry.longitude ?? entry.coords?.longitude,
        accuracy: entry.accuracy ?? entry.coords?.accuracy,
        speed: entry.speed ?? 0,
        recordedAt: entry.timestamp ?? entry.recordedAt ?? Date.now(),
      }))

      const response = await send(`/api/courier/${courierId}/pings`, { positions })

      // The cursor only moves once the server has them. A cursor advanced on
      // send would lose the batch that failed on a flaky connection, which is
      // the connection this exists for.
      if (response.ok) {
        const newest = Math.max(...positions.map(entry => Number(entry.recordedAt) || 0))

        localStorage.setItem('smakelo.track.cursor', String(newest))
      }
    }, 30_000)
  }
  else if (typeof navigator !== 'undefined' && navigator.geolocation) {
    watchId = navigator.geolocation.watchPosition(report, () => undefined, {
      enableHighAccuracy: true,
      maximumAge: 5000,
    })
  }

  return {
    native: Boolean(native?.watchPosition),
    stop() {
      if (watchId !== null) {
        if (native?.clearWatch)
          native.clearWatch(watchId)
        else if (typeof navigator !== 'undefined')
          navigator.geolocation.clearWatch(watchId)
      }

      if (drainTimer)
        clearInterval(drainTimer)

      native?.stopRecording?.().catch(() => undefined)
    },
  }
}
