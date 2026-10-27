// The Budget tab (Finance pivot, Oct 2026): the plan, like Riley's budget
// spreadsheet — one column per pay period (payday to the day before the
// next), what comes in and which account it lands in, the bills and
// everyday spending and which account each comes out of, what's set
// aside, debt payments, what's left over — and what each account needs
// at payday to cover its share. The Calendar shows the same by day.

import { Segmented } from '@suite/ui/components'
import { Plus } from 'lucide-react'
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { entryAccount, spendingAccount } from '../model/accounts'
import { mainPay } from '../model/forward'
import { formatAmount } from '../model/money'
import { leftOverNote, monthsGrid, periodLabel, type Cell, type MonthsGrid, type Row } from '../model/months'
import { accountBudget } from '../model/payday'
import { useAccounts } from '../store/accounts'
import { useEntries } from '../store/entries'
import { useGoals } from '../store/goals'
import { useMoneyTools } from '../store/money'
import { useSettings } from '../store/settings'
import { useSpending } from '../store/spending'
import { CalendarScreen } from './CalendarScreen'
import { EntryEditor, type EntryEditorTarget } from './EntryEditor'
import { GoalEditor } from './GoalSheets'

type View = 'sheet' | 'calendar'

export function BudgetScreen() {
  const [view, setView] = useState<View>(() => (sessionStorage.getItem('finance:ui:budget') === 'calendar' ? 'calendar' : 'sheet'))
  const choose = (v: View) => {
    setView(v)
    try {
      sessionStorage.setItem('finance:ui:budget', v)
    } catch {
      // Just won't be remembered.
    }
  }
  return (
    <div className="finance-months">
      <div className="months-bar">
        <Segmented<View> label="View" value={view} onChange={choose} options={[{ value: 'sheet', label: 'Budget' }, { value: 'calendar', label: 'Calendar' }]} />
      </div>
      {view === 'sheet' ? <div className="page"><BudgetSheet /></div> : <CalendarScreen />}
    </div>
  )
}

/** A section of the sheet: its rows and a subtotal per period (home currency), or none where adding up wouldn't mean anything. */
interface Section { key: string; title: string; rows: Row[]; subtotal: Cell[] | null }

