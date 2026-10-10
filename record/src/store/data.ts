// Record's data and every action that changes it. Each slice saves to
// its own file whenever it changes.
//
// Planner (another tab, or the evening review) writes the same journal,
// so a change made there is picked up here as soon as it's saved.

import { decodeAppearance, type AppearanceSettings } from '@suite/appearance'
import { isSameDay, parseDate, startOfDay, toISO } from '@suite/dates'
import { list } from '@suite/decode'
import { newID } from '@suite/ids'
import { decodeJournalEntry, decodeNote, decodeNotebook } from '@suite/record/decode'
import { docToPlainText, wrapDoc, type DocNode } from '@suite/record/noteDoc'
import type { JournalEntry, Note, Notebook } from '@suite/record/types'
import { create } from 'zustand'
import { decodeGoalRefs, type GoalRef } from '../model/goals'
import { decodePapers, type Paper } from '../model/papers'
import { sampleNotes } from '../model/sample'
import { Filename, storage } from './persist'

export interface DataState {
  journal: JournalEntry[]
  notes: Note[]
  notebooks: Notebook[]
  papers: Paper[]
  appearance: AppearanceSettings
  /** Planner's goals, read only. */
  goals: GoalRef[]
}

interface Actions {
  /** Saves a formatted day, keeping its plain text in step. */
  setJournalDoc(date: Date, doc: DocNode): void
  deleteJournalEntry(id: string): void
  /** Adds or replaces a note, stamping it as just updated. */
  saveNote(note: Note): void
  deleteNote(id: string): void
  saveNotebook(notebook: Notebook): void
  /** Keeps its notes — they go back to Notes. */
  deleteNotebook(id: string): void
  /** Adds or replaces a paper, stamping it as just edited. */
  savePaper(paper: Paper): void
  deletePaper(id: string): void
  setAppearance(patch: Partial<AppearanceSettings>): void
  replace(patch: Partial<DataState>): void
}

const read: { [K in keyof DataState]: () => DataState[K] } = {
  journal: () => list(storage.loadRaw(Filename.journalEntries), decodeJournalEntry),
  notes: () => {
    const saved = storage.loadRaw(Filename.notes)
    return saved === undefined ? sampleNotes() : list(saved, decodeNote)
  },
  notebooks: () => list(storage.loadRaw(Filename.notebooks), decodeNotebook),
  papers: () => decodePapers(storage.loadRaw(Filename.papers)),
  appearance: () => decodeAppearance(storage.loadRaw(Filename.appearance)),
  goals: () => decodeGoalRefs(storage.loadRaw(Filename.goals)),
}

const fileFor: Record<keyof DataState, string> = {
  journal: Filename.journalEntries,
  notes: Filename.notes,
  notebooks: Filename.notebooks,
  papers: Filename.papers,
  appearance: Filename.appearance,
  goals: Filename.goals,
}

/** Planner's, so never saved from here. */
const READ_ONLY: (keyof DataState)[] = ['goals']

export const useData = create<DataState & Actions>()(set => ({
  journal: read.journal(),
  notes: read.notes(),
  notebooks: read.notebooks(),
  papers: read.papers(),
  appearance: read.appearance(),
  goals: read.goals(),

  setJournalDoc: (date, doc) => set(s => ({ journal: patchDay(s.journal, date, { text: docToPlainText(doc), body: wrapDoc(doc) }) })),
  deleteJournalEntry: id => set(s => ({ journal: s.journal.filter(e => e.id !== id) })),

  saveNote: note =>
    set(s => {
      const stamped = { ...note, updatedDate: toISO(new Date()) }
      const exists = s.notes.some(n => n.id === note.id)
      return { notes: exists ? s.notes.map(n => (n.id === note.id ? stamped : n)) : [...s.notes, stamped] }
    }),
  deleteNote: id => set(s => ({ notes: s.notes.filter(n => n.id !== id) })),
  saveNotebook: notebook =>
    set(s => ({
      notebooks: s.notebooks.some(b => b.id === notebook.id)
        ? s.notebooks.map(b => (b.id === notebook.id ? notebook : b))
        : [...s.notebooks, notebook],
    })),
  deleteNotebook: id =>
    set(s => ({
      notebooks: s.notebooks.filter(b => b.id !== id),
      notes: s.notes.map(n => (n.notebookID === id ? { ...n, notebookID: undefined } : n)),
    })),

  savePaper: paper =>
    set(s => {
      const stamped = { ...paper, updatedDate: toISO(new Date()) }
      return { papers: s.papers.some(p => p.id === paper.id) ? s.papers.map(p => (p.id === paper.id ? stamped : p)) : [...s.papers, stamped] }
    }),
  deletePaper: id => set(s => ({ papers: s.papers.filter(p => p.id !== id) })),

  setAppearance: patch => set(s => ({ appearance: { ...s.appearance, ...patch } })),
  replace: patch => set(patch),
}))

/** Changes the day's entry, starting one if there isn't one yet. */
function patchDay(journal: JournalEntry[], date: Date, patch: Partial<JournalEntry>): JournalEntry[] {
  const existing = journal.find(e => isSameDay(parseDate(e.date), date))
  if (existing) return journal.map(e => (e === existing ? { ...e, ...patch } : e))
  return [...journal, { id: newID(), date: toISO(startOfDay(date)), text: '', ...patch }]
}

/** Set while taking in another tab's save, so it isn't written straight back. */
let fromElsewhere = false

useData.subscribe((state, prev) => {
  if (fromElsewhere) return
  for (const key of Object.keys(fileFor) as (keyof DataState)[]) {
    if (!READ_ONLY.includes(key) && state[key] !== prev[key]) storage.saveRaw(fileFor[key], state[key])
  }
})

// Another tab (Planner's evening review, or Record open twice) saved one of these.
window.addEventListener('storage', e => {
  const key = (Object.keys(fileFor) as (keyof DataState)[]).find(k => e.key === `vectis:${fileFor[k]}`)
  if (!key) return
  fromElsewhere = true
  try {
    useData.setState({ [key]: read[key]() } as Partial<DataState>)
  } finally {
    fromElsewhere = false
  }
})
