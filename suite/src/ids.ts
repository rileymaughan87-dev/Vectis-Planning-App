/** Upper-case, like Swift's `UUID().uuidString`, so ids look the same in both apps. */
export function newID(): string {
  return crypto.randomUUID().toUpperCase()
}
