// The forward view (Finance rework, stage 2): from what's in the main
// current account now, what's coming before the next payday, and what's
// safe to spend until then.
//
//   safe to spend = balance now (from the last check, plus everything since)
//                 + pay landing before payday
//                 − bills, planned spending and goal payments before payday
//                 − the cushion you keep back
//
// Payday is the next day your *main* pay arrives — the one you choose, or
// by default the biggest repeating pay. Money that lands on payday starts
// the next stretch; it never props up this one (pay on the 30th funds the
// month after). Smaller pay before then does count.
//
// International mode: a current account in another currency (your US
// account, say) gets what it needs to cover its own bills before payday —
// "transfer this much" — and that comes out of safe to spend, converted.

import { addDays, addMonths, daysBetween, dayKey, startOfDay } from '@suite/dates'
import { expectedBalance, movementsBetween, spendingAccount, type Account, type Audit, type MoneyData, type Movement } from './accounts'
import { occurrencesInMonth, type FinanceEvent } from './entries'

/** Roughly what an entry comes to in a month, to compare amounts that come at different rates. */
export function monthly(event: FinanceEvent): number {
  if (!event.repeats) return event.amount
  return event.frequency === 'weekly' ? (event.amount * 52) / 12 : event.frequency === 'fortnightly' ? (event.amount * 26) / 12 : event.amount
}

/** The first day after `after` the entry happens, within the next couple of years. */
export function nextOccurrence(event: FinanceEvent, after: Date): Date | undefined {
  const key = dayKey(after)
  for (let m = new Date(after.getFullYear(), after.getMonth(), 1), i = 0; i < 25; m = addMonths(m, 1), i++) {
    const hit = occurrencesInMonth(event, m).find(d => dayKey(d) > key)
    if (hit) return hit
  }
  return undefined
}

/** Your main pay: the one chosen if it's still coming, else the biggest repeating pay still coming. */
export function mainPay(events: FinanceEvent[], chosenID: string | undefined, today: Date = new Date()): FinanceEvent | undefined {
  const coming = events.filter(e => e.entryType === 'income' && nextOccurrence(e, today))
  const chosen = coming.find(e => e.id === chosenID)
  if (chosen) return chosen
  const repeating = coming.filter(e => e.repeats)
  const pool = repeating.length ? repeating : coming
  return [...pool].sort((a, b) => monthly(b) - monthly(a))[0]
}

/** Pay you could pick as your main pay: any that's still coming. */
export const payOptions = (events: FinanceEvent[], today: Date = new Date()) =>
  events.filter(e => e.entryType === 'income' && nextOccurrence(e, today))

export interface Running {
  event: FinanceEvent
  /** The next time it happens (today counts). */
  next: Date
}

/** Every entry still to happen — repeating ones still going and one-offs still ahead — soonest first. */
export function running(events: FinanceEvent[], today: Date = new Date()): Running[] {
  const yesterday = addDays(startOfDay(today), -1)
  return events
    .flatMap(event => {
      const next = nextOccurrence(event, yesterday)
      return next ? [{ event, next }] : []
    })
    .sort((a, b) => a.next.getTime() - b.next.getTime())
}

export type Forward =
  | { kind: 'noAccount' }
  | { kind: 'notChecked'; account: Account }
  | {
      kind: 'ready'
      account: Account
      /** What should be in the account now. */
      balanceNow: number
      /** The check it's worked out from. */
      checked: Audit
      /** Unset if there's no pay to plan towards yet. */
      payday?: Date
      pay?: FinanceEvent
      /** Days from today until payday (at least 1). */
      days: number
      /** In and out before payday, in date order. */
      comingUp: Movement[]
      /** What lands on payday itself — the start of the next stretch. */
      onPayday: Movement[]
      cushion: number
      safe: number
      perDay: number
      /** The lowest the account gets before payday, if it dips below the cushion. */
      dip?: { balance: number; date: Date }
      /** Other-currency current accounts and what to send each before payday. */
      transfers: TransferNeed[]
    }

/** What a current account in another currency needs sent to it, to cover its bills until payday. */
export interface TransferNeed {
  account: Account
  /** In the account's own currency; 0 if it's covered. */
  need: number
  /** The same in the main account's currency, if there's a rate. */
  inMain: number | null
  /** False until its balance has been checked once (then it's counted from nothing). */
  checked: boolean
  /** Its own bills before payday, in its currency. */
  bills: Movement[]
}

/**
 * For each current account in another currency than the main one: the
 * least it gets down to before `end` (from its balance now, through its
 * bills and pay), and so what to send so it never goes below zero.
 */
export function transferNeeds(
  data: MoneyData & { audits: Audit[] }, main: Account, today: Date, end: Date,
  convert?: (amount: number, from: Account, to: Account) => number | null,
): TransferNeed[] {
  return data.accounts
    .filter(a => a.kind === 'current' && a.id !== main.id && (a.currency ?? '') !== (main.currency ?? ''))
    .map(account => {
      const exp = expectedBalance(account, data.audits, data, today)
      const bills = movementsBetween(account, data, today, end)
      let running = exp?.expected ?? 0
      let low = running
      for (const m of bills) {
        running += m.amount
        low = Math.min(low, running)
      }
      const need = low < 0 ? Math.ceil(-low) : 0
      return { account, need, inMain: need ? convert?.(need, account, main) ?? null : 0, checked: Boolean(exp), bills }
    })
}

export function forward(
  data: MoneyData & { audits: Audit[] },
  options: { cushion: number; paydayEntryID?: string; convert?: (amount: number, from: Account, to: Account) => number | null },
  today: Date = new Date(),
): Forward {
  const account = spendingAccount(data.accounts)
  if (!account) return { kind: 'noAccount' }
  const exp = expectedBalance(account, data.audits, data, today)
  if (!exp?.since) return { kind: 'notChecked', account }

  const pay = mainPay(data.events, options.paydayEntryID, today)
  const payday = pay ? nextOccurrence(pay, today) : undefined
  const end = payday ?? addDays(startOfDay(today), 30)
  const comingUp = movementsBetween(account, data, today, addDays(end, -1))
  const onPayday = payday ? movementsBetween(account, data, addDays(payday, -1), payday) : []

  const cushion = Math.max(0, options.cushion)
  const net = comingUp.reduce((a, m) => a + m.amount, 0)
  // Money to send to other-currency accounts before payday leaves this one.
  const transfers = transferNeeds(data, account, today, addDays(end, -1), options.convert)
  const sending = transfers.reduce((a, t) => a + (t.inMain ?? 0), 0)
  const safe = round2(exp.expected + net - sending - cushion)
  const days = Math.max(1, daysBetween(startOfDay(today), startOfDay(end)))

  let running = exp.expected
  let low = { balance: running, date: startOfDay(today) }
  for (const m of comingUp) {
    running += m.amount
    if (running < low.balance) low = { balance: round2(running), date: m.date }
  }

  return {
    kind: 'ready',
    account,
    balanceNow: exp.expected,
    checked: exp.since,
    payday,
    pay,
    days,
    comingUp,
    onPayday,
    cushion,
    safe,
    perDay: round2(safe / days),
    dip: low.balance < cushion && low.date > startOfDay(today) ? low : undefined,
    transfers,
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100
