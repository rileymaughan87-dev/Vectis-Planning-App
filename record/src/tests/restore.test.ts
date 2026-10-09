// Restoring a backup: saved text goes back exactly (some entries, like the
// sync account, aren't JSON), device-only notes stay, and every restored
// file is marked as edited here so sync sends it rather than taking the
// cloud's copy over it.

import { restoreEntries } from '@suite/storage'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

class MemoryStorage {
  data = new Map<string, string>()
  getItem(k: string) { return this.data.get(k) ?? null }
  setItem(k: string, v: string) { this.data.set(k, v) }
  removeItem(k: string) { this.data.delete(k) }
  key(i: number) { return [...this.data.keys()][i] ?? null }
  get length() { return this.data.size }
}

describe('restoring a backup', () => {
  let store: MemoryStorage
  beforeEach(() => {
    store = new MemoryStorage()
    ;(globalThis as { localStorage?: unknown }).localStorage = store
  })
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage
  })

  it('puts entries back as saved, keeps this device its own, and lets the restore win', () => {
    store.setItem('vectis:device-id', 'this-device')
    store.setItem('vectis:sync:pending', '[]')
    restoreEntries('vectis:', {
      'goals.json': '[{"id":"G","title":"Read"}]',
      'journal_entries.json': '[]',
      'sync:user': 'pzL3xpsMuser',
      'device-id': 'other-device',
      'before-sync': '{"savedAt":"old"}',
      'ui:slot': '""',
    })
    expect(store.getItem('vectis:goals.json')).toBe('[{"id":"G","title":"Read"}]')
    // Not JSON — restored as the raw text it was saved as.
    expect(store.getItem('vectis:sync:user')).toBe('pzL3xpsMuser')
    expect(store.getItem('vectis:device-id')).toBe('this-device')
    expect(store.getItem('vectis:before-sync')).toBeNull()
    expect(JSON.parse(store.getItem('vectis:sync:pending')!)).toEqual(['goals.json', 'journal_entries.json'])
  })
})
