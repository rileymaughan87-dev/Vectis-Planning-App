// Settings › Category colours (Index style, P7/P7b): pick a preset or
// your own set, and a picker for any one category. They colour event
// blocks by category; the frame keeps its paper and blue.

import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { contrastingText, darkened } from '../model/format'
import { PRESETS, SWATCHES, customColors, parseHex, type PaletteChoice } from '../model/palette'
import type { CalendarCategory } from '../model/types'
import { useData } from '../store/data'
import { SectionBox, Sheet } from '../ui/components'

export function CategoryColoursSheet({ onClose }: { onClose: () => void }) {
  const { categories, palette, choosePalette, setCategoryColor } = useData()
  const [picking, setPicking] = useState<CalendarCategory | null>(null)
  const rows: { id: PaletteChoice; name: string; note: string; colors: string[] }[] = [
    ...PRESETS,
    { id: 'custom', name: 'Custom', note: 'Your colours', colors: customColors(categories, palette) },
  ]

  return (
    <Sheet title="Category colours" onClose={onClose} leftLabel="Done">
      <p className="caption" style={{ margin: 0 }}>Colours for your calendar categories — the event blocks on Daily and Long-Term. Goals and tasks follow your colour scheme in Appearance; the rest of Vectis keeps its paper and blue.</p>

      <SectionBox title="Presets" accent="var(--brand)">
        <div className="preset-list" role="radiogroup" aria-label="Colour presets">
          {rows.map(p => (
            <button
              key={p.id}
              role="radio"
              aria-checked={palette.choice === p.id}
              className="preset-row"
              onClick={() => choosePalette(p.id)}
            >
              <span className="grow">
                <span className="row" style={{ alignItems: 'baseline', gap: 8 }}>
                  <span className="preset-name">{p.name}</span>
                  <span className="caption2">{p.note}</span>
                </span>
                <span className="preset-strip" aria-hidden="true">
                  {p.colors.slice(0, 6).map((c, i) => <span key={i} style={{ background: c }} />)}
                </span>
              </span>
              <span className="preset-mark" aria-hidden="true">{palette.choice === p.id ? '✓' : ''}</span>
            </button>
          ))}
        </div>
      </SectionBox>

      <SectionBox title="Make it yours" accent="var(--brand)">
        <div>
          {categories.map(c => (
            <button key={c.id} className="colour-row" onClick={() => setPicking(c)}>
              <span className="colour-swatch" style={{ background: c.colorHex }} />
              <span className="grow">{c.name}</span>
              <span className="mono muted">{c.colorHex}</span>
              <ChevronRight size={16} className="muted" />
            </button>
          ))}
        </div>
        <p className="help">Changing a colour switches you to Custom. Your own colours are kept when you try a preset, so you can always come back to them.</p>
      </SectionBox>

      {picking && (
        <ColourPicker
          category={picking}
          onClose={() => setPicking(null)}
          onDone={hex => { if (hex !== picking.colorHex) setCategoryColor(picking.id, hex); setPicking(null) }}
        />
      )}
    </Sheet>
  )
}

/** One category's colour: a live preview, the curated swatches, or any hex. */
export function ColourPicker({ category, onClose, onDone }: { category: CalendarCategory; onClose: () => void; onDone: (hex: string) => void }) {
  const [hex, setHex] = useState(category.colorHex.toUpperCase())
  const [text, setText] = useState(hex)
  const valid = parseHex(text)
  const pick = (c: string) => { setHex(c); setText(c) }
  const ink = contrastingText(hex)

  return (
    <Sheet title={category.name || 'Category'} compact onClose={onClose} right={{ label: 'Done', onClick: () => onDone(hex) }}>
      <div className="colour-preview" style={{ background: hex, color: ink, borderColor: darkened(hex, 0.3) }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{category.name || 'Category'}</span>
        <span className="mono" style={{ fontSize: 10, opacity: 0.85 }}>3:30 – 5:00 PM</span>
      </div>

      <div className="swatch-grid" role="radiogroup" aria-label="Colours">
        {SWATCHES.map(c => (
          <button key={c} role="radio" aria-checked={hex === c} aria-label={c} style={{ background: c }} onClick={() => pick(c)} />
        ))}
      </div>

      <label className="any-colour">
        <span className="grow">Any colour</span>
        <input
          type="color" aria-label="Choose any colour" value={hex}
          onChange={e => pick(e.target.value.toUpperCase())}
        />
        <input
          className="mono" aria-label="Hex colour" value={text} spellCheck={false}
          onChange={e => {
            setText(e.target.value)
            const ok = parseHex(e.target.value)
            if (ok) setHex(ok)
          }}
          style={{ width: 96, borderColor: valid ? undefined : 'var(--danger)' }}
        />
      </label>
      <p className="help">Text on the block switches between white and ink so it stays readable.</p>
    </Sheet>
  )
}
