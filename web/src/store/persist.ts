import { createStorage } from '@suite/storage'

// Saves and loads app data in the browser's local storage, one entry per
// iPhone-app file name so the two map onto each other one to one.
//
// An entry that exists but won't parse is copied aside before anything
// else happens. Every caller treats "nothing loaded" as a first launch,
// and the next save would otherwise write straight over the only copy.

export const Filename = {
  goals: 'goals.json',
  calendarEvents: 'calendar_events.json',
  categories: 'categories.json',
  calendarHours: 'calendar_hours.json',
  tasks: 'tasks.json',
  appearance: 'appearance.json',
  planReviewSettings: 'plan_review_settings.json',
  journalEntries: 'journal_entries.json',
  notes: 'notes.json',
  notebooks: 'notebooks.json',
  // Web-only
  share: 'share.json',
  partners: 'partners.json',
} as const

export type FilenameValue = (typeof Filename)[keyof typeof Filename]

// Planner's entries live under "vectis:" (the code name), so everything
// saved before the rename still loads. The logic is shared (suite/storage).
export const storage = createStorage('vectis:', 'Planner')
export const loadRaw = storage.loadRaw
export const saveRaw = storage.saveRaw
export const allEntries = storage.allEntries
