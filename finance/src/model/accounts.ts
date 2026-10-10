// Accounts and audits (Finance rework, stage 1 — docs/finance-rework-brief.md).
//
// Balances are the truth. Each account is optional: a current account,
// savings, a credit card, a loan — whatever you want to see. Now and then
// you *audit* one: type in what the bank says. Finance compares that with
// what it expected from the last audit plus everything since (pay, bills,
// goal payments, logged spending), and a gap can be noted in one tap as
// everyday spending (or extra money in). Each audit is a snapshot, so
// over time they show savings rising and debts falling — real, not planned.
//
// For a credit card or loan, the balance is what's owed (as on the
// statement): spending on a card makes it go up, paying it makes it go down.
//
// New with the web app (no iPhone file): accounts.json, account_audits.json.

import { addMonths, dayKey, parseDate, startOfDay, toISO, type ISODate } from '@suite/dates'
import { bool, list, num, oneOf, optNum, str, type Raw } from '@suite/decode'
import { newID } from '@suite/ids'
import { lineItemsInMonth, type FinanceEvent } from './entries'
import { schedule, type FinanceGoal } from './goals'
import type { SpendingEntry } from './spending'

export type AccountKind = 'current' | 'savings' | 'credit' | 'loan'

export const ACCOUNT_KINDS: AccountKind[] = ['current', 'savings', 'credit', 'loan']

export const accountKindInfo: Record<AccountKind, { label: string; owed: boolean; placeholder: string; help: string }> = {
  current: { label: 'Current account', owed: false, placeholder: 'e.g. HSBC current', help: 'Where pay lands and bills go out.' },
  savings: { label: 'Savings', owed: false, placeholder: 'e.g. Easy-access saver', help: 'Watch it grow, audit by audit.' },
  credit: { label: 'Credit card', owed: true, placeholder: 'e.g. Amex', help: 'What you owe on it. Spending you log on the card adds to it.' },
  loan: { label: 'Loan or other debt', owed: true, placeholder: 'e.g. Car loan', help: 'What you still owe. Watch it fall, audit by audit.' },
}

export interface Account {
  id: string
  name: string
  kind: AccountKind
  createdDate: ISODate
  /** The current account pay and bills go through (the first current account if none is marked). */
  primary: boolean
}

/** What a gap at an audit was put down to. */
export type GapNote = 'everyday' | 'extraIn' | 'left'

export interface Audit {
  id: string
  accountID: string
  /** When the balance was checked. */
  date: ISODate
  /** What the bank said: money in it, or owed for a card or loan. */
  balance: number
  /** What Finance expected then; unset for an account's first audit. */
  expected?: number
  gap?: GapNote
}

// MARK: - Reading saved data

function decodeAccount(r: Raw): Account {
  return {
    id: str(r.id, newID()),
    name: str(r.name, ''),
    kind: oneOf(r.kind, ACCOUNT_KINDS, 'current'),
    createdDate: str(r.createdDate, toISO(new Date())),
    primary: bool(r.primary, false),
  }
}

function decodeAudit(r: Raw): Audit | null {
  if (typeof r.accountID !== 'string' || typeof r.date !== 'string') return null
  return {
    id: str(r.id, newID()),
    accountID: r.accountID,
    date: r.date,
    balance: num(r.balance, 0),
    expected: optNum(r.expected),
    gap: r.gap === 'everyday' || r.gap === 'extraIn' || r.gap === 'left' ? r.gap : undefined,
  }
}

export const decodeAccounts = (v: unknown) => list(v, decodeAccount)
export const decodeAudits = (v: unknown) => list(v, decodeAudit)

// MARK: - Which account things go through

/** Pay, bills and goal payments go through this one, and spending logged without an account. */
export function spendingAccount(accounts: Account[]): Account | undefined {
  const current = accounts.filter(a => a.kind === 'current')
  return current.find(a => a.primary) ?? current[0]
}

/** Accounts spending can be logged against: current accounts and cards. */
export const spendableAccounts = (accounts: Account[]) => accounts.filter(a => a.kind === 'current' || a.kind === 'credit')

