// What's on a day. One function used by the Daily grid, Home's "Right
// now", buffer awareness and a partner's view, so they can never
// disagree (audit item 7 — in the iPhone app these were three copies).
//
// Goal and task blocks are generated here on every call with stable
// ids, never stored as events.

import { addMinutes, dayKey, isSameDay, parseDate, startOfDay } from './dates'
import { eventsOn } from './events'
import { goalBlockTimes } from './goals'
import type { CalendarCategory, CalendarEvent, CalendarHours, Goal, VectisTask } from './types'

export type BlockKind = 'event' | 'goal' | 'task'

export interface DayBlock {
  /** Stable across renders: the event id, `goal:<id>:<day>`, or the task id. */
  id: string
  kind: BlockKind
  title: string
  start: Date
  end: Date
  done: boolean
  /** Category colour for events; goal and task blocks use theme colours. */
  colorHex?: string
  /** The occurrence-shifted event, for event blocks. */
  event?: CalendarEvent
  goalID?: string
  taskID?: string
}

export interface DayData {
  events: CalendarEvent[]
  goals: Goal[]
  tasks: VectisTask[]
  categories: CalendarCategory[]
}

export function dayBlocks(data: DayData, date: Date): DayBlock[] {
  const blocks: DayBlock[] = []

  for (const e of eventsOn(data.events, date)) {
    if (!e.flowsToDaily || e.isAllDay) continue
    blocks.push({
      id: e.id,
      kind: 'event',
      title: e.title,
      start: parseDate(e.startDate),
      end: parseDate(e.endDate),
      done: e.isCompleted,
      colorHex: data.categories.find(c => c.id === e.categoryID)?.colorHex ?? '#999999',
      event: e,
    })
  }

  for (const g of data.goals) {
    const times = goalBlockTimes(g, date)
    if (!times) continue
    blocks.push({
      id: `goal:${g.id}:${dayKey(date)}`,
      kind: 'goal',
      title: g.title,
      start: times.start,
      end: times.end,
      done: g.completions[dayKey(date)] === true,
      goalID: g.id,
    })
  }

  for (const t of data.tasks) {
    if (!t.scheduledDate || t.durationMinutes === undefined) continue
    const start = parseDate(t.scheduledDate)
    if (!isSameDay(start, date)) continue
    blocks.push({
      id: t.id,
      kind: 'task',
      title: t.text,
      start,
      end: addMinutes(start, t.durationMinutes),
      done: t.done,
      taskID: t.id,
    })
  }

  return blocks.sort((a, b) => a.start.getTime() - b.start.getTime())
}

/** All-day things on a day — context rather than something you're doing at 2pm. */
export function allDayEvents(events: CalendarEvent[], date: Date): CalendarEvent[] {
  return eventsOn(events, date).filter(e => e.isAllDay)
}

/**
 * Minutes from the start of `date` to `time`, so a block that runs past
 * midnight keeps its real length instead of wrapping (audit item 4).
 */
export function minutesIntoDay(time: Date, date: Date): number {
  return Math.round((time.getTime() - startOfDay(date).getTime()) / 60_000)
}

// MARK: - Overlap layout

export interface LaidOut<T> {
  item: T
  column: number
  columnCount: number
}

/** Packs overlapping blocks into side-by-side columns, like Google Calendar. */
export function layoutBlocks<T extends { start: Date; end: Date }>(items: T[]): LaidOut<T>[] {
  const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime())
  const clusters: T[][] = []
  let current: T[] = []
  let clusterEnd = -Infinity
  for (const it of sorted) {
    if (current.length === 0 || it.start.getTime() < clusterEnd) {
      current.push(it)
      clusterEnd = Math.max(clusterEnd, it.end.getTime())
    } else {
      clusters.push(current)
      current = [it]
      clusterEnd = it.end.getTime()
    }
  }
  if (current.length) clusters.push(current)

  const out: LaidOut<T>[] = []
  for (const cluster of clusters) {
    const columnEnds: number[] = []
    const placed: { item: T; column: number }[] = []
    for (const it of cluster) {
      let col = columnEnds.findIndex(end => end <= it.start.getTime())
      if (col === -1) {
        columnEnds.push(it.end.getTime())
        col = columnEnds.length - 1
      } else {
        columnEnds[col] = it.end.getTime()
      }
      placed.push({ item: it, column: col })
    }
    for (const p of placed) out.push({ ...p, columnCount: columnEnds.length })
  }
  return out
}

// MARK: - Buffer awareness

/** Above this, a day tends to unravel as soon as anything runs long. */
export const COMFORTABLE_LIMIT = 0.8

/**
 * How much of the visible day is spoken for. Overlaps count once, and
 * done tasks don't count.
 */
export function commitmentFraction(data: DayData, hours: CalendarHours, date: Date): number {
  const dayStart = startOfDay(date).getTime()
  const windowStart = dayStart + hours.startHour * 3_600_000
  const windowEnd = dayStart + hours.endHour * 3_600_000
  const length = windowEnd - windowStart
  if (length <= 0) return 0

  const intervals = dayBlocks(data, date)
    .filter(b => !(b.kind === 'task' && b.done))
    .map(b => ({ start: Math.max(b.start.getTime(), windowStart), end: Math.min(b.end.getTime(), windowEnd) }))
    .filter(i => i.end > i.start)
    .sort((a, b) => a.start - b.start)

  let total = 0
  let open: { start: number; end: number } | null = null
  for (const i of intervals) {
    if (open && i.start <= open.end) {
      open.end = Math.max(open.end, i.end)
    } else {
      if (open) total += open.end - open.start
      open = { ...i }
    }
  }
  if (open) total += open.end - open.start
  return total / length
}
