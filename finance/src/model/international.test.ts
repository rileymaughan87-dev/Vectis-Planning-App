// International mode: a UK account in pounds, a US account in dollars.
// Each keeps its own bills; the US account's bills before payday become
// "transfer this much", which comes out of safe to spend; totals convert.
import { toISO } from '@suite/dates'
import { describe, expect, it } from 'vitest'
import { goalSource, standing, type Account, type Audit, type Transfer } from './accounts'
import { converter, rateToHome } from './currency'
import { makeFinanceEvent } from './entries'
import { forward } from './forward'
import type { FinanceGoal } from './goals'

const day = (d: number, h = 12) => new Date(2026, 9, d, h)
const uk: Account = { id: 'uk', name: 'Monzo', kind: 'current', createdDate: toISO(day(1)), primary: true }
const us: Account = { id: 'us', name: 'Chase', kind: 'current', createdDate: toISO(day(1)), primary: false, currency: 'USD' }
const usLoan: Account = { id: 'loan', name: 'Student loan', kind: 'loan', createdDate: toISO(day(1)), primary: false, currency: 'USD' }
const entry = (title: string, type: 'income' | 'expense', amount: number, d: number, accountID?: string) =>
  makeFinanceEvent({ title, entryType: type, amount, date: toISO(day(d, 0)), repeats: true, frequency: 'monthly', accountID })

const salary = entry('Salary', 'income', 2300, 30)
const rent = entry('Rent', 'expense', 950, 20)
const usPhone = entry('US phone', 'expense', 60, 15, 'us')
const usCard = entry('US card payment', 'expense', 200, 22, 'us')
const audits: Audit[] = [
  { id: 'a', accountID: 'uk', date: toISO(day(10, 9)), balance: 1600 },
  { id: 'b', accountID: 'us', date: toISO(day(10, 9)), balance: 100 },
]
// 1 GBP = 1.25 USD, so $1 = £0.80.
const rates = { base: 'GBP', date: '2026-10-10', rates: { USD: 1.25 } }
const convert = converter('GBP', rates, {})
const byAccount = (amount: number, from: Account, to: Account) => convert(amount, from.currency ?? 'GBP', to.currency ?? 'GBP')
const data = { accounts: [uk, us, usLoan], audits, events: [salary, rent, usPhone, usCard], goals: [] as FinanceGoal[], spending: [] }

describe('international mode', () => {
  it('converts through home, and your own rate wins', () => {
    expect(rateToHome('USD', 'GBP', rates, {})).toBe(0.8)
    expect(convert(100, 'USD', 'GBP')).toBe(80)
    expect(converter('GBP', rates, { USD: 0.75 })(100, 'USD', 'GBP')).toBe(75)
    expect(convert(100, 'GBP', 'GBP')).toBe(100)
  })

  it("keeps US bills off the UK account and asks for a transfer that covers them", () => {
    const f = forward(data, { cushion: 0, convert: byAccount }, day(10))
    if (f.kind !== 'ready') throw new Error(f.kind)
    expect(f.comingUp.map(m => m.title)).toEqual(['Rent'])
    // $100 in it, $260 of bills before payday: send $160 (£128).
    expect(f.transfers).toMatchObject([{ account: { id: 'us' }, need: 160, inMain: 128, checked: true }])
    // 1600 − 950 rent − 128 to send.
    expect(f.safe).toBe(522)
  })

  it('once the transfer is logged, nothing more is asked and both balances follow it', () => {
    const sent: Transfer = { id: 't', date: toISO(day(11)), fromAccountID: 'uk', toAccountID: 'us', amountOut: 130, amountIn: 160 }
    const f = forward({ ...data, transfers: [sent] }, { cushion: 0, convert: byAccount }, day(12))
    if (f.kind !== 'ready') throw new Error(f.kind)
    expect(f.transfers[0].need).toBe(0)
    expect(f.balanceNow).toBe(1470)
    expect(f.safe).toBe(520)
  })

  it('pays a US-dollar debt goal from the US account', () => {
    const goal = { id: 'g', title: 'Loan', kind: 'debt', accountID: 'loan' } as FinanceGoal
    expect(goalSource(goal, data.accounts)?.id).toBe('us')
    expect(goalSource({ ...goal, accountID: undefined }, data.accounts)?.id).toBe('uk')
  })

  it('adds up totals in pounds', () => {
    const inHome = (n: number, a: Account) => convert(n, a.currency ?? 'GBP', 'GBP') ?? n
    expect(standing([uk, us], audits, inHome)).toEqual({ have: 1680, owe: 0 })
  })
})

describe('a transfer on the day a balance was checked', () => {
  it('counts on both sides when it was made after the check', () => {
    const checkedToday: Audit[] = [
      { id: 'a', accountID: 'uk', date: toISO(day(13, 9)), balance: 1600 },
      { id: 'b', accountID: 'us', date: toISO(day(13, 9)), balance: 100 },
    ]
    const sent: Transfer = { id: 't', date: toISO(day(13, 10)), fromAccountID: 'uk', toAccountID: 'us', amountOut: 128, amountIn: 160 }
    const f = forward({ ...data, audits: checkedToday, transfers: [sent] }, { cushion: 0, convert: byAccount }, day(13, 11))
    if (f.kind !== 'ready') throw new Error(f.kind)
    expect(f.balanceNow).toBe(1472)
    expect(f.transfers[0].need).toBe(0)
  })
})
