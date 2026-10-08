// The Budget tab, from FinanceBudgetView.swift: one month's money in full
// — the totals, every line sorted into sections, room to save — plus how
// the months compare. Every line opens its editor; every section can add.
// Estimates are called out rather than blended in silently.
//
// New compared with the iPhone app: "a typical month" beside the real
// one, so a five-payday month doesn't look better than it is.

import { SectionBox, VButton } from '@suite/ui/components'
import { startOfMonth } from '@suite/months'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { monthBudget, monthKey, monthSummary, monthsAround, typicalMonth, type BudgetLine, type MonthSummary } from '../model/budget'
import { kindInfo, type GoalKind } from '../model/goals'
import { formatMoney, formatMoneyWhole } from '../model/money'
import { useEntries } from '../store/entries'
import { useGoals } from '../store/goals'
import { useCurrency } from '../store/settings'
import { EXPENSE, INCOME, UNCONFIRMED } from '../ui/semantic'
import { EntryEditor, type EntryEditorTarget } from './EntryEditor'
import { LeftOverTrend } from './LeftOverTrend'
import { GoalEditor, type GoalEditorTarget } from './GoalSheets'

const signed = (n: number, money: (n: number) => string) => (n < 0 ? '−' : '') + money(Math.abs(n))

export function BudgetScreen() {
  const events = useEntries(s => s.events)
  const goals = useGoals(s => s.goals)
  const currency = useCurrency()
  const money = (n: number) => formatMoney(n, currency)
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [entryEditor, setEntryEditor] = useState<EntryEditorTarget | null>(null)
  const [goalEditor, setGoalEditor] = useState<GoalEditorTarget | null>(null)

  const summary = monthSummary(events, goals, month)
  const budget = monthBudget(events, goals, month)
  const typical = typicalMonth(events, goals, month)
  // A fixed window around this month, so the chart doesn't jump about when you pick a month from it.
  const trend = monthsAround(new Date(), 2, 3).map(m => monthSummary(events, goals, m))
  const today = new Date()
  const newDate = month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth() ? today : month

  const open = (line: BudgetLine) => {
    if (line.source.kind === 'entry') setEntryEditor({ mode: 'edit', event: line.source.event })
    else setGoalEditor({ mode: 'edit', goal: line.source.goal })
  }
  const goalAccent = (k: GoalKind) => kindInfo[k].accent

  return (
    <div className="page finance-budget">
      <div className="row spread month-head">
        <button className="icon-button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month"><ChevronLeft size={20} /></button>
        <button className="month-title" onClick={() => setMonth(startOfMonth(new Date()))} title="Back to this month">
          {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </button>
        <button className="icon-button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month"><ChevronRight size={20} /></button>
      </div>

      <div className="budget-columns">
        <div className="budget-col">
          <SectionBox title="In and out" accent="var(--primary)">
            <InAndOut summary={summary} money={money} />
          </SectionBox>
          {(typical.income > 0 || typical.spending > 0) && <TypicalMonth summary={summary} typical={typical} currency={currency} />}
          <SectionBox title="Room to save" accent="var(--primary)">
            <RoomToSave summary={summary} money={money} />
          </SectionBox>
          <SectionBox title="Left over each month" accent="var(--primary)" subtitle="Tap a month">
            <LeftOverTrend summaries={trend} selected={monthKey(month)} onSelect={setMonth} currency={currency} />
          </SectionBox>
        </div>

        <div className="budget-col">
          <BudgetSection title="Money in" accent={INCOME} lines={budget.income} money={money} onTap={open}
            empty="No income planned this month." add="Add income"
            onAdd={() => setEntryEditor({ mode: 'new', date: newDate, entryType: 'income' })} />
          <BudgetSection title="Fixed costs" accent={EXPENSE} lines={budget.fixed} money={money} onTap={open}
            empty="Rent, bills, subscriptions — things that stay the same." add="Add fixed cost"
            onAdd={() => setEntryEditor({ mode: 'new', date: newDate, entryType: 'expense', category: 'fixed' })} />
          <BudgetSection title="Flexible spending" accent={EXPENSE} lines={budget.flexible} money={money} onTap={open}
            empty="Groceries, eating out, fuel — things that vary." add="Add flexible spending"
            onAdd={() => setEntryEditor({ mode: 'new', date: newDate, entryType: 'expense', category: 'flexible' })} />
          <BudgetSection title="Debt payments" accent={goalAccent('debt')} lines={budget.debts} money={money} onTap={open}
            empty="No debt payments this month." add="Add debt"
            onAdd={() => setGoalEditor({ mode: 'new', kind: 'debt' })} />
          <BudgetSection title="Saving and set-asides" accent={goalAccent('savings')} lines={budget.savings} money={money} onTap={open}
            empty="Nothing being put aside this month." add="Add saving"
            onAdd={() => setGoalEditor({ mode: 'new', kind: 'savings' })} />
        </div>
      </div>

      {entryEditor && <EntryEditor target={entryEditor} onClose={() => setEntryEditor(null)} />}
      {goalEditor && <GoalEditor target={goalEditor} onClose={() => setGoalEditor(null)} />}
    </div>
  )
}

/** Money in, money out (and what it's made of), and the difference. */
function InAndOut({ summary: s, money }: { summary: MonthSummary; money: (n: number) => string }) {
  const scale = Math.max(s.income, s.spending)
  // A short month is information, not a verdict.
  const detail = s.income === 0 && s.spending === 0 ? 'Nothing planned this month yet.'
    : s.leftOver >= 0 ? (s.income > 0 ? `More in than out — ${Math.round((s.leftOver / s.income) * 100)}% of what comes in.` : 'More in than out.')
    : `${money(-s.leftOver)} more going out than coming in.`
  const parts = ([['Fixed', s.fixed], ['Flexible', s.flexible], ['Debt payments', s.debtPayments]] as const).filter(([, v]) => v > 0)
  return (
    <>
      <div>
        <span className="caption">Difference</span>
        <div className="headline-number">{signed(s.leftOver, money)}</div>
        <span className="caption">{detail}</span>
      </div>
      <Comparison label="Money in" amount={s.income} fraction={scale ? s.income / scale : 0} color={INCOME} money={money} />
      <Comparison label="Money out" amount={s.spending} fraction={scale ? s.spending / scale : 0} color={EXPENSE} money={money} />
      {parts.length > 0 && <span className="caption2">{parts.map(([l, v]) => `${l} ${money(v)}`).join(' · ')}</span>}
      {s.estimated > 0 && <span className="caption2">Includes {money(s.estimated)} of estimated amounts not confirmed yet.</span>}
    </>
  )
}

/** A labelled amount with a bar on a shared scale; the label says what it is, so colour is never the only clue. */
function Comparison({ label, amount, fraction, color, money }: { label: string; amount: number; fraction: number; color: string; money: (n: number) => string }) {
  return (
    <div className="comparison">
      <div className="row spread"><span>{label}</span><strong className="num">{money(amount)}</strong></div>
      <div className="comparison-track"><div style={{ width: `${Math.min(Math.max(fraction, 0), 1) * 100}%`, background: color }} /></div>
    </div>
  )
}

function TypicalMonth({ summary, typical, currency }: { summary: MonthSummary; typical: ReturnType<typeof typicalMonth>; currency: string }) {
  const whole = (n: number) => formatMoneyWhole(n, currency)
  const gap = summary.leftOver - typical.leftOver
  const note = Math.abs(gap) < Math.max(25, Math.abs(typical.income) * 0.03) ? 'This month is about typical.'
    : gap > 0 ? `This month leaves about ${whole(gap)} more than a typical one — often an extra weekly payday, or one-offs being light.`
    : `This month leaves about ${whole(-gap)} less than a typical one — often an extra weekly bill, or one-offs.`
  return (
    <div className="editor-box typical">
      <div className="editor-box-head"><span className="stripe" style={{ background: 'var(--text-3)' }} />A typical month</div>
      <div className="typical-grid">
        <span className="caption">In</span><span className="caption">Out</span><span className="caption">Left over</span>
        <strong className="num">{whole(typical.income)}</strong>
        <strong className="num">{whole(typical.spending)}</strong>
        <strong className="num">{(typical.leftOver < 0 ? '−' : '') + whole(Math.abs(typical.leftOver))}</strong>
      </div>
      <p className="help">{note} Weekly amounts are spread as 52 weeks over 12 months; one-offs and saving aren't counted.</p>
    </div>
  )
}

/** Unplanned money is a choice — including leaving it as breathing room — never money being wasted. */
function RoomToSave({ summary: s, money }: { summary: MonthSummary; money: (n: number) => string }) {
  const note = s.leftOver <= 0 ? 'Nothing left over to put aside this month — useful to know when planning the next.'
    : s.stillFree < -0.005 ? `Goal payments are ${money(-s.stillFree)} more than what's left over. Worth a look at the plan.`
    : s.stillFree < 0.005 ? 'Everything left over is already going to your goals.'
    : 'Not planned for anything yet. It could go to a goal, or stay as breathing room.'
  const row = (label: string, amount: number, bold = false) => (
    <div className="row spread" style={{ fontWeight: bold ? 600 : 400 }}><span>{label}</span><span className="num">{signed(amount, money)}</span></div>
  )
  return (
    <>
      {row('Left over after spending', s.leftOver)}
      {row('Going to saving and set-asides', s.goalSavings)}
      <hr className="divider" style={{ margin: 0 }} />
      {row('Still free', s.stillFree, true)}
      <p className="help" style={{ margin: 0 }}>{note}</p>
    </>
  )
}

function BudgetSection(props: {
  title: string; accent: string; lines: BudgetLine[]; empty: string; add: string
  money: (n: number) => string; onTap: (l: BudgetLine) => void; onAdd: () => void
}) {
  const total = props.lines.reduce((a, l) => a + l.amount, 0)
  return (
    <SectionBox title={props.title} accent={props.accent} subtitle={props.lines.length ? props.money(total) : undefined}>
      {props.lines.length === 0 && <p className="help" style={{ margin: 0 }}>{props.empty}</p>}
      {props.lines.map(line => (
        <button key={line.id} className="budget-line" onClick={() => props.onTap(line)}>
          <span className="grow" style={{ minWidth: 0 }}>
            <div className="ellipsis">{line.title || 'Untitled'}</div>
            <div className="caption2">{line.detail}</div>
          </span>
          {line.isEstimate && <span className="caption2" style={{ color: UNCONFIRMED, fontWeight: 600 }}>Estimated</span>}
          <strong className="num">{props.money(line.amount)}</strong>
          <ChevronRight size={14} className="muted" />
        </button>
      ))}
      <VButton accent={props.accent} onClick={props.onAdd}>+ {props.add}</VButton>
    </SectionBox>
  )
}

