// Planner's data as sync records, and back. Pure functions — the Firebase
// side is in sync/engine.ts.
//
// Each goal, event, task, note… is its own record, so two devices editing
// different things never clash; editing the same thing on both, the last
// save wins. A deleted item leaves a small "deleted" record (a tombstone)
// so the other device knows to remove it rather than send it back.
// Settings (hours, appearance, plan and review) are one record each.

import type { DataState } from '../store/data'
import { Filename } from '../store/persist'

export type SyncedKey = keyof DataState

/** What syncs, and how: a list of items with ids, or one value. */
export const SYNCED: { key: SyncedKey; file: string; kind: 'list' | 'single' }[] = [
  { key: 'goals', file: Filename.goals, kind: 'list' },
  { key: 'events', file: Filename.calendarEvents, kind: 'list' },
  { key: 'categories', file: Filename.categories, kind: 'list' },
  { key: 'hours', file: Filename.calendarHours, kind: 'single' },
  { key: 'tasks', file: Filename.tasks, kind: 'list' },
  { key: 'appearance', file: Filename.appearance, kind: 'single' },
  { key: 'planReview', file: Filename.planReviewSettings, kind: 'single' },
  { key: 'journal', file: Filename.journalEntries, kind: 'list' },
  { key: 'notes', file: Filename.notes, kind: 'list' },
  { key: 'notebooks', file: Filename.notebooks, kind: 'list' },
]

/** One record as stored in Firestore (under users/{uid}/planner/{docId}). */
export interface SyncRecord {
  file: string
  /** The item's id; empty for a single value. */
  id: string
  /** Position in its list, so both devices keep the same order. */
  index: number
  /** The item as JSON text: safe for any shape (Firestore can't hold nested arrays or undefined). */
  json: string
  deleted: boolean
}

/** Firestore document ids can't contain "/", so ids are escaped. */
export function docID(file: string, id: string): string {
  const base = file.replace(/\.json$/, '')
  return id ? `${base}__${encodeURIComponent(id)}` : base
}

/** Every record for one slice of the data. Items without an id can't sync and are skipped. */
export function recordsFor(file: string, kind: 'list' | 'single', value: unknown): Map<string, SyncRecord> {
  const out = new Map<string, SyncRecord>()
  if (kind === 'single') {
    out.set(docID(file, ''), { file, id: '', index: 0, json: JSON.stringify(value), deleted: false })
    return out
  }
  if (!Array.isArray(value)) return out
  value.forEach((item, index) => {
    const id = typeof item?.id === 'string' ? item.id : ''
    if (!id) return
    out.set(docID(file, id), { file, id, index, json: JSON.stringify(item), deleted: false })
  })
  return out
}

export function allRecords(state: Pick<DataState, SyncedKey>): Map<string, SyncRecord> {
  const out = new Map<string, SyncRecord>()
  for (const s of SYNCED) for (const [k, r] of recordsFor(s.file, s.kind, state[s.key])) out.set(k, r)
  return out
}

export interface Changes {
  /** Records to write (new, changed, or newly deleted). */
  writes: Map<string, SyncRecord>
}

/**
 * What to send for one slice: records that are new or changed compared
 * with what the cloud has (`known`), and tombstones for items that have
 * gone. Unchanged records aren't sent.
 */
export function diff(known: Map<string, SyncRecord>, file: string, current: Map<string, SyncRecord>): Changes {
  const writes = new Map<string, SyncRecord>()
  for (const [k, r] of current) {
    const was = known.get(k)
    if (!was || was.deleted || was.json !== r.json || was.index !== r.index) writes.set(k, r)
  }
  for (const [k, r] of known) {
    if (r.file === file && !r.deleted && !current.has(k)) writes.set(k, { ...r, json: '', deleted: true })
  }
  return { writes }
}

/** One slice rebuilt from the records: a list in order, or the single value (undefined if there isn't one). */
export function rebuild(records: Map<string, SyncRecord>, file: string, kind: 'list' | 'single'): unknown {
  const mine = [...records.values()].filter(r => r.file === file && !r.deleted)
  if (kind === 'single') return mine[0] ? JSON.parse(mine[0].json) : undefined
  return mine.sort((a, b) => a.index - b.index || a.id.localeCompare(b.id)).map(r => JSON.parse(r.json))
}

/** Reads a stored record defensively — anything malformed is ignored. */
export function readRecord(data: Record<string, unknown>): SyncRecord | null {
  if (typeof data.file !== 'string' || typeof data.json !== 'string') return null
  return {
    file: data.file,
    id: typeof data.id === 'string' ? data.id : '',
    index: typeof data.index === 'number' ? data.index : 0,
    json: data.json,
    deleted: data.deleted === true,
  }
}

/** "12 goals, 40 events, 8 notes…" — to show what each side holds before choosing. */
export function describe(records: Map<string, SyncRecord>): string {
  const count = (file: string) => [...records.values()].filter(r => r.file === file && !r.deleted).length
  const parts: [string, string, number][] = [
    ['goal', 'goals', count(Filename.goals)], ['event', 'events', count(Filename.calendarEvents)], ['task', 'tasks', count(Filename.tasks)],
    ['note', 'notes', count(Filename.notes)], ['journal entry', 'journal entries', count(Filename.journalEntries)],
  ]
  const shown = parts.filter(([, , n]) => n > 0).map(([one, many, n]) => `${n} ${n === 1 ? one : many}`)
  return shown.length ? shown.join(', ') : 'nothing yet'
}

/** Whether there's anything of substance (not just default settings). */
export function hasContent(records: Map<string, SyncRecord>): boolean {
  const lists = new Set(SYNCED.filter(s => s.kind === 'list' && s.key !== 'categories').map(s => s.file))
  return [...records.values()].some(r => lists.has(r.file) && !r.deleted)
}
