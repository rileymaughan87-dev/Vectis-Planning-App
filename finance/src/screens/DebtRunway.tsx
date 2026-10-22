// The debt runway: every debt on one timeline from now to its last
// payment, and the total owed month by month — shrinking — ending with what
// has no plan yet, so the real finish line is honest. A debt with no plan
// is shown hatched, "none planned yet": information, not an error.

import { useMemo } from 'react'
import { onBalance, type MoneyData } from '../model/accounts'
import { formatAmount } from '../model/money'
import { debtRunway } from '../model/overview'
import { useAccounts } from '../store/accounts'
import { useEntries } from '../store/entries'
import { useGoals } from '../store/goals'
import { useMoneyTools } from '../store/money'
import { useSpending } from '../store/spending'

const monthYear = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
const per = { monthly: 'a month', weekly: 'a week', fortnightly: 'every 2 weeks' } as const

export function DebtRunwayView({ onOpen }: { onOpen?: (goalID: string) => void }) {
  const goals = useGoals(s => s.goals)
  const { audits, transfers } = useAccounts()
  const events = useEntries(s => s.events)
  const spending = useSpending(s => s.entries)
  const tools = useMoneyTools()
  const r = useMemo(() => {
    const data: MoneyData = { accounts: tools.accounts, events, goals, spending, transfers }
    const real = goals.map(g => onBalance(g, tools.accounts, audits, data))
    return debtRunway(real, tools.goalCurrency, (n, c) => tools.convert(n, c, tools.home) ?? n)
  }, [goals, audits, transfers, events, spending, tools])

  if (!r.debts.length) return <p className="help" style={{ margin: 0 }}>No debts left to pay — nothing on the runway.</p>

  const span = Math.max(1, r.end.getTime() - r.start.getTime())
  const at = (d: Date) => Math.min(100, Math.max(0, ((d.getTime() - r.start.getTime()) / span) * 100))
  const years: number[] = []
  for (let y = r.start.getFullYear() + 1; new Date(y, 0, 1) <= r.end; y++) years.push(y)
  const maxOwed = Math.max(1, ...r.monthly.map(m => m.owed))
  const home = (n: number) => formatAmount(n, tools.home)

  return (
    <div className="runway">
      <p className="runway-summary">
        {r.lastPayment ? `Everything planned is paid by ${monthYear(r.lastPayment)}.` : 'No payments are planned yet.'}
        {r.leftAtEnd > 0 ? ` ${home(r.leftAtEnd)} has no plan yet.` : ''}
      </p>

      <div className="runway-axis" aria-hidden="true">
        <span style={{ left: 0 }}>{monthYear(r.start)}</span>
        {/* A year too close to the start label would collide with it. */}
        {years.filter(y => at(new Date(y, 0, 1)) > 18).map(y => <span key={y} className="tick" style={{ left: `${at(new Date(y, 0, 1))}%` }}>{y}</span>)}
      </div>

      {r.debts.map(d => (
        <button key={d.id} className="runway-row" onClick={() => onOpen?.(d.id)} disabled={!onOpen}>
          <span className="runway-label">
            <span className="runway-title">{d.title}</span>
            <span className="mono muted">
              {formatAmount(d.remaining, d.currency)} · {d.payment ? `${formatAmount(d.payment.amount, d.currency)} ${per[d.payment.frequency]}` : 'none planned yet'}
            </span>
          </span>
          <span className="runway-track">
            {years.map(y => <span key={y} className="runway-year" style={{ left: `${at(new Date(y, 0, 1))}%` }} />)}
            {d.start && d.finish
              ? <span className="runway-bar" style={{ left: `${at(d.start)}%`, width: `${Math.max(1.5, at(d.finish) - at(d.start))}%` }} />
              : <span className="runway-bar unplanned" style={{ left: 0, width: '100%' }} />}
          </span>
          {d.finish && <span className="runway-end mono muted">{monthYear(d.finish)}</span>}
        </button>
      ))}

      <div className="runway-total">
        <span className="mono muted">Total owed, month by month</span>
        <div className="runway-bars" aria-label={`From ${home(r.monthly[0].owed)} now to ${home(r.monthly.at(-1)!.owed)} in ${monthYear(r.monthly.at(-1)!.month)}`}>
          {r.monthly.map(m => <span key={m.month.toISOString()} style={{ height: `${(m.owed / maxOwed) * 100}%` }} title={`${monthYear(m.month)}: ${home(m.owed)}`} />)}
        </div>
        <div className="runway-ends">
          <span>{home(r.monthly[0].owed)} now</span>
          <span>{r.leftAtEnd > 0 ? `${home(r.leftAtEnd)} left in ${monthYear(r.monthly.at(-1)!.month)}` : `Paid off by ${monthYear(r.monthly.at(-1)!.month)}`}</span>
        </div>
      </div>
    </div>
  )
}
