import { useEffect } from 'react'
import { contrastingText, normalizeHex } from '../model/format'
import { PALETTE_PRESETS } from '../model/sample'
import type { AppearanceSettings } from '../model/types'

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
