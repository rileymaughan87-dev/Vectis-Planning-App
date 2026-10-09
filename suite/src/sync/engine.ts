// The Firebase side of sync, shared by Planner and Finance. Loaded only
// when needed (./store.ts).
//
// Signing in: Google, through Firebase, which keeps you signed in on this
// device. Data: users/{uid}/{collection}/{record} in Firestore, readable
// only by you (the rules in the console). Firestore's offline cache queues
// changes made without a connection and sends them when it's back.
//
// The first time a device syncs, if both it and the cloud already have
// data, you choose which to keep; the other side's copy is set aside in
// localStorage rather than thrown away.

import { getApps, initializeApp } from 'firebase/app'
import {
  GoogleAuthProvider, browserLocalPersistence, browserPopupRedirectResolver, indexedDBLocalPersistence, initializeAuth,
  onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut as fbSignOut, type Auth, type User,
} from 'firebase/auth'
import {
  collection, doc, getDocsFromCache, getDocsFromServer, initializeFirestore, onSnapshot, persistentLocalCache,
  persistentMultipleTabManager, serverTimestamp, writeBatch, type CollectionReference, type Firestore,
} from 'firebase/firestore'
import { newID } from '../ids'
import { diff, readRecord, rebuild, recordsFor, type SyncRecord } from './records'
import { firebaseConfig, keys, type Attachment, type SyncApp, type SyncSlice, type SyncStore } from './store'

export interface Engine {
  signIn(): Promise<void>
  signOut(): Promise<void>
  choose(side: 'device' | 'cloud'): Promise<void>
}

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
  if (code.includes('permission-denied')) return 'The database refused access. Check the Firestore rules in the Firebase console.'
  if (code.includes('unauthorized-domain')) return "This web address isn't allowed to sign in yet. Add it under Authentication → Settings → Authorized domains."
  if (code.includes('popup-closed') || code.includes('cancelled')) return 'Sign-in was closed before it finished.'
  if (code.includes('network')) return "Couldn't reach Google. Check your connection."
  return error instanceof Error ? error.message : String(error)
}

