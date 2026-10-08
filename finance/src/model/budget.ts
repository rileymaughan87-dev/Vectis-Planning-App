// One month's money in plain totals and sorted lines, ported from
// MonthSummary.swift (MonthSummary and MonthBudget). The Budget and
// Calendar tabs both read from here, so they always agree.
//
// "Spending" is money that actually leaves: fixed and flexible expenses
// plus debt payments. Saving and set-asides stay in the same account, so
// they come out of what's left over rather than counting as spending.
//
// New: `typicalMonth`, what an average month looks like once weekly and
// fortnightly amounts are spread evenly — a month with five paydays or
// five grocery runs otherwise looks better or worse than it is.

import { dayKey } from '@suite/dates'
import { lineItemsInMonth, occurrencesInMonth, type FinanceEvent } from './entries'
import { goalPaymentsInMonth, type FinanceGoal } from './goals'
import { flexibleForMonth, type SpendingEntry, type SpendingPot } from './spending'

/** Logged spending and the weekly pot, when there are any. */
export interface Spending {
  entries: SpendingEntry[]
  pot: SpendingPot
}

export interface MonthSummary {
  month: Date
  income: number
  fixed: number
  flexible: number
  debtPayments: number
  /** Planned or confirmed payments into saving and set-asides. */
  goalSavings: number
  /** How much of this month is still an unconfirmed estimate. */
  estimated: number
  /** The weekly pot's share of days still to come — part of `flexible`, but a plan. */
  flexiblePlanned: number
  spending: number
  /** Income minus spending: the most this month could put towards saving. */
  leftOver: number
  /** Left over after saving and set-asides have had their share. */
  stillFree: number
}

export function monthSummary(events: FinanceEvent[], goals: FinanceGoal[], month: Date, logged?: Spending, today: Date = new Date()): MonthSummary {
  const items = lineItemsInMonth(events, month)
  const sum = (f: (i: (typeof items)[number]) => boolean) => items.filter(f).reduce((a, i) => a + i.amount, 0)
  const payments = goalPaymentsInMonth(goals, month)
  const income = sum(i => i.event.entryType === 'income')
  const fixed = sum(i => i.event.entryType === 'expense' && i.event.expenseCategory === 'fixed')
  // Anything not marked fixed counts as flexible, so totals always add up.
  // Plus spending actually logged, and the pot's plan for days still to come.
  const pot = logged ? flexibleForMonth(logged.entries, logged.pot, month, today) : { spent: 0, planned: 0 }
  const flexible = sum(i => i.event.entryType === 'expense') - fixed + pot.spent + pot.planned
  const debtPayments = payments.filter(p => p.kind === 'debt').reduce((a, p) => a + p.amount, 0)
  const goalSavings = payments.filter(p => p.kind !== 'debt').reduce((a, p) => a + p.amount, 0)
  const spending = fixed + flexible + debtPayments
  return {
    month: new Date(month.getFullYear(), month.getMonth(), 1),
    income, fixed, flexible, debtPayments, goalSavings, spending,
    estimated: sum(i => !i.confirmed),
    flexiblePlanned: pot.planned,
    leftOver: income - spending,
    stillFree: income - spending - goalSavings,
  }
}

// MARK: - Lines

export type LineSource = { kind: 'entry'; event: FinanceEvent } | { kind: 'goal'; goal: FinanceGoal } | { kind: 'pot' }

export interface BudgetLine {
  id: string
  title: string
  /** How often, in a few words: "Weekly · 5 this month", "Monthly · 3 Oct". */
  detail: string
  amount: number
  /** Any of this month's amounts still an estimate. */
  isEstimate: boolean
  source: LineSource
}

export interface MonthBudget {
  income: BudgetLine[]
  fixed: BudgetLine[]
  flexible: BudgetLine[]
  debts: BudgetLine[]
  savings: BudgetLine[]
}

const shortDay = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

function detail(frequency: string, dates: Date[], skipped = 0): string {
  const bits: string[] = []
  if (frequency === 'weekly') bits.push(`Weekly · ${dates.length} this month`)
  else if (frequency === 'fortnightly') bits.push(`Every 2 weeks · ${dates.length} this month`)
  else if (frequency === 'monthly') bits.push(`Monthly · ${shortDay(dates[0])}`)
  else bits.push(dates.map(shortDay).join(', '))
  if (skipped > 0) bits.push(`${skipped} skipped`)
  return bits.join(' · ')
}

