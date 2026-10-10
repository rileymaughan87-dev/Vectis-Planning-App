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
    }

export function forward(data: MoneyData & { audits: Audit[] }, options: { cushion: number; paydayEntryID?: string }, today: Date = new Date()): Forward {
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
  const safe = round2(exp.expected + net - cushion)
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
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100
