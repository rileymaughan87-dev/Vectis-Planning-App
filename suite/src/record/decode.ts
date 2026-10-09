// Reading Record's saved data with a default for every missing field (the
// suite rule: adding a field never makes old data unreadable).

import { toISO } from '../dates'
import { bool, list, oneOf, optStr, str, type Raw } from '../decode'
import { newID } from '../ids'
import { decodeDoc } from './noteDoc'
import type { ChecklistItem, JournalEntry, Note, Notebook } from './types'

const now = () => toISO(new Date())

export function decodeJournalEntry(r: Raw): JournalEntry | null {
  if (typeof r.date !== 'string') return null
  return { id: str(r.id, newID()), date: r.date, reflectionPrompt: optStr(r.reflectionPrompt), text: str(r.text, ''), body: decodeDoc(r.body) }
}

export function decodeChecklistItem(r: Raw): ChecklistItem {
  return { id: str(r.id, newID()), text: str(r.text, ''), done: bool(r.done, false) }
}

export function decodeNotebook(r: Raw): Notebook {
  return { id: str(r.id, newID()), title: str(r.title, ''), linkedGoalID: optStr(r.linkedGoalID), createdDate: str(r.createdDate, now()) }
}

export function decodeNote(r: Raw): Note {
  return {
    id: str(r.id, newID()),
    type: oneOf(r.type, ['jot', 'list', 'classic'] as const, 'classic'),
    title: str(r.title, ''),
    jotText: str(r.jotText, ''),
    richTextData: optStr(r.richTextData),
    checklistItems: list(r.checklistItems, decodeChecklistItem),
    body: decodeDoc(r.body),
    mathResults: bool(r.mathResults, true),
    linkedGoalID: optStr(r.linkedGoalID),
    notebookID: optStr(r.notebookID),
    updatedDate: str(r.updatedDate, now()),
  }
}
