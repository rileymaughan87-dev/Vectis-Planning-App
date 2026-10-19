// The Months view (Oct 2026): your plan laid out like a spreadsheet, one
// column per pay period — from one payday to the day before the next — so
// each column is one pay packet and what it has to cover (pay landing on the
// 28th funds the month after, not the one it lands in). Without a repeating
// pay, columns are calendar months.
//
// Rows: what comes in, what goes out, goal and debt payments, logged
// spending, and what's left over; then what to send to an account in
// another currency, what's still owed on each debt and what's saved. Each
// row keeps its own currency; totals are in your home currency.

import { addDays, addMonths, parseDate, startOfDay } from '@suite/dates'
import { expectedBalance, movementsBetween, onBalance, spendingAccount, type Account, type Audit, type MoneyData } from './accounts'
import { lineItemsInMonth, type FinanceEvent } from './entries'
import { mainPay } from './forward'
import { schedule, type FinanceGoal } from './goals'

export interface Period {
  start: Date
  /** The first day of the next period (not included). */
  end: Date
}

export interface Cell {
  amount: number
  /** Still an estimate: a varying amount not yet confirmed. */
  estimate: boolean
}

export interface Row {
  key: string
  title: string
  currency: string
  /** What tapping the row opens. */
  ref?: { type: 'entry' | 'goal'; id: string }
  cells: (Cell | null)[]
}

export interface MonthsGrid {
  periods: Period[]
  /** Which column today is in. */
  current: number
  /** True when columns follow your pay; false for calendar months. */
  byPay: boolean
  income: Row[]
  outgoing: Row[]
  goals: Row[]
  spending: Row | null
  /** In home currency. */
  leftOver: Cell[]
  totalIn: Cell[]
  totalOut: Cell[]
  /** What to send to each current account in another currency (its currency); past columns show what was sent. */
  transfers: Row[]
  /** Still owed after each period, per debt; and the total in home currency. */
  owed: Row[]
  owedTotal: Cell[]
  /** Saved (or put aside) by the end of each period, per saving goal. */
  saved: Row[]
}

export interface MonthsOptions {
  paydayEntryID?: string
  home: string
  currencyOf: (a: Account | undefined) => string
  goalCurrency: (g: FinanceGoal) => string
  entryCurrency: (e: FinanceEvent) => string
  /** Any amount into home currency (unconverted if there's no rate). */
  toHome: (amount: number, currency: string) => number
  before?: number
  after?: number
}

/** Pay periods around today: from each payday to the day before the next (or calendar months). */
export function payPeriods(events: FinanceEvent[], paydayEntryID: string | undefined, today: Date, before = 1, after = 10): { periods: Period[]; byPay: boolean } {
  const pay = mainPay(events, paydayEntryID, today)
  const anchor = pay ? startOfDay(parseDate(pay.date)) : undefined
  const repeating = pay?.repeats && pay.frequency !== 'none'
  const boundary = (k: number): Date => {
    if (!anchor || !repeating) return new Date(today.getFullYear(), today.getMonth() + k, 1)
    if (pay.frequency === 'weekly') return addDays(anchor, 7 * k)
    if (pay.frequency === 'fortnightly') return addDays(anchor, 14 * k)
    return addMonths(anchor, k)
  }
  // The period today is in: the last boundary on or before today.
  const t = startOfDay(today)
  let k = 0
  if (anchor && repeating) {
    const step = pay.frequency === 'weekly' ? 7 : pay.frequency === 'fortnightly' ? 14 : 30.44
    k = Math.floor((t.getTime() - anchor.getTime()) / (step * 86_400_000))
    while (boundary(k) > t) k--
    while (boundary(k + 1) <= t) k++
  }
  const periods: Period[] = []
  for (let i = k - before; i <= k + after; i++) periods.push({ start: boundary(i), end: boundary(i + 1) })
  return { periods, byPay: Boolean(anchor && repeating) }
}

