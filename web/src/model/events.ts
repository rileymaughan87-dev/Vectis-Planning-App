// Calendar event logic, ported from CalendarModels.swift.

import { addDays, addMinutes, atMinutes, dayKey, daysBetween, minutesFromMidnight, parseDate, startOfDay, toISO, weekday } from './dates'
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
    durationOverrides: {},
    occurrenceActuals: {},
    occurrenceEstimates: {},
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
  const key = dayKey(date)
  // A one-day length change wins over the series' usual length.
  const overrideMinutes = event.durationOverrides[key]
  const durationMs = overrideMinutes !== undefined ? overrideMinutes * 60_000 : endDate.getTime() - startDate.getTime()

  // A day that was individually dragged wins over the series' own time.
  const override = event.timeOverrides[key]
  if (override !== undefined) {
    const start = atMinutes(date, override)
    return { start, end: new Date(start.getTime() + durationMs) }
  }
  if (event.recurrence === 'none') return { start: startDate, end: endDate }
  if (dayKey(startDate) === key) return { start: startDate, end: new Date(startDate.getTime() + durationMs) }
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

// MARK: - Single occurrences of a repeating event

const before = (r: Record<string, number>, key: string) => Object.fromEntries(Object.entries(r).filter(([k]) => k < key))
const from = (r: Record<string, number>, key: string, inclusive: boolean) =>
  Object.fromEntries(Object.entries(r).filter(([k]) => (inclusive ? k >= key : k > key)))

/** One occurrence made longer or shorter; the series is untouched. */
export function withOccurrenceDuration(event: CalendarEvent, date: Date, minutes: number): CalendarEvent {
  return { ...event, durationOverrides: { ...event.durationOverrides, [dayKey(date)]: Math.max(minutes, 5) } }
}

/**
 * Logs how long one occurrence actually took. Same estimate-lock rule as
 * a one-off: the planned length is frozen the first time, and the block
 * then shows the real length for that day only.
 */
export function withOccurrenceActual(event: CalendarEvent, date: Date, minutes: number): CalendarEvent {
  const key = dayKey(date)
  const times = timesOn(event, date)
  const actual = Math.max(minutes, 1)
  return {
    ...event,
    occurrenceEstimates: key in event.occurrenceEstimates
      ? event.occurrenceEstimates
      : { ...event.occurrenceEstimates, [key]: Math.round((times.end.getTime() - times.start.getTime()) / 60_000) },
    occurrenceActuals: { ...event.occurrenceActuals, [key]: actual },
    durationOverrides: { ...event.durationOverrides, [key]: actual },
  }
}

/**
 * New times for a repeating event from one occurrence onward. Earlier
 * occurrences keep the times they really had: the series ends the day
 * before, and a new series with the new times starts on this day.
 * Overrides, logs and deleted days go to whichever half their date is in.
 * From the series' very first day there's nothing earlier to protect, so
 * the series itself just changes.
 */
export function splitSeriesFrom(
  events: CalendarEvent[], eventID: string, date: Date, startMinutes: number, durationMinutes: number, newID: () => string,
): CalendarEvent[] {
  const index = events.findIndex(e => e.id === eventID)
  if (index < 0) return events
  const original = events[index]
  const splitDay = startOfDay(date)
  const splitKey = dayKey(splitDay)
  const newStart = atMinutes(splitDay, startMinutes)
  const newEnd = addMinutes(newStart, Math.max(durationMinutes, 5))
  const result = [...events]

  if (splitDay <= startOfDay(parseDate(original.startDate))) {
    const { [splitKey]: _t, ...timeOverrides } = original.timeOverrides
    const { [splitKey]: _d, ...durationOverrides } = original.durationOverrides
    void _t
    void _d
    result[index] = { ...original, startDate: toISO(newStart), endDate: toISO(newEnd), timeOverrides, durationOverrides }
    return result
  }

  const future: CalendarEvent = {
    ...original,
    id: newID(),
    startDate: toISO(newStart),
    endDate: toISO(newEnd),
    excludedOccurrences: original.excludedOccurrences.filter(k => k >= splitKey),
    // The new times ARE this day's times now, so its own overrides go.
    timeOverrides: from(original.timeOverrides, splitKey, false),
    durationOverrides: from(original.durationOverrides, splitKey, false),
    occurrenceActuals: from(original.occurrenceActuals, splitKey, true),
    occurrenceEstimates: from(original.occurrenceEstimates, splitKey, true),
    estimatedMinutes: undefined,
    actualMinutes: undefined,
    isCompleted: false,
  }
  result[index] = {
    ...original,
    recurrenceEndDate: toISO(addDays(splitDay, -1)),
    excludedOccurrences: original.excludedOccurrences.filter(k => k < splitKey),
    timeOverrides: before(original.timeOverrides, splitKey),
    durationOverrides: before(original.durationOverrides, splitKey),
    occurrenceActuals: before(original.occurrenceActuals, splitKey),
    occurrenceEstimates: before(original.occurrenceEstimates, splitKey),
  }
  result.splice(index + 1, 0, future)
  return result
}
