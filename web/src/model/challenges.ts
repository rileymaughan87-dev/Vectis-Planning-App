// Challenges, ported from ChallengeModels.swift and GoalsStore. A
// challenge is just a long-term goal with a head start: one linked daily
// habit per chosen task, a start date to count days from, and an
// optional strict mode. Nothing is special-cased afterwards — every part
// can be edited or deleted like anything else.
//
// The catalog (challenges.json) is the iPhone app's Challenges.json.

import catalogJSON from './challenges.json'
import { addDays, dayKey, parseDate, startOfDay, toISO } from './dates'
import { makeGoal } from './goals'
import { newID } from './ids'
import type { Goal } from './types'

export interface ChallengeTask {
  title: string
  suggestedTime?: string | null
}

export interface ChallengeTemplate {
  id: string
  name: string
  tagline: string
  description: string
  durationDays: number
  supportsStrictMode: boolean
  strictModeDisclaimer?: string | null
  tasks: ChallengeTask[]
}

export const CHALLENGES: ChallengeTemplate[] = (catalogJSON as ChallengeTemplate[]).filter(
  t => typeof t.id === 'string' && Array.isArray(t.tasks) && t.durationDays > 0,
)

export function templateFor(goal: Goal): ChallengeTemplate | undefined {
  return CHALLENGES.find(t => t.id === goal.challengeTemplateID)
}

/** The long-term goal plus one habit per chosen task, ready to add. */
export function startChallenge(template: ChallengeTemplate, tasks: ChallengeTask[], startDate: Date, strictMode: boolean): Goal[] {
  const start = startOfDay(startDate)
  const end = addDays(start, template.durationDays - 1)
  const goal = makeGoal(template.name, {
    kind: 'longTerm',
    targetDate: toISO(end),
    challengeTemplateID: template.id,
    challengeStartDate: toISO(start),
    challengeStrictMode: strictMode,
    milestones: [{ id: newID(), title: `${template.name} complete (day ${template.durationDays})`, done: false, addToCalendar: true, date: toISO(end) }],
  })
  const habits = tasks.map(task =>
    makeGoal(task.title, {
      frequency: 'daily',
      linkedToGoalID: goal.id,
      endDate: toISO(end),
      // Counts from the challenge's first day, so a challenge starting next
      // Monday doesn't log misses for the days in between.
      createdDate: toISO(start),
    }),
  )
  return [goal, ...habits]
}

/**
 * Starts the challenge again from `today` and bumps the attempt count.
 * The habits keep every tick from earlier attempts — the record stays
 * truthful — but their statistics (dots, totals, misses) count from the
 * restart, the same as the iPhone app.
 */
export function restartChallenge(goals: Goal[], goalID: string, today: Date = new Date()): Goal[] {
  const goal = goals.find(g => g.id === goalID)
  const template = goal && templateFor(goal)
  if (!goal || !template) return goals
  const start = startOfDay(today)
  const end = toISO(addDays(start, template.durationDays - 1))
  return goals.map(g => {
    if (g.id === goalID) {
      return {
        ...g,
        challengeStartDate: toISO(start),
        targetDate: end,
        challengeAttempt: g.challengeAttempt + 1,
        milestones: g.milestones.map(m => ({ ...m, done: false, date: end })),
      }
    }
    // A restart is day one for the statistics; the earlier ticks stay.
    if (g.linkedToGoalID === goalID) return { ...g, endDate: end, statsStartDate: toISO(start) }
    return g
  })
}

/**
 * Past challenge days with no record either way for at least one habit —
 * days you were away and never confirmed. These prompt a catch-up rather
 * than being silently counted as failures.
 */
export function unresolvedDays(goals: Goal[], goal: Goal, today: Date = new Date()): Date[] {
  if (!goal.challengeStartDate) return []
  const habits = goals.filter(g => g.linkedToGoalID === goal.id)
  if (habits.length === 0) return []
  const result: Date[] = []
  const last = goal.targetDate ? startOfDay(parseDate(goal.targetDate)) : null
  const end = startOfDay(today)
  for (let day = startOfDay(parseDate(goal.challengeStartDate)); day < end; day = addDays(day, 1)) {
    if (last && day > last) break
    const key = dayKey(day)
    if (habits.some(h => h.completions[key] === undefined)) result.push(day)
  }
  return result
}

/** Marks every habit of a challenge done, or missed, for one day. */
export function resolveDay(goals: Goal[], goalID: string, date: Date, completed: boolean): Goal[] {
  const key = dayKey(date)
  return goals.map(g => (g.linkedToGoalID === goalID ? { ...g, completions: { ...g.completions, [key]: completed } } : g))
}