function BudgetSheet() {
  const { audits, transfers } = useAccounts()
  const events = useEntries(s => s.events)
  const goals = useGoals(s => s.goals)
  const spending = useSpending(s => s.entries)
  const paydayEntryID = useSettings(s => s.paydayEntryID)
  const tools = useMoneyTools()
  const [editing, setEditing] = useState<EntryEditorTarget | null>(null)
  const [goalID, setGoalID] = useState<string | null>(null)
  const toHome = (n: number, c: string) => tools.convert(n, c, tools.home) ?? n

  const { grid, sections } = useMemo(() => {
    const data = { accounts: tools.accounts, audits, events, goals, spending, transfers }
    const several = tools.accounts.filter(a => a.kind === 'current' || a.kind === 'credit').length > 1
    const grid = monthsGrid(data, {
      paydayEntryID,
      home: tools.home,
      currencyOf: tools.currencyOf,
      goalCurrency: tools.goalCurrency,
      entryCurrency: tools.entryCurrency,
      toHome,
      // Where each one lands or comes out of, once there's more than one account.
      entryNote: e => {
        if (!several) return undefined
        const a = entryAccount(e, tools.accounts)
        return a ? `${e.entryType === 'income' ? 'into' : 'from'} ${a.name}` : undefined
      },
      before: 1,
      after: 10,
    })
    const sum = (rows: Row[]) => grid.periods.map((_, i) => {
      let amount = 0
      let estimate = false
      for (const r of rows) {
        const c = r.cells[i]
        if (!c) continue
        amount += toHome(c.amount, r.currency)
        estimate ||= c.estimate
      }
      return { amount: Math.round(amount * 100) / 100, estimate }
    })
    const groupRows = (id: string) => grid.groups.find(g => g.id === id)?.rows ?? []
    const everyday = [...grid.living, ...(grid.spending ? [grid.spending] : [])]

    // What each other account needs at payday for its share of the plan (before anything's already in it — Accounts tops up from that).
    const pay = mainPay(events, paydayEntryID)
    const payAccount = (pay && entryAccount(pay, tools.accounts)) ?? spendingAccount(tools.accounts)
    const sendRows: Row[] = tools.accounts
      .filter(a => a.kind === 'current' && a.id !== payAccount?.id)
      .map(a => ({
        key: `send-${a.id}`,
        title: `To ${a.name || 'account'}`,
        currency: tools.currencyOf(a),
        cells: grid.periods.map(p => {
          const b = accountBudget(a, data, p)
          const need = Math.round((b.out - b.in) * 100) / 100
          return need > 0 ? { amount: need, estimate: false } : null
        }),
      }))
      .filter(r => r.cells.some(Boolean))

    const sections: Section[] = [
      { key: 'in', title: 'Coming in', rows: grid.income, subtotal: grid.totalIn },
      { key: 'bills', title: 'Bills', rows: grid.bills, subtotal: sum(grid.bills) },
      { key: 'everyday', title: 'Everyday', rows: everyday, subtotal: sum(grid.living) },
      { key: 'setAside', title: 'Set aside', rows: groupRows('setAside'), subtotal: sum(groupRows('setAside')) },
      { key: 'debts', title: 'Debts', rows: groupRows('debts'), subtotal: sum(groupRows('debts')) },
      { key: 'send', title: 'At payday, send', rows: sendRows, subtotal: null },
    ].filter(s => s.rows.length)
    return { grid, sections }
  }, [tools, audits, transfers, events, goals, spending, paydayEntryID])

  const openRow = (r: Row) => {
    if (r.ref?.type === 'entry') {
      const e = events.find(x => x.id === r.ref!.id)
      if (e) setEditing({ mode: 'edit', event: e })
    } else if (r.ref?.type === 'goal') setGoalID(r.ref.id)
  }
  // Open on Now (the month before is a swipe back).
  const scrollRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const box = scrollRef.current
    const now = box?.querySelector<HTMLElement>('.period-row .now')
    const label = box?.querySelector<HTMLElement>('.period-row .corner')
    if (box && now && label) box.scrollLeft += now.getBoundingClientRect().left - label.getBoundingClientRect().right
  }, [grid.current, grid.periods.length])
  const goal = goals.find(g => g.id === goalID)
  const cols = grid.periods.length

  return (
    <>
      <div className="months-scroll" role="region" aria-label="Budget" tabIndex={0} ref={scrollRef}>
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
            {!sections.length && (
              <tr><td colSpan={cols + 1} className="empty-cell">Add your pay and bills (below) and they fill in here.</td></tr>
            )}
            {sections.map((s, n) => <SectionRows key={s.key} index={n + 1} section={s} grid={grid} home={tools.home} onOpen={openRow} />)}
          </tbody>
        </table>
      </div>
      <p className="help months-legend">
        <span className="swipe-hint">Swipe for more months. </span>
        {grid.byPay ? 'Each column runs from a payday to the day before the next. ' : ''}
        Rows are in their own currency; totals in {tools.home}. <span className="est">Dotted amounts</span> vary and aren't confirmed yet.
        Tap a row to change it — including which account it comes out of.
      </p>
      <button className="text-button" style={{ alignSelf: 'flex-start' }} onClick={() => setEditing({ mode: 'new', date: new Date() })}>
        <Plus size={14} style={{ verticalAlign: -2 }} /> Add pay, a bill or spending
      </button>
      {editing && <EntryEditor target={editing} onClose={() => setEditing(null)} />}
      {goal && <GoalEditor target={{ mode: 'edit', goal }} onClose={() => setGoalID(null)} />}
    </>
  )
}

const cellClass = (grid: MonthsGrid, i: number) => (i === grid.current ? 'now' : i < grid.current ? 'past' : '')

/** One amount: whole pounds unless it has pence; blank when there's nothing; estimates dotted. */
function Amount({ cell, currency, signed }: { cell: Cell | null; currency: string; signed?: boolean }): ReactNode {
  if (!cell || (Math.abs(cell.amount) < 0.005 && !signed)) return null
  const text = formatAmount(Math.abs(cell.amount), currency)
  return <span className={cell.estimate ? 'est' : undefined}>{cell.amount < -0.004 ? '−' : ''}{text}</span>
}

function SectionRows({ index, section: s, grid, home, onOpen }: { index: number; section: Section; grid: MonthsGrid; home: string; onOpen: (r: Row) => void }) {
  return (
    <>
      <tr className="group-row">
        <th scope="rowgroup">
          <span className="group-head">
            <span className="group-index">{String(index).padStart(2, '0')}</span>
            <span className="group-title">{s.title}</span>
          </span>
        </th>
        {s.subtotal
          ? s.subtotal.map((c, i) => <td key={i} className={cellClass(grid, i)}><Amount cell={c} currency={home} /></td>)
          : <td colSpan={grid.periods.length} />}
      </tr>
      {s.rows.map(r => (
        <tr key={r.key} className="item-row">
          <th scope="row">
            {r.ref ? (
              <button className="row-link" onClick={() => onOpen(r)}>
                <span className="row-title">{r.title}</span>
                {r.note && <span className="row-note">{r.note}</span>}
              </button>
            ) : (
              <span className="row-link">
                <span className="row-title">{r.title}</span>
                {r.note && <span className="row-note">{r.note}</span>}
              </span>
            )}
          </th>
          {r.cells.map((c, i) => <td key={i} className={cellClass(grid, i)}><Amount cell={c} currency={r.currency} /></td>)}
        </tr>
      ))}
    </>
  )
}
