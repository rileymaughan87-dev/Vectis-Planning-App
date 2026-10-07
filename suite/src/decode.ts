// Reading saved JSON with a default for every missing field — the web
// version of the suite rule "hand-write Codable with decodeIfPresent ??
// default". Adding a field later never makes old data unreadable, and an
// item missing something essential is dropped on its own, never the file.

export type Raw = Record<string, unknown>

export const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v)
export const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d)
export const optStr = (v: unknown) => (typeof v === 'string' ? v : undefined)
export const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
export const optNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
export const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
export const nums = (v: unknown, d: number[]) => (Array.isArray(v) ? v.filter(x => typeof x === 'number') : d)
export const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
export const oneOf = <T extends string>(v: unknown, options: readonly T[], d: T): T =>
  (typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : d)

export function record<T>(v: unknown, pick: (x: unknown) => T | undefined): Record<string, T> {
  const out: Record<string, T> = {}
  if (!isObj(v)) return out
  for (const [k, x] of Object.entries(v)) {
    const value = pick(x)
    if (value !== undefined) out[k] = value
  }
  return out
}

export function list<T>(v: unknown, decode: (x: Raw) => T | null): T[] {
  if (!Array.isArray(v)) return []
  return v.flatMap(x => {
    if (!isObj(x)) return []
    const item = decode(x)
    return item ? [item] : []
  })
}
