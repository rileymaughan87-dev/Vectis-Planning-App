// Sync between devices — the part each app keeps in its main bundle.
// It describes what the app syncs (`SyncApp`) and holds the status the
// Settings box shows. The Firebase side (./engine.ts) is only downloaded
// once a device has signed in, so devices that don't sync never load it.

import { create, type StoreApi, type UseBoundStore } from 'zustand'
import type { SliceKind, SyncRecord } from './records'

/** One synced piece of an app's data: a list of items with ids, or one value. */
export interface SyncSlice {
  /** The app's file name for it, e.g. "goals.json" — also how its records are tagged. */
  file: string
  kind: SliceKind
  get(): unknown
  set(value: unknown): void
  /** Reads a synced value through the app's usual tolerant decoders. */
  decode(raw: unknown): unknown
  /** Calls back whenever this slice changes locally. */
  subscribe(onChange: () => void): () => void
}

export interface SyncApp {
  /** Shown in sign-in errors and the like: "Planner", "Finance". */
  name: string
  /** Firestore collection under users/{uid}. */
  collection: string
  /** The app's localStorage prefix ("vectis:", "finance:"), for sync's own small notes. */
  prefix: string
  slices: SyncSlice[]
  /** Which slices count as real content (not just default settings), for the first-sync choice. */
  contentFiles: string[]
  /** "12 goals, 3 notes" — what each side holds, when choosing. */
  describe(records: Map<string, SyncRecord>): string
  /** Everything saved locally, to set aside before taking the cloud's copy. */
  allEntries(): Record<string, string>
}

export type SyncPhase =
  /** No Firebase settings in this build. */
  | 'unavailable'
  | 'signedOut'
  | 'connecting'
  /** Both this device and the cloud have data: which one to keep? */
  | 'choose'
  | 'live'
  | 'error'

export interface SyncState {
  phase: SyncPhase
  email?: string
  /** While live: whether everything has reached the cloud. */
  status: 'upToDate' | 'sending' | 'offline'
  lastSyncedAt?: number
  error?: string
  choice?: { device: string; cloud: string }
  signIn(): Promise<void>
  signOut(): Promise<void>
  choose(side: 'device' | 'cloud'): Promise<void>
}

export type SyncStore = UseBoundStore<StoreApi<SyncState>>

export function firebaseConfig(): Record<string, string> | null {
  try {
    const raw = import.meta.env.VITE_FIREBASE_CONFIG
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed.apiKey === 'string' && typeof parsed.projectId === 'string' ? parsed : null
  } catch {
    return null
  }
}

/** sync's own small notes in localStorage, under the app's prefix. */
export const keys = (app: SyncApp) => ({
  /** Which account this device syncs with, once its first sync has settled. */
  user: `${app.prefix}sync:user`,
  /** Slices edited while sync wasn't running yet; these win over the cloud on start. */
  pending: `${app.prefix}sync:pending`,
  device: `${app.prefix}device-id`,
  beforeSync: `${app.prefix}before-sync`,
  cloudBeforeSync: `${app.prefix}cloud-before-sync`,
})

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Set by the engine while it's in charge of sending changes. */
export interface Attachment { attached: boolean }

/**
 * The app's sync store. Devices that already sync reconnect as soon as
 * this runs; edits made before the engine is ready are remembered so
 * opening the app never overwrites them with the cloud's older copy.
 */
export function createSyncStore(app: SyncApp): SyncStore {
  const attachment: Attachment = { attached: false }
  let engine: Promise<import('./engine').Engine> | null = null
  const loadEngine = () => {
    engine ??= import('./engine').then(m => m.createEngine(app, useSync, attachment))
    return engine
  }

  const useSync: SyncStore = create<SyncState>()(() => ({
    phase: firebaseConfig() ? 'signedOut' : 'unavailable',
    status: 'upToDate',
    signIn: async () => (await loadEngine()).signIn(),
    signOut: async () => (await loadEngine()).signOut(),
    choose: async side => (await loadEngine()).choose(side),
  }))

  const k = keys(app)
  for (const slice of app.slices) {
    slice.subscribe(() => {
      if (attachment.attached || !read(k.user)) return
      try {
        const pending = new Set<string>(JSON.parse(localStorage.getItem(k.pending) ?? '[]'))
        pending.add(slice.file)
        localStorage.setItem(k.pending, JSON.stringify([...pending]))
      } catch {
        // Can't record it; the cloud copy will win for this slice.
      }
    })
  }

  if (firebaseConfig() && read(k.user)) {
    useSync.setState({ phase: 'connecting' })
    void loadEngine()
  }
  return useSync
}
