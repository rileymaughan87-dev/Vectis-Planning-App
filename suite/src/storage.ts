// Saves and loads an app's data in the browser's local storage, one entry
// per file name, under the app's own prefix ("vectis:", "finance:") so
// two apps on the same website can never overwrite each other.
//
// An entry that exists but won't parse is copied aside before anything
// else happens. Callers treat "nothing loaded" as a first launch, and the
// next save would otherwise write straight over the only copy.

export interface AppStorage {
  /** The parsed JSON, or undefined on first launch or if it was unreadable. */
  loadRaw(filename: string): unknown
  saveRaw(filename: string, value: unknown): void
  /** Every saved entry for this app, for a full backup. */
  allEntries(): Record<string, string>
  /** Puts a backup's entries back exactly as they were saved; see `restoreEntries`. */
  restoreEntries(entries: Record<string, string>): void
}

/**
 * A backup's entries that belong to the device, not the data: they stay as
 * they are here. (Each device keeps its own id; sync's own notes are
 * rewritten below; the copies set aside before a first sync are old.)
 */
const DEVICE_ONLY = ['device-id', 'sync:pending', 'sync:files', 'before-sync', 'cloud-before-sync']

/**
 * Writes a backup's entries back as saved text, then marks every data file
 * as edited here, so on its next connection sync sends the restored data
 * to the cloud and your other devices — rather than taking the cloud's
 * copy over it. A restore is always the newest word.
 */
export function restoreEntries(prefix: string, entries: Record<string, string>) {
  const files: string[] = []
  for (const [name, text] of Object.entries(entries)) {
    if (typeof text !== 'string' || DEVICE_ONLY.includes(name)) continue
    localStorage.setItem(prefix + name, text)
    if (name.endsWith('.json')) files.push(name)
  }
  localStorage.setItem(`${prefix}sync:pending`, JSON.stringify(files))
}

export function createStorage(prefix: string, appName: string): AppStorage {
  const setAside = (filename: string, text: string) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const name = filename.replace(/\.json$/, `.unreadable-${stamp}.json`)
    try {
      localStorage.setItem(prefix + name, text)
      console.warn(`${appName}: kept unreadable data as ${name}`)
    } catch (error) {
      console.warn(`${appName}: couldn't set aside ${filename}`, error)
    }
  }

  return {
    loadRaw(filename) {
      let text: string | null = null
      try {
        text = localStorage.getItem(prefix + filename)
      } catch {
        return undefined
      }
      if (text === null) return undefined
      try {
        return JSON.parse(text)
      } catch (error) {
        console.warn(`${appName}: failed to load ${filename}`, error)
        setAside(filename, text)
        return undefined
      }
    },
    saveRaw(filename, value) {
      try {
        localStorage.setItem(prefix + filename, JSON.stringify(value))
      } catch (error) {
        console.warn(`${appName}: failed to save ${filename}`, error)
      }
    },
    restoreEntries(entries) {
      restoreEntries(prefix, entries)
    },
    allEntries() {
      const out: Record<string, string> = {}
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key?.startsWith(prefix)) out[key.slice(prefix.length)] = localStorage.getItem(key) ?? ''
        }
      } catch {
        // Storage unavailable; nothing to back up.
      }
      return out
    },
  }
}
