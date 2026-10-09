// Moving data in and out: importing the iPhone app's save files, and the
// one-file backup of everything stored here — the same "vectis-backup"
// file Record makes (suite/record/backup.ts), note pictures included.

import {
  decodeAppearance, decodeCategory, decodeEvent, decodeGoal, decodeHours, decodeJournalEntry, decodePlanReview, decodeTask, list,
} from '../model/decode'
import { downloadVectisBackup, restoreVectisBackup } from '@suite/record/backup'
import { useData, type DataState } from '../store/data'
import { Filename, saveRaw, storage } from '../store/persist'

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
}

/** Record's files: saved as they are, for Record to read (it decodes them itself). */
const recordFiles: string[] = [Filename.notes, Filename.notebooks]

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
    if (recordFiles.includes(file.name)) {
      try {
        saveRaw(file.name, JSON.parse(await file.text()))
        result.imported.push(`${file.name} (in Record)`)
      } catch {
        result.skipped.push(`${file.name} (couldn't be read)`)
      }
      continue
    }
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

export const downloadBackup = () => downloadVectisBackup(storage)

/** Restores a backup, then reloads so every store reads it fresh. */
export const restoreBackup = (file: File) => restoreVectisBackup(storage, file)

export { downloadJSON } from '@suite/backup'
