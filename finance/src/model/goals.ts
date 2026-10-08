// Saving, set-asides and debts, ported from FinanceGoalModels.swift. All
// three are a target broken into regular payments. Planned payments
// aren't stored — `schedule` works them out — only what actually happened
// is, in `payments` (day key → amount; 0 means skipped).
//
// Saved in the iPhone app's finance_goals.json shape, plus
// "fortnightly" for payments every two weeks.

import { addDays, addMonths, dayFromKey, dayKey, parseDate, startOfDay, toISO, weekday, type ISODate } from '@suite/dates'
import { list, num, oneOf, optNum, optStr, record, str, type Raw } from '@suite/decode'
import { newID } from '@suite/ids'

export type GoalKind = 'savings' | 'setAside' | 'debt'
export type GoalFrequency = 'monthly' | 'weekly' | 'fortnightly'

export const GOAL_KINDS: GoalKind[] = ['savings', 'setAside', 'debt']

export const kindInfo: Record<GoalKind, { label: string; section: string; target: string; placeholder: string; empty: string; accent: string }> = {
  savings: {
    label: 'Saving', section: 'Saving', target: 'Target', placeholder: 'e.g. Holiday', accent: 'var(--primary)',
    empty: "Something you're building up money for.",
  },
  setAside: {
    label: 'Set-aside', section: 'Set-asides', target: 'Amount needed', placeholder: 'e.g. Christmas', accent: 'var(--secondary)',
    empty: "A cost that comes round now and then — spread it out so it isn't a surprise.",
  },
  // Tertiary rather than a red: a debt you're paying off isn't a warning.
  debt: {
    label: 'Debt', section: 'Debts', target: 'Amount owed now', placeholder: 'e.g. Credit card', accent: 'var(--tertiary)',
    empty: "Something you're paying off, broken into regular payments.",
  },
}

export interface FinanceGoal {
  id: string
  title: string
  kind: GoalKind
  targetAmount: number
  /** Saved before the goal was added. Not used for debts (target is already what's left). */
  startingAmount: number
  targetDate?: ISODate
  paymentAmount: number
  frequency: GoalFrequency
  /** 1 = Sunday … 7 = Saturday; weekly only, always the first payment's weekday. */
  weekday?: number
  firstPaymentDate: ISODate
  /** What was actually paid, by day key. 0 = skipped. */
  payments: Record<string, number>
}

export interface GoalPayment {
  goalID: string
  title: string
  kind: GoalKind
  date: Date
  amount: number
  confirmed: boolean
}

// MARK: - Reading saved data

export function decodeGoal(r: Raw): FinanceGoal {
  return {
    id: str(r.id, newID()),
    title: str(r.title, ''),
    kind: oneOf(r.kind, GOAL_KINDS, 'savings'),
    targetAmount: num(r.targetAmount, 0),
    startingAmount: num(r.startingAmount, 0),
    targetDate: optStr(r.targetDate),
    paymentAmount: num(r.paymentAmount, 0),
    // The iPhone app wrote "none" for an unset plan; that meant monthly.
    frequency: oneOf(r.frequency, ['monthly', 'weekly', 'fortnightly'] as const, 'monthly'),
    weekday: optNum(r.weekday),
    firstPaymentDate: str(r.firstPaymentDate, toISO(startOfDay(new Date()))),
    payments: record(r.payments, x => optNum(x)),
  }
}

export const decodeGoals = (v: unknown) => list(v, decodeGoal)

export function makeGoal(fields: Partial<FinanceGoal> & Pick<FinanceGoal, 'title' | 'kind'>): FinanceGoal {
  return {
    id: newID(), targetAmount: 0, startingAmount: 0, paymentAmount: 0, frequency: 'monthly',
    firstPaymentDate: toISO(startOfDay(new Date())), payments: {},
    ...fields,
  }
}

// MARK: - Progress

export function amountPaid(goal: FinanceGoal): number {
  const recorded = Object.values(goal.payments).reduce((a, b) => a + b, 0)
  return (goal.kind === 'debt' ? 0 : goal.startingAmount) + recorded
}

export const amountRemaining = (goal: FinanceGoal) => Math.max(goal.targetAmount - amountPaid(goal), 0)
export const isComplete = (goal: FinanceGoal) => goal.targetAmount > 0 && amountRemaining(goal) < 0.005
export const progress = (goal: FinanceGoal) => (goal.targetAmount > 0 ? Math.min(amountPaid(goal) / goal.targetAmount, 1) : 0)

// MARK: - The plan

/** The nth date the plan lands on (0 = the first payment). */
export function plannedDate(goal: FinanceGoal, n: number): Date {
  const start = startOfDay(parseDate(goal.firstPaymentDate))
  switch (goal.frequency) {
    case 'weekly': {
      // The first matching weekday on or after the start (older saves may name a different day).
      const wanted = goal.weekday ?? weekday(start)
      return addDays(start, ((wanted - weekday(start) + 7) % 7) + 7 * n)
    }
    case 'fortnightly':
      return addDays(start, 14 * n)
    case 'monthly':
      // Same day each month, clamped to short months.
      return addMonths(start, n)
  }
}