const inPeriod = (d: Date, p: Period) => d >= p.start && d < p.end
const round2 = (n: number) => Math.round(n * 100) / 100
const sumCells = (cells: (Cell | null)[][], col: number) => {
  let amount = 0
  let estimate = false
  for (const row of cells) {
    const c = row[col]
    if (!c) continue
    amount += c.amount
    estimate ||= c.estimate
  }
  return { amount: round2(amount), estimate }
}

/** Every occurrence of these entries in a period, with its amount. */
function itemsIn(events: FinanceEvent[], p: Period) {
  const out: ReturnType<typeof lineItemsInMonth> = []
  for (let m = new Date(p.start.getFullYear(), p.start.getMonth(), 1); m < p.end; m = addMonths(m, 1)) {
    for (const item of lineItemsInMonth(events, m)) if (inPeriod(item.date, p)) out.push(item)
  }
  return out
}

export function monthsGrid(data: MoneyData & { audits: Audit[] }, options: MonthsOptions, today: Date = new Date()): MonthsGrid {
  const { periods, byPay } = payPeriods(data.events, options.paydayEntryID, today, options.before ?? 1, options.after ?? 10)
  const current = Math.max(0, periods.findIndex(p => inPeriod(startOfDay(today), p)))
  const toHome = (c: Cell, currency: string): Cell => ({ amount: options.toHome(c.amount, currency), estimate: c.estimate })

  // Entries, one row per title and currency (a one-off pay and the repeating pay after it share a row).
  const entryRows = (type: 'income' | 'expense') => {
    const groups = new Map<string, FinanceEvent[]>()
    for (const e of data.events.filter(x => x.entryType === type)) {
      const key = `${e.title.trim().toLowerCase()}|${options.entryCurrency(e)}`
      groups.set(key, [...(groups.get(key) ?? []), e])
    }
    const rows: Row[] = []
    for (const [key, events] of groups) {
      const cells = periods.map(p => {
        const items = itemsIn(events, p)
        if (!items.length) return null
        return { amount: round2(items.reduce((a, i) => a + i.amount, 0)), estimate: items.some(i => !i.confirmed) }
      })
      if (cells.every(c => c === null)) continue
      // The row opens the entry that's still running (or the latest).
      const open = [...events].sort((a, b) => b.date.localeCompare(a.date))[0]
      rows.push({ key, title: events[0].title || 'Untitled', currency: options.entryCurrency(events[0]), ref: { type: 'entry', id: open.id }, cells })
    }
    return rows
  }
  const income = entryRows('income')
  const outgoing = entryRows('expense')

  // Goal and debt payments, from each goal's plan (on its real balance, if linked).
  const real = data.goals.map(g => onBalance(g, data.accounts, data.audits, data, today))
  const goals: Row[] = []
  for (const g of real) {
    const plan = schedule(g)
    const cells = periods.map(p => {
      const ps = plan.filter(x => inPeriod(x.date, p) && x.amount > 0)
      // The plan itself, not an estimate: only amounts marked as varying show amber.
      return ps.length ? { amount: round2(ps.reduce((a, x) => a + x.amount, 0)), estimate: false } : null
    })
    if (cells.every(c => c === null)) continue
    goals.push({ key: g.id, title: g.title || 'Goal', currency: options.goalCurrency(g), ref: { type: 'goal', id: g.id }, cells })
  }

  // Logged spending, in home currency (each spend in its account's currency).
  const spendCells = periods.map(p => {
    const es = data.spending.filter(e => inPeriod(parseDate(e.date), p))
    if (!es.length) return null
    const accountOf = (id?: string) => data.accounts.find(a => a.id === id)
    return { amount: round2(es.reduce((a, e) => a + options.toHome(e.amount, options.currencyOf(accountOf(e.accountID))), 0)), estimate: false }
  })
  const spending: Row | null = spendCells.some(Boolean) ? { key: 'spending', title: 'Logged spending', currency: options.home, cells: spendCells } : null

  // Totals in home currency.
  const homeCells = (rows: Row[]) => rows.map(r => r.cells.map(c => (c ? toHome(c, r.currency) : null)))
  const inCells = homeCells(income)
  const outCells = [...homeCells(outgoing), ...homeCells(goals), ...(spending ? [spending.cells] : [])]
  const totalIn = periods.map((_, i) => sumCells(inCells, i))
  const totalOut = periods.map((_, i) => sumCells(outCells, i))
  const leftOver = periods.map((_, i) => ({ amount: round2(totalIn[i].amount - totalOut[i].amount), estimate: totalIn[i].estimate || totalOut[i].estimate }))

  // What to send to current accounts in another currency: enough each period that they never go below zero.
  const main = spendingAccount(data.accounts)
  const transfers: Row[] = []
  for (const acc of data.accounts) {
    if (acc.kind !== 'current' || acc.id === main?.id || options.currencyOf(acc) === options.currencyOf(main)) continue
    let running = expectedBalance(acc, data.audits, data, today)?.expected ?? 0
    const cells = periods.map((p, i): Cell | null => {
      if (i < current) {
        // Past: what was actually sent.
        const sent = (data.transfers ?? []).filter(t => t.toAccountID === acc.id && inPeriod(parseDate(t.date), p)).reduce((a, t) => a + t.amountIn, 0)
        return sent ? { amount: round2(sent), estimate: false } : null
      }
      const from = i === current ? startOfDay(today) : addDays(p.start, -1)
      const moves = movementsBetween(acc, data, from, addDays(p.end, -1))
      let low = running
      let r = running
      for (const m of moves) {
        r += m.amount
        low = Math.min(low, r)
      }
      const need = low < 0 ? Math.ceil(-low) : 0
      running = r + need
      return need ? { amount: need, estimate: false } : null
    })
    transfers.push({ key: `send-${acc.id}`, title: `To ${acc.name || 'other account'}`, currency: options.currencyOf(acc), cells })
  }

  // Debts: still owed at each period's end. Savings: saved by then.
  const owed: Row[] = []
  const saved: Row[] = []
  for (const g of real) {
    const plan = schedule(g)
    const paidBy = (end: Date) => plan.filter(x => x.date < end).reduce((a, x) => a + x.amount, 0)
    const currency = options.goalCurrency(g)
    if (g.kind === 'debt') {
      owed.push({
        key: `owed-${g.id}`, title: g.title || 'Debt', currency, ref: { type: 'goal', id: g.id },
        cells: periods.map(p => ({ amount: round2(Math.max(0, g.targetAmount - paidBy(p.end))), estimate: false })),
      })
    } else {
      saved.push({
        key: `saved-${g.id}`, title: g.title || 'Saving', currency, ref: { type: 'goal', id: g.id },
        cells: periods.map(p => ({ amount: round2(Math.min(g.targetAmount || Infinity, g.startingAmount + paidBy(p.end))), estimate: false })),
      })
    }
  }
  const owedTotal = periods.map((_, i) => sumCells(owed.map(r => [toHome(r.cells[i]!, r.currency)]), 0))

  return { periods, current, byPay, income, outgoing, goals, spending, leftOver, totalIn, totalOut, transfers, owed, owedTotal, saved }
}

/** "Nov" for a period (the month most of it falls in), and "28 Oct" for where it starts. */
export function periodLabel(p: Period, byPay: boolean): { month: string; from: string } {
  const middle = new Date((p.start.getTime() + p.end.getTime()) / 2)
  return {
    // Another year says so: "Jan ’27".
    month: middle.toLocaleDateString(undefined, { month: 'short' }) + (middle.getFullYear() !== new Date().getFullYear() ? ` ’${String(middle.getFullYear()).slice(2)}` : ''),
    from: byPay ? p.start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '',
  }
}

