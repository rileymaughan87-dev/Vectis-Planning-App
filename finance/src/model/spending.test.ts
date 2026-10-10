import { toISO } from '@suite/dates'
import { describe, expect, it } from 'vitest'
import { makeFinanceEvent, runningRepeatingFlexible, weeklyFlexibleEstimate } from './entries'
import { decodePot, flexibleForMonth, recentNotes, weekStatus, type SpendingEntry, type SpendingPot, type Week } from './spending'

const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h)
const spend = (d: Date, amount: number, note = ''): SpendingEntry => ({ id: toISO(d) + amount, date: toISO(d), amount, note, source: 'manual' })

// Mon 5 – Sun 11 Oct 2026, set explicitly so the test doesn't depend on the region's week start.
const week: Week = { start: new Date(2026, 9, 5), end: new Date(2026, 9, 12) }
const pot: SpendingPot = { weeklyAmount: 140, startDate: toISO(new Date(2026, 9, 1)), isActive: true }
const entries = [spend(day(2026, 10, 5), 30, 'Groceries'), spend(day(2026, 10, 7), 12.5, 'Coffee'), spend(day(2026, 10, 12), 9, 'Coffee'), spend(day(2026, 9, 28), 50, 'Groceries')]

describe('the week', () => {
  it('shows what is left and spreads it over the days to come', () => {
    const s = weekStatus(entries, pot, week, day(2026, 10, 8))
    expect(s).toMatchObject({ spent: 42.5, left: 97.5, daysLeft: 4 })
    expect(s.perDay).toBeCloseTo(97.5 / 4)
    expect(weekStatus(entries, pot, week, day(2026, 10, 20))).toMatchObject({ daysLeft: 0, perDay: undefined })
  })

  it('says nothing per day once the pot is used up', () => {
    expect(weekStatus([spend(day(2026, 10, 6), 150)], pot, week, day(2026, 10, 8))).toMatchObject({ left: -10, perDay: undefined })
  })
})

describe('a month of flexible spending', () => {
  it('adds the pot only for days still to come', () => {
    // On 8 Oct: logged 30 + 12.5 + 9 in October; 23 days from the 9th to the 31st.
    const f = flexibleForMonth(entries, pot, day(2026, 10, 1), day(2026, 10, 8))
    expect(f.spent).toBe(51.5)
    expect(f.planned).toBeCloseTo((140 / 7) * 23)
    expect(flexibleForMonth(entries, pot, day(2026, 9, 1), day(2026, 10, 8)).planned).toBe(0)
    expect(flexibleForMonth(entries, { ...pot, isActive: false }, day(2026, 10, 1), day(2026, 10, 8)).planned).toBe(0)
  })
})

describe('handing over to the pot', () => {
  it('finds running repeating flexible entries and estimates a week', () => {
    const events = [
      makeFinanceEvent({ title: 'Food', entryType: 'expense', expenseCategory: 'flexible', amount: 80, date: toISO(day(2026, 9, 1)), repeats: true, frequency: 'weekly', weekday: 3 }),
      makeFinanceEvent({ title: 'Fuel', entryType: 'expense', expenseCategory: 'flexible', amount: 104, date: toISO(day(2026, 9, 1)), repeats: true, frequency: 'monthly' }),
      makeFinanceEvent({ title: 'Ended', entryType: 'expense', expenseCategory: 'flexible', amount: 50, date: toISO(day(2026, 9, 1)), repeats: true, frequency: 'weekly', endDate: toISO(day(2026, 10, 1)) }),
      makeFinanceEvent({ title: 'Gift', entryType: 'expense', expenseCategory: 'flexible', amount: 40, date: toISO(day(2026, 12, 1)) }),
    ]
    expect(runningRepeatingFlexible(events, day(2026, 10, 8)).map(e => e.title)).toEqual(['Food', 'Fuel'])
    expect(weeklyFlexibleEstimate(events, day(2026, 10, 8))).toBeCloseTo(80 + 24)
  })
})

describe('notes and saved data', () => {
  it('offers the most used notes first', () => {
    expect(recentNotes(entries)).toEqual(['Coffee', 'Groceries'])
  })

  it('reads a missing pot as off', () => {
    expect(decodePot(undefined)).toMatchObject({ weeklyAmount: 0, isActive: false })
  })
})
