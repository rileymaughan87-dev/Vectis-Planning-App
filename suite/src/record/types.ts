// The saved shapes of Record's data — journal entries, notes and notebooks
// — shared by Record (which edits them) and Planner (whose evening review
// writes the day's Daily review). Shaped like the iPhone app's JSON files.

import type { ISODate } from '../dates'
import type { NoteDoc } from './noteDoc'

export type ID = string

/**
 * One per day. Its document has two foldable sections under headings —
 * "Journal" and "Daily review" (where the evening review's answer goes);
 * see `dayDoc` in noteDoc.ts.
 */
export interface JournalEntry {
  id: ID
  /** The day this entry is for, not necessarily when it was written. */
  date: ISODate
  /** The evening review's prompt, once the review has been answered. */
  reflectionPrompt?: string
  /** Plain text of the whole day — what search reads. */
  text: string
  /** The formatted day from the shared editor; see noteDoc.ts. */
  body?: NoteDoc
}

export type NoteType = 'jot' | 'list' | 'classic'

export interface ChecklistItem {
  id: ID
  text: string
  done: boolean
}

export interface Notebook {
  id: ID
  title: string
  linkedGoalID?: ID
  createdDate: ISODate
}

/** One note; only the fields for its `type` are used. */
export interface Note {
  id: ID
  type: NoteType
  title: string
  /** Jots only. */
  jotText: string
  /** Classic notes only: RTF, base64-encoded (Swift `Data`). */
  richTextData?: string
  /** Lists only. */
  checklistItems: ChecklistItem[]
  /**
   * The formatted note from the shared editor (noteDoc.ts). When
   * set it's the note's content; the fields above are only read for
   * notes saved before it existed, such as iPhone imports.
   */
  body?: NoteDoc
  /** Answers after lines ending in "=" (web only; on unless turned off for this note). */
  mathResults: boolean
  linkedGoalID?: ID
  /** Unset means it sits loose in its type's section. */
  notebookID?: ID
  updatedDate: ISODate
}
