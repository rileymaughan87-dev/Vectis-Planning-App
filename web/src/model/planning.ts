// Plan and review, ported from PlanningItem.swift and EveningReviewView.
// One definition of "what still needs a slot", shared by the capture
// popup and the drag tray so the two can never disagree.

import { journalEntryFor } from '@suite/record/noteDoc'
import { eventsOn } from './events'
import { isDoneOn, isScheduled, missNudge } from './goals'
import type { CalendarEvent, Goal, JournalEntry, VectisTask } from './types'

export type PlanningItem =
  | { kind: 'goal'; id: string; title: string; durationMinutes: number; goal: Goal }
  | { kind: 'task'; id: string; title: string; durationMinutes: number; task: VectisTask }

/** About an hour decides big vs small. Only changes which step it shows in. */
export const BIG_ITEM_MINUTES = 60

/**
 * Short-term goals due that day with no calendar slot yet, and undone
 * tasks that have a duration but haven't been dropped on the grid.
 * Longest first, whatever the source.
 */
export function planningItems(goals: Goal[], tasks: VectisTask[], date: Date): PlanningItem[] {
  const goalItems: PlanningItem[] = goals
    .filter(g => g.kind === 'shortTerm' && isScheduled(g, date) && !g.scheduledOnCalendar)
    .map(g => ({ kind: 'goal', id: g.id, title: g.title, durationMinutes: g.scheduledDurationMinutes, goal: g }))
  const taskItems: PlanningItem[] = tasks
    .filter(t => !t.done && t.durationMinutes !== undefined && !t.scheduledDate)
    .map(t => ({ kind: 'task', id: t.id, title: t.text, durationMinutes: t.durationMinutes ?? 30, task: t }))
  return [...goalItems, ...taskItems].sort((a, b) => b.durationMinutes - a.durationMinutes)
}

/** Timed events on the Daily grid that aren't flexible — the day's fixed frame. */
export function fixedEvents(events: CalendarEvent[], date: Date): CalendarEvent[] {
  return eventsOn(events, date)
    .filter(e => e.flowsToDaily && !e.isAllDay && !e.isFlexible)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
}

// MARK: - Evening review

export function reviewGoals(goals: Goal[], date: Date) {
  // Long-term goals have no daily completion, so only short-term ones count.
  const scheduled = goals.filter(g => g.kind === 'shortTerm' && isScheduled(g, date))
  return { scheduled, done: scheduled.filter(g => isDoneOn(g, date)) }
}

/** Repeated misses, only when that sub-setting is on. Quiet below two in a row. */
export function flaggedGoals(goals: Goal[], date: Date, flagRepeatedMisses: boolean): Goal[] {
  if (!flagRepeatedMisses) return []
  return reviewGoals(goals, date).scheduled.filter(g => missNudge(g, date) !== null)
}

/** A day with repeated misses gets the diagnostic question; otherwise the positive one. */
export function reviewPrompt(flagged: Goal[]): string {
  return flagged.length === 0 ? 'What worked today?' : 'What slowed you down today?'
}

// Shared with Record, which owns the journal.
export { journalEntryFor }

/** Reviewed today means today's entry was started by the review's prompt. */
export function hasReviewed(journal: JournalEntry[], date: Date): boolean {
  return journalEntryFor(journal, date)?.reflectionPrompt !== undefined
}
