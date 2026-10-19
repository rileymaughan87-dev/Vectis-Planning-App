// The Months view: columns from payday to payday, rows in their own
// currency, totals in pounds, what to send to the US account each period,
// and debts counting down. Shaped like Riley's own plan (Oct 2026).
import { dayKey, toISO } from '@suite/dates'
import { describe, expect, it } from 'vitest'
import type { Account, Audit } from './accounts'
import { converter } from './currency'
import { makeFinanceEvent } from './entries'
import { makeGoal } from './goals'
import { monthsGrid, payPeriods } from './months'

const d = (m: number, day: number) => new Date(2026, m - 1, day)
const uk: Account = { id: 'uk', name: 'HSBC Current', kind: 'current', createdDate: toISO(d(10, 1)), primary: true }
const us: Account = { id: 'us', name: 'America First', kind: 'current', createdDate: toISO(d(10, 1)), primary: false, currency: 'USD' }
const firstPay = makeFinanceEvent({ title: 'Paycheck', entryType: 'income', amount: 1350, date: toISO(d(10, 30)) })
const pay = makeFinanceEvent({ title: 'Paycheck', entryType: 'income', amount: 2000, date: toISO(d(11, 28)), repeats: true, frequency: 'monthly' })
const rent = makeFinanceEvent({ title: 'Rent', entryType: 'expense', expenseCategory: 'fixed', amount: 600, date: toISO(d(11, 1)), repeats: true, frequency: 'monthly' })
const insurance = makeFinanceEvent({ title: 'Insurance', entryType: 'expense', expenseCategory: 'fixed', amount: 150, date: toISO(d(11, 6)), repeats: true, frequency: 'monthly', accountID: 'us' })
const card = { ...makeGoal({ title: 'Credit Card', kind: 'debt' }), targetAmount: 2300, paymentAmount: 1150, frequency: 'monthly' as const, firstPaymentDate: toISO(d(12, 1)), currency: 'USD' }
const audits: Audit[] = [{ id: 'a', accountID: 'us', date: toISO(d(10, 13)), balance: 109 }, { id: 'b', accountID: 'uk', date: toISO(d(10, 13)), balance: 10 }]
const data = { accounts: [uk, us], audits, events: [firstPay, pay, rent, insurance], goals: [card], spending: [] }

const convert = converter('GBP', { base: 'GBP', date: '2026-10-19', rates: { USD: 1.25 } }, {})
const options = {
  home: 'GBP',
  currencyOf: (a?: Account) => a?.currency ?? 'GBP',
  goalCurrency: (g: { currency?: string }) => g.currency ?? 'GBP',
  entryCurrency: (e: { accountID?: string }) => (e.accountID === 'us' ? 'USD' : 'GBP'),
  toHome: (n: number, c: string) => convert(n, c, 'GBP') ?? n,
}

describe('the Months view', () => {
  it('runs from payday to payday, from the main pay', () => {
    const { periods, byPay } = payPeriods(data.events, undefined, d(10, 19), 1, 3)
    expect(byPay).toBe(true)
    expect(periods.map(p => dayKey(p.start))).toEqual(['2026-08-28', '2026-09-28', '2026-10-28', '2026-11-28', '2026-12-28'])
  })

  it('puts each pay packet against what it pays for, in pounds', () => {
    const g = monthsGrid(data, { ...options, before: 0, after: 3 }, d(10, 19))
    // Columns: 28 Sep (now), 28 Oct, 28 Nov, 28 Dec.
    expect(g.current).toBe(0)
    expect(g.income.map(r => r.title)).toEqual(['Paycheck'])
    expect(g.income[0].cells.map(c => c?.amount ?? 0)).toEqual([0, 1350, 2000, 2000])
    // Insurance stays in dollars on its row; the totals convert it ($150 = £120).
    expect(g.outgoing.find(r => r.title === 'Insurance')).toMatchObject({ currency: 'USD' })
    expect(g.totalOut[1].amount).toBe(600 + 120)
    expect(g.leftOver[1].amount).toBe(1350 - 720)
    // The card's $1,150 in December: $920 at this rate.
    expect(g.goals[0].cells[2]).toEqual({ amount: 1150, estimate: false })
    expect(g.leftOver[2].amount).toBe(2000 - 600 - 120 - 920)
  })

  it('works out what to send to the US account each pay period', () => {
    const g = monthsGrid(data, { ...options, before: 0, after: 3 }, d(10, 19))
    // $109 there; $150 insurance → send $41. Then $150 + $1,150 card → $1,300.
    expect(g.transfers[0].title).toBe('To America First')
    expect(g.transfers[0].cells.map(c => c?.amount ?? 0)).toEqual([0, 41, 1300, 1300])
  })

  it('counts each debt down', () => {
    const g = monthsGrid(data, { ...options, before: 0, after: 3 }, d(10, 19))
    expect(g.owed[0].cells.map(c => c?.amount)).toEqual([2300, 2300, 1150, 0])
    expect(g.owedTotal[2].amount).toBe(920)
  })
})
