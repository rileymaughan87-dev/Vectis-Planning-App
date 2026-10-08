// Moving data in and out: importing the iPhone app's save files, and a
// one-file backup of everything stored here — note pictures included
// (they live in IndexedDB, so they're added as base64).

import {
  decodeAppearance, decodeCategory, decodeEvent, decodeGoal, decodeHours, decodeJournalEntry, decodeNote, decodeNotebook, decodePlanReview, decodeTask, list,
} from '../model/decode'
import { attachmentIDs } from '../model/noteDoc'
import { exportAttachments, importAttachments, removeUnused } from '../store/attachments'
import { useData, type DataState } from '../store/data'
import { Filename, allEntries, saveRaw } from '../store/persist'

/** iPhone file name → how to read it into which slice. */
const swiftFiles: Record<string, (raw: unknown) => Partial<DataState>> = {
  [Filename.goals]: raw => ({ goals: list(raw, decodeGoal) }),
  [Filename.calendarEvents]: raw => ({ events: list(raw, decodeEvent) }),
  [Filename.categories]: raw => ({ categories: list(raw, decodeCategory) }),
  [Filename.calendarHours]: raw => ({ hours: decodeHours(raw) }),
  [Filename.tasks]: raw => ({ tasks: list(raw, decodeTask) }),
  [Filename.appearance]: raw => ({ appearance: decodeAppearance(raw) }),
  [Filename.planReviewSettings]: raw => ({ planReview: decodePlanReview(raw) }),
  [Filename.journalEntries]: raw => ({ journal: list(raw, decodeJournalEntry) }),
  [Filename.notes]: raw => ({ notes: list(raw, decodeNote) }),
  [Filename.notebooks]: raw => ({ notebooks: list(raw, decodeNotebook) }),
}

export interface ImportResult {
  imported: string[]
  skipped: string[]
}

/**
 * Reads whichever iPhone save files were picked, by name, and replaces
 * those parts of the data here. Files it doesn't know (journal, people…)
 * are listed as skipped — those parts of the app aren't on the web yet.
 */
export async function importSwiftFiles(files: File[]): Promise<ImportResult> {
  const patch: Partial<DataState> = {}
  const result: ImportResult = { imported: [], skipped: [] }
  for (const file of files) {
    const read = swiftFiles[file.name]
    if (!read) {
      result.skipped.push(file.name)
      continue
    }
    try {
      Object.assign(patch, read(JSON.parse(await file.text())))
      result.imported.push(file.name)
    } catch {
      result.skipped.push(`${file.name} (couldn't be read)`)
    }
  }
  if (result.imported.length) useData.getState().replace(patch)
  return result
}

export async function downloadBackup() {
  let attachments = {}
  try {
    attachments = await exportAttachments()
  } catch {
    // No picture store in this browser; the rest still backs up.
  }
  const body = JSON.stringify({ format: 'vectis-backup', version: 1, savedAt: new Date().toISOString(), entries: allEntries(), attachments }, null, 2)
  downloadJSON(body, `vectis-backup-${new Date().toISOString().slice(0, 10)}.json`)
}

/** Restores a backup, then reloads so every store reads it fresh. */
export async function restoreBackup(file: File) {
  const parsed = JSON.parse(await file.text())
  if (parsed?.format !== 'vectis-backup' || typeof parsed.entries !== 'object') {
    throw new Error("That file isn't a Planner backup.")
  }
  for (const [name, text] of Object.entries(parsed.entries as Record<string, string>)) {
    saveRaw(name, JSON.parse(text))
  }
  // Older backups have no pictures; newer ones bring them back.
  if (parsed.attachments && typeof parsed.attachments === 'object') await importAttachments(parsed.attachments)
  location.reload()
}

/** Every picture a note or journal entry still uses. */
export function attachmentsInUse(): Set<string> {
  const { notes, journal } = useData.getState()
  const ids = new Set<string>()
  for (const n of notes) if (n.body) for (const id of attachmentIDs(n.body.doc)) ids.add(id)
  for (const j of journal) if (j.body) for (const id of attachmentIDs(j.body.doc)) ids.add(id)
  return ids
}

/** Clears out pictures nothing uses any more; run quietly a little after start-up. */
export function tidyAttachments() {
  removeUnused(attachmentsInUse()).catch(() => {})
}

export function downloadJSON(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
