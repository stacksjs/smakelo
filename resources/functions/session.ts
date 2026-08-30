/**
 * Who this browser is, and proof it is the one asking.
 *
 * Both of these were copy-pasted into a dozen views. They are the same two
 * facts every interactive surface needs, and having twelve copies meant a fix
 * to one of them was a fix to one of them.
 */

/**
 * The CSRF token, minted by the head partial before anything can POST.
 *
 * Read from the cookie rather than kept in a variable: the head script may
 * have set it after this module was evaluated, and a stale copy fails a
 * comparison the server is right to make.
 */
export function csrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)X-CSRF-Token=([^;]+)/)

  return match ? decodeURIComponent(match[1] as string) : ''
}

/**
 * A token standing in for the account this demo does not have.
 *
 * Minted once and kept, so a person's own reviews, saved places, orders and
 * shares survive a reload. It identifies a browser, not a person, and is
 * forgeable; see `app/Actions/Visitor/identity.ts` for what rests on it.
 */
export function visitorToken(): string {
  try {
    const saved = localStorage.getItem('smakelo.visitor')

    if (saved)
      return saved

    const token = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')

    localStorage.setItem('smakelo.visitor', token)

    return token
  }
  catch {
    // A browser refusing storage still gets to read the site; it just cannot
    // be recognised on the next page, which is the honest consequence.
    return ''
  }
}

/**
 * The bearer for a signed-in account, when there is one.
 *
 * Accounts are optional: everything works from the visitor token alone, and
 * this is only present once somebody has signed in. Kept in localStorage
 * rather than a cookie because the framework's auth endpoints answer with a
 * bearer and expect it back in a header.
 */
export function authToken(): string {
  try {
    return localStorage.getItem('smakelo.auth') ?? ''
  }
  catch {
    return ''
  }
}

export function setAuthToken(token: string): void {
  try {
    localStorage.setItem('smakelo.auth', String(token ?? ''))
  }
  catch {
    // A browser refusing storage cannot stay signed in between pages. It can
    // still use the whole site as a guest, which is the point of guests.
  }
}

export function clearAuthToken(): void {
  try {
    localStorage.removeItem('smakelo.auth')
  }
  catch {}
}

/** POST JSON with every token this request could need. */
export function send(url: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-csrf-token': csrfToken(),
    'x-visitor': visitorToken(),
  }

  const bearer = authToken()

  if (bearer)
    headers.Authorization = `Bearer ${bearer}`

  return fetch(url, {
    method: 'POST',
    headers,
    credentials: 'same-origin',
    body: JSON.stringify(body ?? {}),
  })
}

/** Cents to something a person reads, in the market's currency. */
export function money(cents: number, currency = 'usd'): string {
  const symbol = currency === 'eur' ? '€' : '$'

  return `${symbol}${(Math.abs(Number(cents) || 0) / 100).toFixed(2)}`
}
