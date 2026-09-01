import { apiGet, me } from './session'

/**
 * The printable table-code sheet, behind an account.
 *
 * The codes used to be rendered into the page on the server, which put every
 * restaurant's table codes behind a guessable URL and no account at all - and
 * a table code is what opens a tab at that table. They now come from
 * `/api/manage/{slug}/codes`, which checks the permission and the team.
 *
 * The signals stay in the generated page's own script, because that is the
 * only place stx looks when it builds a page's setup; handed back from a
 * factory and destructured, they are invisible to it and every binding on the
 * page silently does nothing. This holds the logic so eighteen generated views
 * do not each hold a copy.
 */

export interface SheetSignals {
  /** The codes to print. Named `sheet` in the page: see the generated view. */
  sheet: { set: (value: unknown[]) => void }
  loading: { set: (value: boolean) => void }
  signedIn: { set: (value: boolean) => void }
  denied: { set: (value: boolean) => void }
  slug: { set: (value: string) => void }
}

export function codeSheet(codeSlug: string, signals: SheetSignals): { load: () => Promise<void> } {
  async function load(): Promise<void> {
    const account = await me()

    signals.signedIn.set(Boolean(account))
    signals.slug.set(codeSlug)

    const response = await apiGet(`/api/manage/${encodeURIComponent(codeSlug)}/codes`)

    // 401 and 403 are not "no such sheet": they are "not yours", and saying so
    // is the difference between a fixable problem and a dead end.
    signals.denied.set(response.status === 401 || response.status === 403)
    signals.sheet.set(response.ok ? (await response.json()).data : [])
    signals.loading.set(false)
  }

  return { load }
}
