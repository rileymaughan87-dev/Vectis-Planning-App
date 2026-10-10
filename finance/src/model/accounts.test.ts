// Accounts and audits: what's expected since the last audit, and gaps.
import { toISO } from '@suite/dates'
import { describe, expect, it } from 'vitest'
import { describeGap, expectedBalance, history, monthlyStanding, onBalance, standing, type Account, type Audit, type MoneyData } from './accounts'
import { amountRemaining, makeGoal, progress } from './goals'
import { makeFinanceEvent } from './entries'
import type { SpendingEntry } from './spending'

const day = (d: number, h = 12) => new Date(2026, 9, d, h)
const current: Account = { id: 'cur', name: 'Current', kind: 'current', createdDate: toISO(day(1)), primary: true }
const card: Account = { id: 'card', name: 'Card', kind: 'credit', createdDate: toISO(day(1)), primary: false }
const savings: Account = { id: 'sav', name: 'Saver', kind: 'savings', createdDate: toISO(day(1)), primary: false }

const spend = (id: string, amount: number, d: number, accountID?: string): SpendingEntry =>
  ({ id, amount, date: toISO(day(d)), note: id, source: 'manual', accountID })

const data = (extra: Partial<MoneyData> = {}): MoneyData => ({
  accounts: [current, card, savings],
  events: [
    makeFinanceEvent({ title: 'Pay', entryType: 'income', amount: 2000, date: toISO(day(30, 0)) }),
    makeFinanceEvent({ title: 'Rent', entryType: 'expense', expenseCategory: 'fixed', amount: 900, date: toISO(day(5, 0)) }),
    makeFinanceEvent({ title: 'Phone', entryType: 'expense', expenseCategory: 'fixed', amount: 20, date: toISO(day(2, 0)) }),
  ],
  goals: [],
  spending: [spend('coffee', 4, 3), spend('dinner', 40, 4, 'card'), spend('old', 10, 2)],
  ...extra,
})

const audits: Audit[] = [
  { id: 'a1', accountID: 'cur', date: toISO(day(2, 9)), balance: 1200 },
  { id: 'c1', accountID: 'card', date: toISO(day(1)), balance: 100 },
]

describe('accounts and audits', () => {
  it('expects the last audit plus everything after its day', () => {
    // After the 2nd: rent (−900) on the 5th and coffee (−4) on the 3rd; the phone bill and "old" were on the audit's day.
    const r = expectedBalance(current, audits, data(), day(6))!
    expect(r.movements.map(m => m.title)).toEqual(['coffee', 'Rent'])
    expect(r.expected).toBe(296)
  })

  it('adds spending on a card to what is owed', () => {
    expect(expectedBalance(card, audits, data(), day(6))!.expected).toBe(140)
  })

  it('reads a gap without judging it: less money, or more owed, is unlogged spending', () => {
    expect(describeGap(current, 250, 296)).toEqual({ size: 46, unlogged: true })
    expect(describeGap(current, 300, 296)).toEqual({ size: 4, unlogged: false })
    expect(describeGap(card, 160, 140)).toEqual({ size: 20, unlogged: true })
    expect(describeGap(current, 296, 296)).toBeNull()
  })

  it('totals what you have and owe, and shows change between audits', () => {
    const more: Audit[] = [...audits, { id: 's1', accountID: 'sav', date: toISO(day(1)), balance: 500 }, { id: 's2', accountID: 'sav', date: toISO(day(8)), balance: 650 }]
    expect(standing([current, card, savings], more)).toEqual({ have: 1850, owe: 100 })
    expect(history(more, 'sav').map(h => h.change)).toEqual([150, undefined])
  })
})

describe('goals on real balances, and progress over time', () => {
  const loan: Account = { id: 'loan', name: 'Loan', kind: 'loan', createdDate: toISO(day(1)), primary: false }
  const accounts = [current, savings, loan]

  it('measures a savings goal on its account, counting payments made into it since the check', () => {
    const goal = makeGoal({ title: 'Holiday', kind: 'savings', targetAmount: 1000, accountID: 'sav', paymentAmount: 100, firstPaymentDate: toISO(day(5, 0)), payments: { '2026-10-05': 100 } })
    const checks: Audit[] = [{ id: 's', accountID: 'sav', date: toISO(day(1)), balance: 500 }]
    const d: MoneyData = { accounts, events: [], goals: [goal], spending: [] }
    // 500 at the check + the 100 paid in on the 5th.
    expect(expectedBalance(savings, checks, d, day(6))!.expected).toBe(600)
    const real = onBalance(goal, accounts, checks, d, day(6))
    expect(progress(real)).toBe(0.6)
    // ...and it left the current account.
    expect(expectedBalance(current, [{ id: 'c', accountID: 'cur', date: toISO(day(1)), balance: 900 }], d, day(6))!.expected).toBe(800)
  })

  it('measures a debt on what is still owed', () => {
    const goal = makeGoal({ title: 'Car', kind: 'debt', targetAmount: 3000, accountID: 'loan', payments: {} })
    const checks: Audit[] = [{ id: 'l', accountID: 'loan', date: toISO(day(2)), balance: 2400 }]
    expect(amountRemaining(onBalance(goal, accounts, checks, { accounts, events: [], goals: [goal], spending: [] }, day(6)))).toBe(2400)
  })

  it('shows where things stood at the end of each month, from checks only', () => {
    const checks: Audit[] = [
      { id: '1', accountID: 'sav', date: toISO(new Date(2026, 7, 10)), balance: 400 },
      { id: '2', accountID: 'loan', date: toISO(new Date(2026, 7, 12)), balance: 3000 },
      { id: '3', accountID: 'sav', date: toISO(new Date(2026, 9, 3)), balance: 650 },
      { id: '4', accountID: 'loan', date: toISO(new Date(2026, 9, 4)), balance: 2700 },
    ]
    const months = monthlyStanding(accounts, checks, day(10))
    expect(months.map(m => [m.month.getMonth(), m.saved, m.owed])).toEqual([[7, 400, 3000], [8, 400, 3000], [9, 650, 2700]])
  })
})
