import type { TableSession } from '../../app/Actions/Dine/tables'
import { send } from './session'

interface Signal<T> {
  (): T
  set: (value: T) => void
}

type SplitMode = 'even' | 'by_item'

interface TableSignals {
  session: Signal<TableSession | null>
  bill: Signal<{ totalCents: number, shares: number[] } | null>
  splitMode: Signal<SplitMode | ''>
  loading: Signal<boolean>
  token: Signal<string>
  billError: Signal<boolean>
  closing: Signal<boolean>
}

export function tableSessionHandlers({ session, bill, splitMode, loading, token, billError, closing }: TableSignals) {
  function say(key: string, fallback: string): string {
    const language = (globalThis as typeof globalThis & { Smakelo?: { t?: (key: string, fallback: string) => string } }).Smakelo
    return language?.t?.(key, fallback) ?? fallback
  }

  function menuLink(): string {
    const tab = session()

    if (!tab)
      return '/discover'

    return `/places/${tab.business.slug}?table=${encodeURIComponent(token())}&tab=${tab.tab.id}`
  }

  const currency = () => session()?.business.currency ?? 'usd'
  const tabTotal = () => session()?.tab.totalCents ?? 0
  const numberedRounds = () => session()?.rounds.map((round, index) => ({ ...round, number: index + 1 })) ?? []
  const numberedShares = () => bill()?.shares.map((cents, index) => ({ cents, number: index + 1 })) ?? []

  async function load(): Promise<void> {
    const { pathname, search } = location
    const code = pathname.match(/^(?:\/[a-z]{2})?\/t\/([a-z0-9]+)\/?$/i)?.[1]
      ?? new URLSearchParams(search).get('code')
      ?? ''

    token.set(code)

    try {
      if (code) {
        const response = await fetch(`/api/table-sessions/${encodeURIComponent(code)}`)
        session.set(response.ok ? (await response.json()).data : null)
      }
    }
    finally {
      loading.set(false)
    }
  }

  async function close(mode: SplitMode): Promise<void> {
    const current = session()

    if (!current || closing())
      return

    closing.set(true)
    billError.set(false)

    try {
      const response = await send(`/api/tabs/${current.tab.id}/close`, { splitMode: mode, tableCode: token() })

      if (!response.ok) {
        billError.set(true)
        return
      }

      splitMode.set(mode)
      bill.set((await response.json()).data)
    }
    catch {
      billError.set(true)
    }
    finally {
      closing.set(false)
    }
  }

  return { load, close, menuLink, say, currency, tabTotal, numberedRounds, numberedShares }
}
