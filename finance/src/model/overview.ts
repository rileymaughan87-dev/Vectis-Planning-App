// The Months overview (option C, Oct 2026) and the debt runway, worked out
// from the Months grid and the goals — pure, so they're tested on their own.
//
//   periodStatement  one period as a statement: what came in, the four
//                    groups it went to (bills, living, set aside, debts),
//                    and what's left — the detail under the strip.
//   roomInPlan       the first month from now with money not yet given a
//                    job ("From April, £1,187 a month isn't planned yet").
//   debtRunway       each debt on one timeline from now to its last
//                    payment, and the total owed month by month — with any
//                    debt that has no plan yet left honestly at the end.

import { addMonths, startOfDay } from '@suite/dates'
import { schedule, type FinanceGoal } from './goals'
import type { Cell, MonthsGrid, Period, Row } from './months'

export type AllocationID = 'bills' | 'living' | 'setAside' | 'debts'

/** Fixed colours for the four groups (never colour alone: each has a labelled head too). */
export const ALLOCATION: Record<AllocationID, { title: string; colour: string }> = {
  bills: { title: 'Bills', colour: '#0068B5' },
  living: { title: 'Living', colour: '#7C9473' },
  setAside: { title: 'Set aside', colour: '#6B4C7A' },
  debts: { title: 'Debts', colour: '#C9922E' },
}

export interface StatementLine {
  key: string
  title: string
  note?: string
  amount: number
  currency: string
  estimate: boolean
  ref?: Row['ref']
}

export interface StatementGroup {
  id: AllocationID
  title: string
  colour: string
  /** In home currency. */
  total: number
  /** Share of what came in (or of what went out, if that's more), 0–1. */
  share: number
  estimate: boolean
  lines: StatementLine[]
}

export interface PeriodStatement {
  period: Period
  index: number
  totalIn: Cell
  leftOver: Cell
  groups: StatementGroup[]
  /** Money not given a job (left over above nothing), and how far short (if out is more than in). */
  unplanned: number
  short: number
  /** Still owed after the period (home currency), and the change over it. */
  owedAfter?: number
  owedChange?: number
}

const sumHome = (rows: Row[], i: number, toHome: (n: number, c: string) => number) =>
  rows.reduce((a, r) => a + (r.cells[i] ? toHome(r.cells[i]!.amount, r.currency) : 0), 0)

/** One period as a statement, from the grid. */
export function periodStatement(grid: MonthsGrid, index: number, toHome: (n: number, c: string) => number): PeriodStatement {
  const groupRows = (id: 'setAside' | 'debts') => grid.groups.find(g => g.id === id)?.rows ?? []
  const sources: Record<AllocationID, Row[]> = {
    bills: grid.bills,
    living: [...grid.living, ...(grid.spending ? [grid.spending] : [])],
    setAside: groupRows('setAside'),
    debts: groupRows('debts'),
  }
  const totalIn = grid.totalIn[index]
  const totalOut = grid.totalOut[index].amount
  const base = Math.max(totalIn.amount, totalOut, 1)
  const groups: StatementGroup[] = []
  for (const id of Object.keys(ALLOCATION) as AllocationID[]) {
    const rows = sources[id].filter(r => r.cells[index] && Math.abs(r.cells[index]!.amount) >= 0.005)
    if (!rows.length) continue
    const total = Math.round(sumHome(rows, index, toHome) * 100) / 100
    groups.push({
      id, ...ALLOCATION[id], total, share: total / base,
      estimate: rows.some(r => r.cells[index]!.estimate),
      lines: rows.map(r => ({ key: r.key, title: r.title, note: r.note, amount: r.cells[index]!.amount, currency: r.currency, estimate: r.cells[index]!.estimate, ref: r.ref })),
    })
  }
  const left = grid.leftOver[index]
  const owedAfter = grid.owed.length ? grid.owedTotal[index]?.amount : undefined
  const owedBefore = grid.owed.length && index > 0 ? grid.owedTotal[index - 1]?.amount : undefined
  return {
    period: grid.periods[index],
    index,
    totalIn,
    leftOver: left,
    groups,
    unplanned: Math.max(0, Math.round(left.amount * 100) / 100),
    short: Math.max(0, Math.round(-left.amount * 100) / 100),
    owedAfter,
    owedChange: owedAfter !== undefined && owedBefore !== undefined ? Math.round((owedAfter - owedBefore) * 100) / 100 : undefined,
  }
}

/**
 * Money not given a job yet. Preferably the month from which every month
 * after has some ("from April, … a month") — the signal that matters —
 * else the first single month with some.
 */
