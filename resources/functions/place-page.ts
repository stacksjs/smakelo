import { basemap, keepSized } from './map'
import { send, visitorToken } from './session'

/**
 * What a place page does once it is on screen.
 *
 * The signals themselves are declared by the page, not here. stx builds a
 * page's setup by reading the signal declarations it can see in that page's own
 * script: a signal handed back from a factory and destructured into scope is
 * invisible to it, and the page then renders with every binding inert and
 * nothing logged. So the view declares the state and this module is handed it.
 *
 * The handlers live here because there are 280 generated place views and they
 * are committed. Inlining the logic would repeat two hundred lines in each to
 * say the same thing 280 times.
 */
export interface PlaceSignals {
  slug: string
  saved: any
  reviews: any
  stats: any
  canReview: any
  loadingReviews: any
  composer: any
  plans: any
  share: any
  claim: any
}

export function placeHandlers(page: PlaceSignals) {
  const { slug } = page

  /** Update one field of a grouped signal, keeping the rest. */
  function patch(signal: any, field: string, value: unknown): void {
    signal.set({ ...signal(), [field]: value })
  }

  const setComposer = (field: string, value: unknown) => patch(page.composer, field, value)
  const setShare = (field: string, value: unknown) => patch(page.share, field, value)
  const setClaim = (field: string, value: unknown) => patch(page.claim, field, value)

  async function loadSaved(): Promise<void> {
    const response = await fetch('/api/saved', { headers: { 'x-visitor': visitorToken() } })

    if (!response.ok)
      return

    const { data } = await response.json()

    page.saved.set(data.some((place: any) => place.slug === slug))
  }

  async function toggleSave(): Promise<void> {
    const response = await send(`/api/businesses/${slug}/save`)

    if (response.ok)
      page.saved.set((await response.json()).data.saved)
  }

  async function loadReviews(): Promise<void> {
    const response = await fetch(`/api/businesses/${slug}/reviews`, { headers: { 'x-visitor': visitorToken() } })

    if (!response.ok) {
      page.loadingReviews.set(false)
      return
    }

    const { data } = await response.json()

    page.reviews.set(data.reviews)
    page.stats.set(data.stats)
    page.canReview.set(data.canReview)
    page.loadingReviews.set(false)
  }

  async function postReview(): Promise<void> {
    const draft = page.composer()

    const response = await send(`/api/businesses/${slug}/reviews`, {
      rating: draft.rating,
      authorName: draft.authorName || 'Guest',
      title: draft.title,
      body: draft.body,
      dishes: draft.dishes,
    })

    if (!response.ok) {
      setComposer('error', (await response.json()).message)
      return
    }

    setComposer('error', '')
    loadReviews()
  }

  async function vote(reviewId: number): Promise<void> {
    const response = await send(`/api/reviews/${reviewId}/helpful`)

    if (response.ok)
      loadReviews()
  }

  async function loadPlans(): Promise<void> {
    const response = await fetch(`/api/csa/${slug}/plans`)

    if (response.ok)
      page.plans.set((await response.json()).data)
  }

  async function joinShare(): Promise<void> {
    const draft = page.share()

    const response = await send('/api/csa/join', {
      planId: draft.plan.id,
      name: draft.name || 'Guest',
      fulfilment: draft.fulfilment,
      deliveryAddress: draft.address,
    })

    const payload = await response.json()

    if (!response.ok) {
      setShare('error', payload.message)
      return
    }

    page.share.set({ ...draft, error: '', joined: payload.data })
  }

  async function sendClaim(): Promise<void> {
    const draft = page.claim()

    const response = await send(`/api/businesses/${slug}/claim`, {
      name: draft.name,
      email: draft.email,
      message: draft.message,
    })

    if (!response.ok) {
      setClaim('error', (await response.json()).message)
      return
    }

    page.claim.set({ ...draft, error: '', sent: true })
  }

  function stars(value: number): string {
    return '★'.repeat(value) + '☆'.repeat(5 - value)
  }

  function cadence(value: string): string {
    if (value === 'weekly')
      return 'Every week'

    if (value === 'biweekly')
      return 'Every other week'

    return 'Once a month'
  }

  /** The five-bar rating chart, which one average cannot replace. */
  function barsFrom(stats: any): Array<{ star: number, count: number, percent: number }> {
    if (!stats)
      return []

    const most = Math.max(...stats.distribution, 1)

    return [5, 4, 3, 2, 1].map((star) => {
      const count = stats.distribution[star - 1]

      return { star, count, percent: Math.round((count / most) * 100) }
    })
  }

  function load(): void {
    loadSaved()
    loadReviews()
    loadPlans()
  }

  return {
    setComposer,
    setShare,
    setClaim,
    toggleSave,
    postReview,
    vote,
    joinShare,
    sendClaim,
    stars,
    cadence,
    barsFrom,
    load,
  }
}

/**
 * The map.
 *
 * Imperative because it owns its own DOM, and given its point rather than
 * reading it here: a raw echo inside `<script client>` is not processed by the
 * views build, so the coordinates travel in a data attribute.
 */
export async function placeMap(element: HTMLElement | null, point: any): Promise<void> {
  if (!element || !Number.isFinite(point?.lat))
    return

  const { divIcon, Marker, tileLayer, TsMap } = await import('ts-maps')

  /*
   * Set up like the discover map, because it is the same map.
   *
   * It had the library's defaults - a blue teardrop and its own zoom buttons -
   * next to a page using ours everywhere else, and the tiles at full
   * saturation next to the photographs. One pin, one place, no controls: this
   * map answers "where is it", and a reader who wants to move around it has
   * the whole of /discover for that.
   */
  const map = new TsMap(element, {
    center: [point.lat, point.lng],
    zoom: 15,
    zoomControl: false,
    attributionControl: false,
    fadeAnimation: false,
  })

  basemap(tileLayer, map)

  // Filled, the way a partner's pin is on the discover map: you are looking at
  // this one place, so it is the one thing on the map worth the accent colour.
  new Marker([point.lat, point.lng], {
    icon: divIcon({
      className: 'pin-wrap',
      html: '<span class="pin pin-partner"></span>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    }),
  }).addTo(map)

  keepSized(map, element)
}
