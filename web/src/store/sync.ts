// What Planner syncs between your devices. The machinery is shared with
// Finance (suite/sync); this just lists Planner's data and how to read it
// back. Keys stay under "vectis:", so devices that already sync carry on.

import { countIn, describeCounts } from '@suite/sync/records'
import { createSyncStore, type SyncSlice } from '@suite/sync/store'
import {
  decodeAppearance, decodeCategory, decodeEvent, decodeGoal, decodeHours, decodeJournalEntry, decodeNote, decodeNotebook, decodePlanReview,
  decodeTask, list,
} from '../model/decode'
import { useData, type DataState } from './data'
import { Filename, allEntries } from './persist'

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

export const PLANNER_SLICES: SyncSlice[] = [
  slice('goals', Filename.goals, 'list', raw => list(raw, decodeGoal)),
  slice('events', Filename.calendarEvents, 'list', raw => list(raw, decodeEvent)),
  slice('categories', Filename.categories, 'list', raw => list(raw, decodeCategory)),
  slice('hours', Filename.calendarHours, 'single', decodeHours),
  slice('tasks', Filename.tasks, 'list', raw => list(raw, decodeTask)),
  slice('appearance', Filename.appearance, 'single', decodeAppearance),
  slice('planReview', Filename.planReviewSettings, 'single', decodePlanReview),
  slice('journal', Filename.journalEntries, 'list', raw => list(raw, decodeJournalEntry)),
  slice('notes', Filename.notes, 'list', raw => list(raw, decodeNote)),
  slice('notebooks', Filename.notebooks, 'list', raw => list(raw, decodeNotebook)),
]

export const useSync = createSyncStore({
  name: 'Planner',
  collection: 'planner',
  prefix: 'vectis:',
  slices: PLANNER_SLICES,
  contentFiles: [Filename.goals, Filename.calendarEvents, Filename.tasks, Filename.journalEntries, Filename.notes, Filename.notebooks],
  describe: records => describeCounts([
    ['goal', 'goals', countIn(records, Filename.goals)],
    ['event', 'events', countIn(records, Filename.calendarEvents)],
    ['task', 'tasks', countIn(records, Filename.tasks)],
    ['note', 'notes', countIn(records, Filename.notes)],
    ['journal entry', 'journal entries', countIn(records, Filename.journalEntries)],
  ]),
  allEntries,
  // Note pictures, which live outside the data above (store/attachments.ts).
  onLive: () => import('../sync/pictures').then(m => m.start),
})
