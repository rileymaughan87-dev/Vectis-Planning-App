// Saves and loads app data in the browser's local storage, one entry per
// iPhone-app file name so the two map onto each other one to one.
//
// An entry that exists but won't parse is copied aside before anything
// else happens. Every caller treats "nothing loaded" as a first launch,
// and the next save would otherwise write straight over the only copy.

const PREFIX = 'vectis:'

export const Filename = {
  goals: 'goals.json',
  calendarEvents: 'calendar_events.json',
  categories: 'categories.json',
  calendarHours: 'calendar_hours.json',
  tasks: 'tasks.json',
  appearance: 'appearance.json',
  planReviewSettings: 'plan_review_settings.json',
  journalEntries: 'journal_entries.json',
  // Web-only
  share: 'share.json',
  partners: 'partners.json',
} as const

export type FilenameValue = (typeof Filename)[keyof typeof Filename]

/** The parsed JSON, or undefined on first launch or if it was unreadable. */
export function loadRaw(filename: string): unknown {
  let text: string | null = null
  try {
    text = localStorage.getItem(PREFIX + filename)
  } catch {
    return undefined
  }
  if (text === null) return undefined
  try {
    return JSON.parse(text)
  } catch (error) {
    console.warn(`Vectis: failed to load ${filename}`, error)
    setAside(filename, text)
    return undefined
  }
}

export function saveRaw(filename: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + filename, JSON.stringify(value))
  } catch (error) {
    console.warn(`Vectis: failed to save ${filename}`, error)
  }
}

function setAside(filename: string, text: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const name = filename.replace(/\.json$/, `.unreadable-${stamp}.json`)
  try {
    localStorage.setItem(PREFIX + name, text)
    console.warn(`Vectis: kept unreadable data as ${name}`)
  } catch (error) {
    console.warn(`Vectis: couldn't set aside ${filename}`, error)
  }
}

/** Every saved entry, for a full backup. */
export function allEntries(): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(PREFIX)) out[key.slice(PREFIX.length)] = localStorage.getItem(key) ?? ''
    }
  } catch {
    // Storage unavailable; nothing to back up.
  }
  return out
}
