// The Months tab (Oct 2026): planning in one place. Months is the grid —
// one column per pay period, like Riley's budget spreadsheet — with the
// Calendar and the full list of entries beside it, so adding, editing and
// confirming all happen here.

import { Segmented } from '@suite/ui/components'
import { Plus } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { formatMoney, formatMoneyWhole } from '../model/money'
import { monthsGrid, periodLabel, type Cell, type MonthsGrid, type Row } from '../model/months'
import { useAccounts } from '../store/accounts'
import { useEntries } from '../store/entries'
import { useGoals } from '../store/goals'
import { useMoneyTools } from '../store/money'
import { useSettings } from '../store/settings'
import { useSpending } from '../store/spending'
import { UNCONFIRMED } from '../ui/semantic'
import { CalendarScreen } from './CalendarScreen'
import { EntryEditor, type EntryEditorTarget } from './EntryEditor'
import { GoalEditor } from './GoalSheets'
import { PlanScreen } from './PlanScreen'

type View = 'grid' | 'calendar' | 'list'

export function MonthsScreen() {
  const [view, setView] = useState<View>(() => (sessionStorage.getItem('finance:ui:months') as View | null) ?? 'grid')
  const choose = (v: View) => {
    setView(v)
    try {
      sessionStorage.setItem('finance:ui:months', v)
    } catch {
      // Just won't be remembered.
    }
  }
  return (
    <div className="finance-months">
      <div className="months-bar">
        <Segmented<View>
          label="View"
          value={view}
          onChange={choose}
          options={[{ value: 'grid', label: 'Months' }, { value: 'calendar', label: 'Calendar' }, { value: 'list', label: 'Entries' }]}
        />
      </div>
      {view === 'grid' && <div className="page"><Grid /></div>}
      {view === 'calendar' && <CalendarScreen />}
      {view === 'list' && <PlanScreen />}
    </div>
  )
}

