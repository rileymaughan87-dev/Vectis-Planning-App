// The daily exchange rates for international mode: the European Central
// Bank's reference rates, from Frankfurter (a free public service — no
// account, and nothing of yours is sent, only which currency is home).
// Fetched at most twice a day while international mode is on, kept on this
// device; your own rates in Settings win over them.

import { create } from 'zustand'
import { decodeRates, type Rates } from '../model/currency'
import { Filename, storage } from './persist'

interface RatesState {
  rates?: Rates
  /** When they were last fetched (ms). */
  fetchedAt: number
  fetching: boolean
  error?: string
  refresh(home: string): Promise<void>
}

const saved = storage.loadRaw(Filename.rates) as { fetchedAt?: unknown } | undefined
const SOURCES = (home: string) => [
  `https://api.frankfurter.dev/v1/latest?base=${home}`,
  `https://api.frankfurter.app/latest?from=${home}`,
]

export const useRates = create<RatesState>()((set, get) => ({
  rates: decodeRates(saved),
  fetchedAt: typeof saved?.fetchedAt === 'number' ? saved.fetchedAt : 0,
  fetching: false,
  refresh: async home => {
    if (get().fetching) return
    set({ fetching: true, error: undefined })
    try {
      for (const url of SOURCES(home)) {
        try {
          const res = await fetch(url)
          if (!res.ok) continue
          const rates = decodeRates(await res.json())
          if (!rates) continue
          const fetchedAt = Date.now()
          storage.saveRaw(Filename.rates, { ...rates, fetchedAt })
          set({ rates, fetchedAt })
          return
        } catch {
          // Try the next address.
        }
      }
      set({ error: "Couldn't get today's rate. The last one is used — or set your own below." })
    } finally {
      set({ fetching: false })
    }
  },
}))

/** Fetches if there's no rate for this home currency yet, or it's over 12 hours old. */
export function refreshIfStale(home: string) {
  const { rates, fetchedAt, refresh } = useRates.getState()
  if (!rates || rates.base !== home || Date.now() - fetchedAt > 12 * 3_600_000) void refresh(home)
}
