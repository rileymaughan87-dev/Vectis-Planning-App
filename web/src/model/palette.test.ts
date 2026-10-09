// Category colours: presets recolour every category, and your own colours
// are kept to come back to.
import { describe, expect, it } from 'vitest'
import { PRESETS, choosePalette, colorForNew, customColors, decodePalette, parseHex, setCategoryColor } from './palette'
import type { CalendarCategory } from './types'

const cats: CalendarCategory[] = [
  { id: 'w', name: 'Work', colorHex: '#111111' },
  { id: 'h', name: 'Health', colorHex: '#222222' },
]

describe('category colours', () => {
  it('starts on Custom, so colours set before this existed carry on', () => {
    expect(decodePalette(undefined)).toEqual({ choice: 'custom', custom: {} })
  })

  it('recolours from a preset and brings your own colours back', () => {
    const studio = choosePalette(cats, decodePalette(undefined), 'studio')
    expect(studio.categories.map(c => c.colorHex)).toEqual(PRESETS[1].colors.slice(0, 2))
    expect(customColors(studio.categories, studio.palette)).toEqual(['#111111', '#222222'])
    // Another preset keeps the same Custom set.
    const dusk = choosePalette(studio.categories, studio.palette, 'dusk')
    expect(dusk.palette.custom).toEqual({ w: '#111111', h: '#222222' })
    const back = choosePalette(dusk.categories, dusk.palette, 'custom')
    expect(back.categories.map(c => c.colorHex)).toEqual(['#111111', '#222222'])
  })

  it('makes the set Custom when one colour changes, starting from what was showing', () => {
    const index = choosePalette(cats, decodePalette(undefined), 'index')
    const edited = setCategoryColor(index.categories, 'h', '#abcdef')
    expect(edited.palette.choice).toBe('custom')
    expect(edited.categories.map(c => c.colorHex)).toEqual([PRESETS[0].colors[0], '#ABCDEF'])
  })

  it('gives a new category the preset’s next colour, and reads hex', () => {
    expect(colorForNew({ choice: 'garden', custom: {} }, 7)).toBe(PRESETS[2].colors[1])
    expect(parseHex('6b4c7a')).toBe('#6B4C7A')
    expect(parseHex('#12345')).toBeNull()
  })
})
