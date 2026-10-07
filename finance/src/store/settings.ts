// Finance's appearance — its own copy, since each app installed on a
// phone keeps its own storage anyway.

import { decodeAppearance, type AppearanceSettings } from '@suite/appearance'
import { create } from 'zustand'
import { Filename, storage } from './persist'

interface SettingsState {
  appearance: AppearanceSettings
  setAppearance(patch: Partial<AppearanceSettings>): void
}

export const useSettings = create<SettingsState>()(set => ({
  appearance: decodeAppearance(storage.loadRaw(Filename.appearance)),
  setAppearance: patch => set(s => ({ appearance: { ...s.appearance, ...patch } })),
}))

useSettings.subscribe((state, prev) => {
  if (state.appearance !== prev.appearance) storage.saveRaw(Filename.appearance, state.appearance)
})
