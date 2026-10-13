// Amounts in the right currency (international mode): each account's own,
// and totals in your home currency. With international mode off, everything
// is in the one currency, as before.

import { useEffect, useMemo } from 'react'
import { entryAccount, type Account } from '../model/accounts'
import { converter, currencyOf } from '../model/currency'
import type { FinanceEvent } from '../model/entries'
import type { FinanceGoal } from '../model/goals'
import { formatMoney } from '../model/money'
import { useAccounts } from './accounts'
import { refreshIfStale, useRates } from './rates'
import { useCurrency, useSettings } from './settings'

export function useMoneyTools() {
  const home = useCurrency()
  const international = useSettings(s => s.international)
  const overrides = useSettings(s => s.rateOverrides)
  const rates = useRates(s => s.rates)
  const raw = useAccounts(s => s.accounts)

  return useMemo(() => {
    const convert = converter(home, rates, overrides)
    // Off, accounts are all in the home currency (a currency set earlier is kept for when it's back on).
    const accounts: Account[] = international ? raw : raw.map(a => (a.currency ? { ...a, currency: undefined } : a))
    const cur = (a?: Account) => currencyOf(a, home)
    return {
      home,
      international,
      convert,
      /** Accounts as the sums should see them. */
      accounts,
      currencyOf: cur,
      money: (n: number, currency: string = home) => formatMoney(n, currency),
      /** An amount in an account's own currency. */
      forAccount: (n: number, a?: Account) => formatMoney(n, cur(a)),
      /** One account's amount in another's currency. */
      byAccount: (amount: number, from: Account, to: Account) => convert(amount, cur(from), cur(to)),
      /** For totals: an account's amount in the home currency (unconverted if there's no rate yet). */
      inHome: (n: number, a: Account) => convert(n, cur(a), home) ?? n,
      /** The currency an entry is in: its account's. */
      entryCurrency: (e: FinanceEvent) => cur(entryAccount(e, accounts)),
      /** A goal's currency: its account's (a US loan is in dollars), else where it's paid from. */
      goalCurrency: (g: FinanceGoal) => {
        const linked = accounts.find(a => a.id === g.accountID)
        if (linked) return cur(linked)
        return international && g.currency ? g.currency : home
      },
      /** For sums across entries: an entry's amount in the home currency. */
      entryInHome: (amount: number, e: FinanceEvent) => convert(amount, cur(entryAccount(e, accounts)), home) ?? amount,
    }
  }, [home, international, overrides, rates, raw])
}

/** Keeps the daily rate fresh while international mode is on. */
export function useFreshRates() {
  const home = useCurrency()
  const international = useSettings(s => s.international)
  useEffect(() => {
    if (international) refreshIfStale(home)
  }, [home, international])
}
