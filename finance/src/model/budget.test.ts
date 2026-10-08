import { toISO } from '@suite/dates'
import { describe, expect, it } from 'vitest'
import { monthBudget, monthSummary, monthsAround, typicalMonth } from './budget'
import { makeFinanceEvent } from './entries'
import { makeGoal } from './goals'

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d)
const oct = day(2026, 10, 1)

const events = [
  // Fridays in Oct 2026: 2, 9, 16, 23, 30 — a five-payday month.
  makeFinanceEvent({ title: 'Pay', entryType: 'income', amount: 500, date: toISO(day(2026, 10, 2)), repeats: true, frequency: 'weekly', weekday: 6, amountVaries: true, confirmedAmounts: { '2026-10-02': 520 } }),
  makeFinanceEvent({ title: 'Rent', entryType: 'expense', expenseCategory: 'fixed', amount: 1000, date: toISO(day(2026, 9, 1)), repeats: true, frequency: 'monthly' }),
  makeFinanceEvent({ title: 'Food', entryType: 'expense', expenseCategory: 'flexible', amount: 60, date: toISO(day(2026, 10, 3)), repeats: true, frequency: 'weekly', weekday: 7 }),
  makeFinanceEvent({ title: 'Gift', entryType: 'expense', expenseCategory: 'flexible', amount: 40, date: toISO(day(2026, 10, 20)) }),
]
const goals = [
  makeGoal({ title: 'Card', kind: 'debt', targetAmount: 1000, paymentAmount: 100, firstPaymentDate: toISO(day(2026, 10, 5)) }),
  makeGoal({ title: 'Holiday', kind: 'savings', targetAmount: 1000, paymentAmount: 200, firstPaymentDate: toISO(day(2026, 10, 15)) }),
]

describe('month summary', () => {
  it('splits spending from saving', () => {
    const s = monthSummary(events, goals, oct)
    expect(s.income).toBe(520 + 500 * 4)
    // Saturdays: 3, 10, 17, 24, 31.
    expect(s).toMatchObject({ fixed: 1000, flexible: 60 * 5 + 40, debtPayments: 100, goalSavings: 200, estimated: 2000 })
    expect(s.leftOver).toBe(2520 - 1440)
    expect(s.stillFree).toBe(2520 - 1440 - 200)
  })
})

describe('month budget', () => {
  it('sorts lines into sections, largest first, with how often', () => {
    const b = monthBudget(events, goals, oct)
    expect(b.income.map(l => [l.title, l.amount, l.detail, l.isEstimate])).toEqual([['Pay', 2520, 'Weekly · 5 this month', true]])
    expect(b.flexible.map(l => l.title)).toEqual(['Food', 'Gift'])
    expect(b.fixed[0].detail).toMatch(/^Monthly · /)
    expect(b.debts.map(l => l.title)).toEqual(['Card'])
    expect(b.savings.map(l => l.amount)).toEqual([200])
  })
})

describe('typical month', () => {
  it('spreads weekly amounts and leaves one-offs out', () => {
    const t = typicalMonth(events, goals, oct)
    expect(t.income).toBeCloseTo(500 * 52 / 12)
    expect(t.spending).toBeCloseTo(1000 + 60 * 52 / 12 + 100)
  })
})

describe('months around', () => {
  it('crosses years', () => {
    expect(monthsAround(day(2026, 1, 15), 2, 1).map(d => `${d.getFullYear()}-${d.getMonth() + 1}`)).toEqual(['2025-11', '2025-12', '2026-1', '2026-2'])
  })
})
