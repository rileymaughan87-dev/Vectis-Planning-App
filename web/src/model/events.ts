// Calendar event logic, ported from CalendarModels.swift.

import { addMinutes, atMinutes, dayKey, daysBetween, minutesFromMidnight, parseDate, startOfDay, toISO, weekday } from './dates'
import { newID } from './ids'
import type { CalendarEvent } from './types'

export function makeEvent(fields: Pick<CalendarEvent, 'title' | 'startDate' | 'endDate' | 'categoryID'> & Partial<CalendarEvent>): CalendarEvent {
  return {
    id: newID(),
    notes: '',
    flowsToDaily: false,
    isAllDay: false,
    recurrence: 'none',
    isCompleted: false,
    excludedOccurrences: [],
    origin: 'daily',
    isFlexible: false,
    repeatDays: [1, 2, 3, 4, 5, 6, 7],
    timeOverrides: {},
    parts: [],
    ...fields,
  }
}

/** Whether the event covers a day — multi-day spans and repeats included. */
export function occupies(event: CalendarEvent, date: Date): boolean {
  const day = startOfDay(date)
  // A deliberately deleted occurrence stays gone whatever else applies.
  if (event.excludedOccurrences.includes(dayKey(day))) return false

  const start = startOfDay(parseDate(event.startDate))
  const end = startOfDay(parseDate(event.endDate))
  if (day >= start && day <= end) return true
  if (event.recurrence === 'none' || day <= end) return false
  if (event.recurrenceEndDate && day > startOfDay(parseDate(event.recurrenceEndDate))) return false

  switch (event.recurrence) {
    case 'daily':
      return event.repeatDays.includes(weekday(day))
    case 'weekly':
      return weekday(day) === weekday(start)
    case 'monthly': {
      const target = start.getDate()
      const daysThisMonth = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate()
      // Clamp so a 31st anchor still lands in shorter months.
      return day.getDate() === Math.min(target, daysThisMonth)
    }
  }
}

/** The event's start and end on a specific day; repeats shifted onto it. */
export function timesOn(event: CalendarEvent, date: Date): { start: Date; end: Date } {
  const startDate = parseDate(event.startDate)
  const endDate = parseDate(event.endDate)
  const durationMs = endDate.getTime() - startDate.getTime()

  // A day that was individually dragged wins over the series' own time.
  const override = event.timeOverrides[dayKey(date)]
  if (override !== undefined) {
    const start = atMinutes(date, override)
    return { start, end: new Date(start.getTime() + durationMs) }
  }
  if (event.recurrence === 'none' || dayKey(startDate) === dayKey(date)) {
    return { start: startDate, end: endDate }
  }
  const shifted = atMinutes(date, minutesFromMidnight(startDate))
  return { start: shifted, end: new Date(shifted.getTime() + durationMs) }
}

/** Every event covering a day, each with its times shifted onto that day. */
export function eventsOn(events: CalendarEvent[], date: Date): CalendarEvent[] {
  return events.filter(e => occupies(e, date)).map(e => {
    const t = timesOn(e, date)
    return { ...e, startDate: toISO(t.start), endDate: toISO(t.end) }
  })
}

export function dayCount(event: CalendarEvent): number {
  return daysBetween(parseDate(event.startDate), parseDate(event.endDate)) + 1
}

/**
 * The estimate-lock rule. Before the event starts this is re-planning;
 * at or after its start, the original estimate is frozen (once) and the
 * new duration becomes the logged actual, shared across any parts.
 */
export function resized(event: CalendarEvent, newEnd: Date, now: Date = new Date()): CalendarEvent {
  const start = parseDate(event.startDate)
  const next: CalendarEvent = { ...event, endDate: toISO(newEnd) }
  if (now >= start) {
    if (event.estimatedMinutes === undefined) {
      next.estimatedMinutes = Math.round((parseDate(event.endDate).getTime() - start.getTime()) / 60_000)
    }
    const actual = Math.max(Math.round((newEnd.getTime() - start.getTime()) / 60_000), 1)
    next.actualMinutes = actual
    if (event.parts.length > 0) {
      const total = Math.max(event.parts.reduce((a, p) => a + p.estimatedMinutes, 0), 1)
      next.parts = event.parts.map(p => ({ ...p, actualMinutes: Math.max(Math.round(actual * (p.estimatedMinutes / total)), 0) }))
    }
  }
  return next
}

export function moved(event: CalendarEvent, newStart: Date): CalendarEvent {
  const duration = parseDate(event.endDate).getTime() - parseDate(event.startDate).getTime()
  return { ...event, startDate: toISO(newStart), endDate: toISO(addMinutes(newStart, duration / 60_000)) }
}
