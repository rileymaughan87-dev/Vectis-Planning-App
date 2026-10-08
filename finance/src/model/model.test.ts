import { dayKey, toISO } from '@suite/dates'
import { describe, expect, it } from 'vitest'
import {
  amountOn, decodeFinanceEvent, isConfirmedOn, lineItemsInMonth, lineItemsOn, makeFinanceEvent, monthTotals, occurrencesInMonth, splitFrom,
} from './entries'
import { parseAmount } from './money'

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d)
const keys = (dates: Date[]) => dates.map(dayKey)

describe('occurrences', () => {
  it('puts a one-off entry in its own month only, with half-open months', () => {
    const gift = makeFinanceEvent({ title: 'Gift', entryType: 'expense', date: toISO(day(2026, 10, 31)), amount: 40 })
    expect(keys(occurrencesInMonth(gift, day(2026, 10, 1)))).toEqual(['2026-10-31'])
    expect(occurrencesInMonth(gift, day(2026, 11, 1))).toEqual([])
    const first = makeFinanceEvent({ title: 'x', entryType: 'expense', date: toISO(day(2026, 11, 1)) })
    expect(occurrencesInMonth(first, day(2026, 10, 1))).toEqual([])
  })

  it('clamps a monthly 31st to short months and starts in its own month', () => {
    const rent = makeFinanceEvent({ title: 'Rent', entryType: 'expense', date: toISO(day(2026, 1, 31)), repeats: true, frequency: 'monthly' })
    expect(keys(occurrencesInMonth(rent, day(2026, 2, 10)))).toEqual(['2026-02-28'])
    expect(keys(occurrencesInMonth(rent, day(2026, 4, 1)))).toEqual(['2026-04-30'])
    expect(occurrencesInMonth(rent, day(2025, 12, 1))).toEqual([])
  })

  it('lists weekly days from the first date on', () => {
    // Fri 9 Oct 2026
    const pay = makeFinanceEvent({ title: 'Pay', entryType: 'income', date: toISO(day(2026, 10, 9)), repeats: true, frequency: 'weekly', weekday: 6 })
    expect(keys(occurrencesInMonth(pay, day(2026, 10, 1)))).toEqual(['2026-10-09', '2026-10-16', '2026-10-23', '2026-10-30'])
  })

  it('lists fortnightly days across month boundaries', () => {
    const pay = makeFinanceEvent({ title: 'Pay', entryType: 'income', date: toISO(day(2026, 10, 9)), repeats: true, frequency: 'fortnightly' })
    expect(keys(occurrencesInMonth(pay, day(2026, 10, 1)))).toEqual(['2026-10-09', '2026-10-23'])
    expect(keys(occurrencesInMonth(pay, day(2026, 11, 1)))).toEqual(['2026-11-06', '2026-11-20'])
    expect(occurrencesInMonth(pay, day(2026, 9, 1))).toEqual([])
  })

  it('stops before the end date, keeping earlier ones', () => {
    const gym = makeFinanceEvent({
      title: 'Gym', entryType: 'expense', date: toISO(day(2026, 10, 5)), repeats: true, frequency: 'weekly', weekday: 2,
      endDate: toISO(day(2026, 10, 19)),
    })
    expect(keys(occurrencesInMonth(gym, day(2026, 10, 1)))).toEqual(['2026-10-05', '2026-10-12'])
  })
})

describe('varying amounts', () => {
  const pay = makeFinanceEvent({
    title: 'Pay', entryType: 'income', amount: 600, date: toISO(day(2026, 10, 9)), repeats: true, frequency: 'weekly', weekday: 6,
    amountVaries: true, confirmedAmounts: { '2026-10-09': 655.5 },
  })

  it('uses the confirmed amount where there is one, else the estimate', () => {
    expect(amountOn(pay, day(2026, 10, 9))).toBe(655.5)
    expect(isConfirmedOn(pay, day(2026, 10, 9))).toBe(true)
    expect(amountOn(pay, day(2026, 10, 16))).toBe(600)
    expect(isConfirmedOn(pay, day(2026, 10, 16))).toBe(false)
  })

  it('counts only past and today as waiting to be confirmed', () => {
    const t = monthTotals([pay], day(2026, 10, 1), day(2026, 10, 16))
    expect(t.income).toBe(655.5 + 600 * 3)
    expect(t.toConfirm).toBe(1)
  })
})

describe('lists and totals', () => {
  const events = [
    makeFinanceEvent({ title: 'Rent', entryType: 'expense', expenseCategory: 'fixed', amount: 1200, date: toISO(day(2026, 10, 1)), repeats: true, frequency: 'monthly' }),
    makeFinanceEvent({ title: 'Food', entryType: 'expense', expenseCategory: 'flexible', amount: 90, date: toISO(day(2026, 10, 1)), repeats: true, frequency: 'weekly', weekday: 5 }),
    makeFinanceEvent({ title: 'Salary', entryType: 'income', amount: 2500, date: toISO(day(2026, 10, 1)), repeats: true, frequency: 'monthly' }),
  ]

  it('puts income first on a shared day', () => {
    expect(lineItemsOn(events, day(2026, 10, 1)).map(i => i.event.title)).toEqual(['Salary', 'Food', 'Rent'])
    expect(lineItemsInMonth(events, day(2026, 10, 1))).toHaveLength(2 + 5) // Thursdays: 1, 8, 15, 22, 29
  })

  it('totals by type and category', () => {
    const t = monthTotals(events, day(2026, 10, 1))
    expect(t).toMatchObject({ income: 2500, expenses: 1200 + 450, fixed: 1200, flexible: 450 })
  })
})

describe('changing from a date on', () => {
  it('keeps earlier months and moves later confirmations to the new entry', () => {
    const pay = makeFinanceEvent({
      id: 'A', title: 'Pay', entryType: 'income', amount: 600, date: toISO(day(2026, 10, 2)), repeats: true, frequency: 'weekly', weekday: 6,
      amountVaries: true, confirmedAmounts: { '2026-10-02': 610, '2026-10-16': 620 },
    })
    const [old, next] = splitFrom([pay], 'A', day(2026, 10, 16), { amount: 700 }, 'B')
    expect(keys(occurrencesInMonth(old, day(2026, 10, 1)))).toEqual(['2026-10-02', '2026-10-09'])
    expect(old.confirmedAmounts).toEqual({ '2026-10-02': 610 })
    expect(keys(occurrencesInMonth(next, day(2026, 10, 1)))).toEqual(['2026-10-16', '2026-10-23', '2026-10-30'])
    expect(next).toMatchObject({ id: 'B', amount: 700, confirmedAmounts: { '2026-10-16': 620 } })
  })
})

describe('reading saved entries', () => {
  it('fills defaults and ignores unknown values', () => {
    const e = decodeFinanceEvent({ title: 'Old', entryType: 'mystery', frequency: 'yearly', amount: 'x', confirmedAmounts: { a: 1, b: 'no' } })
    expect(e).toMatchObject({ entryType: 'expense', expenseCategory: 'fixed', frequency: 'none', amount: 0, confirmedAmounts: { a: 1 } })
    expect(decodeFinanceEvent({ entryType: 'income', expenseCategory: 'fixed' }).expenseCategory).toBeUndefined()
  })
})

describe('typed amounts', () => {
  it('reads common ways of writing money', () => {
    expect(parseAmount('1,234.50')).toBe(1234.5)
    expect(parseAmount('£12')).toBe(12)
    expect(parseAmount('12,5')).toBe(12.5)
    expect(parseAmount('1.234,56')).toBe(1234.56)
    expect(parseAmount('1,200')).toBe(1200)
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
  })
})