/** A cap rather than "forever", so a tiny payment against a huge target can't hang the page. */
const MAX_PAYMENTS = 520

/**
 * Every payment: confirmed ones from the record, then planned ones for
 * whatever's still needed. A skipped payment (recorded as 0) pushes the
 * plan one further out; paying extra brings the end closer.
 */
export function schedule(goal: FinanceGoal): GoalPayment[] {
  const out: GoalPayment[] = []
  let stillNeeded = amountRemaining(goal)
  const visited = new Set<string>()
  const lastRecorded = Object.keys(goal.payments).sort().at(-1) ?? ''
  const pay = (date: Date, amount: number, confirmed: boolean): GoalPayment =>
    ({ goalID: goal.id, title: goal.title, kind: goal.kind, date, amount, confirmed })

  for (let n = 0; n < MAX_PAYMENTS; n++) {
    const date = plannedDate(goal, n)
    const key = dayKey(date)
    const planDone = stillNeeded < 0.005 || goal.paymentAmount <= 0
    if (planDone && key > lastRecorded) break
    visited.add(key)
    const paid = goal.payments[key]
    if (paid !== undefined) {
      out.push(pay(date, paid, true))
    } else if (!planDone) {
      const planned = Math.min(goal.paymentAmount, stillNeeded)
      stillNeeded -= planned
      out.push(pay(date, Math.round(planned * 100) / 100, false))
    }
  }
  // Extra payments on days the plan doesn't land on.
  for (const [key, paid] of Object.entries(goal.payments)) {
    if (!visited.has(key)) out.push(pay(dayFromKey(key), paid, true))
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime())
}

/** The last planned payment — when the goal is on course to be done. */
export function projectedFinish(goal: FinanceGoal, payments: GoalPayment[] = schedule(goal)): Date | undefined {
  if (isComplete(goal)) return undefined
  return payments.filter(p => !p.confirmed).at(-1)?.date
}

/** The payment each time that reaches the target by its date, rounded up to a whole unit. */
export function suggestedPayment(goal: FinanceGoal, today: Date = new Date()): number | undefined {
  if (!goal.targetDate || amountRemaining(goal) <= 0) return undefined
  const end = startOfDay(parseDate(goal.targetDate))
  const from = startOfDay(today)
  let count = 0
  for (let n = 0; n < MAX_PAYMENTS; n++) {
    const d = plannedDate(goal, n)
    if (d > end) break
    // Only payments still to come can help; past unrecorded ones are gone.
    if (d >= from && goal.payments[dayKey(d)] === undefined) count++
  }
  return count > 0 ? Math.ceil(amountRemaining(goal) / count) : undefined
}

export type Pace = { kind: 'onTrack' } | { kind: 'late'; finish: Date; needed?: number } | { kind: 'noPlan' }

/** How the plan sits against the date aimed for, if there is one. */
export function pace(goal: FinanceGoal, today: Date = new Date()): Pace | undefined {
  if (!goal.targetDate || isComplete(goal)) return undefined
  if (goal.paymentAmount <= 0) return { kind: 'noPlan' }
  const finish = projectedFinish(goal)
  if (!finish || finish <= startOfDay(parseDate(goal.targetDate))) return { kind: 'onTrack' }
  return { kind: 'late', finish, needed: suggestedPayment(goal, today) }
}

/** The next payment to deal with: the earliest one not yet confirmed. */
export const nextPayment = (payments: GoalPayment[]) => payments.find(p => !p.confirmed)

/** A planned payment whose day has come without being confirmed. */
export const isDue = (p: GoalPayment, today: Date = new Date()) => !p.confirmed && p.date <= startOfDay(today)

// MARK: - Across goals

export function goalPaymentsInMonth(goals: FinanceGoal[], month: Date): GoalPayment[] {
  const start = new Date(month.getFullYear(), month.getMonth(), 1)
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 1)
  return goals.flatMap(schedule).filter(p => p.date >= start && p.date < end).sort((a, b) => a.date.getTime() - b.date.getTime())
}

export function goalPaymentsOn(goals: FinanceGoal[], day: Date): GoalPayment[] {
  const key = dayKey(day)
  return goalPaymentsInMonth(goals, day).filter(p => dayKey(p.date) === key)
}

export function planText(goal: Pick<FinanceGoal, 'frequency' | 'paymentAmount'>, money: (n: number) => string): string {
  if (goal.paymentAmount <= 0) return 'No regular payment set'
  const per = goal.frequency === 'weekly' ? 'a week' : goal.frequency === 'fortnightly' ? 'every 2 weeks' : 'a month'
  return `${money(goal.paymentAmount)} ${per}`
}