/** An account's audits, newest first. */
export function auditsFor(audits: Audit[], accountID: string): Audit[] {
  return audits.filter(a => a.accountID === accountID).sort((a, b) => b.date.localeCompare(a.date))
}

export const latestAudit = (audits: Audit[], accountID: string): Audit | undefined => auditsFor(audits, accountID)[0]

// MARK: - What's happened since an audit

export interface Movement {
  date: Date
  title: string
  /** The change to the account's balance: money in (+) or out (−); for a card or loan, owed going up (+) or down (−). */
  amount: number
  /** Still an estimate or a plan, not a confirmed figure. */
  estimate: boolean
}

export interface MoneyData {
  accounts: Account[]
  events: FinanceEvent[]
  goals: FinanceGoal[]
  spending: SpendingEntry[]
}

/**
 * Everything that changes an account after one day up to and including
 * another. Anything dated on an audit's own day is taken as already in
 * that audit's balance.
 */
export function movementsBetween(account: Account, data: MoneyData, after: Date, upTo: Date): Movement[] {
  const fromKey = dayKey(after)
  const toKey = dayKey(upTo)
  const inRange = (d: Date) => {
    const k = dayKey(d)
    return k > fromKey && k <= toKey
  }
  const isSpending = spendingAccount(data.accounts)?.id === account.id
  const out: Movement[] = []

  // Goal payments into a linked savings account, or off a linked card or loan.
  for (const g of data.goals) {
    if (g.accountID !== account.id) continue
    const sign = g.kind === 'debt' ? -1 : 1
    for (const p of schedule(g)) {
      if (inRange(p.date) && p.amount > 0) out.push({ date: p.date, title: g.title || 'Goal payment', amount: sign * p.amount, estimate: !p.confirmed })
    }
  }

  if (isSpending) {
    for (let m = new Date(after.getFullYear(), after.getMonth(), 1); m <= upTo; m = addMonths(m, 1)) {
      for (const item of lineItemsInMonth(data.events, m)) {
        if (!inRange(item.date)) continue
        const sign = item.event.entryType === 'income' ? 1 : -1
        out.push({ date: item.date, title: item.event.title || 'Untitled', amount: sign * item.amount, estimate: !item.confirmed })
      }
    }
    for (const p of data.goals.flatMap(schedule)) {
      if (inRange(p.date) && p.amount > 0) out.push({ date: p.date, title: p.title || 'Goal payment', amount: -p.amount, estimate: !p.confirmed })
    }
  }

  for (const e of data.spending) {
    const on = e.accountID ?? (isSpending ? account.id : undefined)
    if (on !== account.id) continue
    const d = parseDate(e.date)
    if (!inRange(d)) continue
    // Spending on a card adds to what's owed; from a current account, money goes out.
    out.push({ date: startOfDay(d), title: e.note || 'Spending', amount: account.kind === 'credit' ? e.amount : -e.amount, estimate: false })
  }

  return out.sort((a, b) => a.date.getTime() - b.date.getTime())
}

/** What an account should hold now (or be owed), from its last audit and everything since. */
export function expectedBalance(account: Account, audits: Audit[], data: MoneyData, today: Date = new Date()): { expected: number; since?: Audit; movements: Movement[] } | null {
  const since = latestAudit(audits, account.id)
  if (!since) return null
  const movements = movementsBetween(account, data, parseDate(since.date), today)
  const expected = round2(since.balance + movements.reduce((a, m) => a + m.amount, 0))
  return { expected, since, movements }
}

/**
 * How a newly checked balance compares with what was expected, in words
 * that don't judge: for money in an account, less than expected usually
 * means spending that wasn't logged; for a card, owing more does.
 */
export function describeGap(account: Account, actual: number, expected: number): { size: number; unlogged: boolean } | null {
  const diff = round2(actual - expected)
  if (Math.abs(diff) < 0.005) return null
  const owed = accountKindInfo[account.kind].owed
  // Unlogged spending: less money than expected, or more owed than expected.
  const unlogged = owed ? diff > 0 : diff < 0
  return { size: Math.abs(diff), unlogged }
}

