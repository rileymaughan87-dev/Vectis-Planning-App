// Record's settings: sync, appearance (shared with Planner) and your data.

import { downloadVectisBackup, restoreVectisBackup } from '@suite/record/backup'
import { AppearanceEditor } from '@suite/ui/AppearanceEditor'
import { EditorBox, Sheet, VButton } from '@suite/ui/components'
import { SyncBox } from '@suite/ui/SyncBox'
import { useRef, useState } from 'react'
import { useData } from '../store/data'
import { storage } from '../store/persist'
import { useSync } from '../store/sync'

export function SettingsScreen({ onClose }: { onClose: () => void }) {
  const { appearance, setAppearance } = useData()
  const restoreRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  return (
    <Sheet title="Settings" onClose={onClose} leftLabel="Done">
      <SyncBox useSync={useSync} what="your journal, notes, notebooks and their pictures" />

      <AppearanceEditor appearance={appearance} onChange={setAppearance} />

      <EditorBox title="Your data">
        <p className="help">
          A backup holds your journal, notes and pictures, and Planner's data too — they share one file, which either app can restore.
        </p>
        <div className="button-row">
          <VButton onClick={() => void downloadVectisBackup(storage)}>Download backup</VButton>
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
              await restoreVectisBackup(storage, file)
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
