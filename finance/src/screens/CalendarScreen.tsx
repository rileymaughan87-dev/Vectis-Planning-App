// The Calendar tab, from FinanceView.swift: a month grid of money in and
// out, then the month's totals and every entry in date order. Amber marks
// an amount still running on an estimate; tap it to put the real figure in.
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
import { lineItemsInMonth, lineItemsOn, monthTotals, repeatText, type LineItem } from '../model/entries'
import { amountText, formatMoney, formatMoneyWhole, formatSigned, parseAmount } from '../model/money'
import { useEntries } from '../store/entries'
import { useCurrency } from '../store/settings'
import { EXPENSE, INCOME, UNCONFIRMED } from '../ui/semantic'
import { EntryEditor, type EntryEditorTarget } from './EntryEditor'

const MAX_VISIBLE = 3
const dayTitle = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
const itemColor = (i: LineItem) => (!i.confirmed ? UNCONFIRMED : i.event.entryType === 'income' ? INCOME : EXPENSE)

export function CalendarScreen() {
  const events = useEntries(s => s.events)
  const currency = useCurrency()
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [selected, setSelected] = useState<Date | null>(null)
  const [editor, setEditor] = useState<EntryEditorTarget | null>(null)
  const [confirming, setConfirming] = useState<LineItem | null>(null)

  const items = lineItemsInMonth(events, month)
  const totals = monthTotals(events, month)
  const left = totals.income - totals.expenses
  const today = new Date()
  const waiting = items.filter(i => !i.confirmed && i.date <= today)

  /** A varying amount opens the quick confirm; anything else, the editor. */
  const open = (item: LineItem) => {
    if (item.event.amountVaries) setConfirming(item)
    else setEditor({ mode: 'edit', event: item.event, occurrence: item.date })
  }

  return (
    <div className="page finance-calendar">
      <section className="lt-month" aria-label="Month">
        <MonthGrid
          month={month}
          onMonthChange={setMonth}
          renderDay={({ date, inMonth, isToday }) => {
            const dayItems = inMonth ? items.filter(i => isSameDay(i.date, date)) : lineItemsOn(events, date)
            const visible = dayItems.slice(0, MAX_VISIBLE)
            const overflow = dayItems.length - visible.length
            const label = `${dayTitle(date)}${dayItems.length ? `, ${dayItems.length} entr${dayItems.length === 1 ? 'y' : 'ies'}` : ''}`
            return (
              <button role="gridcell" className={`day-cell ${inMonth ? '' : 'outside'} ${isToday ? 'today' : ''}`} onClick={() => setSelected(date)} aria-label={label}>
                <span className="day-number">{date.getDate()}</span>
                {visible.map(i => (
                  <span key={i.event.id} className="day-item">
                    <span className="swatch" style={{ background: itemColor(i), width: 5, height: 5 }} />
                    <span className="ellipsis">{i.event.title}</span>
                  </span>
                ))}
                {overflow > 0 && <span className="day-more">+{overflow} more</span>}
                {dayItems.length > 0 && <span className="day-dots" aria-hidden="true">{dayItems.slice(0, 4).map(i => <span key={i.event.id} style={{ background: itemColor(i) }} />)}</span>}
              </button>
            )
          }}
        />
      </section>

      <section className="finance-month" aria-label="This month">
        {waiting.length > 0 && (
          <button className="notice confirm-notice" onClick={() => setConfirming(waiting[0])}>
            <strong>{waiting.length} amount{waiting.length === 1 ? '' : 's'} to confirm</strong>
            <span className="caption">Still the estimate — tap to put in what it really was.</span>
          </button>
        )}

        <div className="totals">
          <Total label="In" value={formatMoneyWhole(totals.income, currency)} color={INCOME} />
          <Total label="Out" value={formatMoneyWhole(totals.expenses, currency)} color={EXPENSE} />
          <Total label={left < 0 ? 'Short by' : 'Left over'} value={formatMoneyWhole(Math.abs(left), currency)} color={left < 0 ? EXPENSE : undefined} />
        </div>

        <div className="row spread">
          <h2 className="list-heading" style={{ margin: 0 }}>{month.toLocaleDateString(undefined, { month: 'long' })}</h2>
          <button className="text-button" onClick={() => setEditor({ mode: 'new', date: isSameDay(startOfMonth(today), month) ? today : month })}>
            <Plus size={15} style={{ verticalAlign: -3 }} /> Add entry
          </button>
        </div>

        {items.length === 0 ? (
          <div className="empty" style={{ padding: '24px 16px' }}>
            <strong style={{ color: 'var(--text)' }}>Nothing this month yet</strong>
            <span className="caption">Add your pay, bills and regular spending. Repeating ones fill in every month by themselves.</span>
            <VButton kind="primary" accent="var(--primary)" onClick={() => setEditor({ mode: 'new', date: today })}>Add your first entry</VButton>
          </div>
        ) : (
          <div className="list-box">
            {items.map(i => <EntryRow key={`${i.event.id}:${dayKey(i.date)}`} item={i} currency={currency} showDate onClick={() => open(i)} />)}
          </div>
        )}
      </section>

      {selected && !editor && !confirming && (
        <Sheet title={dayTitle(selected)} onClose={() => setSelected(null)} leftLabel="Close" right={{ label: 'Add', onClick: () => setEditor({ mode: 'new', date: selected }) }}>
          {lineItemsOn(events, selected).length === 0 ? <p className="muted" style={{ margin: 0 }}>Nothing this day.</p> : (
            <div className="list-box">
              {lineItemsOn(events, selected).map(i => <EntryRow key={i.event.id} item={i} currency={currency} onClick={() => open(i)} />)}
            </div>
          )}
          <VButton onClick={() => setEditor({ mode: 'new', date: selected })}><Plus size={16} /> Add to this day</VButton>
        </Sheet>
      )}
      {editor && <EntryEditor target={editor} onClose={() => setEditor(null)} />}
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
