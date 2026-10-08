// Money in and out on the calendar, ported from FinanceModels.swift and
// FinanceStore.swift. Repeating entries aren't stored once per
// occurrence: `occurrencesInMonth` works out which days one falls on, the
// same way Planner handles a repeating goal.
//
// Saved in the iPhone app's JSON shape (finance_events.json), with one
// addition: "fortnightly" for pay that comes every two weeks.

import { addDays, dayKey, daysBetween, parseDate, startOfDay, toISO, weekday, type ISODate } from '@suite/dates'
import { bool, list, num, oneOf, optNum, optStr, record, str, type Raw } from '@suite/decode'
import { newID } from '@suite/ids'

export type EntryType = 'income' | 'expense'
/** Only meaningful for expenses. Fixed bills vs spending you can flex. */
export type ExpenseCategory = 'fixed' | 'flexible'
export type Frequency = 'none' | 'monthly' | 'weekly' | 'fortnightly'

export interface FinanceEvent {
  id: string
  title: string
  entryType: EntryType
  expenseCategory?: ExpenseCategory
  /** For a varying amount, the estimate used until each one is confirmed. */
  amount: number
  /** The first (or only) day it happens. */
  date: ISODate
  repeats: boolean
  frequency: Frequency
  /** 1 = Sunday … 7 = Saturday; only for weekly. Always the date's weekday. */
  weekday?: number
  /** Irregular pay, say: each occurrence is flagged until its real amount is in. */
  amountVaries: boolean
  /** Day key → the confirmed real amount for that occurrence. */
  confirmedAmounts: Record<string, number>
  /** A repeating entry stops here: no occurrences on or after this day. */
  endDate?: ISODate
}

export interface LineItem {
  event: FinanceEvent
  date: Date
  amount: number
  confirmed: boolean
}

// MARK: - Reading saved data

const ENTRY_TYPES = ['income', 'expense'] as const
const CATEGORIES = ['fixed', 'flexible'] as const
const FREQUENCIES = ['none', 'monthly', 'weekly', 'fortnightly'] as const

export function decodeFinanceEvent(r: Raw): FinanceEvent {
  const entryType = oneOf(r.entryType, ENTRY_TYPES, 'expense')
  return {
    id: str(r.id, newID()),
    title: str(r.title, ''),
    entryType,
    expenseCategory: entryType === 'expense' ? oneOf(r.expenseCategory, CATEGORIES, 'fixed') : undefined,
    amount: num(r.amount, 0),
    date: str(r.date, toISO(startOfDay(new Date()))),
    repeats: bool(r.repeats, false),
    frequency: oneOf(r.frequency, FREQUENCIES, 'none'),
    weekday: optNum(r.weekday),
    amountVaries: bool(r.amountVaries, false),
    confirmedAmounts: record(r.confirmedAmounts, x => optNum(x)),
    endDate: optStr(r.endDate),
  }
}

export const decodeFinanceEvents = (v: unknown) => list(v, decodeFinanceEvent)

export function makeFinanceEvent(fields: Partial<FinanceEvent> & Pick<FinanceEvent, 'title' | 'entryType' | 'date'>): FinanceEvent {
  return {
    id: newID(), amount: 0, repeats: false, frequency: 'none', amountVaries: false, confirmedAmounts: {},
    ...fields,
  }
}

// MARK: - When it happens

/**
 * Every day this entry falls on within the month containing `month`.
 * Months are half-open: the 1st at midnight up to (not including) the
 * 1st of the next month.
 */
export function occurrencesInMonth(event: FinanceEvent, month: Date): Date[] {
  const all = occurrencesIgnoringEnd(event, month)
  if (!event.endDate) return all
  const end = startOfDay(parseDate(event.endDate))
  return all.filter(d => d < end)
}

function occurrencesIgnoringEnd(event: FinanceEvent, month: Date): Date[] {
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1)
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 1)
  const anchor = startOfDay(parseDate(event.date))

  if (!event.repeats) return anchor >= monthStart && anchor < monthEnd ? [anchor] : []

  switch (event.frequency) {
    case 'none':
      return []
    case 'monthly': {
      // Nothing in months before it existed.
      if (monthStart < new Date(anchor.getFullYear(), anchor.getMonth(), 1)) return []
      // A 31st lands on the last day of shorter months.
      const lastDay = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate()
      return [new Date(monthStart.getFullYear(), monthStart.getMonth(), Math.min(anchor.getDate(), lastDay))]
    }
    case 'weekly': {
      const day = event.weekday ?? weekday(anchor)
      const out: Date[] = []
      for (let d = monthStart; d < monthEnd; d = addDays(d, 1)) {
        if (weekday(d) === day && d >= anchor) out.push(d)
      }
      return out
    }
    case 'fortnightly': {
      // Every 14 days from the first date.
      const out: Date[] = []
      for (let d = monthStart; d < monthEnd; d = addDays(d, 1)) {
        const since = daysBetween(anchor, d)
        if (since >= 0 && since % 14 === 0) out.push(d)
      }
      return out
    }
  }
}

