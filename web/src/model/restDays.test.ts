import { describe, expect, it } from 'vitest'
import { addDays, dayKey, startOfWeek, toISO } from './dates'
import { consecutiveMisses, isRestDay, makeGoal, recentHistory, recentRate, restDaysLeft } from './goals'

// Two whole weeks plus today, the first day of a third week (whatever day the region starts weeks on).
const weekA = addDays(startOfWeek(new Date(2026, 9, 14)), -14)
const today = addDays(weekA, 14)
const days = (from: Date, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i))
const done = (dates: Date[]) => Object.fromEntries(dates.map(d => [dayKey(d), true]))

describe('rest days (spec 2.2)', () => {
  // Daily, one rest day a week. Week A: six done, one off. Week B: five done, two off.
  const weekADone = days(weekA, 6) // the 7th day is off
  const weekB = addDays(weekA, 7)
  const weekBDone = days(addDays(weekB, 2), 5) // first two days off
  const goal = makeGoal('Gym', {
    createdDate: toISO(addDays(weekA, -1)),
    restDaysPerWeek: 1,
    completions: done([...weekADone, ...weekBDone]),
  })

  it("counts the week's first days off as rest, then misses", () => {
    expect(isRestDay(goal, addDays(weekA, 6), today)).toBe(true)
    expect(isRestDay(goal, weekB, today)).toBe(true)
    expect(isRestDay(goal, addDays(weekB, 1), today)).toBe(false)
  })

  it('scores against the target: a full week reads 6/6, not 6/7', () => {
    const states = recentHistory(goal, 15, today)
    expect(states.filter(s => s === 'rest').length).toBe(2)
    expect(states.filter(s => s === 'missed').length).toBe(1)
    // 11 done against 12 needed (6 + 6), not 14.
    expect(recentRate(goal, 15, today)).toEqual({ done: 11, scheduled: 12 })
  })

  it('scores "6 times a week" exactly like "daily with one rest day"', () => {
    const perWeek = { ...goal, frequencyType: 'timesPerWeek' as const, timesPerWeekTarget: 6, restDaysPerWeek: 0 }
    expect(recentHistory(perWeek, 15, today)).toEqual(recentHistory(goal, 15, today))
    expect(recentRate(perWeek, 15, today)).toEqual(recentRate(goal, 15, today))
  })

  it("doesn't count rest days in a run of misses", () => {
    const missedRun = { ...goal, completions: done(weekADone) }
    // Week B: day 1 rest, days 2–7 missed → six in a row, not seven.
    expect(consecutiveMisses(missedRun, today)).toBe(6)
  })

  it('says how many rest days are left this week, and nothing changes without them', () => {
    const midWeek = addDays(weekB, 3)
    const g = { ...goal, completions: done(days(addDays(weekB, 1), 2)) } // first day off, then two done
    expect(restDaysLeft(g, midWeek)).toBe(0)
    expect(restDaysLeft({ ...g, restDaysPerWeek: 2 }, midWeek)).toBe(1)
    expect(recentHistory({ ...goal, restDaysPerWeek: 0 }, 15, today).includes('rest')).toBe(false)
  })
})
