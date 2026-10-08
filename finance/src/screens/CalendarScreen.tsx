// The Calendar tab, from FinanceView.swift: a month grid of money in and
// out, then the month's totals and everything in date order. Amber marks
// an amount still running on an estimate, or a goal payment whose day has
// come; tap it to put the real figure in.
//
// New compared with the iPhone app: the month's totals and full list sit
// under the grid (there it was one "still free" line), and anything
// waiting for a real amount is called out at the top.

import { dayKey, isSameDay } from '@suite/dates'
import { Sheet, VButton } from '@suite/ui/components'
import { MonthGrid } from '@suite/ui/MonthGrid'
import { startOfMonth } from '@suite/months'
import { ChevronRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { lineItemsInMonth, monthTotals, repeatText, type LineItem } from '../model/entries'
import { goalPaymentsInMonth, isDue, kindInfo, type GoalPayment } from '../model/goals'
import { amountText, formatMoney, formatMoneyWhole, formatSigned, parseAmount } from '../model/money'
import { useEntries } from '../store/entries'
import { useGoals } from '../store/goals'
import { useCurrency } from '../store/settings'
import { EXPENSE, INCOME, UNCONFIRMED } from '../ui/semantic'
import { EntryEditor, type EntryEditorTarget } from './EntryEditor'
import { GoalPaymentSheet, type PaymentTarget } from './GoalSheets'

const MAX_VISIBLE = 3
const dayTitle = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

/** One line on the calendar: an entry's occurrence or a goal payment. */
type Row = { kind: 'entry'; item: LineItem } | { kind: 'goal'; payment: GoalPayment }

const rowDate = (r: Row) => (r.kind === 'entry' ? r.item.date : r.payment.date)
const rowKey = (r: Row) => (r.kind === 'entry' ? `${r.item.event.id}:${dayKey(r.item.date)}` : `goal:${r.payment.goalID}:${dayKey(r.payment.date)}`)
const rowTitle = (r: Row) => (r.kind === 'entry' ? r.item.event.title : r.payment.title) || 'Untitled'
const rowColor = (r: Row) => r.kind === 'entry'
  ? (!r.item.confirmed ? UNCONFIRMED : r.item.event.entryType === 'income' ? INCOME : EXPENSE)
  : (isDue(r.payment) ? UNCONFIRMED : kindInfo[r.payment.kind].accent)

export function CalendarScreen() {
  const events = useEntries(s => s.events)
  const goals = useGoals(s => s.goals)
  const currency = useCurrency()
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [selected, setSelected] = useState<Date | null>(null)
  const [editor, setEditor] = useState<EntryEditorTarget | null>(null)
  const [confirming, setConfirming] = useState<LineItem | null>(null)
  const [payment, setPayment] = useState<PaymentTarget | null>(null)

  const rowsIn = (m: Date): Row[] => [
    ...lineItemsInMonth(events, m).map(item => ({ kind: 'entry', item }) as Row),
    ...goalPaymentsInMonth(goals, m).map(payment => ({ kind: 'goal', payment }) as Row),
  ].sort((a, b) => rowDate(a).getTime() - rowDate(b).getTime())
  const rowsOn = (d: Date) => rowsIn(d).filter(r => isSameDay(rowDate(r), d))

  const rows = rowsIn(month)
  const totals = monthTotals(events, month)
  const goalPayments = rows.flatMap(r => (r.kind === 'goal' ? [r.payment] : []))
  // Debt payments leave the account; saving and set-asides stay in it, so
  // they come out of what's left over rather than counting as spending.
  const debt = goalPayments.filter(p => p.kind === 'debt').reduce((a, p) => a + p.amount, 0)
  const saving = goalPayments.filter(p => p.kind !== 'debt').reduce((a, p) => a + p.amount, 0)
  const out = totals.expenses + debt
  const left = totals.income - out
  const today = new Date()
  const waiting = rows.filter(r => (r.kind === 'entry' ? !r.item.confirmed && r.item.date <= today : isDue(r.payment, today)))

  /** A varying amount or a goal payment opens its quick sheet; anything else, the editor. */
  const open = (r: Row) => {
    if (r.kind === 'goal') setPayment({ mode: r.payment.confirmed ? 'recorded' : 'confirm', payment: r.payment })
    else if (r.item.event.amountVaries) setConfirming(r.item)
    else setEditor({ mode: 'edit', event: r.item.event, occurrence: r.item.date })
  }

  return (
    <div className="page finance-calendar">
      <section className="lt-month" aria-label="Month">
        <MonthGrid
          month={month}
          onMonthChange={setMonth}
          renderDay={({ date, inMonth, isToday }) => {
            const dayRows = inMonth ? rows.filter(r => isSameDay(rowDate(r), date)) : rowsOn(date)
            const visible = dayRows.slice(0, MAX_VISIBLE)
            const overflow = dayRows.length - visible.length
            const label = `${dayTitle(date)}${dayRows.length ? `, ${dayRows.length} item${dayRows.length === 1 ? '' : 's'}` : ''}`
            return (
              <button role="gridcell" className={`day-cell ${inMonth ? '' : 'outside'} ${isToday ? 'today' : ''}`} onClick={() => setSelected(date)} aria-label={label}>
                <span className="day-number">{date.getDate()}</span>
                {visible.map(r => (
                  <span key={rowKey(r)} className="day-item">
                    <span className="swatch" style={{ background: rowColor(r), width: 5, height: 5 }} />
                    <span className="ellipsis">{rowTitle(r)}</span>
                  </span>
                ))}
                {overflow > 0 && <span className="day-more">+{overflow} more</span>}
                {dayRows.length > 0 && <span className="day-dots" aria-hidden="true">{dayRows.slice(0, 4).map(r => <span key={rowKey(r)} style={{ background: rowColor(r) }} />)}</span>}
              </button>
            )
          }}
        />
      </section>

      <section className="finance-month" aria-label="This month">
        {waiting.length > 0 && (
          <button className="notice confirm-notice" onClick={() => open(waiting[0])}>
            <strong>{waiting.length} amount{waiting.length === 1 ? '' : 's'} to confirm</strong>
            <span className="caption">Still the estimate or plan — tap to put in what really happened.</span>
          </button>
        )}

        <div className="totals">
          <Total label="In" value={formatMoneyWhole(totals.income, currency)} color={INCOME} />
          <Total label="Out" value={formatMoneyWhole(out, currency)} color={EXPENSE} />
          <Total label={left < 0 ? 'Short by' : 'Left over'} value={formatMoneyWhole(Math.abs(left), currency)} color={left < 0 ? EXPENSE : undefined} />
        </div>
        {saving > 0 && (
          <div className="row spread caption" style={{ padding: '0 2px' }}>
            <span>{formatMoneyWhole(saving, currency)} to saving and set-asides</span>
            <span>Still free <strong style={{ color: left - saving < 0 ? EXPENSE : 'var(--text)' }}>{left - saving < 0 ? '−' : ''}{formatMoneyWhole(Math.abs(left - saving), currency)}</strong></span>
          </div>
        )}

        <div className="row spread">
          <h2 className="list-heading" style={{ margin: 0 }}>{month.toLocaleDateString(undefined, { month: 'long' })}</h2>
          <button className="text-button" onClick={() => setEditor({ mode: 'new', date: isSameDay(startOfMonth(today), month) ? today : month })}>
            <Plus size={15} style={{ verticalAlign: -3 }} /> Add entry
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="empty" style={{ padding: '24px 16px' }}>
            <strong style={{ color: 'var(--text)' }}>Nothing this month yet</strong>
            <span className="caption">Add your pay, bills and regular spending. Repeating ones fill in every month by themselves.</span>
            <VButton kind="primary" accent="var(--primary)" onClick={() => setEditor({ mode: 'new', date: today })}>Add your first entry</VButton>
          </div>
        ) : (
          <div className="list-box">
            {rows.map(r => <CalendarRow key={rowKey(r)} row={r} currency={currency} showDate onClick={() => open(r)} />)}
          </div>
        )}
      </section>

      {selected && !editor && !confirming && !payment && (
        <Sheet title={dayTitle(selected)} onClose={() => setSelected(null)} leftLabel="Close" right={{ label: 'Add', onClick: () => setEditor({ mode: 'new', date: selected }) }}>
          {rowsOn(selected).length === 0 ? <p className="muted" style={{ margin: 0 }}>Nothing this day.</p> : (
            <div className="list-box">
              {rowsOn(selected).map(r => <CalendarRow key={rowKey(r)} row={r} currency={currency} onClick={() => open(r)} />)}
            </div>
          )}
          <VButton onClick={() => setEditor({ mode: 'new', date: selected })}><Plus size={16} /> Add to this day</VButton>
        </Sheet>
      )}
      {editor && <EntryEditor target={editor} onClose={() => setEditor(null)} />}
      {payment && <GoalPaymentSheet target={payment} onClose={() => setPayment(null)} />}
      {confirming && (
        <ConfirmAmount
          item={confirming}
          currency={currency}
          onClose={() => setConfirming(null)}
          onEdit={() => { setEditor({ mode: 'edit', event: confirming.event, occurrence: confirming.date }); setConfirming(null) }}
        />
      )}
    </div>
  )
}

