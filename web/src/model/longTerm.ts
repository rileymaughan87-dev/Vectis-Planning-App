// What the Long-Term calendar shows, ported from CalendarHelpers.swift.
//
// Events made on the Long-Term screen (by `origin`, not `flowsToDaily` —
// those answer different questions), plus every milestone with a date.

import { isSameDay, parseDate } from './dates'
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

export { monthGridDays, startOfMonth } from '@suite/months'
