// The "vectis-backup" file: everything saved under "vectis:" (Planner's
// data and Record's journal, notes and notebooks share it) plus note
// pictures, which live in IndexedDB and go in as base64. Planner and
// Record make and restore the same file.

import { downloadJSON } from '../backup'
import type { AppStorage } from '../storage'
import { exportAttachments, importAttachments } from './attachments'

export async function downloadVectisBackup(storage: AppStorage) {
  let attachments = {}
  try {
    attachments = await exportAttachments()
  } catch {
    // No picture store in this browser; the rest still backs up.
  }
  const body = JSON.stringify({ format: 'vectis-backup', version: 1, savedAt: new Date().toISOString(), entries: storage.allEntries(), attachments }, null, 2)
  downloadJSON(body, `vectis-backup-${new Date().toISOString().slice(0, 10)}.json`)
}

/** Restores a backup, then reloads so every store reads it fresh. */
export async function restoreVectisBackup(storage: AppStorage, file: File) {
  const parsed = JSON.parse(await file.text())
  if (parsed?.format !== 'vectis-backup' || typeof parsed.entries !== 'object') {
    throw new Error("That file isn't a Planner or Record backup.")
  }
  for (const [name, text] of Object.entries(parsed.entries as Record<string, string>)) {
    storage.saveRaw(name, JSON.parse(text))
  }
  // Older backups have no pictures; newer ones bring them back.
  if (parsed.attachments && typeof parsed.attachments === 'object') await importAttachments(parsed.attachments)
  location.reload()
}
