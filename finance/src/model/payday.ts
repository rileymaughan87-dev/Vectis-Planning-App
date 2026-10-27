// Payday (Finance pivot, Oct 2026): where the pay goes. Pay lands in one
// account; every other account has its own bills and spending in the
// budget (each entry says which account it comes out of). At payday each
// account is topped up to cover its budget for the pay period — less
// what's still in it — and goal payments (savings, investments, debts)
// go where they're planned. What stays in the pay account is what's left.
//
//   top-up = the account's budget for the period (its bills, everyday
//            spending, set-asides and goal payments, less any money that
//            lands in it) − what's in it at payday (from its last balance
//            check and everything since), never below nothing.
//
// The everyday account (groceries, fuel, fun) also shows what's left of
// its budget until payday, from the spends you log.

import { addDays, parseDate, startOfDay } from '@suite/dates'
import {
  accountKindInfo, entryAccount, expectedBalance, goalSource, movementsBetween, spendingAccount, type Account, type Audit, type MoneyData,
} from './accounts'
import { lineItemsInMonth, setAsideItems, type FinanceEvent } from './entries'
import { mainPay, nextOccurrence } from './forward'
import { schedule, type FinanceGoal } from './goals'

export interface Period { start: Date; end: Date }

const inPeriod = (d: Date, p: Period) => d >= p.start && d < p.end
const round2 = (n: number) => Math.round(n * 100) / 100
const months = (p: Period) => {
  const out: Date[] = []
  for (let m = new Date(p.start.getFullYear(), p.start.getMonth(), 1); m < p.end; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) out.push(m)
  return out
}

/** One account's budget for a period, in its own currency: what goes out of it less what lands in it (not counting transfers). */
export function accountBudget(account: Account, data: MoneyData, p: Period, goals: FinanceGoal[] = data.goals): { out: number; in: number; flexible: number } {
  const mine = data.events.filter(e => entryAccount(e, data.accounts)?.id === account.id)
  let out = 0
  let inn = 0
  let flexible = 0
  for (const m of months(p)) {
    for (const item of lineItemsInMonth(mine, m)) {
      if (!inPeriod(item.date, p)) continue
      if (item.event.entryType === 'income') inn += item.amount
      else {
        out += item.amount
        if (item.event.expenseCategory === 'flexible') flexible += item.amount
      }
    }
    for (const s of setAsideItems(mine, m)) if (inPeriod(s.date, p)) out += s.amount
  }
  for (const g of goals) {
    if (goalSource(g, data.accounts)?.id !== account.id) continue
    for (const pay of schedule(g)) if (inPeriod(pay.date, p) && pay.amount > 0) out += pay.amount
  }
  return { out: round2(out), in: round2(inn), flexible: round2(flexible) }
}

export interface TopUp {
  account: Account
  /** The account's budget for the period, less what lands in it (its own currency). */
  budget: number
  /** What's in it at payday, from its last check and everything since; 0 if it's never been checked. */
  carry: number
  checked: boolean
  /** What to send for the period, before anything's been sent. */
  need: number
  /** Sent to it already this period (logged transfers). */
  sent: number
  /** Still to send. */
  remaining: number
  /** The same in the pay account's currency, if there's a rate. */
  remainingInPay: number | null
}

export interface GoalLine {
  goal: FinanceGoal
  /** The account it goes into (a savings or investment account, or a card or loan), if linked. */
  to?: Account
  amount: number
  /** The planned payment dates in the period still to record. */
  dates: Date[]
  /** Recorded already this period. */
  done: boolean
}

export interface PaydayPlan {
  kind: 'ready'
  pay: FinanceEvent
  payAccount: Account
  /** This period: from the payday to the day before the next. */
  period: Period
  /** True once the payday has come (so it reads "Payday was …"). */
  passed: boolean
  payAmount: number
  payEstimate: boolean
  topUps: TopUp[]
  goals: GoalLine[]
  /** What the pay account itself spends this period (its own bills, set-asides). */
  ownBudget: number
  /** What stays in the pay account once everything's sent and its own bills are paid (pay account's currency). */
  stays: number
}

export type Payday = PaydayPlan | { kind: 'noPay' } | { kind: 'noAccount' }

/**
 * The payday plan: the coming payday, or the last one if it was in the
 * last few days (so there's time to send everything after the pay lands).
 */
