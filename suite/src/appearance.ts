// Appearance shared across the suite: the palettes, the saved settings,
// and applying them to the page. Semantic colours (income, expense,
// unconfirmed, warnings) are never themed — see docs/design-system.md.

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
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', c.primary)
  }, [a])
}