/** The month line by line, sorted into sections, largest first in each. */
export function monthBudget(events: FinanceEvent[], goals: FinanceGoal[], month: Date, logged?: Spending, money?: (n: number) => string, today: Date = new Date()): MonthBudget {
  const budget: MonthBudget = { income: [], fixed: [], flexible: [], debts: [], savings: [] }

  for (const event of events) {
    const items = lineItemsInMonth([event], month)
    if (items.length === 0) continue
    const line: BudgetLine = {
      id: event.id,
      title: event.title,
      detail: detail(event.repeats ? event.frequency : 'none', items.map(i => i.date)),
      amount: items.reduce((a, i) => a + i.amount, 0),
      isEstimate: items.some(i => !i.confirmed),
      source: { kind: 'entry', event },
    }
    if (event.entryType === 'income') budget.income.push(line)
    else if (event.expenseCategory === 'fixed') budget.fixed.push(line)
    else budget.flexible.push(line)
  }

  // Logged spending and the pot, as one line.
  if (logged) {
    const pot = flexibleForMonth(logged.entries, logged.pot, month, today)
    if (pot.spent > 0 || pot.planned > 0) {
      const fmt = money ?? ((n: number) => n.toFixed(2))
      budget.flexible.push({
        id: 'pot',
        title: logged.pot.isActive ? 'Weekly pot' : 'Logged spending',
        detail: [`${fmt(pot.spent)} spent`, ...(pot.planned > 0 ? [`about ${fmt(Math.round(pot.planned))} still to come`] : [])].join(' · '),
        amount: pot.spent + pot.planned,
        isEstimate: false,
        source: { kind: 'pot' },
      })
    }
  }

  const payments = goalPaymentsInMonth(goals, month)
  for (const goal of goals) {
    const mine = payments.filter(p => p.goalID === goal.id)
    if (mine.length === 0) continue
    const line: BudgetLine = {
      id: goal.id,
      title: goal.title,
      detail: detail(goal.frequency, mine.map(p => p.date), mine.filter(p => p.confirmed && p.amount === 0).length),
      amount: mine.reduce((a, p) => a + p.amount, 0),
      isEstimate: false,
      source: { kind: 'goal', goal },
    }
    if (goal.kind === 'debt') budget.debts.push(line)
    else budget.savings.push(line)
  }

  for (const section of Object.values(budget)) section.sort((a: BudgetLine, b: BudgetLine) => b.amount - a.amount)
  return budget
}

// MARK: - A typical month

const PER_MONTH = { monthly: 1, weekly: 52 / 12, fortnightly: 26 / 12 } as const

export interface TypicalMonth {
  income: number
  spending: number
  leftOver: number
}

/**
 * Repeating entries and goal plans still running in `month`, spread to an
 * average month (weekly × 52 ÷ 12, every 2 weeks × 26 ÷ 12). One-offs are
 * left out — they're exactly what a typical month doesn't have. A
 * running weekly pot counts as its weekly amount spread the same way.
 */
export function typicalMonth(events: FinanceEvent[], goals: FinanceGoal[], month: Date, pot?: SpendingPot): TypicalMonth {
  let income = 0
  let spending = 0
  for (const e of events) {
    if (!e.repeats || e.frequency === 'none' || occurrencesInMonth(e, month).length === 0) continue
    const amount = e.amount * PER_MONTH[e.frequency]
    if (e.entryType === 'income') income += amount
    else spending += amount
  }
  if (pot?.isActive) spending += pot.weeklyAmount * PER_MONTH.weekly
  // Debt payments still running this month count as spending.
  for (const debt of goals.filter(g => g.kind === 'debt' && g.paymentAmount > 0)) {
    if (goalPaymentsInMonth([debt], month).length > 0) spending += debt.paymentAmount * PER_MONTH[debt.frequency]
  }
  return { income, spending, leftOver: income - spending }
}

/** Months from `offset` before to after this one, for the trend. */
export function monthsAround(today: Date, before: number, after: number): Date[] {
  return Array.from({ length: before + after + 1 }, (_, i) => new Date(today.getFullYear(), today.getMonth() - before + i, 1))
}

export const monthKey = (d: Date) => dayKey(new Date(d.getFullYear(), d.getMonth(), 1))
