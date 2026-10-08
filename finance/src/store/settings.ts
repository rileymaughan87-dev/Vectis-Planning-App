// Finance's appearance — its own copy, since each app installed on a
// phone keeps its own storage anyway — and the currency amounts show in.

import { decodeAppearance, type AppearanceSettings } from '@suite/appearance'
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
  appearance: decodeAppearance(storage.loadRaw(Filename.appearance)),
  currencyOverride: isObj(savedPrefs) ? optStr(savedPrefs.currency) : undefined,
  setAppearance: patch => set(s => ({ appearance: { ...s.appearance, ...patch } })),
  setCurrency: code => set({ currencyOverride: code }),
}))

/** The currency to show amounts in. */
export const useCurrency = () => useSettings(s => s.currencyOverride ?? regionCurrency())

useSettings.subscribe((state, prev) => {
  if (state.appearance !== prev.appearance) storage.saveRaw(Filename.appearance, state.appearance)
  if (state.currencyOverride !== prev.currencyOverride) storage.saveRaw(Filename.preferences, { currency: state.currencyOverride })
})
