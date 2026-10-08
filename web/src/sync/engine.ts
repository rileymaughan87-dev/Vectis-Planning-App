// The Firebase side of sync. Loaded only when needed (store/sync.ts).
//
// Signing in: Google, through Firebase, which keeps you signed in on this
// device. Data: users/{uid}/planner/{record} in Firestore, readable only by
// you (the rules set up in the console). Firestore's offline cache queues
// changes made without a connection and sends them when it's back.
//
// The first time a device syncs, if both it and the cloud already have
// data, you choose which to keep; the other side's copy is set aside
// (`vectis:before-sync`) rather than thrown away.

import { initializeApp } from 'firebase/app'
import {
  GoogleAuthProvider, browserLocalPersistence, browserPopupRedirectResolver, indexedDBLocalPersistence, initializeAuth,
  onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut as fbSignOut, type Auth, type User,
} from 'firebase/auth'
import {
  collection, doc, getDocsFromCache, getDocsFromServer, initializeFirestore, onSnapshot, persistentLocalCache,
  persistentMultipleTabManager, serverTimestamp, writeBatch, type CollectionReference, type Firestore,
} from 'firebase/firestore'
import {
  decodeAppearance, decodeCategory, decodeEvent, decodeGoal, decodeHours, decodeJournalEntry, decodeNote, decodeNotebook, decodePlanReview,
  decodeTask, list,
} from '../model/decode'
import { newID } from '../model/ids'
import { useData, type DataState } from '../store/data'
import { allEntries } from '../store/persist'
import { SYNC_PENDING_KEY, SYNC_USER_KEY, firebaseConfig, setAttached, useSync } from '../store/sync'
import { SYNCED, allRecords, describe, diff, hasContent, readRecord, rebuild, recordsFor, type SyncRecord, type SyncedKey } from './records'

/** Read a synced value back through the same tolerant decoders as local data. */
const decoders: Record<SyncedKey, (raw: unknown) => unknown> = {
  goals: raw => list(raw, decodeGoal),
  events: raw => list(raw, decodeEvent),
  categories: raw => list(raw, decodeCategory),
  hours: raw => decodeHours(raw),
  tasks: raw => list(raw, decodeTask),
  appearance: raw => decodeAppearance(raw),
  planReview: raw => decodePlanReview(raw),
  journal: raw => list(raw, decodeJournalEntry),
  notes: raw => list(raw, decodeNote),
  notebooks: raw => list(raw, decodeNotebook),
}

let auth: Auth
let db: Firestore
let col: CollectionReference | null = null
/** What the cloud holds, as far as this device knows (including its own unsent writes). */
let known = new Map<string, SyncRecord>()
let stopListening: (() => void) | null = null
let stopWatching: (() => void) | null = null
let pushTimer: ReturnType<typeof setTimeout> | undefined
const dirty = new Set<SyncedKey>()

const device = (() => {
  try {
    let id = localStorage.getItem('vectis:device-id')
    if (!id) localStorage.setItem('vectis:device-id', (id = newID()))
    return id
  } catch {
    return 'unknown'
  }
})()

const store = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Storage unavailable.
  }
}

function friendly(error: unknown): string {
  const code = (error as { code?: string })?.code ?? ''
  if (code.includes('permission-denied')) return "The database refused access. Check the Firestore rules in the Firebase console."
  if (code.includes('unauthorized-domain')) return "This web address isn't allowed to sign in yet. Add it under Authentication → Settings → Authorized domains."
  if (code.includes('popup-closed') || code.includes('cancelled')) return 'Sign-in was closed before it finished.'
  if (code.includes('network')) return "Couldn't reach Google. Check your connection."
  return error instanceof Error ? error.message : String(error)
}

// MARK: - Starting up

let started = false
export async function start() {
  if (started) return
  started = true
  const config = firebaseConfig()
  if (!config) {
    useSync.setState({ phase: 'unavailable' })
    return
  }
  const app = initializeApp(config)
  auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  })
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
  onAuthStateChanged(auth, user => {
    if (user) void connect(user)
    else disconnect()
  })
}

export async function signIn() {
  useSync.setState({ error: undefined })
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  try {
    await signInWithPopup(auth, provider)
  } catch (error) {
    const code = (error as { code?: string })?.code ?? ''
    // Some phones block pop-ups (or don't support them in a home-screen app): go via a full-page redirect instead.
    if (code.includes('popup-blocked') || code.includes('operation-not-supported')) {
      await signInWithRedirect(auth, provider)
      return
    }
    useSync.setState({ error: friendly(error) })
  }
}

export async function signOut() {
  stop()
  store(SYNC_USER_KEY, null)
  store(SYNC_PENDING_KEY, null)
  await fbSignOut(auth)
  useSync.setState({ phase: 'signedOut', email: undefined, choice: undefined, error: undefined })
}

function disconnect() {
  stop()
  useSync.setState({ phase: 'signedOut', email: undefined, choice: undefined })
}

function stop() {
  stopListening?.()
  stopWatching?.()
  stopListening = stopWatching = null
  clearTimeout(pushTimer)
  dirty.clear()
  setAttached(false)
  col = null
}