/** The confirmed amount for one occurrence if there is one, otherwise the estimate. */
export function amountOn(event: FinanceEvent, date: Date): number {
  if (!event.amountVaries) return event.amount
  return event.confirmedAmounts[dayKey(date)] ?? event.amount
}

/** False only for a varying amount that hasn't had its real figure entered. */
export function isConfirmedOn(event: FinanceEvent, date: Date): boolean {
  if (!event.amountVaries) return true
  return event.confirmedAmounts[dayKey(date)] !== undefined
}

// MARK: - Changing a repeating entry part-way

/**
 * Splits a repeating entry at `from`: the original stops the day before
 * (so earlier months keep their old amount), and a copy with `changes`
 * starts on `from`, taking any confirmed amounts from that day on. For
 * "rent goes up from March" without rewriting January.
 */
export function splitFrom(events: FinanceEvent[], id: string, from: Date, changes: Partial<FinanceEvent>, newID_: string = newID()): FinanceEvent[] {
  const original = events.find(e => e.id === id)
  if (!original) return events
  const start = startOfDay(from)
  const fromKey = dayKey(start)
  const before: Record<string, number> = {}
  const after: Record<string, number> = {}
  for (const [k, v] of Object.entries(original.confirmedAmounts)) (k < fromKey ? before : after)[k] = v
  const ended: FinanceEvent = { ...original, endDate: toISO(start), confirmedAmounts: before }
  const next: FinanceEvent = { ...original, ...changes, id: newID_, confirmedAmounts: after, date: changes.date ?? toISO(start), endDate: original.endDate }
  return events.flatMap(e => (e.id === id ? [ended, next] : [e]))
}

/** Whether `day` is a later occurrence than the first one. */
export const isLaterOccurrence = (event: FinanceEvent, day: Date) => event.repeats && startOfDay(day) > startOfDay(parseDate(event.date))

// MARK: - Weekly pot hand-over

/**
 * Repeating flexible entries still running — what the weekly pot replaces.
 * One-off flexible entries (a planned gift) aren't included: they're
 * specific plans and keep counting on their own.
 */
export function runningRepeatingFlexible(events: FinanceEvent[], today: Date = new Date()): FinanceEvent[] {
  const t = startOfDay(today)
  return events.filter(e => e.entryType === 'expense' && e.expenseCategory === 'flexible' && e.repeats
    && (!e.endDate || startOfDay(parseDate(e.endDate)) > t))
}

/** Roughly what those cost a week, as a starting point for the pot. */
export function weeklyFlexibleEstimate(events: FinanceEvent[], today: Date = new Date()): number {
  return runningRepeatingFlexible(events, today).reduce((a, e) =>
    a + (e.frequency === 'weekly' ? e.amount : e.frequency === 'fortnightly' ? e.amount / 2 : (e.amount * 12) / 52), 0)
}

// MARK: - Lists and totals

/** Every occurrence in a month, in date order (income first on a shared day). */
export function lineItemsInMonth(events: FinanceEvent[], month: Date): LineItem[] {
  return events
    .flatMap(event => occurrencesInMonth(event, month).map(date => ({
      event, date, amount: amountOn(event, date), confirmed: isConfirmedOn(event, date),
    })))
    .sort((a, b) => a.date.getTime() - b.date.getTime()
      || (a.event.entryType === b.event.entryType ? 0 : a.event.entryType === 'income' ? -1 : 1)
      || a.event.title.localeCompare(b.event.title))
}

export function lineItemsOn(events: FinanceEvent[], day: Date): LineItem[] {
  const key = dayKey(day)
  return lineItemsInMonth(events, day).filter(i => dayKey(i.date) === key)
}

export interface MonthTotals {
  income: number
  expenses: number
  fixed: number
  flexible: number
  /** Occurrences still running on an estimate, up to and including today. */
  toConfirm: number
}

export function monthTotals(events: FinanceEvent[], month: Date, today: Date = new Date()): MonthTotals {
  const items = lineItemsInMonth(events, month)
  const sum = (filter: (i: LineItem) => boolean) => items.filter(filter).reduce((a, i) => a + i.amount, 0)
  const endOfToday = addDays(startOfDay(today), 1)
  return {
    income: sum(i => i.event.entryType === 'income'),
    expenses: sum(i => i.event.entryType === 'expense'),
    fixed: sum(i => i.event.entryType === 'expense' && i.event.expenseCategory === 'fixed'),
    flexible: sum(i => i.event.entryType === 'expense' && i.event.expenseCategory === 'flexible'),
    toConfirm: items.filter(i => !i.confirmed && i.date < endOfToday).length,
  }
}

/** "Every month on the 15th", "Every Friday", "Every other Friday", or "Once". */
export function repeatText(event: Pick<FinanceEvent, 'repeats' | 'frequency' | 'date'>): string {
  if (!event.repeats || event.frequency === 'none') return 'Once'
  const anchor = parseDate(event.date)
  const dayName = anchor.toLocaleDateString(undefined, { weekday: 'long' })
  if (event.frequency === 'weekly') return `Every ${dayName}`
  if (event.frequency === 'fortnightly') return `Every other ${dayName}`
  return `Monthly on day ${anchor.getDate()}`
}
