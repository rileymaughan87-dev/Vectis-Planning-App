// Payday: what to send to each account so it's covered until the next
// payday, topped up from what's already there; goal payments where
// they're planned; and what stays in the pay account.
import { toISO } from '@suite/dates'
import { describe, expect, it } from 'vitest'
import type { Account, Audit, Transfer } from './accounts'
import { converter } from './currency'
import { makeFinanceEvent } from './entries'
import { makeGoal } from './goals'
import { everydayAccount, everydayLeft, payday } from './payday'

const d = (m: number, day: number) => new Date(2026, m - 1, day, 12)
const acc = (id: string, name: string, kind: Account['kind'], extra: Partial<Account> = {}): Account =>
  ({ id, name, kind, createdDate: toISO(d(10, 1)), primary: false, ...extra })
const hsbc = acc('hsbc', 'HSBC Current', 'current', { primary: true })
const everyday = acc('every', 'Everyday', 'current')
const us = acc('us', 'America First', 'current', { currency: 'USD' })
const savings = acc('save', 'Savings', 'savings')
const monthly = (title: string, amount: number, day: Date, extra = {}) =>
  makeFinanceEvent({ title, entryType: 'expense', expenseCategory: 'fixed', amount, date: toISO(day), repeats: true, frequency: 'monthly', ...extra })

const events = [
  makeFinanceEvent({ title: 'Paycheck', entryType: 'income', amount: 2000, date: toISO(d(10, 28)), repeats: true, frequency: 'monthly', setAsides: [{ id: 't', title: 'Tithing', percent: 10, kind: 'giving' }] }),
  monthly('Rent', 600, d(11, 1)),
  monthly('Groceries', 200, d(11, 1), { expenseCategory: 'flexible', accountID: 'every' }),
  monthly('Fuel', 250, d(11, 1), { expenseCategory: 'flexible', accountID: 'every' }),
  monthly('Fun', 100, d(11, 1), { expenseCategory: 'flexible', accountID: 'every' }),
  monthly('Insurance', 150, d(11, 6), { accountID: 'us' }),
]
const card = { ...makeGoal({ title: 'Credit card', kind: 'debt' }), targetAmount: 2300, paymentAmount: 1150, frequency: 'monthly' as const, firstPaymentDate: toISO(d(12, 1)), currency: 'USD' }
const buffer = { ...makeGoal({ title: 'Buffer', kind: 'savings' }), targetAmount: 600, paymentAmount: 200, frequency: 'monthly' as const, firstPaymentDate: toISO(d(12, 2)), accountID: 'save' }
const audits: Audit[] = [
  { id: 'a', accountID: 'every', date: toISO(d(11, 20)), balance: 40 },
  { id: 'b', accountID: 'us', date: toISO(d(11, 20)), balance: 109 },
]
const data = { accounts: [hsbc, everyday, us, savings], audits, events, goals: [card, buffer], spending: [], transfers: [] as Transfer[] }
const convert = converter('GBP', { base: 'GBP', date: '2026-11-20', rates: { USD: 1.25 } }, {})
const byAccount = (n: number, from: Account, to: Account) => convert(n, from.currency ?? 'GBP', to.currency ?? 'GBP')

describe('payday', () => {
  it('tops up each account to its budget for the pay period, less what is already there', () => {
    const p = payday(data, { convert: byAccount }, d(11, 26))
    if (p.kind !== 'ready') throw new Error(p.kind)
    expect(p.payAccount.id).toBe('hsbc')
    expect(p.passed).toBe(false)
    expect(p.payAmount).toBe(2000)
    // Everyday: £550 budget, £40 still in it → send £510.
    expect(p.topUps.find(x => x.account.id === 'every')).toMatchObject({ budget: 550, carry: 40, need: 510, remaining: 510 })
    // America First: $150 insurance + $1,150 card, $109 there → $1,191 (£952.80).
    expect(p.topUps.find(x => x.account.id === 'us')).toMatchObject({ budget: 1300, carry: 109, need: 1191, remainingInPay: 952.8 })
    // The buffer goes straight to Savings.
    expect(p.goals.map(g => [g.goal.title, g.to?.name, g.amount])).toEqual([['Buffer', 'Savings', 200]])
    // HSBC keeps rent and tithing; what stays is what's left.
    expect(p.ownBudget).toBe(800)
    expect(p.stays).toBe(-462.8) // 2,000 − 800 − 510 − 952.80 − 200: this month comes up short
  })

  it('counts what has been sent, and still shows the payday for a few days after', () => {
    const sent: Transfer = { id: 't', date: toISO(d(11, 28)), fromAccountID: 'hsbc', toAccountID: 'every', amountOut: 300, amountIn: 300 }
    const p = payday({ ...data, transfers: [sent] }, { convert: byAccount }, d(11, 30))
    if (p.kind !== 'ready') throw new Error(p.kind)
    expect(p.passed).toBe(true)
    expect(p.topUps.find(x => x.account.id === 'every')).toMatchObject({ need: 510, sent: 300, remaining: 210 })
  })

  it('finds the everyday account and what is left of it', () => {
    const p = payday(data, {}, d(11, 26))
    if (p.kind !== 'ready') throw new Error(p.kind)
    expect(everydayAccount(data, p.period)?.id).toBe('every')
    const spent = [{ id: 's', date: toISO(d(12, 2)), amount: 62.5, note: 'Tesco', source: 'manual' as const, accountID: 'every' }]
    expect(everydayLeft(everyday, { ...data, spending: spent }, p.period)).toEqual({ budget: 550, spent: 62.5, left: 487.5 })
  })

  it('needs pay to plan from', () => {
    expect(payday({ ...data, events: events.slice(1) }, {}, d(11, 26)).kind).toBe('noPay')
  })
})
