// Goal logic, ported from GoalHelpers.swift. Pure functions over plain
// data, so the same code drives your own screens and a partner's
// read-only view of their shared file.

import {
  ALL_DAYS, DISTANT_PAST, addDays, atMinutes, dayKey, parseDate, startOfDay, startOfWeek, toISO, weekday,
} from './dates'
import { newID } from './ids'
import type { Goal, Milestone } from './types'

export type GoalDayState = 'done' | 'missed' | 'notScheduled' | 'pending'

export interface ResolvedSchedule {
  repeatDays: number[]
  startMinutes: number
  durationMinutes: number
}

export function makeGoal(title: string, overrides: Partial<Goal> = {}): Goal {
  return {
    id: newID(),
    title,
    kind: 'shortTerm',
    frequency: 'none',
    createdDate: toISO(new Date()),
    completions: {},
    milestones: [],
    notes: [],
    repeatDays: [...ALL_DAYS],
    scheduledOnCalendar: false,
    scheduledStartMinutes: 21 * 60,
    scheduledDurationMinutes: 30,
    isFlexible: true,
    challengeStrictMode: false,
    challengeAttempt: 1,
    frequencyType: 'specificDays',
    timesPerWeekTarget: 3,
    timesPerDayTarget: 2,
    completionCounts: {},
    scheduledTimeOverrides: {},
    scheduleVersions: [],
    currentScheduleEffectiveFrom: DISTANT_PAST,
    ...overrides,
  }
}

/**
 * The repeat days, start time and duration actually in force on a date.
 * Past days resolve against the superseded versions, so the calendar is
 * a record rather than today's settings applied backwards.
 */
export function scheduleOn(goal: Goal, date: Date): ResolvedSchedule {
  const day = startOfDay(date)
  const live: ResolvedSchedule = {
    repeatDays: goal.repeatDays,
    startMinutes: goal.scheduledStartMinutes,
    durationMinutes: goal.scheduledDurationMinutes,
  }
  if (day >= startOfDay(parseDate(goal.currentScheduleEffectiveFrom))) return live

  let match: Goal['scheduleVersions'][number] | undefined
  for (const v of goal.scheduleVersions) {
    if (startOfDay(parseDate(v.effectiveFrom)) > day) continue
    if (!match || parseDate(v.effectiveFrom) > parseDate(match.effectiveFrom)) match = v
  }
  if (!match) return live
  return { repeatDays: match.repeatDays, startMinutes: match.startMinutes, durationMinutes: match.durationMinutes }
}

/**
 * Applies an edited schedule, recording the old one as history first if
 * anything changed. The new schedule takes effect from today, so edits
 * only ever change future days.
 */
export function applyScheduleChange(
  goal: Goal,
  previous: ResolvedSchedule,
  effectiveFrom: Date = new Date(),
): Goal {
  const changed =
    !sameDays(previous.repeatDays, goal.repeatDays) ||
    previous.startMinutes !== goal.scheduledStartMinutes ||
    previous.durationMinutes !== goal.scheduledDurationMinutes
  if (!changed) return goal
  return {
    ...goal,
    scheduleVersions: [
      ...goal.scheduleVersions,
      {
        id: newID(),
        effectiveFrom: goal.currentScheduleEffectiveFrom,
        repeatDays: previous.repeatDays,
        startMinutes: previous.startMinutes,
        durationMinutes: previous.durationMinutes,
      },
    ],
    currentScheduleEffectiveFrom: toISO(startOfDay(effectiveFrom)),
  }
}

function sameDays(a: number[], b: number[]) {
  return a.length === b.length && a.every(d => b.includes(d))
}

export function liveSchedule(goal: Goal): ResolvedSchedule {
  return {
    repeatDays: goal.repeatDays,
    startMinutes: goal.scheduledStartMinutes,
    durationMinutes: goal.scheduledDurationMinutes,
  }
}

/**
 * The day this goal counts from: the day it was created, or the earliest
 * day anything was logged, whichever came first.
 */
export function firstDayKey(goal: Goal): string {
  const created = dayKey(parseDate(goal.createdDate))
  let earliest = created
  for (const k of Object.keys(goal.completions)) if (k < earliest) earliest = k
  for (const k of Object.keys(goal.completionCounts)) if (k < earliest) earliest = k
  return earliest
}

/** Whether the goal is due on a date. Days before it began never count. */
export function isScheduled(goal: Goal, date: Date): boolean {
  if (dayKey(date) < firstDayKey(goal)) return false
  if (goal.endDate && startOfDay(date) > startOfDay(parseDate(goal.endDate))) return false
  switch (goal.frequencyType) {
    case 'specificDays':
      return scheduleOn(goal, date).repeatDays.includes(weekday(date))
    case 'timesPerWeek':
    case 'timesPerDay':
      return true
  }
}

export function completionCount(goal: Goal, date: Date): number {
  return goal.completionCounts[dayKey(date)] ?? 0
}

