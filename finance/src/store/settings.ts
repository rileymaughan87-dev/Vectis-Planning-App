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
  setAppearance(patch: Partial<AppearanceSettings>): void
  setCurrency(code: string | undefined): void
  setCushion(amount: number): void
  setPayday(entryID: string | undefined): void
}

export interface Preferences {
  currency?: string
  cushion: number
  paydayEntryID?: string
}

export function decodePreferences(v: unknown): Preferences {
  const r = isObj(v) ? v : {}
  return { currency: optStr(r.currency), cushion: Math.max(0, num(r.cushion, 0)), paydayEntryID: optStr(r.paydayEntryID) }
}

const savedPrefs = decodePreferences(storage.loadRaw(Filename.preferences))

export const useSettings = create<SettingsState>()(set => ({
  appearance: loadSharedAppearance(),
  currencyOverride: savedPrefs.currency,
  cushion: savedPrefs.cushion,
  paydayEntryID: savedPrefs.paydayEntryID,
  setAppearance: patch => set(s => ({ appearance: { ...s.appearance, ...patch } })),
  setCurrency: code => set({ currencyOverride: code }),
  setCushion: amount => set({ cushion: Math.max(0, amount) }),
  setPayday: entryID => set({ paydayEntryID: entryID }),
}))

/** The saved preferences as one value (and how sync sends them). */
export const preferencesOf = (s: Pick<SettingsState, 'currencyOverride' | 'cushion' | 'paydayEntryID'>): Preferences =>
  ({ currency: s.currencyOverride, cushion: s.cushion, paydayEntryID: s.paydayEntryID })

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
  if (state.currencyOverride !== prev.currencyOverride || state.cushion !== prev.cushion || state.paydayEntryID !== prev.paydayEntryID) {
    storage.saveRaw(Filename.preferences, preferencesOf(state))
  }
})
