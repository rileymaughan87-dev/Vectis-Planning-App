// Note pictures between devices, while sync is live. Loaded with the sync
// engine (only on devices that sync).
//
// Each picture is stored as base64 text split into parts
// (users/{uid}/pictureParts/{id}_{n}, each well under Firestore's 1 MiB
// limit), plus a small index entry (users/{uid}/pictureIndex/{id}) that's
// written last, so an index entry means the picture is complete. Devices
// watch the small index only; a picture's parts are fetched just when a
// note here needs it.

import type { LiveContext } from '@suite/sync/store'
import { collection, doc, getDoc, onSnapshot, writeBatch, type CollectionReference, type Firestore } from 'firebase/firestore'
import { ATTACHMENT_SAVED, attachmentIDs, fromBase64, loadAttachment, saveAttachment, toBase64 } from '@suite/record/attachments'
import { useData } from '../store/data'
import { attachmentsInUse } from './backup'
import { planPictures, splitParts, type CloudIndex } from './picturePlan'

export function start({ db, uid }: LiveContext): () => void {
  const index = collection(db, 'users', uid, 'pictureIndex')
  const parts = collection(db, 'users', uid, 'pictureParts')
  let cloud: CloudIndex = new Map()
  let cloudParts = new Map<string, { parts: number; type: string }>()
  let indexLoaded = false
  /** Only tidy the cloud when the index came from the server, not an offline copy. */
  let online = false
  let stopped = false
  let running = false
  let again = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(() => void run(), 1500)
  }

  const run = async () => {
    if (stopped || !indexLoaded) return
    if (running) {
      again = true
      return
    }
    running = true
    try {
      const local = new Set(await attachmentIDs())
      const plan = planPictures(local, cloud, attachmentsInUse(), Date.now())
      for (const id of plan.upload) {
        if (stopped) return
        await upload(db, parts, index, id)
      }
      for (const id of plan.download) {
        if (stopped) return
        await download(parts, id, cloudParts.get(id))
      }
      for (const id of online ? plan.removeFromCloud : []) {
        if (stopped) return
        remove(db, parts, index, id, cloudParts.get(id)?.parts ?? 1)
      }
    } catch {
      // Offline or interrupted: the next change, or reopening the app, tries again.
    } finally {
      running = false
      if (again && !stopped) {
        again = false
        schedule()
      }
    }
  }

  const stopIndex = onSnapshot(index, { includeMetadataChanges: true }, snap => {
    online = !snap.metadata.fromCache
    cloud = new Map()
    cloudParts = new Map()
    snap.forEach(d => {
      const data = d.data()
      cloud.set(d.id, { createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0 })
      cloudParts.set(d.id, { parts: typeof data.parts === 'number' ? data.parts : 1, type: typeof data.type === 'string' ? data.type : 'image/jpeg' })
    })
    indexLoaded = true
    schedule()
  }, () => {})

  // A new picture here, or a note here that now uses one from elsewhere.
  window.addEventListener(ATTACHMENT_SAVED, schedule)
  const stopNotes = useData.subscribe((s, p) => {
    if (s.notes !== p.notes || s.journal !== p.journal) schedule()
  })

  return () => {
    stopped = true
    clearTimeout(timer)
    stopIndex()
    stopNotes()
    window.removeEventListener(ATTACHMENT_SAVED, schedule)
  }
}

async function upload(db: Firestore, parts: CollectionReference, index: CollectionReference, id: string) {
  const stored = await loadAttachment(id)
  if (!stored) return
  const chunks = splitParts(await toBase64(stored.blob))
  const batch = writeBatch(db)
  chunks.forEach((data, n) => batch.set(doc(parts, `${id}_${n}`), { data, part: n }))
  // Last, so an index entry always means every part is there.
  batch.set(doc(index, id), { parts: chunks.length, type: stored.blob.type || 'image/jpeg', size: stored.blob.size, createdAt: stored.createdAt })
  // Not awaited: offline it only finishes on reconnecting, but the local cache (and so the index we watch) has it at once.
  void batch.commit().catch(() => {})
}

async function download(parts: CollectionReference, id: string, info?: { parts: number; type: string }) {
  if (!info) return
  let data = ''
  for (let n = 0; n < info.parts; n++) {
    const snap = await getDoc(doc(parts, `${id}_${n}`))
    const piece = snap.data()?.data
    if (typeof piece !== 'string') return // not all there yet; try again later
    data += piece
  }
  await saveAttachment(id, fromBase64(data, info.type), { fromSync: true })
}

function remove(db: Firestore, parts: CollectionReference, index: CollectionReference, id: string, count: number) {
  const batch = writeBatch(db)
  batch.delete(doc(index, id))
  for (let n = 0; n < count; n++) batch.delete(doc(parts, `${id}_${n}`))
  void batch.commit().catch(() => {})
}
