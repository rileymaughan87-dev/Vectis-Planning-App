// Record's saved data. It keeps Planner's "vectis:" prefix and the iPhone
// app's file names: the journal, notes and notebooks were Planner's
// before Record existed, and Planner's evening review still writes the
// journal — so both apps read and write the very same entries.

import { createStorage } from '@suite/storage'

export const Filename = {
  journalEntries: 'journal_entries.json',
  notes: 'notes.json',
  notebooks: 'notebooks.json',
  /** Web only: school papers (model/papers.ts). */
  papers: 'papers.json',
  /** Planner's; Record only reads it, to link notes to goals. */
  goals: 'goals.json',
  /** Shared with Planner, so both look the same. */
  appearance: 'appearance.json',
} as const

export const storage = createStorage('vectis:', 'Record')
