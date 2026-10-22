// Percentage set-asides on pay (Riley, 22 Oct 2026): 10% of each pay,
// worked out from that pay's amount, following its estimate or confirmed
// figure; shown in Months under Set aside and taken off safe to spend.
import { dayKey, toISO } from '@suite/dates'
import { describe, expect, it } from 'vitest'
import type { Account, Audit } from './accounts'
import { decodeFinanceEvent, makeFinanceEvent, setAsideItems, withSetAsideSkipped, type FinanceEvent } from './entries'
import { forward } from './forward'
import { leftOverNote, monthsGrid } from './months'

const d = (m: number, day: number) => new Date(2026, m - 1, day)
const tithing = { id: 't', title: 'Tithing', percent: 10, kind: 'giving' as const }
const firstPay = makeFinanceEvent({ title: 'Paycheck', entryType: 'income', amount: 1350, date: toISO(d(10, 30)), setAsides: [tithing] })
const pay = makeFinanceEvent({
  title: 'Paycheck', entryType: 'income', amount: 2000, date: toISO(d(11, 28)), repeats: true, frequency: 'monthly', amountVaries: true, setAsides: [tithing],
})
const rent = makeFinanceEvent({ title: 'Rent', entryType: 'expense', expenseCategory: 'fixed', amount: 600, date: toISO(d(11, 1)), repeats: true, frequency: 'monthly' })
const items = (events: FinanceEvent[], m: number) => setAsideItems(events, d(m, 1)).map(i => ({ amount: i.amount, confirmed: i.confirmed, date: dayKey(i.date) }))

describe('set-asides from pay', () => {
  it('works out 10% of each pay', () => {
    expect(items([firstPay], 10)).toEqual([{ amount: 135, confirmed: true, date: '2026-10-30' }])
  })

  it('stays an estimate while the pay is, and follows the confirmed amount', () => {
    expect(items([pay], 11)).toEqual([{ amount: 200, confirmed: false, date: '2026-11-28' }])
    const confirmed = { ...pay, confirmedAmounts: { '2026-11-28': 2150 } }
    expect(items([confirmed], 11)).toEqual([{ amount: 215, confirmed: true, date: '2026-11-28' }])
  })

  it('can be skipped for one pay, and goes when the rule is removed', () => {
    expect(items([withSetAsideSkipped(pay, d(11, 28), 't', true)], 11)).toEqual([])
    expect(items([pay], 12)).toHaveLength(1)
    expect(items([{ ...pay, setAsides: [] }], 11)).toEqual([])
  })

  it('reads older entries exactly as before', () => {
    const old = decodeFinanceEvent({ id: 'x', title: 'Pay', entryType: 'income', amount: 100, date: '2026-10-01T00:00:00Z' })
    expect('setAsides' in old).toBe(false)
    expect(decodeFinanceEvent({ ...old, setAsides: [{ title: 'Tithing', percent: 10 }] }).setAsides?.[0]).toMatchObject({ title: 'Tithing', percent: 10, kind: 'giving' })
    // Only pay carries them.
    expect('setAsides' in decodeFinanceEvent({ ...old, entryType: 'expense', setAsides: [tithing] })).toBe(false)
  })
})

describe('set-asides in Months and safe to spend', () => {
  const uk: Account = { id: 'uk', name: 'HSBC Current', kind: 'current', createdDate: toISO(d(10, 1)), primary: true }
  const audits: Audit[] = [{ id: 'a', accountID: 'uk', date: toISO(d(10, 13)), balance: 100 }]
  const data = { accounts: [uk], audits, events: [firstPay, pay, rent], goals: [], spending: [] }
  const options = {
    home: 'GBP', currencyOf: () => 'GBP', goalCurrency: () => 'GBP', entryCurrency: () => 'GBP', toHome: (n: number) => n, before: 0, after: 2,
  }

  it('shows under Set aside and comes off what is left over', () => {
    const g = monthsGrid(data, options, d(10, 29))
    // Columns: 28 Oct (now), 28 Nov, 28 Dec.
    expect(g.setAsides).toMatchObject([{ title: 'Tithing', note: '10% of pay', ref: { type: 'entry' } }])
    expect(g.setAsides[0].cells.map(c => c?.amount)).toEqual([135, 200, 200])
    expect(g.leftOver[0].amount).toBe(1350 - 600 - 135)
    expect(g.groups.map(x => x.id)).toEqual(['in', 'out', 'setAside'])
    expect(g.groups[2].subtotal?.[1]).toEqual({ amount: 200, estimate: true })
  })

  it('reads "all planned" at nothing left, "not planned yet" above it', () => {
    expect(leftOverNote({ amount: 0, estimate: false })).toBe('all planned')
    expect(leftOverNote({ amount: 615, estimate: false })).toBe('not planned yet')
    expect(leftOverNote({ amount: -20, estimate: false })).toBe('short')
  })

  it('comes off safe to spend, with the pay it belongs to', () => {
    // Payday is the 28th; the one-off £1,350 on 30 Oct falls in this stretch, so its tithing does too.
    const f = forward(data, { cushion: 0 }, d(10, 29))
    if (f.kind !== 'ready') throw new Error(f.kind)
    const titles = f.comingUp.map(m => `${m.title} ${m.amount}`)
    expect(titles).toContain('Tithing -135')
    expect(titles).toContain('Paycheck 1350')
  })
})
