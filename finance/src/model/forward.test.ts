// The forward view: payday, what's coming, and safe to spend.
import { toISO } from '@suite/dates'
import { describe, expect, it } from 'vitest'
import type { Account, Audit } from './accounts'
import { makeFinanceEvent } from './entries'
import { forward, mainPay, nextOccurrence } from './forward'

const day = (d: number, h = 12) => new Date(2026, 9, d, h)
const current: Account = { id: 'cur', name: 'Current', kind: 'current', createdDate: toISO(day(1)), primary: true }
const monthlyEntry = (title: string, type: 'income' | 'expense', amount: number, d: number) =>
  makeFinanceEvent({ title, entryType: type, expenseCategory: type === 'expense' ? 'fixed' : undefined, amount, date: toISO(day(d, 0)), repeats: true, frequency: 'monthly' })

// Riley's pattern: a small payment early in the month, the main pay on the 30th.
const small = monthlyEntry('Top-up', 'income', 300, 2)
const salary = monthlyEntry('Salary', 'income', 2300, 30)
const rent = monthlyEntry('Rent', 'expense', 950, 20)
const phone = monthlyEntry('Phone', 'expense', 24, 25)
const audits: Audit[] = [{ id: 'a', accountID: 'cur', date: toISO(day(10, 9)), balance: 1600 }]
const data = { accounts: [current], audits, events: [small, salary, rent, phone], goals: [], spending: [] }

describe('the forward view', () => {
  it('takes the biggest repeating pay as payday unless one is chosen', () => {
    expect(mainPay(data.events, undefined, day(10))?.title).toBe('Salary')
    expect(mainPay(data.events, small.id, day(10))?.title).toBe('Top-up')
    expect(nextOccurrence(salary, day(30))?.getMonth()).toBe(10) // after the 30th: next month's
  })

  it('works out safe to spend until payday, leaving payday money for the next stretch', () => {
    const f = forward(data, { cushion: 100 }, day(10))
    if (f.kind !== 'ready') throw new Error(f.kind)
    expect(f.payday?.getDate()).toBe(30)
    expect(f.comingUp.map(m => m.title)).toEqual(['Rent', 'Phone'])
    expect(f.onPayday.map(m => m.title)).toEqual(['Salary'])
    // 1600 − 950 − 24 − 100 cushion
    expect(f.safe).toBe(526)
    expect(f.days).toBe(20)
    expect(f.perDay).toBe(26.3)
    expect(f.dip).toBeUndefined()
  })

  it('warns about a dip below the cushion before payday', () => {
    const f = forward({ ...data, audits: [{ ...audits[0], balance: 1000 }] }, { cushion: 100 }, day(10))
    if (f.kind !== 'ready') throw new Error(f.kind)
    expect(f.dip).toEqual({ balance: 26, date: day(25, 0) })
  })

  it('asks for an account, then a first check', () => {
    expect(forward({ ...data, accounts: [] }, { cushion: 0 }, day(10)).kind).toBe('noAccount')
    expect(forward({ ...data, audits: [] }, { cushion: 0 }, day(10)).kind).toBe('notChecked')
  })
})
