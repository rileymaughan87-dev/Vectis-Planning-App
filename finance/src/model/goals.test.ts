import { dayKey, toISO } from '@suite/dates'
import { describe, expect, it } from 'vitest'
import {
  amountPaid, amountRemaining, decodeGoal, goalPaymentsInMonth, isComplete, makeGoal, pace, plannedDate, projectedFinish, schedule,
  suggestedPayment,
} from './goals'

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d)
const summary = (ps: ReturnType<typeof schedule>) => ps.map(p => `${dayKey(p.date)} ${p.amount}${p.confirmed ? '✓' : ''}`)

describe('plan dates', () => {
  it('clamps monthly to short months without drifting', () => {
    const g = makeGoal({ title: 'x', kind: 'savings', firstPaymentDate: toISO(day(2026, 1, 31)) })
    expect([0, 1, 2].map(n => dayKey(plannedDate(g, n)))).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
  })

  it('steps weekly and fortnightly', () => {
    const w = makeGoal({ title: 'x', kind: 'savings', frequency: 'weekly', firstPaymentDate: toISO(day(2026, 10, 9)) })
    expect(dayKey(plannedDate(w, 2))).toBe('2026-10-23')
    const f = makeGoal({ title: 'x', kind: 'savings', frequency: 'fortnightly', firstPaymentDate: toISO(day(2026, 10, 9)) })
    expect(dayKey(plannedDate(f, 2))).toBe('2026-11-06')
  })
})

describe('schedule', () => {
  const base = { title: 'Holiday', kind: 'savings' as const, targetAmount: 1000, startingAmount: 100, paymentAmount: 300, firstPaymentDate: toISO(day(2026, 10, 1)) }

  it('plans what is still needed, with a smaller last payment', () => {
    expect(summary(schedule(makeGoal(base)))).toEqual(['2026-10-01 300', '2026-11-01 300', '2026-12-01 300'])
  })

  it('pushes the plan out after a skip and pulls it in after an extra', () => {
    const skipped = makeGoal({ ...base, payments: { '2026-10-01': 0 } })
    expect(summary(schedule(skipped))).toEqual(['2026-10-01 0✓', '2026-11-01 300', '2026-12-01 300', '2027-01-01 300'])
    const extra = makeGoal({ ...base, payments: { '2026-10-01': 300, '2026-10-15': 450 } })
    expect(summary(schedule(extra))).toEqual(['2026-10-01 300✓', '2026-10-15 450✓', '2026-11-01 150'])
    expect(projectedFinish(extra)).toEqual(day(2026, 11, 1))
  })

  it('counts starting money for saving but not for debt', () => {
    expect(amountPaid(makeGoal(base))).toBe(100)
    expect(amountRemaining(makeGoal({ ...base, kind: 'debt' }))).toBe(1000)
    expect(isComplete(makeGoal({ ...base, payments: { '2026-10-01': 900 } }))).toBe(true)
  })

  it('stops at a sensible cap with a tiny payment', () => {
    expect(schedule(makeGoal({ ...base, targetAmount: 1e9, paymentAmount: 1 })).length).toBe(520)
  })

  it('lists one month across goals', () => {
    const a = makeGoal(base)
    const b = makeGoal({ ...base, title: 'Car', kind: 'debt', frequency: 'fortnightly', paymentAmount: 50, firstPaymentDate: toISO(day(2026, 10, 2)) })
    expect(goalPaymentsInMonth([a, b], day(2026, 10, 1)).map(p => `${p.title} ${p.date.getDate()}`)).toEqual(['Holiday 1', 'Car 2', 'Car 16', 'Car 30'])
  })
})

describe('target dates', () => {
  const goal = makeGoal({
    title: 'Christmas', kind: 'setAside', targetAmount: 600, paymentAmount: 100,
    firstPaymentDate: toISO(day(2026, 10, 1)), targetDate: toISO(day(2026, 12, 20)),
  })

  it('suggests a payment from the payments still to come', () => {
    // From 10 Oct: Nov 1 and Dec 1 remain before the 20th.
    expect(suggestedPayment(goal, day(2026, 10, 10))).toBe(300)
  })

  it('says when the plan finishes after the date', () => {
    const p = pace(goal, day(2026, 10, 10))
    expect(p).toMatchObject({ kind: 'late', needed: 300 })
    expect(pace({ ...goal, paymentAmount: 300 }, day(2026, 9, 1))).toEqual({ kind: 'onTrack' })
  })
})

describe('reading saved goals', () => {
  it('fills defaults and maps the old "none" frequency to monthly', () => {
    expect(decodeGoal({ title: 'Old', kind: 'odd', frequency: 'none', payments: { '2026-01-01': 5, bad: 'x' } }))
      .toMatchObject({ kind: 'savings', frequency: 'monthly', payments: { '2026-01-01': 5 }, targetAmount: 0 })
  })
})
