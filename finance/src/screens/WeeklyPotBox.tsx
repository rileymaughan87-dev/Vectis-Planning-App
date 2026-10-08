// The top of the Budget page: a week's flexible spending against the pot,
// with the quick-log button. About *now* by default, whatever month the
// rest of the page shows. New compared with the iPhone app: what's left
// spread over the days still to come, and stepping back to earlier weeks.

import { addDays, isSameDay, parseDate, startOfDay } from '@suite/dates'
import { SectionBox, VButton } from '@suite/ui/components'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { formatMoney } from '../model/money'
import { entriesIn, weekOf, weekStatus, type SpendingEntry } from '../model/spending'
import { useCurrency } from '../store/settings'
import { useSpending } from '../store/spending'

const short = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

export function WeeklyPotBox({ onLog, onEdit, onSetUp }: { onLog: () => void; onEdit: (e: SpendingEntry) => void; onSetUp: () => void }) {
  const { entries, pot } = useSpending()
  const currency = useCurrency()
  const money = (n: number) => formatMoney(n, currency)
  const [offset, setOffset] = useState(0)
  const week = weekOf(addDays(new Date(), offset * 7))
  const isThisWeek = offset === 0
  const list = entriesIn(entries, week.start, week.end)
  const status = weekStatus(entries, pot, week)
  const fraction = pot.weeklyAmount > 0 ? Math.min(status.spent / pot.weeklyAmount, 1) : 0
  const label = `${short(week.start)} – ${short(addDays(week.end, -1))}`
  // Weeks before the pot started had no pot to measure against.
  const potStart = startOfDay(parseDate(pot.startDate))
  const showPot = pot.isActive && week.end > potStart

  return (
    <SectionBox title={isThisWeek ? 'This week' : 'That week'} accent="var(--primary)" subtitle={label}>
      <div className="row spread week-switch">
        <button className="icon-button" onClick={() => setOffset(o => o - 1)} aria-label="Previous week"><ChevronLeft size={18} /></button>
        {!isThisWeek && <button className="text-button" onClick={() => setOffset(0)}>Back to this week</button>}
        <button className="icon-button" onClick={() => setOffset(o => o + 1)} disabled={isThisWeek} aria-label="Next week"><ChevronRight size={18} /></button>
      </div>

      {showPot ? (
        <div className="pot-summary">
          <div className="headline-number">{status.left >= 0 ? `${money(status.left)} left` : `${money(-status.left)} over`}</div>
          <span className="caption">
            {money(status.spent)} of {money(pot.weeklyAmount)} spent
            {isThisWeek && status.perDay !== undefined && ` · about ${money(status.perDay)} a day for the rest of the week`}
          </span>
          <div className="comparison-track"><div style={{ width: `${fraction * 100}%`, background: 'var(--primary)' }} /></div>
          {isThisWeek && <span className="caption2">Starts fresh on {week.end.toLocaleDateString(undefined, { weekday: 'long' })}. Going over is just information — nothing carries forward.</span>}
        </div>
      ) : (
        <p className="help" style={{ margin: 0 }}>
          {pot.isActive ? `Before the weekly pot started (${short(potStart)}).` : "Log spending as it happens. A weekly pot — one amount for groceries, eating out and other flexible spending — shows what's left each week."}
          {status.spent > 0 && ` ${money(status.spent)} logged ${isThisWeek ? 'this' : 'that'} week.`}
        </p>
      )}

      <VButton kind="primary" accent="var(--primary)" onClick={onLog}><Plus size={16} style={{ verticalAlign: -3 }} /> Log spending</VButton>

      {list.length === 0 ? <p className="help" style={{ margin: 0 }}>Nothing logged {isThisWeek ? 'this' : 'that'} week{isThisWeek ? ' yet' : ''}.</p> : (
        <div>
          {list.map(e => {
            const d = new Date(e.date)
            return (
              <button key={e.id} className="budget-line" onClick={() => onEdit(e)}>
                <span className="grow" style={{ minWidth: 0 }}>
                  <div className="ellipsis">{e.note || 'Spending'}</div>
                  <div className="caption2">{isSameDay(d, new Date()) ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'long' })}</div>
                </span>
                <strong className="num">{money(e.amount)}</strong>
              </button>
            )
          })}
        </div>
      )}

      <VButton accent="var(--primary)" onClick={onSetUp}>{pot.isActive ? 'Change pot' : 'Set up a weekly pot'}</VButton>
    </SectionBox>
  )
}
