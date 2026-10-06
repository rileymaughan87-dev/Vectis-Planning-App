// Date helpers. Everything is local time, matching `Calendar.current`
// in the iPhone app, so "today" means today where you are.

import type { ISODate } from './types'

/** Swift's `Date.distantPast`, as the iPhone app writes it. */
export const DISTANT_PAST: ISODate = '0001-01-01T00:00:00Z'

export const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7]
export const WEEKDAYS_ONLY = [2, 3, 4, 5, 6]
export const WEEKEND_ONLY = [1, 7]

export function parseDate(iso: ISODate): Date {
  return new Date(iso)
}

/** ISO 8601 without milliseconds — the shape Swift's encoder writes. */
export function toISO(date: Date): ISODate {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, date.getHours(), date.getMinutes(), date.getSeconds())
}

export function addMonths(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1, date.getHours(), date.getMinutes())
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(date.getDate(), lastDay))
  return target
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000)
}

/** The canonical "yyyy-MM-dd" key for a local day. */
export function dayKey(date: Date): string {
  const y = String(date.getFullYear()).padStart(4, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function dayFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function isSameDay(a: Date, b: Date): boolean {
  return dayKey(a) === dayKey(b)
}

/** 1 = Sunday … 7 = Saturday, Foundation's convention. */
export function weekday(date: Date): number {
  return date.getDay() + 1
}

/** Whole days from `a` to `b`, by calendar day rather than 24h blocks. */
export function daysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((ub - ua) / 86_400_000)
}

export function minutesFromMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

export function atMinutes(day: Date, minutes: number): Date {
  return addMinutes(startOfDay(day), minutes)
}

export function sameSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  const sb = new Set(b)
  return a.every(x => sb.has(x))
}
