// An app's data as sync records, and back. Pure functions, shared by
// Planner and Finance — the Firebase side is in ./engine.ts.
//
// Each item in a list (a goal, an event, a spending entry…) is its own
// record, so two devices editing different things never clash; editing
// the same thing on both, the last save wins. A deleted item leaves a
// small "deleted" record (a tombstone) so the other device removes it
// rather than sending it back. Settings are one record each.

/** One record as stored in Firestore (under users/{uid}/{collection}/{docId}). */
export interface SyncRecord {
  /** Which slice it belongs to: the app's file name, e.g. "goals.json". */
  file: string
  /** The item's id; empty for a single value. */
  id: string
  /** Position in its list, so both devices keep the same order. */
  index: number
  /** The item as JSON text: safe for any shape (Firestore can't hold nested arrays or undefined). */
  json: string
  deleted: boolean
}

export type SliceKind = 'list' | 'single'

/** Firestore document ids can't contain "/", so ids are escaped. */
export function docID(file: string, id: string): string {
  const base = file.replace(/\.json$/, '')
  return id ? `${base}__${encodeURIComponent(id)}` : base
}

/** Every record for one slice of the data. Items without an id can't sync and are skipped. */
export function recordsFor(file: string, kind: SliceKind, value: unknown): Map<string, SyncRecord> {
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

/**
 * What to send for one slice: records that are new or changed compared
 * with what the cloud has (`known`), and tombstones for items that have
 * gone. Unchanged records aren't sent.
 */
export function diff(known: Map<string, SyncRecord>, file: string, current: Map<string, SyncRecord>): Map<string, SyncRecord> {
  const writes = new Map<string, SyncRecord>()
  for (const [k, r] of current) {
    const was = known.get(k)
    if (!was || was.deleted || was.json !== r.json || was.index !== r.index) writes.set(k, r)
  }
  for (const [k, r] of known) {
    if (r.file === file && !r.deleted && !current.has(k)) writes.set(k, { ...r, json: '', deleted: true })
  }
  return writes
}

/** One slice rebuilt from the records: a list in order, or the single value (undefined if there isn't one). */
export function rebuild(records: Map<string, SyncRecord>, file: string, kind: SliceKind): unknown {
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

/** Live items in one slice. */
export const countIn = (records: Map<string, SyncRecord>, file: string) =>
  [...records.values()].filter(r => r.file === file && !r.deleted).length

/** "12 goals, 2 journal entries" from (singular, plural, count) parts; "nothing yet" if all zero. */
export function describeCounts(parts: [string, string, number][]): string {
  const shown = parts.filter(([, , n]) => n > 0).map(([one, many, n]) => `${n} ${n === 1 ? one : many}`)
  return shown.length ? shown.join(', ') : 'nothing yet'
}
