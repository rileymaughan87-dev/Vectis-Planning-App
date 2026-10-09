// What Record syncs between your devices. The journal, notes and
// notebooks were Planner's first, so their records stay where they were
// (users/{uid}/planner) and both apps keep them up to date — nothing to
// move. Note pictures sync alongside (sync/pictures.ts).
//
// Record shares Planner's "vectis:" storage and sign-in, so a device
// where Planner already syncs carries straight on here.

import { decodeAppearance } from '@suite/appearance'
import { list } from '@suite/decode'
import { decodeJournalEntry, decodeNote, decodeNotebook } from '@suite/record/decode'
import { countIn, describeCounts } from '@suite/sync/records'
import { createSyncStore, type SyncSlice } from '@suite/sync/store'
import { useData, type DataState } from './data'
import { Filename, storage } from './persist'

function slice<K extends keyof DataState>(key: K, file: string, kind: SyncSlice['kind'], decode: (raw: unknown) => DataState[K]): SyncSlice {
  return {
    file,
    kind,
    get: () => useData.getState()[key],
    set: value => useData.getState().replace({ [key]: value } as Partial<DataState>),
    decode,
    subscribe: onChange => useData.subscribe((state, prev) => {
      if (state[key] !== prev[key]) onChange()
    }),
  }
}

export const useSync = createSyncStore({
  name: 'Record',
  collection: 'planner',
  prefix: 'vectis:',
  slices: [
    slice('journal', Filename.journalEntries, 'list', raw => list(raw, decodeJournalEntry)),
    slice('notes', Filename.notes, 'list', raw => list(raw, decodeNote)),
    slice('notebooks', Filename.notebooks, 'list', raw => list(raw, decodeNotebook)),
    slice('appearance', Filename.appearance, 'single', decodeAppearance),
  ],
  contentFiles: [Filename.journalEntries, Filename.notes, Filename.notebooks],
  describe: records => describeCounts([
    ['note', 'notes', countIn(records, Filename.notes)],
    ['notebook', 'notebooks', countIn(records, Filename.notebooks)],
    ['journal entry', 'journal entries', countIn(records, Filename.journalEntries)],
  ]),
  allEntries: storage.allEntries,
  // Note pictures, which live outside the data above (suite/record/attachments.ts).
  onLive: () => import('../sync/pictures').then(m => m.start),
})
