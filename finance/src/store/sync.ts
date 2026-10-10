// What Finance syncs between your devices, using the machinery shared with
// Planner (suite/sync). Records live under users/{uid}/finance, apart from
// Planner's, so the two apps never touch each other's data. The look is
// shared by every app and syncs with Planner's data, not here.

import { countIn, describeCounts } from '@suite/sync/records'
import { createSyncStore, type SyncSlice } from '@suite/sync/store'
import { decodeAccounts, decodeAudits } from '../model/accounts'
import { decodeFinanceEvents } from '../model/entries'
import { decodeGoals } from '../model/goals'
import { decodePot, decodeSpendingEntries } from '../model/spending'
import { useAccounts } from './accounts'
import { useEntries } from './entries'
import { useGoals } from './goals'
import { Filename, storage } from './persist'
import { decodePreferences, preferencesOf, useSettings } from './settings'
import { useSpending } from './spending'

/** A slice backed by one field of a zustand store. */
function slice<S, K extends keyof S>(
  store: { getState(): S; setState(p: Partial<S>): void; subscribe(l: (s: S, p: S) => void): () => void },
  key: K, file: string, kind: SyncSlice['kind'], decode: (raw: unknown) => S[K],
): SyncSlice {
  return {
    file,
    kind,
    get: () => store.getState()[key],
    set: value => store.setState({ [key]: value } as unknown as Partial<S>),
    decode,
    subscribe: onChange => store.subscribe((s, p) => {
      if (s[key] !== p[key]) onChange()
    }),
  }
}

const FINANCE_SLICES: SyncSlice[] = [
  slice(useEntries, 'events', Filename.financeEvents, 'list', decodeFinanceEvents),
  slice(useGoals, 'goals', Filename.financeGoals, 'list', decodeGoals),
  slice(useSpending, 'entries', Filename.spendingEntries, 'list', decodeSpendingEntries),
  slice(useSpending, 'pot', Filename.spendingPot, 'single', decodePot),
  slice(useAccounts, 'accounts', Filename.accounts, 'list', decodeAccounts),
  slice(useAccounts, 'audits', Filename.accountAudits, 'list', decodeAudits),
  // Currency, cushion and payday, saved together as preferences.json.
  {
    file: Filename.preferences,
    kind: 'single',
    get: () => preferencesOf(useSettings.getState()),
    set: value => {
      const p = value as ReturnType<typeof decodePreferences>
      useSettings.setState({ currencyOverride: p.currency, cushion: p.cushion, paydayEntryID: p.paydayEntryID })
    },
    decode: decodePreferences,
    subscribe: onChange => useSettings.subscribe((s, p) => {
      if (s.currencyOverride !== p.currencyOverride || s.cushion !== p.cushion || s.paydayEntryID !== p.paydayEntryID) onChange()
    }),
  },
]

export const useSync = createSyncStore({
  name: 'Finance',
  collection: 'finance',
  prefix: 'finance:',
  slices: FINANCE_SLICES,
  contentFiles: [Filename.financeEvents, Filename.financeGoals, Filename.spendingEntries, Filename.accounts],
  // Accounts joined on 10 Oct 2026, after devices were already syncing.
  addedLater: [Filename.accounts, Filename.accountAudits],
  describe: records => describeCounts([
    ['entry', 'entries', countIn(records, Filename.financeEvents)],
    ['goal', 'goals', countIn(records, Filename.financeGoals)],
    ['logged spend', 'logged spends', countIn(records, Filename.spendingEntries)],
    ['account', 'accounts', countIn(records, Filename.accounts)],
  ]),
  allEntries: storage.allEntries,
})
