// Links between the Vectis apps. Each app lives in its own folder beside
// the others (…/planner/, …/record/), so a link from one to another is
// relative ("../record/…") and stays inside the same Home Screen app.
//
// Record understands two addresses after "#":
//   journal=2026-10-10  opens that day's journal entry
//   goal=<goal id>      shows the notes linked to that Planner goal

import { dayFromKey, dayKey } from './dates'
import type { Note, Notebook } from './record/types'

/** From any app's page: open a day in Record's journal. */
export const recordJournalLink = (date: Date) => `../record/#journal=${dayKey(date)}`

/** From any app's page: Record's notes for one Planner goal. */
export const recordGoalLink = (goalID: string) => `../record/#goal=${encodeURIComponent(goalID)}`

export type RecordLink = { kind: 'journal'; date: Date } | { kind: 'goal'; goalID: string }

/** What a Record address asks for, if anything. */
export function parseRecordLink(hash: string): RecordLink | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const journal = params.get('journal')
  if (journal && /^\d{4}-\d{2}-\d{2}$/.test(journal)) return { kind: 'journal', date: dayFromKey(journal) }
  const goal = params.get('goal')
  if (goal) return { kind: 'goal', goalID: goal }
  return null
}

/** A note belongs to a goal if it's linked itself, or sits in a notebook that is. */
export function isLinkedToGoal(note: Note, notebooks: Notebook[], goalID: string): boolean {
  if (note.linkedGoalID === goalID) return true
  const book = note.notebookID ? notebooks.find(b => b.id === note.notebookID) : undefined
  return book?.linkedGoalID === goalID
}

/** How many notes each goal has, by goal id. */
export function notesPerGoal(notes: Note[], notebooks: Notebook[]): Map<string, number> {
  const counts = new Map<string, number>()
  const goalIDs = new Set([...notes.map(n => n.linkedGoalID), ...notebooks.map(b => b.linkedGoalID)].filter((id): id is string => Boolean(id)))
  for (const id of goalIDs) {
    const n = notes.filter(note => isLinkedToGoal(note, notebooks, id)).length
    if (n) counts.set(id, n)
  }
  return counts
}
