// The Months tab (Oct 2026): planning in one place. Months is the grid —
// one column per pay period, like Riley's budget spreadsheet — with the
// Calendar and the full list of entries beside it, so adding, editing and
// confirming all happen here.

import { Segmented } from '@suite/ui/components'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { formatAmount } from '../model/money'
import { leftOverNote, monthsGrid, periodLabel, type Cell, type Group, type GroupID, type MonthsGrid, type Row } from '../model/months'
import { useAccounts } from '../store/accounts'
import { useEntries } from '../store/entries'
import { useGoals } from '../store/goals'
import { useMoneyTools } from '../store/money'
import { useSettings } from '../store/settings'
import { useSpending } from '../store/spending'
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
  const [open, setOpen] = useState<Record<string, boolean>>(readOpen)

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

  const openRow = (r: Row) => {
    if (r.ref?.type === 'entry') {
      const e = events.find(x => x.id === r.ref!.id)
      if (e) setEditing({ mode: 'edit', event: e })
    } else if (r.ref?.type === 'goal') setGoalID(r.ref.id)
  }
  const toggle = (id: GroupID) => setOpen(o => {
    const next = { ...o, [id]: !isOpen(o, id) }
    try {
      sessionStorage.setItem('finance:ui:months-open', JSON.stringify(next))
    } catch {
      // Just won't be remembered.
    }
    return next
  })
  // Open on Now (the month before is a swipe back).
  const scrollRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const box = scrollRef.current
    const now = box?.querySelector<HTMLElement>('.period-row .now')
    const label = box?.querySelector<HTMLElement>('.period-row .corner')
    if (box && now && label) box.scrollLeft += now.getBoundingClientRect().left - label.getBoundingClientRect().right
  }, [grid.current, grid.periods.length])
  const goal = goals.find(g => g.id === goalID)
  const nothing = !grid.income.length && !grid.outgoing.length && !grid.goals.length && !grid.setAsides.length
  const cols = grid.periods.length

  return (
    <>
      <div className="months-scroll" role="region" aria-label="Months" tabIndex={0} ref={scrollRef}>
        <table className="months-grid">
          <colgroup>
            <col className="label-col" />
            {grid.periods.map((_, i) => <col key={i} className="amount-col" />)}
          </colgroup>
          <thead>
            <tr className="period-row">
              <th scope="col" className="corner"><span className="mono muted">{grid.byPay ? 'From payday' : 'Month'}</span></th>
              {grid.periods.map((p, i) => {
                const l = periodLabel(p, grid.byPay)
                return (
                  <th key={i} scope="col" className={cellClass(grid, i)}>
                    <div className="period-month">{i === grid.current ? 'Now' : l.month}</div>
                    <div className="period-from">{i === grid.current ? l.month : l.from}</div>
                  </th>
                )
              })}
            </tr>
            {/* The answer, pinned under the months: what's left once everything has its job. */}
            <tr className="left-row">
              <th scope="row">Left over</th>
              {grid.leftOver.map((c, i) => {
                // A month with nothing in or out has nothing to say.
                if (!grid.totalIn[i].amount && !grid.totalOut[i].amount) return <td key={i} className={cellClass(grid, i)} />
                const note = leftOverNote(c)
                return (
                  <td key={i} className={`${cellClass(grid, i)} ${note === 'short' ? 'short' : note === 'not planned yet' ? 'room' : ''}`}>
                    <div className="left-figure"><Amount cell={c} currency={tools.home} signed /></div>
                    <div className="left-note">{note}</div>
                  </td>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {nothing && (
              <tr><td colSpan={cols + 1} className="empty-cell">Add your pay and bills (Entries above) and they fill in here.</td></tr>
            )}
            {grid.groups.map((g, n) => {
              const collapsible = COLLAPSIBLE.includes(g.id)
              const shown = !collapsible || isOpen(open, g.id)
              return (
                <GroupRows
                  key={g.id}
                  index={n + 1}
                  group={g}
                  grid={grid}
                  home={tools.home}
                  collapsible={collapsible}
                  shown={shown}
                  onToggle={() => toggle(g.id)}
                  onOpen={openRow}
                />
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="help months-legend">
        <span className="swipe-hint">Swipe for more months. </span>
        {grid.byPay ? 'Each column runs from a payday to the day before the next — one pay packet and what it covers. ' : ''}
        Rows are in their own currency; totals in {tools.home}.{' '}
        <span className="est">Dotted amounts</span> vary and aren't confirmed yet. Tap a row to change it.
      </p>
      <button className="text-button" style={{ alignSelf: 'flex-start' }} onClick={() => setEditing({ mode: 'new', date: new Date() })}>
        <Plus size={14} style={{ verticalAlign: -2 }} /> Add an entry
      </button>
      {editing && <EntryEditor target={editing} onClose={() => setEditing(null)} />}
      {goal && <GoalEditor target={{ mode: 'edit', goal }} onClose={() => setGoalID(null)} />}
    </>
  )
}

/** Debts, what's still owed and what's saved start folded to their subtotal. */
const COLLAPSIBLE: GroupID[] = ['debts', 'owed', 'saved']
const isOpen = (o: Record<string, boolean>, id: GroupID) => o[id] ?? false
function readOpen(): Record<string, boolean> {
  try {
    return JSON.parse(sessionStorage.getItem('finance:ui:months-open') ?? '{}') ?? {}
  } catch {
    return {}
  }
}

const cellClass = (grid: MonthsGrid, i: number) => (i === grid.current ? 'now' : i < grid.current ? 'past' : '')

/** One amount: whole pounds unless it has pence; blank when there's nothing; estimates dotted. */
function Amount({ cell, currency, signed }: { cell: Cell | null; currency: string; signed?: boolean }): ReactNode {
  if (!cell || (Math.abs(cell.amount) < 0.005 && !signed)) return null
  const text = formatAmount(Math.abs(cell.amount), currency)
  return <span className={cell.estimate ? 'est' : undefined}>{cell.amount < -0.004 ? '−' : ''}{text}</span>
}

function GroupRows({ index, group: g, grid, home, collapsible, shown, onToggle, onOpen }: {
  index: number
  group: Group
  grid: MonthsGrid
  home: string
  collapsible: boolean
  shown: boolean
  onToggle: () => void
  onOpen: (r: Row) => void
}) {
  const head = (
    <span className="group-head">
      <span className="group-index">{String(index).padStart(2, '0')}</span>
      <span className="group-title">{g.title}</span>
      {collapsible && (shown ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />)}
    </span>
  )
  return (
    <>
      <tr className="group-row">
        <th scope="rowgroup">
          {collapsible ? (
            <button className="group-toggle" onClick={onToggle} aria-expanded={shown} aria-label={`${g.title}: ${shown ? 'fold away' : 'show each'}`}>{head}</button>
          ) : head}
        </th>
        {g.subtotal
          ? g.subtotal.map((c, i) => <td key={i} className={cellClass(grid, i)}><Amount cell={c} currency={home} /></td>)
          : <td colSpan={grid.periods.length} />}
      </tr>
      {shown && g.rows.map(r => (
        <tr key={r.key} className="item-row">
          <th scope="row">
            {r.ref ? (
              <button className="row-link" onClick={() => onOpen(r)}>
                <span className="row-title">{r.title}</span>
                {r.note && <span className="row-note">{r.note}</span>}
              </button>
            ) : <span className="row-title">{r.title}</span>}
          </th>
          {r.cells.map((c, i) => <td key={i} className={cellClass(grid, i)}><Amount cell={c} currency={r.currency} /></td>)}
        </tr>
      ))}
    </>
  )
}
