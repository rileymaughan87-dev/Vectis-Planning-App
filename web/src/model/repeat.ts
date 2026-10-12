// Repeat rules: every N days, every N weeks on chosen days, every N months
// (on a date, or on the 1st…4th or last weekday, like "the 1st Thursday"),
// every N years. Web only (Oct 2026). Goals and events keep their older
// fields too (weekdays, recurrence) so the iPhone app still reads
// something close; where a rule is set, the rule decides.

import { addDays, dayFromKey, daysBetween, startOfDay, startOfWeek, weekday } from './dates'

export type RepeatUnit = 'day' | 'week' | 'month' | 'year'

export interface RepeatRule {
  unit: RepeatUnit
  /** Every N units: 1 = every, 2 = every other… */
  interval: number
  /** Weeks: the weekdays it lands on (1 = Sunday … 7 = Saturday). */
  weekdays: number[]
  /** Months and years: on a date ("the 15th") or a weekday ("the 1st Thursday"). */
  monthMode: 'date' | 'weekday'
  /** The date, 1–31 (a short month uses its last day). */
  monthDay: number
  /** Which weekday of the month: 1–4, or -1 for the last. */
  ordinal: number
  /** That weekday, 1 = Sunday … 7 = Saturday. */
  weekday: number
  /** Years: the month, 1–12. */
  month: number
  /**
   * Goals: the day ("yyyy-MM-dd") its every-N counts from. Events count
   * from their own start date and leave this empty.
   */
  anchor: string
}

/** A sensible rule for a start date: every week on its weekday, the date and weekday filled in from it. */
export function ruleFor(start: Date, unit: RepeatUnit = 'week', interval = 1): RepeatRule {
  const nth = Math.ceil(start.getDate() / 7)
  return {
    unit,
    interval,
    weekdays: [weekday(start)],
    monthMode: 'date',
    monthDay: start.getDate(),
    ordinal: nth > 4 ? -1 : nth,
    weekday: weekday(start),
    month: start.getMonth() + 1,
    anchor: '',
  }
}

const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate()

/** Whether `day` is that month's ordinal weekday (the 1st Thursday, the last Friday…). */
function isNthWeekday(day: Date, ordinal: number, wd: number): boolean {
  if (weekday(day) !== wd) return false
  if (ordinal === -1) return day.getDate() + 7 > daysInMonth(day.getFullYear(), day.getMonth())
  return Math.ceil(day.getDate() / 7) === ordinal
}

function onMonthDay(rule: RepeatRule, day: Date): boolean {
  if (rule.monthMode === 'weekday') return isNthWeekday(day, rule.ordinal, rule.weekday)
  return day.getDate() === Math.min(rule.monthDay, daysInMonth(day.getFullYear(), day.getMonth()))
}

/**
 * Whether a rule lands on `day`, counting its every-N from `anchor` (an
 * event's first day, or the day a goal's pattern starts). Nothing before
 * the anchor.
 */
export function landsOn(rule: RepeatRule, anchor: Date, day: Date): boolean {
  const a = startOfDay(anchor)
  const d = startOfDay(day)
  if (d < a) return false
  const n = Math.max(1, Math.round(rule.interval))
  switch (rule.unit) {
    case 'day':
      return daysBetween(a, d) % n === 0
    case 'week': {
      if (!rule.weekdays.includes(weekday(d))) return false
      const weeks = Math.round(daysBetween(startOfWeek(a), startOfWeek(d)) / 7)
      return weeks % n === 0
    }
    case 'month': {
      const months = (d.getFullYear() - a.getFullYear()) * 12 + d.getMonth() - a.getMonth()
      return months % n === 0 && onMonthDay(rule, d)
    }
    case 'year': {
      const years = d.getFullYear() - a.getFullYear()
      return years % n === 0 && d.getMonth() + 1 === rule.month && onMonthDay(rule, d)
    }
  }
}