function CalendarRow({ row, currency, showDate, onClick }: { row: Row; currency: string; showDate?: boolean; onClick: () => void }) {
  if (row.kind === 'entry') return <EntryRow item={row.item} currency={currency} showDate={showDate} onClick={onClick} />
  const p = row.payment
  const info = kindInfo[p.kind]
  const due = isDue(p)
  return (
    <button className="list-item entry-row" onClick={onClick}>
      <span className="row" style={{ gap: 10 }}>
        <span className="swatch" style={{ background: due ? UNCONFIRMED : info.accent }} />
        <span className="grow" style={{ minWidth: 0 }}>
          <div className="ellipsis">{p.title || 'Untitled'}</div>
          <div className="caption2">
            {showDate && `${p.date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })} · `}
            {p.kind === 'debt' ? 'Debt payment' : info.label}{p.confirmed ? '' : ' · planned'}
          </div>
        </span>
        <span style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }} className={p.confirmed && p.amount === 0 ? 'muted' : ''}>
            {p.confirmed && p.amount === 0 ? 'Skipped' : formatSigned(p.amount, currency, '-')}
          </div>
          {due && <div className="caption2" style={{ color: UNCONFIRMED, fontWeight: 600 }}>To confirm</div>}
        </span>
        <ChevronRight size={16} className="muted" />
      </span>
    </button>
  )
}


