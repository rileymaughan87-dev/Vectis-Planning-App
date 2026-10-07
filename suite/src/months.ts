// Whole-week month layouts, starting on the region's first weekday.

import { addDays, startOfDay, startOfWeek } from './dates'

/**
 * The days to draw for a month: whole weeks, starting on the region's
 * first weekday, with `inMonth` false for the spill-over days.
 */
export function monthGridDays(month: Date): { date: Date; inMonth: boolean }[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  const days: { date: Date; inMonth: boolean }[] = []
  let cursor = startOfWeek(first)
  while (cursor <= last || days.length % 7 !== 0) {
    days.push({ date: cursor, inMonth: cursor.getMonth() === month.getMonth() })
    cursor = addDays(cursor, 1)
  }
  return days
}

export function startOfMonth(date: Date): Date {
  return startOfDay(new Date(date.getFullYear(), date.getMonth(), 1))
}
