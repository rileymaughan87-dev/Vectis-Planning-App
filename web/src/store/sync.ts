// What Planner syncs between your devices. The machinery is shared with
// Finance (suite/sync); this just lists Planner's data and how to read it
// back. Keys stay under "vectis:", so devices that already sync carry on.
//
// Notes, notebooks and their pictures moved to Record (Oct 2026), which
// syncs them in the same place; the journal syncs from both apps, since
// the evening review writes it.
//
// Accountability: your share settings and partners list sync too. A Drive
// partner's latest copy of their data doesn't (it changes on every refresh
// and each device can fetch it from Drive); a partner added from a file
// has no Drive link to refresh from, so their copy does.

import { countIn, describeCounts } from '@suite/sync/records'
import { createSyncStore, type SyncSlice } from '@suite/sync/store'
import {
  decodeAppearance, decodeCategory, decodeEvent, decodeGoal, decodeHours, decodeJournalEntry, decodePlanReview,
  decodeTask, list,
} from '../model/decode'
import { useData, type DataState } from './data'
import { Filename, allEntries } from './persist'
import { decodePartners, decodeShareSettings, useShare, type Partner } from './share'

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
]

/** Name, Drive file and auto-publish — not when it last published, which each device tracks itself. */
const shareSettings: SyncSlice = {
  file: Filename.share,
  kind: 'single',
  get: () => {
    const { ownerName, fileID, autoPublish } = useShare.getState()
    return { ownerName, fileID: fileID ?? null, autoPublish }
  },
  set: value => {
    const { ownerName, fileID, autoPublish } = value as { ownerName: string; fileID: string | null; autoPublish: boolean }
    useShare.setState({ ownerName, fileID: fileID ?? undefined, autoPublish })
  },
  decode: raw => {
    const s = decodeShareSettings(raw)
    return { ownerName: s.ownerName, fileID: s.fileID ?? null, autoPublish: s.autoPublish }
  },
  subscribe: onChange => useShare.subscribe((s, p) => {
    if (s.ownerName !== p.ownerName || s.fileID !== p.fileID || s.autoPublish !== p.autoPublish) onChange()
  }),
}

/** What syncs of a partner: everything but a Drive partner's fetched copy. */
const forSync = (p: Partner): Partner => (p.id.startsWith('file:') ? p : { id: p.id, name: p.name, addedAt: p.addedAt })

const partners: SyncSlice = {
  file: Filename.partners,
  kind: 'list',
  get: () => useShare.getState().partners.map(forSync),
  set: value => {
    const local = new Map(useShare.getState().partners.map(p => [p.id, p]))
    // Keep this device's fetched copies; a new Drive partner fetches its own.
    const merged = (value as Partner[]).map(p => {
      const here = local.get(p.id)
      return p.snapshot || !here ? p : { ...p, snapshot: here.snapshot, lastFetchedAt: here.lastFetchedAt }
    })
    useShare.setState({ partners: merged })
    for (const p of merged) {
      if (!p.snapshot && !p.id.startsWith('file:')) void useShare.getState().refreshPartner(p.id).catch(() => {})
    }
  },
  decode: raw => decodePartners(raw).map(forSync),
  subscribe: onChange => useShare.subscribe((s, p) => {
    if (s.partners === p.partners) return
    // A refresh only changes the fetched copy, which doesn't sync — no need to send anything.
    const ids = (list: Partner[]) => JSON.stringify(list.map(forSync))
    if (ids(s.partners) !== ids(p.partners)) onChange()
  }),
}

export const useSync = createSyncStore({
  name: 'Planner',
  collection: 'planner',
  prefix: 'vectis:',
  slices: [...PLANNER_SLICES, shareSettings, partners],
  // Accountability joined sync on 9 Oct 2026, after phone and laptop were already syncing.
  addedLater: [Filename.share, Filename.partners],
  contentFiles: [Filename.goals, Filename.calendarEvents, Filename.tasks, Filename.journalEntries],
  describe: records => describeCounts([
    ['goal', 'goals', countIn(records, Filename.goals)],
    ['event', 'events', countIn(records, Filename.calendarEvents)],
    ['task', 'tasks', countIn(records, Filename.tasks)],
    ['journal entry', 'journal entries', countIn(records, Filename.journalEntries)],
  ]),
  allEntries,
})
