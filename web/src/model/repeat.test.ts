// Repeat rules: every N days/weeks/months/years, the 1st Thursday, the last
// Friday, the 31st in short months — and goals and events following them.
import { describe, expect, it } from 'vitest'
import { dayKey, toISO } from './dates'
import { occupies, makeEvent } from './events'
import { applyScheduleChange, isScheduled, liveSchedule, makeGoal, restAllowance } from './goals'
import { decodeRepeatRule, describeRule, landsOn, nextDays, ruleFor, type RepeatRule } from './repeat'

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day)
const days = (rule: RepeatRule, anchor: Date, from: Date, n: number) => nextDays(rule, anchor, from, n).map(dayKey)

describe('repeat rules', () => {
  it('every 3 days from the anchor, nothing before it', () => {
    const rule = { ...ruleFor(d(2026, 10, 1)), unit: 'day' as const, interval: 3 }
    expect(days(rule, d(2026, 10, 1), d(2026, 9, 25), 3)).toEqual(['2026-10-01', '2026-10-04', '2026-10-07'])
  })

  it('every 2 weeks on Tue and Thu', () => {
    // 6 Oct 2026 is a Tuesday.
    const rule = { ...ruleFor(d(2026, 10, 6), 'week', 2), weekdays: [3, 5] }
    const got = days(rule, d(2026, 10, 6), d(2026, 10, 6), 4)
    expect(got).toEqual(['2026-10-06', '2026-10-08', '2026-10-20', '2026-10-22'])
    expect(landsOn(rule, d(2026, 10, 6), d(2026, 10, 13))).toBe(false)
  })

  it('the 1st Thursday of every month', () => {
    const rule: RepeatRule = { ...ruleFor(d(2026, 10, 1), 'month'), monthMode: 'weekday', ordinal: 1, weekday: 5 }
    expect(days(rule, d(2026, 10, 1), d(2026, 10, 1), 3)).toEqual(['2026-10-01', '2026-11-05', '2026-12-03'])
    expect(describeRule(rule)).toBe('Every month on the 1st Thursday')
  })

  it('the last Friday, every 3 months', () => {
    const rule: RepeatRule = { ...ruleFor(d(2026, 10, 30), 'month', 3), monthMode: 'weekday', ordinal: -1, weekday: 6 }
    expect(days(rule, d(2026, 10, 1), d(2026, 10, 1), 2)).toEqual(['2026-10-30', '2027-01-29'])
  })

  it('the 31st lands on the last day of a short month', () => {
    const rule: RepeatRule = { ...ruleFor(d(2026, 1, 31), 'month'), monthDay: 31 }
    expect(days(rule, d(2026, 1, 31), d(2026, 2, 1), 2)).toEqual(['2026-02-28', '2026-03-31'])
  })

  it('every year on a date, and every 2 years', () => {
    const rule = ruleFor(d(2026, 3, 3), 'year')
    expect(days(rule, d(2026, 3, 3), d(2026, 3, 4), 1)).toEqual(['2027-03-03'])
    expect(describeRule(rule)).toBe('Every year on 3 March')
    expect(days({ ...rule, interval: 2 }, d(2026, 3, 3), d(2026, 3, 4), 1)).toEqual(['2028-03-03'])
  })

  it('reads saved rules defensively', () => {
    expect(decodeRepeatRule(null)).toBeUndefined()
    expect(decodeRepeatRule({ unit: 'fortnight' })).toBeUndefined()
    expect(decodeRepeatRule({ unit: 'week', interval: 0, weekdays: [9] })).toMatchObject({ unit: 'week', interval: 1, weekdays: [2], monthMode: 'date', anchor: '' })
  })
})

describe('events and goals with a rule', () => {
  it('an event every 2 weeks', () => {
    const start = d(2026, 10, 6)
    const event = makeEvent({
      title: 'Bins', categoryID: 'c', startDate: toISO(new Date(2026, 9, 6, 19)), endDate: toISO(new Date(2026, 9, 6, 20)),
      recurrence: 'weekly', repeatRule: ruleFor(start, 'week', 2),
    })
    expect(occupies(event, d(2026, 10, 13))).toBe(false)
    expect(occupies(event, d(2026, 10, 20))).toBe(true)
  })

  it('a goal on the 1st Thursday, counted from its anchor; no rest days', () => {
    const rule: RepeatRule = { ...ruleFor(d(2026, 10, 1), 'month'), monthMode: 'weekday', ordinal: 1, weekday: 5, anchor: '2026-10-01' }
    const goal = makeGoal('Fast offering', { createdDate: toISO(d(2026, 9, 1)), repeatRule: rule, restDaysPerWeek: 2 })
    expect(isScheduled(goal, d(2026, 11, 5))).toBe(true)
    expect(isScheduled(goal, d(2026, 11, 12))).toBe(false)
    expect(restAllowance(goal)).toBe(0)
  })

  it('changing a goal to every 2 weeks only affects days from the change', () => {
    const goal = makeGoal('Long run', { createdDate: toISO(d(2026, 9, 1)), repeatDays: [7] })
    const edited = applyScheduleChange(
      { ...goal, repeatRule: { ...ruleFor(d(2026, 10, 10), 'week', 2), weekdays: [7], anchor: '2026-10-10' } },
      liveSchedule(goal),
      d(2026, 10, 10),
    )
    expect(isScheduled(edited, d(2026, 10, 3))).toBe(true) // before: every Saturday
    expect(isScheduled(edited, d(2026, 10, 10))).toBe(true)
    expect(isScheduled(edited, d(2026, 10, 17))).toBe(false) // after: every other Saturday
    expect(isScheduled(edited, d(2026, 10, 24))).toBe(true)
  })
})
