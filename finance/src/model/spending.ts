// Real flexible spending and the weekly pot, ported from SpendingModels
// and SpendingStore.swift. Logged spending is the record: it counts in its
// month whether or not the pot is on. The pot only adds a *plan* for days
// still to come.
//
// The pot itself: one amount for all flexible spending instead of a
// planned entry each for groceries, eating out and so on. Labelled pots
// are easier to stick to than one undivided balance ("mental accounting",
// Thaler 1999; earmarked money was spent more slowly in Soman & Cheema 2011).
//
// Saved as spending_entries.json and spending_pot.json, the iPhone shapes.

import { addDays, daysBetween, parseDate, startOfDay, startOfWeek, toISO, type ISODate } from '@suite/dates'
import { bool, isObj, list, num, oneOf, optStr, str, type Raw } from '@suite/decode'
import { newID } from '@suite/ids'

export interface SpendingEntry {
  id: string
  date: ISODate
  amount: number
  note: string
  /** "shortcut" came from the iPhone's Shortcuts action; the web only logs by hand. */
  source: 'manual' | 'shortcut'
  /** Which account it came out of (model/accounts.ts); unset means the main current account. */
  accountID?: string
}

export interface SpendingPot {
  weeklyAmount: number
  /** The day the pot took over; it plans nothing before this. */
  startDate: ISODate
  isActive: boolean
}

export const decodeSpendingEntry = (r: Raw): SpendingEntry => ({
  id: str(r.id, newID()),
  date: str(r.date, toISO(new Date())),
  amount: num(r.amount, 0),
  note: str(r.note, ''),
  source: oneOf(r.source, ['manual', 'shortcut'] as const, 'manual'),
  accountID: optStr(r.accountID),
})

export const decodeSpendingEntries = (v: unknown) => list(v, decodeSpendingEntry)

export function decodePot(v: unknown): SpendingPot {
  const r = isObj(v) ? v : {}
  return { weeklyAmount: num(r.weeklyAmount, 0), startDate: str(r.startDate, toISO(startOfDay(new Date()))), isActive: bool(r.isActive, false) }
}

// MARK: - Weeks

export interface Week {
  start: Date
  /** Exclusive: the start of the next week. */
  end: Date
}

/** The week containing `date`, starting on the region's first weekday. */
export function weekOf(date: Date): Week {
  const start = startOfWeek(date)
  return { start, end: addDays(start, 7) }
}

const inRange = (e: SpendingEntry, start: Date, end: Date) => {
  const d = parseDate(e.date)
  return d >= start && d < end
}

/** Newest first. */
export function entriesIn(entries: SpendingEntry[], start: Date, end: Date): SpendingEntry[] {
  return entries.filter(e => inRange(e, start, end)).sort((a, b) => b.date.localeCompare(a.date))
}

export const spentIn = (entries: SpendingEntry[], start: Date, end: Date) =>
  entries.filter(e => inRange(e, start, end)).reduce((a, e) => a + e.amount, 0)

export interface WeekStatus {
  spent: number
  left: number
  /** Days left in the week including today (0 for a past week). */
  daysLeft: number
  /** What's left spread over the days still to come, today included. */
  perDay?: number
}

export function weekStatus(entries: SpendingEntry[], pot: SpendingPot, week: Week, today: Date = new Date()): WeekStatus {
  const spent = spentIn(entries, week.start, week.end)
  const left = pot.weeklyAmount - spent
  const t = startOfDay(today)
  const daysLeft = t < week.start ? 7 : t >= week.end ? 0 : daysBetween(t, week.end)
  return { spent, left, daysLeft, perDay: daysLeft > 0 && left > 0 ? left / daysLeft : undefined }
}

// MARK: - Months

/**
 * Flexible spending for a month: what was actually logged, plus — while
 * the pot is on — the pot's daily share for each day still to come
 * (from tomorrow; today is covered by what's logged so far).
 */
export function flexibleForMonth(entries: SpendingEntry[], pot: SpendingPot, month: Date, today: Date = new Date()): { spent: number; planned: number } {
  const start = new Date(month.getFullYear(), month.getMonth(), 1)
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 1)
  const spent = spentIn(entries, start, end)
  if (!pot.isActive || pot.weeklyAmount <= 0) return { spent, planned: 0 }
  const tomorrow = addDays(startOfDay(today), 1)
  const potStart = startOfDay(parseDate(pot.startDate))
  const from = new Date(Math.max(start.getTime(), tomorrow.getTime(), potStart.getTime()))
  if (from >= end) return { spent, planned: 0 }
  return { spent, planned: (pot.weeklyAmount / 7) * daysBetween(from, end) }
}

/** The notes used most often lately, for one-tap logging. */
export function recentNotes(entries: SpendingEntry[], limit = 5): string[] {
  const counts = new Map<string, { n: number; last: string }>()
  for (const e of [...entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60)) {
    const note = e.note.trim()
    if (!note) continue
    const c = counts.get(note) ?? { n: 0, last: e.date }
    counts.set(note, { n: c.n + 1, last: c.last })
  }
  return [...counts.entries()].sort((a, b) => b[1].n - a[1].n || b[1].last.localeCompare(a[1].last)).slice(0, limit).map(([note]) => note)
}
