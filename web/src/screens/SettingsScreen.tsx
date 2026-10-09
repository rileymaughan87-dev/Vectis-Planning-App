// Settings, ported from SettingsView.swift, plus moving data in and out.

import { AppearanceEditor } from '@suite/ui/AppearanceEditor'
import { Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { formatMinutes } from '../model/format'
import { paletteName } from '../model/palette'
import type { CalendarCategory } from '../model/types'
import { useData } from '../store/data'
import { downloadBackup, importSwiftFiles, restoreBackup, type ImportResult } from '../sync/backup'
import { EditorBox, Field, Sheet, SummaryRow, Toggle, VButton } from '../ui/components'
import { CategoryColoursSheet, ColourPicker } from './CategoryColours'
import { SyncBox } from '@suite/ui/SyncBox'
import { useSync } from '../store/sync'

const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

export function SettingsScreen({ onClose }: { onClose: () => void }) {
  const { appearance, setAppearance, planReview, setPlanReview, categories, setCategories, addCategory, palette, setCategoryColor, hours, setHours } = useData()
  const [colours, setColours] = useState(false)
  const [picking, setPicking] = useState<CalendarCategory | null>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const restoreRef = useRef<HTMLInputElement>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const hourLabel = (h: number) => (h === 24 ? `${formatMinutes(0)} (midnight)` : formatMinutes(h * 60))

  return (
    <Sheet title="Settings" onClose={onClose} leftLabel="Done">
      <SyncBox useSync={useSync} what="your goals, calendar, tasks, settings and journal" />

      <EditorBox title="Plan and review">
        <Toggle label="Plan and review" checked={planReview.isEnabled} onChange={isEnabled => setPlanReview({ isEnabled })} />
        {planReview.isEnabled && (
          <>
            <Field label="Evening review">
              <input
                type="time"
                value={toTime(planReview.eveningReviewMinutes)}
                onChange={e => {
                  if (!e.target.value) return
                  const [h, m] = e.target.value.split(':').map(Number)
                  setPlanReview({ eveningReviewMinutes: h * 60 + m })
                }}
              />
            </Field>
            <Toggle label="Review time estimates" checked={planReview.reviewTimeEstimates} onChange={v => setPlanReview({ reviewTimeEstimates: v })} />
            <Toggle label="Rehearse your plans" checked={planReview.rehearsePlans} onChange={v => setPlanReview({ rehearsePlans: v })} />
            <Toggle label="Flag repeated misses" checked={planReview.flagRepeatedMisses} onChange={v => setPlanReview({ flagRepeatedMisses: v })} />
            <Toggle label="Fresh start prompts" checked={planReview.freshStartPrompts} onChange={v => setPlanReview({ freshStartPrompts: v })} />
          </>
        )}
        <p className="help">
          {planReview.isEnabled
            ? 'Daily planning and Review buttons sit above the Daily grid. A quiet evening review shows on Home once the time above passes, until you’ve answered it.'
            : 'Off by default. Turning it on adds daily planning above the Daily grid and a short evening review — what got done, and an optional line of reflection.'}
          {' '}Only "flag repeated misses" changes anything yet; the others are kept for later.
        </p>
      </EditorBox>

      <AppearanceEditor appearance={appearance} onChange={setAppearance} />

      <EditorBox title="Categories">
        <SummaryRow title="Category colours" summary={paletteName(palette.choice)} onClick={() => setColours(true)} />
        {categories.map(c => (
          <div key={c.id} className="row">
            <button
              className="colour-swatch" aria-label={`${c.name} colour`} title="Change colour"
              style={{ background: c.colorHex, width: 34, height: 34 }} onClick={() => setPicking(c)}
            />
            <input aria-label="Category name" value={c.name} onChange={e => setCategories(categories.map(x => (x.id === c.id ? { ...x, name: e.target.value } : x)))} />
            <button className="icon-button" aria-label={`Delete ${c.name}`} style={{ color: 'var(--danger)' }} disabled={categories.length <= 1} onClick={() => setCategories(categories.filter(x => x.id !== c.id))}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button className="text-button" style={{ textAlign: 'left' }} onClick={() => addCategory('New Category')}>
          + Add category
        </button>
        <p className="help">Deleting a category doesn't delete events using it — they move to your first category next time the app opens.</p>
      </EditorBox>
      {colours && <CategoryColoursSheet onClose={() => setColours(false)} />}
      {picking && (
        <ColourPicker
          category={picking}
          onClose={() => setPicking(null)}
          onDone={hex => { if (hex !== picking.colorHex) setCategoryColor(picking.id, hex); setPicking(null) }}
        />
      )}

      <EditorBox title="Daily calendar hours">
        <div className="inline-fields">
          <Field label="From">
            <select value={hours.startHour} onChange={e => setHours({ ...hours, startHour: Math.min(Number(e.target.value), hours.endHour - 1) })}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
          </Field>
          <Field label="To">
            <select value={hours.endHour} onChange={e => setHours({ ...hours, endHour: Math.max(Number(e.target.value), hours.startHour + 1) })}>
              {Array.from({ length: 24 }, (_, i) => i + 1).map(h => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
          </Field>
        </div>
      </EditorBox>

      <EditorBox title="Your data">
        <p className="help">
          Bring your iPhone data across: in Xcode, open Window › Devices and Simulators, select the app (Planner, or Vectis on older builds) under Installed Apps, choose
          "Download Container…", then pick the .json files from its AppData/Documents folder here. Each file replaces that part of the
          data here (goals, events, categories, tasks, journal, settings; notes and notebooks go to Record).
        </p>
        <VButton onClick={() => importRef.current?.click()}>Import iPhone files…</VButton>
        <input
          ref={importRef} type="file" accept=".json,application/json" multiple className="visually-hidden"
          onChange={async e => {
            const files = Array.from(e.target.files ?? [])
            e.target.value = ''
            if (files.length) setImportResult(await importSwiftFiles(files))
          }}
        />
        {importResult && (
          <div className={`notice ${importResult.imported.length ? 'ok' : ''}`}>
            {importResult.imported.length > 0 && <div>Imported: {importResult.imported.join(', ')}</div>}
            {importResult.skipped.length > 0 && <div className="caption">Not used yet: {importResult.skipped.join(', ')}</div>}
          </div>
        )}
        <div className="button-row">
          <VButton onClick={() => void downloadBackup()}>Download backup</VButton>
          <VButton onClick={() => restoreRef.current?.click()}>Restore backup…</VButton>
        </div>
        <input
          ref={restoreRef} type="file" accept=".json,application/json" className="visually-hidden"
          onChange={async e => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            if (!confirm('Restoring replaces everything stored here with the backup. Continue?')) return
            try {
              await restoreBackup(file)
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err))
            }
          }}
        />
        {error && <div className="notice error">{error}</div>}
        <p className="help">Your data lives in this browser on this device. A backup is the way to move it to another device or keep a copy; it includes the pictures in your notes, so it can be large.</p>
      </EditorBox>
    </Sheet>
  )
}
