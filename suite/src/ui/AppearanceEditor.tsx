// Display mode and colour scheme, as boxes in an app's Settings. Shared so
// both apps offer exactly the same choices.

import { Check } from 'lucide-react'
import { PALETTE_PRESETS, type AppearanceSettings, type ColorSchemeMode } from '../appearance'
import { EditorBox, Field, Segmented } from './components'

export function AppearanceEditor({ appearance, onChange }: { appearance: AppearanceSettings; onChange: (patch: Partial<AppearanceSettings>) => void }) {
  return (
    <>
      <EditorBox title="Display mode">
        <Segmented<ColorSchemeMode>
          label="Display mode"
          value={appearance.mode}
          onChange={mode => onChange({ mode })}
          options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]}
        />
        <p className="help">System follows your device's own light/dark setting.</p>
      </EditorBox>

      <EditorBox title="Colour scheme">
        {PALETTE_PRESETS.map(p => {
          const selected = !appearance.isCustom && appearance.selectedPresetID === p.id
          return (
            <button key={p.id} className="row" style={{ textAlign: 'left', gap: 12 }} onClick={() => onChange({ selectedPresetID: p.id, isCustom: false })} aria-pressed={selected}>
              <span className="row" style={{ gap: 4 }}>
                {[p.primaryHex, p.secondaryHex, p.tertiaryHex].map(h => <span key={h} className="swatch" style={{ width: 18, height: 18, background: `#${h}` }} />)}
              </span>
              <span className="grow">
                <div style={{ fontWeight: 500, fontSize: 14 }}>{p.name}</div>
                <div className="caption2">{p.theory}</div>
              </span>
              {selected && <Check size={18} color="var(--primary)" />}
            </button>
          )
        })}
        <button className="row" style={{ gap: 12 }} onClick={() => onChange({ isCustom: true })} aria-pressed={appearance.isCustom}>
          <span className="grow" style={{ textAlign: 'left', paddingLeft: 66 }}>Custom</span>
          {appearance.isCustom && <Check size={18} color="var(--primary)" />}
        </button>
        {appearance.isCustom && (
          <div className="inline-fields">
            {([['Primary', 'customPrimaryHex'], ['Secondary', 'customSecondaryHex'], ['Tertiary', 'customTertiaryHex']] as const).map(([label, k]) => (
              <Field key={k} label={label}>
                <input type="color" value={`#${appearance[k].replace('#', '')}`} onChange={e => onChange({ [k]: e.target.value.slice(1).toUpperCase() })} style={{ height: 36, padding: 2 }} />
              </Field>
            ))}
          </div>
        )}
        <p className="help">Warning colours (overdue, unconfirmed) always stay the same, for clarity.</p>
      </EditorBox>
    </>
  )
}
