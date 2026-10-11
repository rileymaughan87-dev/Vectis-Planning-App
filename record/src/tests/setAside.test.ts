// What a first sync set aside: when a device took the synced data, its own
// items were kept in "before-sync". Bringing them back adds only what's
// missing (by id), never removes anything, and isn't offered twice.

import { createSyncStore, type SyncSlice } from '@suite/sync/store'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

class MemoryStorage {
  data = new Map<string, string>()
  getItem(k: string) { return this.data.get(k) ?? null }
  setItem(k: string, v: string) { this.data.set(k, v) }
  removeItem(k: string) { this.data.delete(k) }
  key(i: number) { return [...this.data.keys()][i] ?? null }
  get length() { return this.data.size }
}

type Item = { id: string; title: string }

describe('items set aside by a first sync', () => {
  let store: MemoryStorage
  let notebooks: Item[]
  const slice: SyncSlice = {
    file: 'notebooks.json',
    kind: 'list',
    get: () => notebooks,
    set: v => { notebooks = v as Item[] },
    decode: raw => raw,
    subscribe: () => () => {},
  }
  const app = () => createSyncStore({
    name: 'Test', collection: 'test', prefix: 'vectis:', slices: [slice], contentFiles: ['notebooks.json'],
    describe: records => `${records.size} notebook${records.size === 1 ? '' : 's'}`,
    allEntries: () => ({}),
  })

  beforeEach(() => {
    store = new MemoryStorage()
    ;(globalThis as { localStorage?: unknown }).localStorage = store
    // The synced data this device took: one notebook from the other device.
    notebooks = [{ id: 'b', title: 'From the laptop' }]
    store.setItem('vectis:before-sync', JSON.stringify({
      savedAt: '2026-10-11T09:00:00.000Z',
      entries: { 'notebooks.json': JSON.stringify([{ id: 'a', title: 'From the phone' }, { id: 'b', title: 'Older copy' }]) },
    }))
  })
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage
  })

  it('offers only what is missing, and adds it back without removing anything', () => {
    const sync = app()
    expect(sync.getState().setAside()).toEqual({ savedAt: '2026-10-11T09:00:00.000Z', summary: '1 notebook' })
    sync.getState().bringBack()
    expect(notebooks).toEqual([{ id: 'b', title: 'From the laptop' }, { id: 'a', title: 'From the phone' }])
    expect(sync.getState().setAside()).toBeNull()
  })

  it('stops offering once dismissed, but keeps the set-aside copy', () => {
    const sync = app()
    sync.getState().dismissSetAside()
    expect(sync.getState().setAside()).toBeNull()
    expect(notebooks).toEqual([{ id: 'b', title: 'From the laptop' }])
    expect(store.getItem('vectis:before-sync')).not.toBeNull()
  })
})
