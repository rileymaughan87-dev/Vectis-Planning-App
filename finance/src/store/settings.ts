// Finance's appearance — the suite's shared one, so changing the look here
// changes it in every app — the currency amounts show in, and the two
// choices behind "safe to spend": the cushion kept back and which pay is
// payday. Saved together in preferences.json.

import { loadSharedAppearance, onSharedAppearanceChange, saveSharedAppearance, type AppearanceSettings } from '@suite/appearance'
import { isObj, num, optStr } from '@suite/decode'
import { create } from 'zustand'
import { regionCurrency } from '../model/money'
import { Filename, storage } from './persist'

interface SettingsState {
  appearance: AppearanceSettings
  /** Undefined follows the device's region. */
  currencyOverride?: string
  /** Kept back from safe to spend, so a surprise never tips you over. */
  cushion: number
  /** The pay that marks payday; unset means the biggest repeating pay. */
  paydayEntryID?: string
  /** International mode: accounts in more than one currency (model/currency.ts). */
  international: boolean
  /** Your own rates: what 1 of each currency is worth in your home currency. They win over the daily rate. */
  rateOverrides: Record<string, number>
  setInternational(on: boolean): void
  setRateOverride(code: string, rate: number | undefined): void
  setAppearance(patch: Partial<AppearanceSettings>): void
  setCurrency(code: string | undefined): void
  setCushion(amount: number): void
  setPayday(entryID: string | undefined): void
}

export interface Preferences {
  currency?: string
  cushion: number
  paydayEntryID?: string
  international: boolean
  rateOverrides: Record<string, number>
}

export function decodePreferences(v: unknown): Preferences {
  const r = isObj(v) ? v : {}
  const overrides = isObj(r.rateOverrides)
    ? Object.fromEntries(Object.entries(r.rateOverrides).filter((e): e is [string, number] => typeof e[1] === 'number' && e[1] > 0))
    : {}
  return {
    currency: optStr(r.currency),
    cushion: Math.max(0, num(r.cushion, 0)),
    paydayEntryID: optStr(r.paydayEntryID),
    international: r.international === true,
    rateOverrides: overrides,
  }
}

const savedPrefs = decodePreferences(storage.loadRaw(Filename.preferences))

export const useSettings = create<SettingsState>()(set => ({
  appearance: loadSharedAppearance(),
  currencyOverride: savedPrefs.currency,
  cushion: savedPrefs.cushion,
  paydayEntryID: savedPrefs.paydayEntryID,
  international: savedPrefs.international,
  rateOverrides: savedPrefs.rateOverrides,
  setInternational: on => set({ international: on }),
  setRateOverride: (code, rate) => set(s => {
    const { [code]: _old, ...rest } = s.rateOverrides
    void _old
    return { rateOverrides: rate && rate > 0 ? { ...rest, [code]: rate } : rest }
  }),
  setAppearance: patch => set(s => ({ appearance: { ...s.appearance, ...patch } })),
  setCurrency: code => set({ currencyOverride: code }),
  setCushion: amount => set({ cushion: Math.max(0, amount) }),
  setPayday: entryID => set({ paydayEntryID: entryID }),
}))

/** The saved preferences as one value (and how sync sends them). */
export const preferencesOf = (s: Pick<SettingsState, 'currencyOverride' | 'cushion' | 'paydayEntryID' | 'international' | 'rateOverrides'>): Preferences =>
  ({ currency: s.currencyOverride, cushion: s.cushion, paydayEntryID: s.paydayEntryID, international: s.international, rateOverrides: s.rateOverrides })

/** Whether two saved preferences differ (what sync and saving watch). */
export const prefsChanged = (a: Preferences, b: Preferences) => JSON.stringify(a) !== JSON.stringify(b)

/** The currency to show amounts in. */
export const useCurrency = () => useSettings(s => s.currencyOverride ?? regionCurrency())

/** Set while taking in another app's change, so it isn't written straight back. */
let fromElsewhere = false

onSharedAppearanceChange(appearance => {
  fromElsewhere = true
  try {
    useSettings.setState({ appearance })
  } finally {
    fromElsewhere = false
  }
})

useSettings.subscribe((state, prev) => {
  if (state.appearance !== prev.appearance && !fromElsewhere) saveSharedAppearance(state.appearance)
  if (prefsChanged(preferencesOf(state), preferencesOf(prev))) storage.saveRaw(Filename.preferences, preferencesOf(state))
})