function Total({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="total">
      <span className="caption">{label}</span>
      <strong style={{ color }}>{value}</strong>
    </div>
  )
}

function EntryRow({ item, currency, showDate, onClick }: { item: LineItem; currency: string; showDate?: boolean; onClick: () => void }) {
  const { event, date, amount, confirmed } = item
  const income = event.entryType === 'income'
  const kind = income ? 'Money in' : event.expenseCategory === 'flexible' ? 'Flexible' : 'Fixed bill'
  return (
    <button className="list-item entry-row" onClick={onClick}>
      <span className="row" style={{ gap: 10 }}>
        <span className="swatch" style={{ background: confirmed ? (income ? INCOME : EXPENSE) : UNCONFIRMED }} />
        <span className="grow" style={{ minWidth: 0 }}>
          <div className="ellipsis">{event.title || 'Untitled'}</div>
          <div className="caption2">
            {showDate && `${date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })} · `}
            {kind}{event.repeats ? ` · ${repeatText(event)}` : ''}
          </div>
        </span>
        <span style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 600, color: income ? INCOME : undefined, fontVariantNumeric: 'tabular-nums' }}>{formatSigned(amount, currency, income ? '+' : '-')}</div>
          {!confirmed && <div className="caption2" style={{ color: UNCONFIRMED, fontWeight: 600 }}>Estimate</div>}
        </span>
        <ChevronRight size={16} className="muted" />
      </span>
    </button>
  )
}

/** The real amount for one occurrence of a varying entry. */
function ConfirmAmount({ item, currency, onClose, onEdit }: { item: LineItem; currency: string; onClose: () => void; onEdit: () => void }) {
  const { confirmAmount, clearConfirmation } = useEntries()
  const [text, setText] = useState(amountText(item.amount))
  const value = parseAmount(text)
  const save = () => {
    if (value === null) return
    confirmAmount(item.event.id, item.date, Math.abs(value))
    onClose()
  }
  return (
    <Sheet title={item.confirmed ? 'Confirmed amount' : 'Confirm amount'} compact onClose={onClose} right={{ label: 'Save', onClick: save, disabled: value === null }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 600 }}>{item.event.title}</div>
        <div className="caption">{dayTitle(item.date)} · estimate {formatMoney(item.event.amount, currency)}</div>
      </div>
      <input
        autoFocus inputMode="decimal" value={text} onChange={e => setText(e.target.value)} aria-label="Actual amount"
        onKeyDown={e => e.key === 'Enter' && save()} style={{ fontSize: 22, textAlign: 'center' }}
      />
      <VButton kind="primary" accent="var(--primary)" onClick={save} disabled={value === null}>Save</VButton>
      {item.confirmed && <VButton onClick={() => { clearConfirmation(item.event.id, item.date); onClose() }}>Back to the estimate</VButton>}
      <button className="text-button" onClick={onEdit}>Edit the entry itself</button>
    </Sheet>
  )
}