export function payday(
  data: MoneyData & { audits: Audit[] },
  options: { paydayEntryID?: string; convert?: (amount: number, from: Account, to: Account) => number | null },
  today: Date = new Date(),
): Payday {
  if (!data.accounts.length) return { kind: 'noAccount' }
  const t = startOfDay(today)
  const pay = mainPay(data.events, options.paydayEntryID, addDays(t, -6))
  if (!pay) return { kind: 'noPay' }
  const payAccount = entryAccount(pay, data.accounts) ?? spendingAccount(data.accounts)
  if (!payAccount) return { kind: 'noAccount' }
  // The last payday up to 5 days ago, else the next one.
  const recent = nextOccurrence(pay, addDays(t, -6))
  const start = recent ?? t
  const end = nextOccurrence(pay, start) ?? addDays(start, 31)
  const period = { start, end }

  const payAmount = round2(lineItemsInMonth([pay], start).filter(i => inPeriod(i.date, period)).reduce((a, i) => a + i.amount, 0))
  const payEstimate = lineItemsInMonth([pay], start).some(i => inPeriod(i.date, period) && !i.confirmed)

  // Goal payments from the pay account go straight where they're planned; the rest are in their account's budget.
  const fromPay = data.goals.filter(g => goalSource(g, data.accounts)?.id === payAccount.id)
  const goals: GoalLine[] = []
  for (const g of fromPay) {
    const plan = schedule(g).filter(x => inPeriod(x.date, period) && x.amount > 0)
    if (!plan.length) continue
    goals.push({
      goal: g,
      to: data.accounts.find(a => a.id === g.accountID),
      amount: round2(plan.reduce((a, x) => a + x.amount, 0)),
      dates: plan.filter(x => !x.confirmed).map(x => x.date),
      done: plan.every(x => x.confirmed),
    })
  }

  // Every other everyday or bills account is topped up to its budget.
  const topUps: TopUp[] = []
  for (const account of data.accounts) {
    if (account.id === payAccount.id || account.kind !== 'current') continue
    const b = accountBudget(account, data, period)
    const budget = round2(b.out - b.in)
    if (budget <= 0) continue
    // In it at payday: its last check plus everything up to the day before.
    const exp = expectedBalance(account, data.audits, data, t)
    let carry = exp?.expected ?? 0
    if (exp && start > t) carry += movementsBetween(account, data, t, addDays(start, -1)).reduce((a, m) => a + m.amount, 0)
    if (exp && start <= t) {
      // The payday has come: what was there before it (undo what's happened since).
      carry -= movementsBetween(account, data, addDays(start, -1), t).reduce((a, m) => a + m.amount, 0)
    }
    carry = round2(Math.max(0, carry))
    const need = round2(Math.max(0, budget - carry))
    const sent = round2((data.transfers ?? [])
      .filter(x => x.toAccountID === account.id && inPeriod(startOfDay(parseDate(x.date)), period))
      .reduce((a, x) => a + x.amountIn, 0))
    const remaining = round2(Math.max(0, need - sent))
    topUps.push({
      account, budget, carry, checked: Boolean(exp), need, sent, remaining,
      remainingInPay: remaining ? options.convert?.(remaining, account, payAccount) ?? null : 0,
    })
  }

  const own = accountBudget(payAccount, data, period, data.goals.filter(g => !fromPay.includes(g)))
  const ownBudget = round2(own.out - (own.in - payAmount))
  const sending = topUps.reduce((a, x) => a + (x.need ? options.convert?.(x.need, x.account, payAccount) ?? x.need : 0), 0)
  const toGoals = goals.reduce((a, x) => a + x.amount, 0)
  const stays = round2(payAmount - ownBudget - sending - toGoals)

  return { kind: 'ready', pay, payAccount, period, passed: start <= t, payAmount, payEstimate, topUps, goals, ownBudget, stays }
}

/** The everyday account: marked as such, else the current account with the most flexible spending in the budget. */
export function everydayAccount(data: MoneyData, p: Period): Account | undefined {
  const marked = data.accounts.find(a => a.everyday)
  if (marked) return marked
  const scored = data.accounts
    .filter(a => a.kind === 'current' || a.kind === 'credit')
    .map(a => ({ a, flexible: accountBudget(a, data, p, []).flexible }))
    .filter(x => x.flexible > 0)
    .sort((x, y) => y.flexible - x.flexible)
  return scored[0]?.a
}

/** What's left of the everyday budget this period, from the spends logged against the account. */
export function everydayLeft(account: Account, data: MoneyData, p: Period): { budget: number; spent: number; left: number } {
  const budget = accountBudget(account, data, p, []).flexible
  const isMain = spendingAccount(data.accounts)?.id === account.id
  const spent = round2(data.spending
    .filter(e => (e.accountID ?? (isMain ? account.id : undefined)) === account.id && inPeriod(startOfDay(parseDate(e.date)), p))
    .reduce((a, e) => a + e.amount, 0))
  return { budget, spent, left: round2(budget - spent) }
}

/** Accounts that hold money (not cards or loans). */
export const holdsMoney = (a: Account) => !accountKindInfo[a.kind].owed
