// Accountability sharing: your own published file, and the partners
// whose files you follow. Web-only — the iPhone app has no equivalent.

import { create } from 'zustand'
import { toISO } from '../model/dates'
import { newID } from '../model/ids'
import { currentToken, fetchSharedFile, publishFile, signIn } from '../sync/google'
import { buildSnapshot, parseSnapshot, type ShareSnapshot } from '../sync/shareFile'
import { useData } from './data'
import { Filename, loadRaw, saveRaw } from './persist'

export interface Partner {
  /** The Drive file id, or `file:<uuid>` for one opened from a file. */
  id: string
  name: string
  addedAt: string
  lastFetchedAt?: string
  /** The last copy read, so their view still opens offline. */
  snapshot?: ShareSnapshot
}

interface ShareSettings {
  ownerName: string
  fileID?: string
  lastPublishedAt?: string
  autoPublish: boolean
}

type Status = 'idle' | 'publishing' | 'error'

interface ShareState extends ShareSettings {
  partners: Partner[]
  status: Status
  error: string | null
  /** True when your data changed since the last publish. */
  hasUnpublishedChanges: boolean

  setOwnerName(name: string): void
  setAutoPublish(on: boolean): void
  /** From a tap: signs in if needed, then publishes. */
  publishNow(): Promise<void>
  /** Background publish; only runs with a still-valid token. */
  publishQuietly(): Promise<void>
  stopSharing(): void

  addPartner(fileID: string): Promise<Partner>
  addPartnerFromFile(raw: unknown): Partner
  refreshPartner(id: string): Promise<void>
  renamePartner(id: string, name: string): void
  removePartner(id: string): void
}

function loadSettings(): ShareSettings {
  const raw = loadRaw(Filename.share) as Partial<ShareSettings> | undefined
  return {
    ownerName: typeof raw?.ownerName === 'string' ? raw.ownerName : '',
    fileID: typeof raw?.fileID === 'string' ? raw.fileID : undefined,
    lastPublishedAt: typeof raw?.lastPublishedAt === 'string' ? raw.lastPublishedAt : undefined,
    autoPublish: typeof raw?.autoPublish === 'boolean' ? raw.autoPublish : true,
  }
}

function loadPartners(): Partner[] {
  const raw = loadRaw(Filename.partners)
  if (!Array.isArray(raw)) return []
  return raw.flatMap(p => {
    if (typeof p !== 'object' || p === null || typeof p.id !== 'string') return []
    let snapshot: ShareSnapshot | undefined
    try {
      snapshot = p.snapshot ? parseSnapshot(p.snapshot) : undefined
    } catch {
      snapshot = undefined
    }
    return [{
      id: p.id,
      name: typeof p.name === 'string' ? p.name : 'Partner',
      addedAt: typeof p.addedAt === 'string' ? p.addedAt : toISO(new Date()),
      lastFetchedAt: typeof p.lastFetchedAt === 'string' ? p.lastFetchedAt : undefined,
      snapshot,
    }]
  })
}

function fileName(owner: string) {
  return `Vectis share — ${owner.trim() || 'me'}.json`
}

export const useShare = create<ShareState>()((set, get) => {
  async function publishWith(token: string) {
    const { ownerName, fileID } = get()
    set({ status: 'publishing', error: null })
    try {
      const snapshot = buildSnapshot(useData.getState(), ownerName)
      const id = await publishFile(token, fileID, fileName(ownerName), snapshot)
      set({ fileID: id, lastPublishedAt: snapshot.publishedAt, status: 'idle', hasUnpublishedChanges: false })
    } catch (error) {
      set({ status: 'error', error: error instanceof Error ? error.message : String(error) })
    }
  }

  return {
    ...loadSettings(),
    partners: loadPartners(),
    status: 'idle',
    error: null,
    hasUnpublishedChanges: false,

    setOwnerName: ownerName => set({ ownerName, hasUnpublishedChanges: Boolean(get().fileID) }),
    setAutoPublish: autoPublish => set({ autoPublish }),

    publishNow: async () => {
      let token = currentToken()
      if (!token) {
        try {
          token = await signIn()
        } catch (error) {
          set({ status: 'error', error: error instanceof Error ? error.message : String(error) })
          return
        }
      }
      await publishWith(token)
    },

    publishQuietly: async () => {
      const token = currentToken()
      if (!token || get().status === 'publishing') return
      await publishWith(token)
    },

    // Forgets the file here. The copy in Drive stays until you delete it there.
    stopSharing: () => set({ fileID: undefined, lastPublishedAt: undefined, hasUnpublishedChanges: false, status: 'idle', error: null }),

    addPartner: async fileID => {
      const existing = get().partners.find(p => p.id === fileID)
      const snapshot = parseSnapshot(await fetchSharedFile(fileID))
      const partner: Partner = {
        id: fileID,
        name: existing?.name ?? snapshot.ownerName,
        addedAt: existing?.addedAt ?? toISO(new Date()),
        lastFetchedAt: toISO(new Date()),
        snapshot,
      }
      set(s => ({ partners: existing ? s.partners.map(p => (p.id === fileID ? partner : p)) : [...s.partners, partner] }))
      return partner
    },

    addPartnerFromFile: raw => {
      const snapshot = parseSnapshot(raw)
      const partner: Partner = {
        id: `file:${newID()}`,
        name: snapshot.ownerName,
        addedAt: toISO(new Date()),
        lastFetchedAt: toISO(new Date()),
        snapshot,
      }
      set(s => ({ partners: [...s.partners, partner] }))
      return partner
    },

    refreshPartner: async id => {
      if (id.startsWith('file:')) return
      const snapshot = parseSnapshot(await fetchSharedFile(id))
      set(s => ({
        partners: s.partners.map(p => (p.id === id ? { ...p, snapshot, lastFetchedAt: toISO(new Date()) } : p)),
      }))
    },

    renamePartner: (id, name) => set(s => ({ partners: s.partners.map(p => (p.id === id ? { ...p, name } : p)) })),
    removePartner: id => set(s => ({ partners: s.partners.filter(p => p.id !== id) })),
  }
})

useShare.subscribe((state, prev) => {
  if (
    state.ownerName !== prev.ownerName || state.fileID !== prev.fileID ||
    state.lastPublishedAt !== prev.lastPublishedAt || state.autoPublish !== prev.autoPublish
  ) {
    const { ownerName, fileID, lastPublishedAt, autoPublish } = state
    saveRaw(Filename.share, { ownerName, fileID, lastPublishedAt, autoPublish })
  }
  if (state.partners !== prev.partners) saveRaw(Filename.partners, state.partners)
})

// Anything that changes what a partner would see marks the share stale,
// and publishes a few seconds later if auto-publish is on and Google
// access is still fresh. Otherwise the menu shows "Publish now".
let timer: ReturnType<typeof setTimeout> | undefined
useData.subscribe((state, prev) => {
  const shared = state.goals !== prev.goals || state.events !== prev.events ||
    state.categories !== prev.categories || state.tasks !== prev.tasks || state.hours !== prev.hours
  if (!shared || !useShare.getState().fileID) return
  useShare.setState({ hasUnpublishedChanges: true })
  clearTimeout(timer)
  timer = setTimeout(() => {
    if (useShare.getState().autoPublish) void useShare.getState().publishQuietly()
  }, 4000)
})
