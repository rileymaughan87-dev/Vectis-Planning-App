// Finance's appearance — the suite's shared one, so changing the look here
// changes it in every app — and the currency amounts show in.

import { loadSharedAppearance, onSharedAppearanceChange, saveSharedAppearance, type AppearanceSettings } from '@suite/appearance'
import { isObj, optStr } from '@suite/decode'
import { create } from 'zustand'
import { regionCurrency } from '../model/money'
import { Filename, storage } from './persist'

interface SettingsState {
  appearance: AppearanceSettings
  /** Undefined follows the device's region. */
  currencyOverride?: string
  setAppearance(patch: Partial<AppearanceSettings>): void
  setCurrency(code: string | undefined): void
}

const savedPrefs = storage.loadRaw(Filename.preferences)

export const useSettings = create<SettingsState>()(set => ({
  appearance: loadSharedAppearance(),
  currencyOverride: isObj(savedPrefs) ? optStr(savedPrefs.currency) : undefined,
  setAppearance: patch => set(s => ({ appearance: { ...s.appearance, ...patch } })),
  setCurrency: code => set({ currencyOverride: code }),
}))

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
  if (state.currencyOverride !== prev.currencyOverride) storage.saveRaw(Filename.preferences, { currency: state.currencyOverride })
})
