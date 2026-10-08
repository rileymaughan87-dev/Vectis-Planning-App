// Sync between your devices: what the rest of the app sees. The Firebase
// side (sync/engine.ts) is only downloaded once you've signed in, so
// devices that don't sync never load it.

import { create } from 'zustand'
import type { DataState } from './data'
import { useData } from './data'

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
  /** What each side holds, when choosing. */
  choice?: { device: string; cloud: string }
  signIn(): Promise<void>
  signOut(): Promise<void>
  choose(side: 'device' | 'cloud'): Promise<void>
}

/** Which account this device syncs with, once the first sync has settled. */
export const SYNC_USER_KEY = 'vectis:sync:user'
/** Slices edited while sync wasn't running yet; these win over the cloud on start. */
export const SYNC_PENDING_KEY = 'vectis:sync:pending'

export function firebaseConfig(): Record<string, string> | null {
  try {
    const raw = import.meta.env.VITE_FIREBASE_CONFIG
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed.apiKey === 'string' && typeof parsed.projectId === 'string' ? parsed : null
  } catch {
    return null
  }
}

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

let engine: Promise<typeof import('../sync/engine')> | null = null
const loadEngine = () => {
  engine ??= import('../sync/engine').then(async m => {
    await m.start()
    return m
  })
  return engine
}

export const useSync = create<SyncState>()(() => ({
  phase: firebaseConfig() ? 'signedOut' : 'unavailable',
  status: 'upToDate',
  signIn: async () => {
    const m = await loadEngine()
    await m.signIn()
  },
  signOut: async () => {
    const m = await loadEngine()
    await m.signOut()
  },
  choose: async side => {
    const m = await loadEngine()
    await m.choose(side)
  },
}))

/** Engine attached and in charge of sending changes. */
let attached = false
export const setAttached = (on: boolean) => { attached = on }

// Edits made before the engine has caught up (the first moments after
// opening) are remembered, so starting up doesn't overwrite them with the
// cloud's older copy.
useData.subscribe((state, prev) => {
  if (attached || !read(SYNC_USER_KEY)) return
  const changed = (Object.keys(state) as (keyof DataState)[]).filter(k => typeof state[k] !== 'function' && state[k] !== prev[k])
  if (!changed.length) return
  try {
    const pending = new Set<string>(JSON.parse(localStorage.getItem(SYNC_PENDING_KEY) ?? '[]'))
    for (const k of changed) pending.add(k)
    localStorage.setItem(SYNC_PENDING_KEY, JSON.stringify([...pending]))
  } catch {
    // Can't record it; the cloud copy will win for these.
  }
})

// A device that already syncs reconnects straight away on opening.
if (firebaseConfig() && read(SYNC_USER_KEY)) {
  useSync.setState({ phase: 'connecting' })
  void loadEngine()
}
