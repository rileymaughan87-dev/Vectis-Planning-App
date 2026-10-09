// Category colours (Index style, Oct 2026): a preset — Index, Studio,
// Garden, Dusk — or your own Custom set. They colour calendar categories
// (event blocks); goals and tasks follow the Appearance scheme, and the
// frame keeps its paper and blue.
//
// The colour in force is always written into each category's `colorHex`,
// so everything else (Daily, Long-Term, the share file a partner sees,
// the iPhone's categories.json) keeps reading one field. The palette
// remembers which preset is chosen and keeps the Custom set aside while
// a preset is in use, so going back to Custom brings your colours back.

import { isObj, oneOf, record, type Raw } from '@suite/decode'
import type { CalendarCategory } from './types'

export type PresetID = 'index' | 'studio' | 'garden' | 'dusk'
export type PaletteChoice = PresetID | 'custom'

export interface Preset {
  id: PresetID
  name: string
  note: string
  colors: string[]
}

export const PRESETS: Preset[] = [
  { id: 'index', name: 'Index', note: 'Default', colors: ['#0068B5', '#6B4C7A', '#3F6B4E', '#C9922E', '#D2574A', '#7C9473'] },
  { id: 'studio', name: 'Studio', note: 'Bold', colors: ['#1F3A93', '#C0392B', '#E0A100', '#16794F', '#8E44AD', '#2C3E50'] },
  { id: 'garden', name: 'Garden', note: 'Soft greens', colors: ['#3F6B4E', '#7C9473', '#A3B18A', '#C9922E', '#8A5A44', '#5B7F95'] },
  { id: 'dusk', name: 'Dusk', note: 'Muted', colors: ['#4A5A78', '#7A5C78', '#A86D5A', '#6E7F6A', '#B08B4F', '#5E6670'] },
]

/** The colour picker's curated swatches, six to a row. */
export const SWATCHES = [
  '#0068B5', '#1F3A93', '#4A5A78', '#2E8B8B', '#3F6B4E', '#7C9473',
  '#6B4C7A', '#7A5C78', '#8E44AD', '#D2574A', '#C0392B', '#A86D5A',
  '#C9922E', '#E0A100', '#B08B4F', '#2C3E50', '#5E6670', '#8A5A44',
]

export interface CategoryPalette {
  choice: PaletteChoice
  /** Your own colours by category id, kept while a preset is in use. */
  custom: Record<string, string>
}

/**
 * Saved as category_palette.json (web only). Nothing saved means the
 * categories' own colours are in use — so colours set before this
 * existed carry on as your Custom set.
 */
export function decodePalette(v: unknown): CategoryPalette {
  const r: Raw = isObj(v) ? v : {}
  return {
    choice: oneOf(r.choice, ['index', 'studio', 'garden', 'dusk', 'custom'] as const, 'custom'),
    custom: record(r.custom, x => (typeof x === 'string' ? x : undefined)),
  }
}

const presetColor = (preset: Preset, index: number) => preset.colors[index % preset.colors.length]

export const presetOf = (choice: PaletteChoice) => PRESETS.find(p => p.id === choice)

/** "Index", "Custom"… */
export const paletteName = (choice: PaletteChoice) => presetOf(choice)?.name ?? 'Custom'

/** The Custom set as it stands: the categories' colours while Custom is chosen, the kept set otherwise. */
export function customColors(categories: CalendarCategory[], palette: CategoryPalette): string[] {
  return categories.map(c => (palette.choice === 'custom' ? c.colorHex : palette.custom[c.id] ?? c.colorHex))
}

/** Switches to a preset or back to Custom, recolouring every category. */
export function choosePalette(categories: CalendarCategory[], palette: CategoryPalette, choice: PaletteChoice): { categories: CalendarCategory[]; palette: CategoryPalette } {
  // Leaving Custom: keep its colours to come back to.
  const custom = palette.choice === 'custom' ? Object.fromEntries(categories.map(c => [c.id, c.colorHex])) : palette.custom
  const preset = presetOf(choice)
  return {
    palette: { choice, custom },
    categories: categories.map((c, i) => ({ ...c, colorHex: preset ? presetColor(preset, i) : custom[c.id] ?? c.colorHex })),
  }
}

/** One category's own colour: that makes the whole set Custom (starting from what's showing). */
export function setCategoryColor(categories: CalendarCategory[], id: string, hex: string): { categories: CalendarCategory[]; palette: CategoryPalette } {
  const next = categories.map(c => (c.id === id ? { ...c, colorHex: hex.toUpperCase() } : c))
  return { categories: next, palette: { choice: 'custom', custom: Object.fromEntries(next.map(c => [c.id, c.colorHex])) } }
}

/** The colour for a category added now: the preset's next one, or a default. */
export function colorForNew(palette: CategoryPalette, index: number): string {
  const preset = presetOf(palette.choice)
  return preset ? presetColor(preset, index) : '#4A7FE8'
}

/** "#6B4C7A", or null if it isn't a 6-digit hex colour. */
export function parseHex(text: string): string | null {
  const t = text.trim().replace(/^#?/, '#')
  return /^#[0-9a-fA-F]{6}$/.test(t) ? t.toUpperCase() : null
}