/** The next days it lands on from `from` (for "Next: …" previews). */
export function nextDays(rule: RepeatRule, anchor: Date, from: Date, count = 3, limitDays = 3 * 366): Date[] {
  const out: Date[] = []
  for (let i = 0, d = startOfDay(from); i < limitDays && out.length < count; i++, d = addDays(d, 1)) {
    if (landsOn(rule, anchor, d)) out.push(d)
  }
  return out
}

const ORDINALS: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', [-1]: 'last' }
export const ordinalName = (n: number) => ORDINALS[n] ?? `${n}th`
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const weekdayName = (wd: number) => WEEKDAY_NAMES[wd - 1] ?? ''
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const monthName = (m: number) => MONTH_NAMES[m - 1] ?? ''
const dateName = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`

function listDays(days: number[]): string {
  const sorted = [...days].sort((x, y) => x - y)
  if (sorted.length === 7) return 'every day'
  if (sorted.join() === '2,3,4,5,6') return 'weekdays'
  if (sorted.join() === '1,7') return 'weekends'
  const names = sorted.map(d => weekdayName(d).slice(0, 3))
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0] ?? ''
}

/** "Every 2 weeks on Tue and Thu", "Every month on the 1st Thursday", "Every year on 3 March". */
export function describeRule(rule: RepeatRule): string {
  const n = Math.max(1, Math.round(rule.interval))
  const every = (one: string, many: string) => (n === 1 ? `Every ${one}` : n === 2 ? `Every other ${one}` : `Every ${n} ${many}`)
  const on = rule.monthMode === 'weekday' ? `the ${ordinalName(rule.ordinal)} ${weekdayName(rule.weekday)}` : `the ${dateName(rule.monthDay)}`
  switch (rule.unit) {
    case 'day':
      return every('day', 'days')
    case 'week': {
      const span = n === 1 ? 'Every week' : `Every ${n} weeks`
      if (rule.weekdays.length === 7) return n === 1 ? 'Every day' : `${span}, every day`
      return `${span} on ${listDays(rule.weekdays)}`
    }
    case 'month':
      return `${every('month', 'months')} on ${on}`
    case 'year':
      return rule.monthMode === 'weekday'
        ? `${every('year', 'years')} on ${on} of ${monthName(rule.month)}`
        : `${every('year', 'years')} on ${rule.monthDay} ${monthName(rule.month)}`
  }
}

/** Reads a saved rule, with a default for every missing field; anything unusable gives none. */
export function decodeRepeatRule(v: unknown): RepeatRule | undefined {
  if (!v || typeof v !== 'object') return undefined
  const r = v as Record<string, unknown>
  const unit = (['day', 'week', 'month', 'year'] as const).find(u => u === r.unit)
  if (!unit) return undefined
  const int = (x: unknown, lo: number, hi: number, fallback: number) =>
    typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : fallback
  const weekdays = Array.isArray(r.weekdays) ? [...new Set(r.weekdays.filter((d): d is number => Number.isInteger(d) && d >= 1 && d <= 7))] : []
  return {
    unit,
    interval: int(r.interval, 1, 999, 1),
    weekdays: weekdays.length ? weekdays : [2],
    monthMode: r.monthMode === 'weekday' ? 'weekday' : 'date',
    monthDay: int(r.monthDay, 1, 31, 1),
    ordinal: r.ordinal === -1 ? -1 : int(r.ordinal, 1, 4, 1),
    weekday: int(r.weekday, 1, 7, 2),
    month: int(r.month, 1, 12, 1),
    anchor: typeof r.anchor === 'string' ? r.anchor : '',
  }
}

export const sameRule = (a?: RepeatRule, b?: RepeatRule) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** The day a goal's rule counts its every-N from (the day it was set, if none is saved). */
export const goalAnchor = (rule: RepeatRule, fallback: Date) => (/^\d{4}-\d{2}-\d{2}$/.test(rule.anchor) ? dayFromKey(rule.anchor) : fallback)