// MARK: - Goals on real balances

/**
 * A goal measured on its linked account: the same goal, adjusted so that
 * what's been paid matches the account — saved so far for saving and
 * set-asides, what's still owed for a debt. Everything that reads a goal
 * (progress, the plan, "done around") then follows the real balance.
 * Unlinked, or before the account's first check, it's unchanged.
 */
export function onBalance(goal: FinanceGoal, accounts: Account[], audits: Audit[], data: MoneyData, today: Date = new Date()): FinanceGoal {
  const account = accounts.find(a => a.id === goal.accountID)
  if (!account) return goal
  const exp = expectedBalance(account, audits, data, today)
  if (!exp) return goal
  const recorded = Object.values(goal.payments).reduce((a, b) => a + b, 0)
  if (goal.kind === 'debt') return { ...goal, targetAmount: round2(Math.max(exp.expected, 0) + recorded) }
  return { ...goal, startingAmount: round2(exp.expected - recorded) }
}

/** Accounts a goal of this kind can sit on. */
export const goalAccounts = (accounts: Account[], kind: FinanceGoal['kind']) =>
  accounts.filter(a => (kind === 'debt' ? accountKindInfo[a.kind].owed : a.kind === 'savings'))

// MARK: - Over time

export interface MonthStanding {
  /** The first of the month. */
  month: Date
  /** Savings accounts, at their last check by the month's end. */
  saved: number
  /** Cards and loans. */
  owed: number
  /** Every account you have money in. */
  have: number
}

/**
 * Month by month from your first check: where each account stood at its
 * latest check by the end of that month. Built only from checks, so it's
 * what really happened, not the plan.
 */
export function monthlyStanding(accounts: Account[], audits: Audit[], today: Date = new Date()): MonthStanding[] {
  const mine = audits.filter(a => accounts.some(acc => acc.id === a.accountID))
  if (!mine.length) return []
  const first = mine.map(a => parseDate(a.date)).reduce((a, b) => (a < b ? a : b))
  const out: MonthStanding[] = []
  for (let m = new Date(first.getFullYear(), first.getMonth(), 1); m <= today; m = addMonths(m, 1)) {
    const end = addMonths(m, 1)
    let saved = 0
    let owed = 0
    let have = 0
    for (const acc of accounts) {
      const last = auditsFor(mine, acc.id).find(a => parseDate(a.date) < end)
      if (!last) continue
      if (accountKindInfo[acc.kind].owed) owed += last.balance
      else {
        have += last.balance
        if (acc.kind === 'savings') saved += last.balance
      }
    }
    out.push({ month: m, saved: round2(saved), owed: round2(owed), have: round2(have) })
  }
  return out
}

// MARK: - Where things stand

/** Money you have (current and savings) and what you owe (cards and loans), from each account's latest audit. */
export function standing(accounts: Account[], audits: Audit[]): { have: number; owe: number } {
  let have = 0
  let owe = 0
  for (const a of accounts) {
    const last = latestAudit(audits, a.id)
    if (!last) continue
    if (accountKindInfo[a.kind].owed) owe += last.balance
    else have += last.balance
  }
  return { have: round2(have), owe: round2(owe) }
}

/** Each audit with the change since the one before it, newest first. */
export function history(audits: Audit[], accountID: string): { audit: Audit; change?: number }[] {
  const list = auditsFor(audits, accountID)
  return list.map((audit, i) => ({ audit, change: list[i + 1] ? round2(audit.balance - list[i + 1].balance) : undefined }))
}

/** "today", "yesterday", "3 days ago", "5 weeks ago". */
export function sinceText(iso: ISODate, today: Date = new Date()): string {
  const days = Math.round((startOfDay(today).getTime() - startOfDay(parseDate(iso)).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.round(days / 7)} weeks ago`
  return `${Math.round(days / 30)} months ago`
}

const round2 = (n: number) => Math.round(n * 100) / 100
