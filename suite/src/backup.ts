// One-file backups of an app's saved data, and restoring them. Each app
// tags its backups with its own format name so they can't be mixed up.

import type { AppStorage } from './storage'

export function downloadJSON(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function createBackups(storage: AppStorage, format: string, filePrefix: string, appName: string) {
  return {
    download() {
      const body = JSON.stringify({ format, version: 1, savedAt: new Date().toISOString(), entries: storage.allEntries() }, null, 2)
      downloadJSON(body, `${filePrefix}-backup-${new Date().toISOString().slice(0, 10)}.json`)
    },
    /** Restores a backup, then reloads so everything reads it fresh. */
    async restore(file: File) {
      const parsed = JSON.parse(await file.text())
      if (parsed?.format !== format || typeof parsed.entries !== 'object') {
        throw new Error(`That file isn't a ${appName} backup.`)
      }
      storage.restoreEntries(parsed.entries as Record<string, string>)
      location.reload()
    },
  }
}
