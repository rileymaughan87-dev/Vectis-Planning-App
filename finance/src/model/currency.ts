// International mode (Oct 2026): accounts in more than one currency. Each
// account keeps its own currency — a US account in dollars, a UK one in
// pounds — and everything on it (pay, bills, spending, goal payments) is in
// that currency, so nothing is budgeted twice. Totals convert into your home
// currency at a daily rate (the European Central Bank's, via Frankfurter),
// which you can override with your own.

import type { Account } from './accounts'

/** Fetched rates: 1 `base` = `rates[code]` of that currency. */
export interface Rates {
  base: string
  /** The day the rates are for ("yyyy-MM-dd"). */
  date: string
  rates: Record<string, number>
}

/** An account's currency: its own, or your home currency. */
export const currencyOf = (account: Account | undefined, home: string) => account?.currency || home

/**
 * What one unit of `code` is worth in `home`: your own rate if you've set
 * one, else the fetched rate. Null when there's no rate yet.
 */
export function rateToHome(code: string, home: string, fetched: Rates | undefined, overrides: Record<string, number>): number | null {
  if (code === home) return 1
  const own = overrides[code]
  if (own && own > 0) return own
  if (!fetched) return null
  const per = (c: string) => (c === fetched.base ? 1 : fetched.rates[c])
  const homePerBase = per(home)
  const codePerBase = per(code)
  return homePerBase && codePerBase ? homePerBase / codePerBase : null
}

export type Converter = (amount: number, from: string, to: string) => number | null

/** Converts between any two currencies through home. */
export function converter(home: string, fetched: Rates | undefined, overrides: Record<string, number>): Converter {
  return (amount, from, to) => {
    if (from === to) return amount
    const a = rateToHome(from, home, fetched, overrides)
    const b = rateToHome(to, home, fetched, overrides)
    return a && b ? Math.round((amount * a / b) * 100) / 100 : null
  }
}

/** The currencies your accounts use, home first. */
export function currenciesInUse(accounts: Account[], home: string): string[] {
  return [home, ...new Set(accounts.map(a => currencyOf(a, home)).filter(c => c !== home))]
}

/** Reads fetched rates defensively. */
export function decodeRates(v: unknown): Rates | undefined {
  if (!v || typeof v !== 'object') return undefined
  const r = v as Record<string, unknown>
  if (typeof r.base !== 'string' || typeof r.date !== 'string' || !r.rates || typeof r.rates !== 'object') return undefined
  const rates = Object.fromEntries(Object.entries(r.rates as Record<string, unknown>).filter((e): e is [string, number] => typeof e[1] === 'number' && e[1] > 0))
  return { base: r.base, date: r.date, rates }
}
