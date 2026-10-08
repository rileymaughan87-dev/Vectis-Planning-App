// Photos, scans and drawings in notes. Too big for the rest of the data's
// localStorage, so each is a blob in this browser's IndexedDB, keyed by
// id; a note only holds the id (an "attachment" node in its document).
// Like everything else, it stays on this device — backups carry it over.

const DB_NAME = 'vectis-attachments'
const STORE = 'files'

export interface StoredAttachment {
  id: string
  blob: Blob
  createdAt: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      dbPromise = null
      reject(req.error)
    }
  })
  return dbPromise
}

function run<T>(mode: IDBTransactionMode, f: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(d => new Promise<T>((resolve, reject) => {
    const req = f(d.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }))
}

export async function saveAttachment(id: string, blob: Blob): Promise<void> {
  await run('readwrite', s => s.put({ id, blob, createdAt: Date.now() } satisfies StoredAttachment))
  // Ask the browser not to clear these when space runs low (photos can't be rebuilt).
  navigator.storage?.persist?.().catch(() => {})
}

export const loadAttachment = (id: string) => run<StoredAttachment | undefined>('readonly', s => s.get(id))

export const deleteAttachment = (id: string) => run('readwrite', s => s.delete(id)).then(() => undefined)

export const allAttachments = () => run<StoredAttachment[]>('readonly', s => s.getAll())

// MARK: - Showing them

const urls = new Map<string, Promise<string | null>>()

/** An object URL for an attachment, made once and reused; null if it's missing. */
export function attachmentURL(id: string): Promise<string | null> {
  let url = urls.get(id)
  if (!url) {
    url = loadAttachment(id).then(a => (a ? URL.createObjectURL(a.blob) : null)).catch(() => null)
    urls.set(id, url)
  }
  return url
}

// MARK: - Tidying up

/**
 * Removes attachments no note or journal entry uses any more (a photo
 * deleted from a note, or a deleted note). Recent ones are kept for a day,
 * so undo in an open editor can still bring a photo back.
 */
export async function removeUnused(inUse: Set<string>, keepNewerThan = Date.now() - 86_400_000): Promise<number> {
  const all = await allAttachments()
  const unused = all.filter(a => !inUse.has(a.id) && a.createdAt < keepNewerThan)
  for (const a of unused) await deleteAttachment(a.id)
  return unused.length
}

// MARK: - Backups

/** Every attachment as base64 text, for the one-file backup. */
export async function exportAttachments(): Promise<Record<string, { type: string; data: string }>> {
  const out: Record<string, { type: string; data: string }> = {}
  for (const a of await allAttachments()) {
    const bytes = new Uint8Array(await a.blob.arrayBuffer())
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    out[a.id] = { type: a.blob.type, data: btoa(binary) }
  }
  return out
}

export async function importAttachments(files: Record<string, { type: string; data: string }>): Promise<void> {
  for (const [id, f] of Object.entries(files)) {
    if (typeof f?.data !== 'string') continue
    const bytes = Uint8Array.from(atob(f.data), c => c.charCodeAt(0))
    await saveAttachment(id, new Blob([bytes], { type: typeof f.type === 'string' ? f.type : 'image/jpeg' }))
  }
}
