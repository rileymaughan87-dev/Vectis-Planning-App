// The Plan tab (Finance rework, stage 3), in place of the old month-by-month
// Budget page: the weekly pot, then everything that's set to happen — pay,
// bills, flexible spending — each with when it's next, and a quick way to
// add your pay and regular bills in one go. No calendar months: what
// matters is what's coming (Now) and what's really happened (Accounts).

import { dayKey, startOfDay, toISO } from '@suite/dates'
import { Sheet, SectionBox, VButton } from '@suite/ui/components'
import { ChevronRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { makeFinanceEvent, repeatText } from '../model/entries'
import { monthly, running, type Running } from '../model/forward'
import { formatMoney, parseAmount } from '../model/money'
import type { SpendingEntry } from '../model/spending'
import { useEntries } from '../store/entries'
import { useCurrency } from '../store/settings'
import { EXPENSE, INCOME, UNCONFIRMED } from '../ui/semantic'
import { EntryEditor, type EntryEditorTarget } from './EntryEditor'
import { LogSpendingSheet, PotSetupSheet } from './SpendingSheets'
import { WeeklyPotBox } from './WeeklyPotBox'

const nextText = (d: Date) => {
  const today = startOfDay(new Date())
  if (dayKey(d) === dayKey(today)) return 'today'
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

export function PlanScreen() {
  const events = useEntries(s => s.events)
  const currency = useCurrency()
  const money = (n: number) => formatMoney(n, currency)
  const [editor, setEditor] = useState<EntryEditorTarget | null>(null)
  const [logging, setLogging] = useState<{ editing?: SpendingEntry } | null>(null)
  const [potSetup, setPotSetup] = useState(false)
  const [setup, setSetup] = useState(false)
  const today = new Date()

  const all = running(events)
  const pay = all.filter(r => r.event.entryType === 'income')
  const bills = all.filter(r => r.event.entryType === 'expense' && r.event.expenseCategory !== 'flexible')
  const flexible = all.filter(r => r.event.entryType === 'expense' && r.event.expenseCategory === 'flexible')
  const perMonth = (rows: Running[]) => rows.filter(r => r.event.repeats).reduce((a, r) => a + monthly(r.event), 0)

  const section = (title: string, rows: Running[], color: string, empty: string, add: string, entryType: 'income' | 'expense', category?: 'fixed' | 'flexible') => (
    <SectionBox title={title} accent={color} subtitle={rows.some(r => r.event.repeats) ? `≈ ${money(perMonth(rows))} a month` : undefined}>
      {rows.length === 0 && <p className="help" style={{ margin: 0 }}>{empty}</p>}
      <div className="money-rows">
        {rows.map(r => (
          <button key={r.event.id} className="money-row row" style={{ gap: 10 }} onClick={() => setEditor({ mode: 'edit', event: r.event, occurrence: r.next })}>
            <span className="grow" style={{ minWidth: 0 }}>
              <div className="ellipsis">{r.event.title || 'Untitled'}</div>
              <div className="mono muted">{repeatText(r.event)} · next {nextText(r.next)}</div>
            </span>
            <span className="amount" style={{ color: r.event.amountVaries ? UNCONFIRMED : undefined }}>{money(r.event.amount)}</span>
            <ChevronRight size={14} className="muted" />
          </button>
        ))}
      </div>
      <VButton accent={color} onClick={() => setEditor({ mode: 'new', date: today, entryType, category })}><Plus size={15} /> {add}</VButton>
    </SectionBox>
  )

  return (
    <div className="page finance-plan">
      <WeeklyPotBox onLog={() => setLogging({})} onEdit={e => setLogging({ editing: e })} onSetUp={() => setPotSetup(true)} />

      {section('Money in', pay, INCOME, 'Your pay and anything else that comes in.', 'Add pay', 'income')}
      {section('Bills', bills, EXPENSE, 'Rent, council tax, phone — things that come round.', 'Add a bill', 'expense', 'fixed')}
      <VButton onClick={() => setSetup(true)}>Add pay and bills in one go</VButton>
      {section('Flexible', flexible, EXPENSE, 'Planned spending that varies — or use the weekly pot above instead.', 'Add flexible spending', 'expense', 'flexible')}

      {editor && <EntryEditor target={editor} onClose={() => setEditor(null)} />}
      {logging && <LogSpendingSheet editing={logging.editing} onClose={() => setLogging(null)} />}
      {potSetup && <PotSetupSheet onClose={() => setPotSetup(false)} />}
      {setup && <QuickSetupSheet onClose={() => setSetup(false)} />}
    </div>
  )
}

interface SetupRow { name: string; amount: string; day: string; income?: boolean }

const COMMON_BILLS = ['Rent or mortgage', 'Council tax', 'Energy', 'Water', 'Phone', 'Broadband', 'TV licence', 'Car insurance', 'Subscriptions']

/**
 * Pay and regular bills in one go: fill in the ones you have (amount and
 * the day of the month), leave the rest blank. Each becomes a monthly
 * entry you can change later.
 */
export function QuickSetupSheet({ onClose }: { onClose: () => void }) {
  const addEvent = useEntries(s => s.addEvent)
  const currency = useCurrency()
  const [rows, setRows] = useState<SetupRow[]>([
    { name: 'Pay', amount: '', day: '', income: true },
    ...COMMON_BILLS.map(name => ({ name, amount: '', day: '' })),
  ])
  const patch = (i: number, p: Partial<SetupRow>) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...p } : r)))
  const ready = rows.filter(r => r.name.trim() && (parseAmount(r.amount) ?? 0) > 0)
  const dayOf = (r: SetupRow) => Math.min(Math.max(Math.round(Number(r.day) || 1), 1), 31)

  const save = () => {
    const now = new Date()
    for (const r of ready) {
      // This month's date for that day (a 31st lands on the last day of shorter months).
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      const date = new Date(now.getFullYear(), now.getMonth(), Math.min(dayOf(r), last))
      addEvent(makeFinanceEvent({
        title: r.name.trim(),
        entryType: r.income ? 'income' : 'expense',
        expenseCategory: r.income ? undefined : 'fixed',
        amount: Math.abs(parseAmount(r.amount)!),
        date: toISO(date),
        repeats: true,
        frequency: 'monthly',
      }))
    }
    onClose()
  }

  return (
    <Sheet title="Pay and bills" onClose={onClose} right={{ label: ready.length ? `Add ${ready.length}` : 'Add', onClick: save, disabled: !ready.length }}>
      <p className="help" style={{ margin: 0 }}>
        Fill in the ones you have — the amount ({currency}) and the day of the month it goes out or comes in — and leave the rest blank.
        Each becomes a monthly entry; change how often or anything else afterwards.
      </p>
      <div className="setup-grid">
        <span className="mono muted">Name</span><span className="mono muted">Amount</span><span className="mono muted">Day</span>
        {rows.map((r, i) => (
          <SetupLine key={i} row={r} onChange={p => patch(i, p)} />
        ))}
      </div>
      <button className="text-button" style={{ alignSelf: 'flex-start' }} onClick={() => setRows(rs => [...rs, { name: '', amount: '', day: '' }])}>
        + Another bill
      </button>
      <VButton kind="primary" accent="var(--brand)" onClick={save} disabled={!ready.length}>
        {ready.length ? `Add ${ready.length} ${ready.length === 1 ? 'entry' : 'entries'}` : 'Add'}
      </VButton>
    </Sheet>
  )
}

function SetupLine({ row, onChange }: { row: SetupRow; onChange: (p: Partial<SetupRow>) => void }) {
  return (
    <>
      <input value={row.name} onChange={e => onChange({ name: e.target.value })} aria-label="Name" style={row.income ? { color: INCOME, fontWeight: 500 } : undefined} />
      <input inputMode="decimal" value={row.amount} onChange={e => onChange({ amount: e.target.value })} placeholder="0" aria-label={`${row.name || 'Bill'} amount`} />
      <input inputMode="numeric" value={row.day} onChange={e => onChange({ day: e.target.value.replace(/\D/g, '').slice(0, 2) })} placeholder="1" aria-label={`${row.name || 'Bill'} day of the month`} />
    </>
  )
}