export function isDoneOn(goal: Goal, date: Date): boolean {
  switch (goal.frequencyType) {
    case 'specificDays':
    case 'timesPerWeek':
      return goal.completions[dayKey(date)] === true
    case 'timesPerDay':
      return completionCount(goal, date) >= goal.timesPerDayTarget
  }
}

export function weeklyCompletionCount(goal: Goal, asOf: Date = new Date()): number {
  // The week starts on the region's first day, like the iPhone's Calendar.current.
  const start = startOfWeek(asOf)
  let count = 0
  for (let i = 0; i < 7; i++) if (goal.completions[dayKey(addDays(start, i))] === true) count++
  return count
}

/** The dates behind the history strip, oldest first. */
export function recentDates(days = 14, today: Date = new Date()): Date[] {
  const t = startOfDay(today)
  return Array.from({ length: days }, (_, i) => addDays(t, -(days - 1 - i)))
}

/** Fourteen days rather than seven: one miss in seven reads as dramatic when it isn't. */
export function recentHistory(goal: Goal, days = 14, today: Date = new Date()): GoalDayState[] {
  return recentDates(days, today).map((day, i) => {
    if (!isScheduled(goal, day)) return 'notScheduled'
    if (goal.completions[dayKey(day)] === true) return 'done'
    return i === days - 1 ? 'pending' : 'missed'
  })
}

export function recentRate(goal: Goal, days = 14, today: Date = new Date()) {
  const states = recentHistory(goal, days, today)
  return {
    done: states.filter(s => s === 'done').length,
    scheduled: states.filter(s => s === 'done' || s === 'missed').length,
  }
}

/** Every time it's ever been done. Only goes up — the number a streak destroys. */
export function totalCompletions(goal: Goal): number {
  if (goal.frequencyType === 'timesPerDay') {
    return Object.values(goal.completionCounts).reduce((a, b) => a + b, 0)
  }
  return Object.values(goal.completions).filter(Boolean).length
}

/** Scheduled days missed in a row, counting back from yesterday. */
export function consecutiveMisses(goal: Goal, today: Date = new Date()): number {
  const t = startOfDay(today)
  let count = 0
  for (let offset = 1; offset <= 60; offset++) {
    const day = addDays(t, -offset)
    if (!isScheduled(goal, day)) continue
    if (goal.completions[dayKey(day)] === true) break
    count++
  }
  return count
}

/** Silent at one miss — a single missed day makes no measurable difference. */
export function missNudge(goal: Goal, today: Date = new Date()): string | null {
  if (goal.frequencyType !== 'specificDays') return null
  if (isDoneOn(goal, today)) return null
  const misses = consecutiveMisses(goal, today)
  if (misses < 2) return null
  return `Missed ${misses} in a row — worth picking back up today.`
}

export function isTargetOverdue(goal: Goal, today: Date = new Date()): boolean {
  if (!goal.targetDate || goal.milestones.length === 0) return false
  const allDone = goal.milestones.every(m => m.done)
  return !allDone && parseDate(goal.targetDate) < startOfDay(today)
}

export function isMilestoneOverdue(m: Milestone, today: Date = new Date()): boolean {
  if (!m.addToCalendar || !m.date || m.done) return false
  return parseDate(m.date) < startOfDay(today)
}

export function milestonePercent(milestones: Milestone[]): number {
  if (milestones.length === 0) return 0
  return Math.round((milestones.filter(m => m.done).length / milestones.length) * 100)
}

export function challengeDay(goal: Goal, date: Date = new Date()): number | null {
  if (!goal.challengeStartDate) return null
  const start = startOfDay(parseDate(goal.challengeStartDate))
  return Math.round((startOfDay(date).getTime() - start.getTime()) / 86_400_000) + 1
}

/** The start and end of this goal's calendar block on a day, if it has one. */
export function goalBlockTimes(goal: Goal, date: Date): { start: Date; end: Date } | null {
  if (!goal.scheduledOnCalendar || !isScheduled(goal, date)) return null
  const resolved = scheduleOn(goal, date)
  const startMinutes = goal.scheduledTimeOverrides[dayKey(date)] ?? resolved.startMinutes
  const start = atMinutes(date, startMinutes)
  return { start, end: new Date(start.getTime() + Math.max(resolved.durationMinutes, 5) * 60_000) }
}

// MARK: - Edits (return a new goal; the store swaps it in)

export function withCompletion(goal: Goal, date: Date, done: boolean): Goal {
  const key = dayKey(date)
  const next: Goal = { ...goal, completions: { ...goal.completions, [key]: done } }
  if (goal.frequencyType === 'timesPerDay') {
    next.completionCounts = { ...goal.completionCounts, [key]: done ? goal.timesPerDayTarget : 0 }
  }
  return next
}

export function withCount(goal: Goal, date: Date, count: number): Goal {
  const key = dayKey(date)
  const clamped = Math.min(Math.max(count, 0), goal.timesPerDayTarget)
  return {
    ...goal,
    completionCounts: { ...goal.completionCounts, [key]: clamped },
    completions: { ...goal.completions, [key]: clamped >= goal.timesPerDayTarget },
  }
}
