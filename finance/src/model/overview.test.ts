// The Months overview and debt runway, on figures from Riley's spreadsheet
// (Budget+Debts.xlsx, Nov 2026 – Apr 2027).
import { dayKey, toISO } from '@suite/dates'
import { describe, expect, it } from 'vitest'
import type { Account } from './accounts'
import { makeFinanceEvent } from './entries'
import { makeGoal, type FinanceGoal } from './goals'
import { monthsGrid } from './months'
import { debtRunway, periodStatement, roomInPlan } from './overview'

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day)
const tithing = [{ id: 't', title: 'Tithing', percent: 10, kind: 'giving' as const }]
const monthly = (title: string, amount: number, start: Date, flexible = false) =>
  makeFinanceEvent({ title, entryType: 'expense', expenseCategory: flexible ? 'flexible' : 'fixed', amount, date: toISO(start), repeats: true, frequency: 'monthly' })
const debt = (title: string, owed: number, payment: number, first: Date): FinanceGoal =>
  ({ ...makeGoal({ title, kind: 'debt' }), targetAmount: owed, paymentAmount: payment, frequency: 'monthly', firstPaymentDate: toISO(first) })

const events = [
  makeFinanceEvent({ title: 'Paycheck', entryType: 'income', amount: 1350, date: toISO(d(2026, 10, 30)), setAsides: tithing }),
  makeFinanceEvent({ title: 'Paycheck', entryType: 'income', amount: 2000, date: toISO(d(2026, 11, 28)), repeats: true, frequency: 'monthly', setAsides: tithing }),
  monthly('Rent', 600, d(2026, 11, 1)),
  monthly('Fuel', 300, d(2026, 11, 1)),
  monthly('Groceries', 100, d(2026, 11, 3), true),
]
const goals = [
  debt('Credit card', 1785, 895, d(2026, 12, 1)),
  debt('Ring', 1182.75, 900, d(2027, 2, 1)),
  debt('Existing school', 4162, 160, d(2026, 11, 1)),
  debt('School (Dad)', 1275.75, 0, d(2026, 11, 1)),
]
const uk: Account = { id: 'uk', name: 'HSBC', kind: 'current', createdDate: toISO(d(2026, 10, 1)), primary: true }
const options = { home: 'GBP', currencyOf: () => 'GBP', goalCurrency: () => 'GBP', entryCurrency: () => 'GBP', toHome: (n: number) => n, before: 0, after: 7 }
const grid = monthsGrid({ accounts: [uk], audits: [], events, goals, spending: [] }, options, d(2026, 10, 29))
const same = (n: number) => n

describe('a period as a statement', () => {
  it('splits December into bills, living, set aside and debts, with shares of pay', () => {
    // Columns from 28 Oct: index 1 is 28 Nov – 27 Dec (December's pay).
    const s = periodStatement(grid, 1, same)
    expect(s.totalIn.amount).toBe(2000)
    expect(s.groups.map(g => [g.id, g.total])).toEqual([['bills', 900], ['living', 100], ['setAside', 200], ['debts', 1055]])
    // Out (£2,255) is more than in, so shares are of what went out: the bar still adds up.
    expect(s.groups[3].share).toBeCloseTo(1055 / 2255)
    expect(s.leftOver.amount).toBe(-255)
    expect(s.short).toBe(255)
    expect(s.groups[2].lines[0]).toMatchObject({ title: 'Tithing', note: '10% of pay', amount: 200 })
  })

  it('says how much the debts came down', () => {
    const s = periodStatement(grid, 1, same)
    expect(s.owedChange).toBe(-1055)
  })
})

describe('room in the plan', () => {
  it('finds the first month with money not given a job, and whether it carries on', () => {
    const room = roomInPlan(grid)
    expect(room).not.toBeNull()
    // The ring's last £282.75 is in the period from 28 Feb, leaving £357.25; after that £640 a month.
    expect(dayKey(grid.periods[room!.index].start)).toBe('2027-02-28')
    expect(room).toMatchObject({ amount: 357, ongoing: true })
  })
})

describe('the debt runway', () => {
  const r = debtRunway(goals, () => 'GBP', same, d(2026, 10, 29))

  it('runs every planned debt to its last payment, the unplanned one honestly last', () => {
    expect(r.debts.map(x => x.title)).toEqual(['Credit card', 'Ring', 'Existing school', 'School (Dad)'])
    expect(dayKey(r.debts[0].finish!)).toBe('2027-01-01')
    expect(dayKey(r.debts[1].finish!)).toBe('2027-03-01')
    expect(dayKey(r.debts[2].finish!)).toBe('2029-01-01')
    expect(r.debts[3]).toMatchObject({ payment: undefined, start: undefined, remaining: 1275.75 })
    expect(dayKey(r.lastPayment!)).toBe('2029-01-01')
  })

  it('shrinks month by month and ends with what has no plan', () => {
    expect(r.monthly[0]).toEqual({ month: d(2026, 10, 1), owed: 8405.5 })
    expect(r.monthly.at(-1)!.owed).toBe(1275.75)
    expect(r.leftAtEnd).toBe(1275.75)
  })
})
