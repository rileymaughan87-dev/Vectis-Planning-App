// What the Long-Term calendar shows, ported from CalendarHelpers.swift.
//
// Events made on the Long-Term screen (by `origin`, not `flowsToDaily` —
// those answer different questions), plus every milestone with a date.

import { addDays, isSameDay, parseDate, startOfDay, startOfWeek } from './dates'
import { eventsOn } from './events'
import type { CalendarCategory, CalendarEvent, Goal, Milestone } from './types'

export type LongTermItem =
  | { kind: 'event'; id: string; title: string; colorHex: string; event: CalendarEvent }
  | { kind: 'milestone'; id: string; title: string; colorHex: string; milestone: Milestone; goal: Goal }

export function longTermItems(
  data: { events: CalendarEvent[]; goals: Goal[]; categories: CalendarCategory[] },
  date: Date,
  milestoneColor: string,
): LongTermItem[] {
  const items: LongTermItem[] = []

  // Shifted onto this day, so a repeat lists its own times.
  const events = eventsOn(data.events.filter(e => e.origin === 'longTerm'), date)
    .sort((a, b) => Number(b.isAllDay) - Number(a.isAllDay) || a.startDate.localeCompare(b.startDate))
  for (const e of events) {
    items.push({
      kind: 'event',
      id: e.id,
      title: e.title,
      colorHex: data.categories.find(c => c.id === e.categoryID)?.colorHex ?? '#999999',
      event: e,
    })
  }

  for (const goal of data.goals) {
    if (goal.kind !== 'longTerm') continue
    for (const m of goal.milestones) {
      if (m.addToCalendar && m.date && isSameDay(parseDate(m.date), date)) {
        items.push({ kind: 'milestone', id: m.id, title: m.title, colorHex: milestoneColor, milestone: m, goal })
      }
    }
  }
  return items
}

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