function Grid() {
  const { audits, transfers } = useAccounts()
  const events = useEntries(s => s.events)
  const goals = useGoals(s => s.goals)
  const spending = useSpending(s => s.entries)
  const paydayEntryID = useSettings(s => s.paydayEntryID)
  const tools = useMoneyTools()
  const [editing, setEditing] = useState<EntryEditorTarget | null>(null)
  const [goalID, setGoalID] = useState<string | null>(null)

  const grid = useMemo(() => monthsGrid(
    { accounts: tools.accounts, audits, events, goals, spending, transfers },
    {
      paydayEntryID,
      home: tools.home,
      currencyOf: tools.currencyOf,
      goalCurrency: tools.goalCurrency,
      entryCurrency: tools.entryCurrency,
      toHome: (n, c) => tools.convert(n, c, tools.home) ?? n,
      before: 1,
      after: 10,
    },
  ), [tools, audits, transfers, events, goals, spending, paydayEntryID])

  const open = (r: Row) => {
    if (r.ref?.type === 'entry') {
      const e = events.find(x => x.id === r.ref!.id)
      if (e) setEditing({ mode: 'edit', event: e })
    } else if (r.ref?.type === 'goal') setGoalID(r.ref.id)
  }
  const goal = goals.find(g => g.id === goalID)
  const nothing = !grid.income.length && !grid.outgoing.length && !grid.goals.length

  return (
    <>
      <div className="months-scroll" role="region" aria-label="Months" tabIndex={0}>
        <table className="months-grid">
          <thead>
            <tr>
              <th scope="col"><span className="mono muted">{grid.byPay ? 'From payday' : 'Month'}</span></th>
              {grid.periods.map((p, i) => {
                const l = periodLabel(p, grid.byPay)
                return (
                  <th key={i} scope="col" className={i === grid.current ? 'now' : i < grid.current ? 'past' : ''}>
                    <div>{l.month}</div>
                    {l.from && <div className="from">{l.from}</div>}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {nothing && (
              <tr><td colSpan={grid.periods.length + 1} className="empty-cell">Add your pay and bills (Entries above) and they fill in here.</td></tr>
            )}
            <Section title="Coming in" grid={grid} rows={grid.income} onOpen={open} />
            <Section title="Going out" grid={grid} rows={grid.outgoing} onOpen={open} />
            <Section title="Goals and debts" grid={grid} rows={grid.goals} onOpen={open} />
            {grid.spending && <Section title="Spent" grid={grid} rows={[grid.spending]} onOpen={open} />}
            <TotalRow label="Left over" cells={grid.leftOver} grid={grid} currency={tools.home} strong signed />

            {grid.transfers.length > 0 && <Section title="To send" grid={grid} rows={grid.transfers} onOpen={open} />}
            {grid.owed.length > 0 && (
              <>
                <Section title="Still owed" grid={grid} rows={grid.owed} onOpen={open} whole />
                {grid.owed.length > 1 && <TotalRow label="Total owed" cells={grid.owedTotal} grid={grid} currency={tools.home} />}
              </>
            )}
            {grid.saved.length > 0 && <Section title="Saved" grid={grid} rows={grid.saved} onOpen={open} whole />}
          </tbody>
        </table>
      </div>
      <p className="help months-legend">
        {grid.byPay ? 'Each column runs from a payday to the day before the next, so it shows one pay packet and what it covers. ' : ''}
        Rows are in their own currency; totals are in {tools.home}.{' '}
        <span style={{ color: UNCONFIRMED }}>Amber</span> is an amount that varies and isn't confirmed yet. Tap a row to change it.
      </p>
      <button className="text-button" style={{ alignSelf: 'flex-start' }} onClick={() => setEditing({ mode: 'new', date: new Date() })}>
        <Plus size={14} style={{ verticalAlign: -2 }} /> Add an entry
      </button>
      {editing && <EntryEditor target={editing} onClose={() => setEditing(null)} />}
      {goal && <GoalEditor target={{ mode: 'edit', goal }} onClose={() => setGoalID(null)} />}
    </>
  )
}

const cellClass = (grid: MonthsGrid, i: number) => (i === grid.current ? 'now' : i < grid.current ? 'past' : '')

function CellText({ cell, currency, whole, signed }: { cell: Cell | null; currency: string; whole?: boolean; signed?: boolean }): ReactNode {
  if (!cell || (cell.amount === 0 && !signed)) return <span className="muted">—</span>
  const text = (whole ? formatMoneyWhole : formatMoney)(Math.abs(cell.amount), currency)
  return <span style={{ color: cell.estimate ? UNCONFIRMED : undefined }}>{cell.amount < 0 ? '−' : ''}{text}</span>
}

function Section({ title, grid, rows, onOpen, whole }: { title: string; grid: MonthsGrid; rows: Row[]; onOpen: (r: Row) => void; whole?: boolean }) {
  if (!rows.length) return null
  return (
    <>
      <tr className="section-row"><th scope="rowgroup">{title}</th><td colSpan={grid.periods.length} /></tr>
      {rows.map(r => (
        <tr key={r.key}>
          <th scope="row">
            {r.ref ? <button className="row-link" onClick={() => onOpen(r)}>{r.title}</button> : r.title}
          </th>
          {r.cells.map((c, i) => <td key={i} className={cellClass(grid, i)}><CellText cell={c} currency={r.currency} whole={whole} /></td>)}
        </tr>
      ))}
    </>
  )
}

function TotalRow({ label, cells, grid, currency, strong, signed }: { label: string; cells: Cell[]; grid: MonthsGrid; currency: string; strong?: boolean; signed?: boolean }) {
  return (
    <tr className={`total-row${strong ? ' strong' : ''}`}>
      <th scope="row">{label}</th>
      {cells.map((c, i) => (
        <td key={i} className={`${cellClass(grid, i)}${signed && c.amount < 0 ? ' short' : ''}`}>
          <CellText cell={c} currency={currency} signed={signed} whole />
        </td>
      ))}
    </tr>
  )
}
