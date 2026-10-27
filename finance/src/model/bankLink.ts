// Live balances (Oct 2026): what a linked bank says is in each account
// becomes a balance check, the same as one typed in, so Payday, Everyday
// and the expected balances all run from the bank's real numbers. The
// links themselves live on the server (functions/, docs/live-balances.md);
// Finance only ever sees balances.

import { dayKey, parseDate, toISO } from '@suite/dates'
import { accountKindInfo, describeGap, expectedBalance, latestAudit, tracksSpending, type Account, type Audit, type GapNote, type MoneyData } from './accounts'

/** One linked bank account and its balances — as the server sends it (functions/src/types.ts). */
export interface LinkedBalance {
  key: string
  connection: string
  source: 'enableBanking' | 'simplefin'
  institution: string
  name: string
  currency: string
  balances: { type: string; amount: number }[]
  at: string
  expires?: string
}

/**
 * Which of the bank's balances to use. Booked balances first: "available"
 * often counts an overdraft, or for a card the credit left, neither of
 * which is money you have. Owed accounts (cards, loans) come back positive.
 */
export function pickBalance(b: LinkedBalance, account: Pick<Account, 'kind'>): number | null {
  const order = ['ITBD', 'CLBD', 'current', 'XPCD', 'OPBD', 'ITAV', 'CLAV', 'available']
  const found = [...b.balances].sort((x, y) => rank(order, x.type) - rank(order, y.type))[0]
  if (!found) return null
  const n = Math.round(found.amount * 100) / 100
  return accountKindInfo[account.kind].owed ? Math.abs(n) : n
}

const rank = (order: string[], type: string) => {
  const i = order.indexOf(type)
  return i < 0 ? order.length : i
}

/** The balance check to record for a bank balance: a new one, or today's bank check updated. */
export interface BankAudit {
  balance: number
  expected?: number
  gap?: GapNote
  /** Today's earlier bank check for this account, replaced rather than adding another. */
  replaces?: string
}

export function bankAudit(account: Account, balance: number, audits: Audit[], data: MoneyData, now: Date = new Date()): BankAudit | null {
  const last = latestAudit(audits, account.id)
  const sameDay = last?.source === 'bank' && dayKey(parseDate(last.date)) === dayKey(now)
  if (sameDay && Math.abs(last.balance - balance) < 0.005) return null
  // What was expected is worked out from the check before today's bank one.
  const before = sameDay ? audits.filter(a => a.id !== last.id) : audits
  const exp = tracksSpending(account, data.accounts) ? expectedBalance(account, before, data, now) : null
  const gap = exp ? describeGap(account, balance, exp.expected) : null
  return {
    balance,
    ...(exp ? { expected: exp.expected } : {}),
    ...(gap ? { gap: gap.unlogged ? 'everyday' as const : 'extraIn' as const } : {}),
    ...(sameDay ? { replaces: last.id } : {}),
  }
}

/** Applies bank checks to the audit list. */
export function withBankAudits(audits: Audit[], checks: { accountID: string; audit: BankAudit }[], now: Date = new Date(), id: () => string): Audit[] {
  const replaced = new Set(checks.map(c => c.audit.replaces).filter(Boolean))
  const added: Audit[] = checks.map(({ accountID, audit }) => ({
    id: id(), accountID, date: toISO(now), balance: audit.balance, expected: audit.expected, gap: audit.gap, source: 'bank',
  }))
  return [...audits.filter(a => !replaced.has(a.id)), ...added]
}

/** "Renew by 25 Jan" once a link has two weeks or less to run; null otherwise. */
export function renewNote(b: Pick<LinkedBalance, 'expires'>, now: Date = new Date()): string | null {
  if (!b.expires) return null
  const end = new Date(b.expires)
  const days = (end.getTime() - now.getTime()) / 86_400_000
  if (days > 14) return null
  if (days <= 0) return 'Link expired'
  return `Renew by ${end.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
}