async function connect(user: User) {
  stop()
  useSync.setState({ phase: 'connecting', email: user.email ?? undefined, error: undefined })
  col = collection(db, 'users', user.uid, 'planner')
  try {
    const snap = await getDocsFromServer(col).catch(() => getDocsFromCache(col!))
    known = new Map()
    snap.forEach(d => {
      const r = readRecord(d.data())
      if (r) known.set(d.id, r)
    })

    if (localStorage.getItem(SYNC_USER_KEY) === user.uid) {
      // This device already syncs: the cloud wins, except for anything edited before we got here.
      const pending = new Set<string>(JSON.parse(localStorage.getItem(SYNC_PENDING_KEY) ?? '[]'))
      const neverSynced = SYNCED.filter(s => ![...known.values()].some(r => r.file === s.file)).map(s => s.key)
      await push(SYNCED.map(s => s.key).filter(k => pending.has(k) || neverSynced.includes(k)))
      pull(SYNCED.map(s => s.key).filter(k => !pending.has(k) && !neverSynced.includes(k)))
      store(SYNC_PENDING_KEY, null)
      goLive()
      return
    }

    const local = allRecords(useData.getState())
    if (!hasContent(known)) {
      // First device: send everything up.
      await push(SYNCED.map(s => s.key))
      store(SYNC_USER_KEY, user.uid)
      goLive()
      return
    }
    if (!hasContent(local)) {
      await choose('cloud', user.uid)
      return
    }
    useSync.setState({ phase: 'choose', choice: { device: describe(local), cloud: describe(known) } })
  } catch (error) {
    useSync.setState({ phase: 'error', error: friendly(error) })
  }
}

/** Settles the first sync: keep this device's data, or the cloud's. The other is set aside, not lost. */
export async function choose(side: 'device' | 'cloud', uid = auth.currentUser?.uid) {
  if (!uid || !col) return
  useSync.setState({ phase: 'connecting', choice: undefined })
  try {
    if (side === 'cloud') {
      store('vectis:before-sync', JSON.stringify({ savedAt: new Date().toISOString(), entries: allEntries() }))
      pull(SYNCED.map(s => s.key))
    } else {
      const cloud = Object.fromEntries(SYNCED.map(s => [s.key, rebuild(known, s.file, s.kind)]))
      store('vectis:cloud-before-sync', JSON.stringify({ savedAt: new Date().toISOString(), data: cloud }))
      await push(SYNCED.map(s => s.key))
    }
    store(SYNC_USER_KEY, uid)
    store(SYNC_PENDING_KEY, null)
    goLive()
  } catch (error) {
    useSync.setState({ phase: 'error', error: friendly(error) })
  }
}

// MARK: - Live

function goLive() {
  if (!col) return
  setAttached(true)
  useSync.setState({ phase: 'live', status: 'sending' })

  // Changes from here go up, a moment after they stop (typing in a note is one write, not fifty).
  stopWatching = useData.subscribe((state, prev) => {
    for (const s of SYNCED) if (state[s.key] !== prev[s.key]) dirty.add(s.key)
    if (!dirty.size) return
    clearTimeout(pushTimer)
    pushTimer = setTimeout(() => {
      const keys = [...dirty]
      dirty.clear()
      push(keys).catch(error => useSync.setState({ error: friendly(error) }))
    }, 600)
  })

  // Changes from other devices come down as they happen.
  stopListening = onSnapshot(col, { includeMetadataChanges: true }, snap => {
    const files = new Set<string>()
    for (const change of snap.docChanges()) {
      if (change.doc.metadata.hasPendingWrites) continue // our own, already applied
      if (change.type === 'removed') {
        const was = known.get(change.doc.id)
        known.delete(change.doc.id)
        if (was) files.add(was.file)
        continue
      }
      const r = readRecord(change.doc.data())
      if (!r) continue
      const was = known.get(change.doc.id)
      if (was && was.json === r.json && was.deleted === r.deleted && was.index === r.index) continue
      known.set(change.doc.id, r)
      files.add(r.file)
    }
    if (files.size) pull(SYNCED.filter(s => files.has(s.file)).map(s => s.key))
    const status = snap.metadata.fromCache ? 'offline' : snap.metadata.hasPendingWrites ? 'sending' : 'upToDate'
    useSync.setState(status === 'upToDate' ? { status, lastSyncedAt: Date.now() } : { status })
  }, error => useSync.setState({ phase: 'error', error: friendly(error) }))
}

/** Sends what changed in these slices. */
async function push(keys: SyncedKey[]) {
  if (!col || !keys.length) return
  const state = useData.getState()
  const writes = new Map<string, SyncRecord>()
  for (const key of keys) {
    const s = SYNCED.find(x => x.key === key)!
    for (const [k, r] of diff(known, s.file, recordsFor(s.file, s.kind, state[key])).writes) writes.set(k, r)
  }
  if (!writes.size) return
  const entries = [...writes]
  // Firestore takes up to 500 writes at once.
  for (let i = 0; i < entries.length; i += 400) {
    const batch = writeBatch(db)
    for (const [id, r] of entries.slice(i, i + 400)) {
      batch.set(doc(col, id), { ...r, device, updatedAt: serverTimestamp() })
      known.set(id, r)
    }
    // Offline, this resolves only once it reaches the cloud; the cache has it already.
    void batch.commit().catch(error => useSync.setState({ error: friendly(error) }))
  }
}

/** Takes the cloud's copy of these slices into the app, if it differs. */
function pull(keys: SyncedKey[]) {
  const state = useData.getState()
  const patch: Partial<DataState> = {}
  for (const key of keys) {
    const s = SYNCED.find(x => x.key === key)!
    const raw = rebuild(known, s.file, s.kind)
    if (raw === undefined) continue
    const value = decoders[key](raw)
    if (JSON.stringify(value) !== JSON.stringify(state[key])) (patch as Record<string, unknown>)[key] = value
  }
  if (Object.keys(patch).length) useData.getState().replace(patch)
}