export function roomInPlan(grid: MonthsGrid): { index: number; amount: number; ongoing: boolean } | null {
  const paid = (i: number) => grid.totalIn[i].amount > 0
  const room = (i: number) => paid(i) && grid.leftOver[i].amount >= 0.5
  const ahead = grid.periods.map((_, i) => i).filter(i => i >= grid.current && paid(i))
  for (const i of ahead) {
    const rest = ahead.filter(k => k > i)
    // Ongoing: the least of those months, so "at least … a month" is always true.
    if (room(i) && rest.length > 0 && rest.every(room)) {
      return { index: i, amount: Math.round(Math.min(...[i, ...rest].map(k => grid.leftOver[k].amount))), ongoing: true }
    }
  }
  const first = ahead.find(room)
  return first === undefined ? null : { index: first, amount: Math.round(grid.leftOver[first].amount), ongoing: false }
}

// MARK: - Debt runway

export interface RunwayDebt {
  id: string
  title: string
  currency: string
  /** Still owed now, in its currency. */
  remaining: number
  /** The regular payment, if there's a plan. */
  payment?: { amount: number; frequency: FinanceGoal['frequency'] }
  /** First and last planned payment still to come; none for a debt without a plan. */
  start?: Date
  finish?: Date
}

export interface DebtRunway {
  start: Date
  end: Date
  debts: RunwayDebt[]
  /** The first of each month from now to the end, with everything still owed then (home currency). */
  monthly: { month: Date; owed: number }[]
  /** Owed at the end with no plan to pay it (home currency) — the honest finish line. */
  leftAtEnd: number
  /** When everything planned is paid (the last payment), if anything is. */
  lastPayment?: Date
}

/** Every debt on one timeline from today to the last planned payment (at least a year, at most ten). */
export function debtRunway(goals: FinanceGoal[], currencyOf: (g: FinanceGoal) => string, toHome: (n: number, c: string) => number, today: Date = new Date()): DebtRunway {
  const t = startOfDay(today)
  const debts: RunwayDebt[] = []
  const plans = new Map<string, ReturnType<typeof schedule>>()
  for (const g of goals.filter(x => x.kind === 'debt')) {
    const plan = schedule(g)
    plans.set(g.id, plan)
    const paid = plan.filter(p => p.confirmed || p.date < t).reduce((a, p) => a + p.amount, 0)
    const remaining = Math.max(0, Math.round((g.targetAmount - paid) * 100) / 100)
    if (remaining < 0.005) continue
    const ahead = plan.filter(p => !(p.confirmed || p.date < t) && p.amount > 0)
    debts.push({
      id: g.id, title: g.title || 'Debt', currency: currencyOf(g), remaining,
      payment: g.paymentAmount > 0 && ahead.length ? { amount: g.paymentAmount, frequency: g.frequency } : undefined,
      start: ahead[0]?.date, finish: ahead.at(-1)?.date,
    })
  }
  const lastPayment = debts.map(d => d.finish).filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime())[0]
  const startMonth = new Date(t.getFullYear(), t.getMonth(), 1)
  const minEnd = addMonths(startMonth, 12)
  const maxEnd = addMonths(startMonth, 120)
  // Run to the month after the last payment, so the line ends with it paid.
  const afterLast = lastPayment ? addMonths(new Date(lastPayment.getFullYear(), lastPayment.getMonth(), 1), 1) : undefined
  let end = afterLast && afterLast > minEnd ? afterLast : minEnd
  if (end > maxEnd) end = maxEnd

  // Owed on the first of each month: what's left after the payments before it.
  const monthly: DebtRunway['monthly'] = []
  for (let m = startMonth; m <= end; m = addMonths(m, 1)) {
    let owed = 0
    for (const d of debts) {
      const plan = plans.get(d.id)!
      const paidBy = plan.filter(p => !(p.confirmed || p.date < t) && p.date < m).reduce((a, p) => a + p.amount, 0)
      owed += toHome(Math.max(0, d.remaining - paidBy), d.currency)
    }
    monthly.push({ month: m, owed: Math.round(owed * 100) / 100 })
  }
  const leftAtEnd = debts.filter(d => !d.payment).reduce((a, d) => a + toHome(d.remaining, d.currency), 0)
  // Biggest first, the unplanned at the bottom.
  debts.sort((a, b) => Number(!a.payment) - Number(!b.payment) || (a.finish?.getTime() ?? 0) - (b.finish?.getTime() ?? 0))
  return { start: startMonth, end, debts, monthly, leftAtEnd: Math.round(leftAtEnd * 100) / 100, lastPayment }
}
