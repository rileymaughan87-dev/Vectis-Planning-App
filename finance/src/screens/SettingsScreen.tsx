// Finance settings: appearance, currency and your data.

import { AppearanceEditor } from '@suite/ui/AppearanceEditor'
import { EditorBox, Sheet, VButton } from '@suite/ui/components'
import { useRef, useState } from 'react'
import { SyncBox } from '@suite/ui/SyncBox'
import { CURRENCIES, regionCurrency } from '../model/money'
import { useSync } from '../store/sync'
import { backups } from '../store/persist'
import { useSettings } from '../store/settings'

export function SettingsScreen({ onClose }: { onClose: () => void }) {
  const { appearance, setAppearance, currencyOverride, setCurrency } = useSettings()
  const restoreRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  return (
    <Sheet title="Settings" onClose={onClose} leftLabel="Done">
      <SyncBox useSync={useSync} what="your entries, goals, logged spending and weekly pot" />

      <AppearanceEditor appearance={appearance} onChange={setAppearance} />

      <EditorBox title="Currency">
        <select value={currencyOverride ?? ''} onChange={e => setCurrency(e.target.value || undefined)} aria-label="Currency">
          <option value="">Follow my region ({regionCurrency()})</option>
          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </EditorBox>

      <EditorBox title="Your data">
        <p className="help">
          Your money data stays in this browser on this device. A backup is how to keep a copy or move it to another device.
        </p>
        <div className="button-row">
          <VButton onClick={backups.download}>Download backup</VButton>
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
              await backups.restore(file)
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err))
            }
          }}
        />
        {error && <div className="notice error">{error}</div>}
      </EditorBox>
    </Sheet>
  )
}