export function createEngine(app: SyncApp, useSync: SyncStore, attachment: Attachment): Engine {
  const k = keys(app)
  const config = firebaseConfig()
  if (!config) {
    useSync.setState({ phase: 'unavailable' })
    return { signIn: async () => {}, signOut: async () => {}, choose: async () => {} }
  }

  const fbApp = getApps()[0] ?? initializeApp(config)
  const auth: Auth = initializeAuth(fbApp, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  })
  const db: Firestore = initializeFirestore(fbApp, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })

  const device = (() => {
    try {
      let id = localStorage.getItem(k.device)
      if (!id) localStorage.setItem(k.device, (id = newID()))
      return id
    } catch {
      return 'unknown'
    }
  })()

  let col: CollectionReference | null = null
  /** What the cloud holds, as far as this device knows (including its own unsent writes). */
  let known = new Map<string, SyncRecord>()
  let stopListening: (() => void) | null = null
  let stopWatching: (() => void)[] = []
  let stopExtra: (() => void) | null = null
  let pushTimer: ReturnType<typeof setTimeout> | undefined
  const dirty = new Set<SyncSlice>()
  const allSlices = app.slices
  const hasContent = (records: Map<string, SyncRecord>) =>
    [...records.values()].some(r => app.contentFiles.includes(r.file) && !r.deleted)
  const localRecords = () => {
    const out = new Map<string, SyncRecord>()
    for (const s of allSlices) for (const [id, r] of recordsFor(s.file, s.kind, s.get())) out.set(id, r)
    return out
  }

  const stop = () => {
    stopListening?.()
    for (const f of stopWatching) f()
    stopExtra?.()
    stopListening = null
    stopWatching = []
    stopExtra = null
    clearTimeout(pushTimer)
    dirty.clear()
    attachment.attached = false
    col = null
  }

  /** Sends what changed in these slices. */
  const push = (slices: SyncSlice[]) => {
    if (!col || !slices.length) return
    const writes = new Map<string, SyncRecord>()
    for (const s of slices) for (const [id, r] of diff(known, s.file, recordsFor(s.file, s.kind, s.get()))) writes.set(id, r)
    const entries = [...writes]
    // Firestore takes up to 500 writes at once.
    for (let i = 0; i < entries.length; i += 400) {
      const batch = writeBatch(db)
      for (const [id, r] of entries.slice(i, i + 400)) {
        batch.set(doc(col, id), { ...r, device, updatedAt: serverTimestamp() })
        known.set(id, r)
      }
      // Offline, this resolves only once it reaches the cloud; the local cache has it already.
      void batch.commit().catch(error => useSync.setState({ error: friendly(error) }))
    }
  }

  /** Takes the cloud's copy of these slices into the app, where it differs. */
  const pull = (slices: SyncSlice[]) => {
    for (const s of slices) {
      const raw = rebuild(known, s.file, s.kind)
      if (raw === undefined) continue
      const value = s.decode(raw)
      if (JSON.stringify(value) !== JSON.stringify(s.get())) s.set(value)
    }
  }

  const goLive = () => {
    if (!col) return
    attachment.attached = true
    useSync.setState({ phase: 'live', status: 'sending' })

    // Changes from here go up, a moment after they stop (typing in a note is one write, not fifty).
    stopWatching = allSlices.map(s => s.subscribe(() => {
      dirty.add(s)
      clearTimeout(pushTimer)
      pushTimer = setTimeout(() => {
        const slices = [...dirty]
        dirty.clear()
        push(slices)
      }, 600)
    }))

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
      if (files.size) pull(allSlices.filter(s => files.has(s.file)))
      const status = snap.metadata.fromCache ? 'offline' : snap.metadata.hasPendingWrites ? 'sending' : 'upToDate'
      useSync.setState(status === 'upToDate' ? { status, lastSyncedAt: Date.now() } : { status })
    }, error => useSync.setState({ phase: 'error', error: friendly(error) }))

    // Anything else the app syncs while live (Planner's pictures).
    const uid = auth.currentUser?.uid
    const liveCol = col
    if (app.onLive && uid) {
      app.onLive()
        .then(startExtra => {
          // Still the same live session? (Signing out meanwhile clears col.)
          if (col === liveCol) stopExtra = startExtra({ db, uid })
        })
        .catch(error => useSync.setState({ error: friendly(error) }))
    }
  }

  const choose = async (side: 'device' | 'cloud', uid = auth.currentUser?.uid) => {
    if (!uid || !col) return
    useSync.setState({ phase: 'connecting', choice: undefined })
    try {
      if (side === 'cloud') {
        store(k.beforeSync, JSON.stringify({ savedAt: new Date().toISOString(), entries: app.allEntries() }))
        pull(allSlices)
      } else {
        const cloud = Object.fromEntries(allSlices.map(s => [s.file, rebuild(known, s.file, s.kind)]))
        store(k.cloudBeforeSync, JSON.stringify({ savedAt: new Date().toISOString(), data: cloud }))
        push(allSlices)
      }
      store(k.user, uid)
      store(k.pending, null)
      goLive()
    } catch (error) {
      useSync.setState({ phase: 'error', error: friendly(error) })
    }
  }

  const connect = async (user: User) => {
    stop()
    useSync.setState({ phase: 'connecting', email: user.email ?? undefined, error: undefined })
    col = collection(db, 'users', user.uid, app.collection)
    try {
      const snap = await getDocsFromServer(col).catch(() => getDocsFromCache(col!))
      known = new Map()
      snap.forEach(d => {
        const r = readRecord(d.data())
        if (r) known.set(d.id, r)
      })

      if (localStorage.getItem(k.user) === user.uid) {
        // This device already syncs: the cloud wins, except for anything edited before we got here
        // (and anything the cloud has never had, such as a slice added in a later version).
        const pending = new Set<string>(JSON.parse(localStorage.getItem(k.pending) ?? '[]'))
        const fromHere = (s: SyncSlice) => pending.has(s.file) || ![...known.values()].some(r => r.file === s.file)
        push(allSlices.filter(fromHere))
        pull(allSlices.filter(s => !fromHere(s)))
        store(k.pending, null)
        goLive()
        return
      }

      const local = localRecords()
      if (!hasContent(known)) {
        // The first device: send everything up.
        push(allSlices)
        store(k.user, user.uid)
        goLive()
        return
      }
      if (!hasContent(local)) {
        await choose('cloud', user.uid)
        return
      }
      useSync.setState({ phase: 'choose', choice: { device: app.describe(local), cloud: app.describe(known) } })
    } catch (error) {
      useSync.setState({ phase: 'error', error: friendly(error) })
    }
  }

  onAuthStateChanged(auth, user => {
    if (user) void connect(user)
    else {
      stop()
      useSync.setState({ phase: 'signedOut', email: undefined, choice: undefined })
    }
  })

  return {
    signIn: async () => {
      useSync.setState({ error: undefined })
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      try {
        await signInWithPopup(auth, provider)
      } catch (error) {
        const code = (error as { code?: string })?.code ?? ''
        // Some phones block pop-ups (or don't allow them in a home-screen app): go via a full-page redirect instead.
        if (code.includes('popup-blocked') || code.includes('operation-not-supported')) {
          await signInWithRedirect(auth, provider)
          return
        }
        useSync.setState({ error: friendly(error) })
      }
    },
    signOut: async () => {
      stop()
      store(k.user, null)
      store(k.pending, null)
      await fbSignOut(auth)
      useSync.setState({ phase: 'signedOut', email: undefined, choice: undefined, error: undefined })
    },
    choose: side => choose(side),
  }
}
