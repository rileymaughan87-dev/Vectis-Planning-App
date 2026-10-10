// Appearance shared across the suite: the palettes, the saved settings,
// and applying them to the page. Semantic colours (income, expense,
// unconfirmed, warnings) are never themed — see docs/design-system.md.
//
// One setting for every app (Oct 2026): all of them read and write
// "vectis:appearance.json", so changing the look in one changes it in all.

import { useEffect } from 'react'
import { bool, isObj, oneOf, str } from './decode'
import { contrastingText, normalizeHex } from './format'

export type ColorSchemeMode = 'light' | 'dark' | 'system'

export interface AppearanceSettings {
  mode: ColorSchemeMode
  selectedPresetID: string
  isCustom: boolean
  customPrimaryHex: string
  customSecondaryHex: string
  customTertiaryHex: string
}

export interface PalettePreset {
  id: string
  name: string
  theory: string
  primaryHex: string
  secondaryHex: string
  tertiaryHex: string
}

export const PALETTE_PRESETS: PalettePreset[] = [
  // The ids are what gets saved, so they keep their original names even
  // though the colours are now blue — renaming them would reset saved choices.
  { id: 'tealCoral', name: 'Blue and coral', theory: 'Complementary — blue paired with its warm opposite', primaryHex: '0068B5', secondaryHex: 'D2574A', tertiaryHex: 'C9922E' },
  { id: 'indigoAmber', name: 'Indigo and amber', theory: 'Classic professional pairing, cool and warm balance', primaryHex: '3F51B5', secondaryHex: 'F2A93B', tertiaryHex: '6B7FD7' },
  { id: 'forestClay', name: 'Forest and clay', theory: 'Analogous earth tones, calm and grounded', primaryHex: '3F6B4E', secondaryHex: 'C97B4A', tertiaryHex: '8FA679' },
  { id: 'plumSage', name: 'Plum and sage', theory: 'Muted complementary, sophisticated and quiet', primaryHex: '6B4C7A', secondaryHex: '7C9473', tertiaryHex: 'C99A6B' },
  { id: 'monoTeal', name: 'Monochrome blue', theory: "Single hue at three depths — minimal, can't clash", primaryHex: '0068B5', secondaryHex: '66A4D3', tertiaryHex: '004679' },
]

export function decodeAppearance(v: unknown): AppearanceSettings {
  const r = isObj(v) ? v : {}
  return {
    mode: oneOf(r.mode, ['light', 'dark', 'system'] as const, 'system'),
    selectedPresetID: str(r.selectedPresetID, 'tealCoral'),
    isCustom: bool(r.isCustom, false),
    customPrimaryHex: str(r.customPrimaryHex, '0068B5'),
    customSecondaryHex: str(r.customSecondaryHex, 'D2574A'),
    customTertiaryHex: str(r.customTertiaryHex, 'C9922E'),
  }
}

export interface ThemeColors {
  primary: string
  secondary: string
  tertiary: string
}

export function themeColors(a: AppearanceSettings): ThemeColors {
  const preset = PALETTE_PRESETS.find(p => p.id === a.selectedPresetID) ?? PALETTE_PRESETS[0]
  return {
    primary: normalizeHex(a.isCustom ? a.customPrimaryHex : preset.primaryHex),
    secondary: normalizeHex(a.isCustom ? a.customSecondaryHex : preset.secondaryHex),
    tertiary: normalizeHex(a.isCustom ? a.customTertiaryHex : preset.tertiaryHex),
  }
}

/** Where every app keeps the look (Planner's file name, from before the suite). */
export const SHARED_APPEARANCE_KEY = 'vectis:appearance.json'

/** The suite's appearance as saved. Finance kept its own copy before it was shared; that's used until one is saved here. */
export function loadSharedAppearance(): AppearanceSettings {
  const read = (key: string) => {
    try {
      const text = localStorage.getItem(key)
      return text === null ? undefined : JSON.parse(text)
    } catch {
      return undefined
    }
  }
  return decodeAppearance(read(SHARED_APPEARANCE_KEY) ?? read('finance:appearance.json'))
}

export function saveSharedAppearance(a: AppearanceSettings) {
  try {
    localStorage.setItem(SHARED_APPEARANCE_KEY, JSON.stringify(a))
  } catch {
    // It just won't be remembered.
  }
}

/** Calls back when another open app (another tab) changes the look. */
export function onSharedAppearanceChange(cb: (a: AppearanceSettings) => void): () => void {
  const listener = (e: StorageEvent) => {
    if (e.key === SHARED_APPEARANCE_KEY) cb(loadSharedAppearance())
  }
  window.addEventListener('storage', listener)
  return () => window.removeEventListener('storage', listener)
}

/** The page colours the phone's status bar takes on (the top bar is the page colour). */
const PAGE_COLOR = { light: '#F2EFE8', dark: '#141619' }

/** Pushes the chosen palette and light/dark mode onto the page. */
export function useApplyTheme(a: AppearanceSettings) {
  useEffect(() => {
    const root = document.documentElement
    const c = themeColors(a)
    root.style.setProperty('--primary', c.primary)
    root.style.setProperty('--secondary', c.secondary)
    root.style.setProperty('--tertiary', c.tertiary)
    root.style.setProperty('--on-primary', contrastingText(c.primary))
    if (a.mode === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', a.mode)

    // The status bar matches the page, following the device when on System.
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    const paint = () => {
      const dark = a.mode === 'dark' || (a.mode === 'system' && Boolean(media?.matches))
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? PAGE_COLOR.dark : PAGE_COLOR.light)
    }
    paint()
    media?.addEventListener?.('change', paint)
    return () => media?.removeEventListener?.('change', paint)
  }, [a])
}
