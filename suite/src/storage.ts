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
