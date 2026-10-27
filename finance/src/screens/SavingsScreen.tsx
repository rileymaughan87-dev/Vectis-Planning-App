// The Savings tab (Finance pivot, Oct 2026): savings, investments and
// debts, each kept simple — how it stands, a small graph (going up, or
// coming down for a debt; recorded solid, the plan dotted), and three
// things to do: add, plan payments, record a payment.

import { SectionBox, VButton } from '@suite/ui/components'
import { useState } from 'react'
import { onBalance, type MoneyData } from '../model/accounts'
import {
  amountPaid, amountRemaining, goalSeries, isComplete, isDue, kindInfo, nextPayment, planText, projectedFinish, schedule,
  type FinanceGoal, type GoalKind, type SeriesPoint,
} from '../model/goals'
import { formatAmount } from '../model/money'
import { useAccounts } from '../store/accounts'
import { useEntries } from '../store/entries'
import { useGoals } from '../store/goals'
import { useMoneyTools } from '../store/money'
import { useSpending } from '../store/spending'
import { GoalEditor, GoalPaymentSheet, type GoalEditorTarget, type PaymentTarget } from './GoalSheets'

const SECTIONS: { title: string; kinds: GoalKind[]; add: GoalKind; addLabel: string; empty: string }[] = [
  { title: 'Savings', kinds: ['savings', 'setAside'], add: 'savings', addLabel: 'Add saving', empty: "Something you're saving up for — or a set-aside for a cost that comes round." },
  { title: 'Investments', kinds: ['investment'], add: 'investment', addLabel: 'Add investment', empty: 'Money you put in regularly to grow, with or without an aim.' },
  { title: 'Debts', kinds: ['debt'], add: 'debt', addLabel: 'Add debt', empty: "Something you're paying off, in regular payments." },
]

const monthYear = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })

export function SavingsScreen() {
  const goals = useGoals(s => s.goals)
  const { audits, transfers } = useAccounts()
  const tools = useMoneyTools()
  const data: MoneyData = { accounts: tools.accounts, goals, events: useEntries(s => s.events), spending: useSpending(s => s.entries), transfers }
  // A goal linked to an account follows its real balance.
  const real = (g: FinanceGoal) => onBalance(g, tools.accounts, audits, data)
  const [editor, setEditor] = useState<GoalEditorTarget | null>(null)
  const [payment, setPayment] = useState<PaymentTarget | null>(null)

  return (
    <div className="page finance-savings">
      {SECTIONS.map(sec => {
        const mine = goals.filter(g => sec.kinds.includes(g.kind))
        return (
          <SectionBox key={sec.title} title={sec.title} accent={kindInfo[sec.add].accent}>
            {mine.length === 0 && <p className="help" style={{ margin: 0 }}>{sec.empty}</p>}
            {mine.map(g => (
              <SavingsCard
                key={g.id}
                goal={real(g)}
                account={tools.accounts.find(a => a.id === g.accountID)?.name}
                onPlan={() => setEditor({ mode: 'edit', goal: g })}
                onRecord={() => {
                  // A planned payment whose day has come is recorded against the plan; otherwise it's an extra one.
                  const due = nextPayment(schedule(real(g)))
                  setPayment(due && isDue(due) ? { mode: 'confirm', payment: due } : { mode: 'extra', goal: g })
                }}
              />
            ))}
            <VButton accent={kindInfo[sec.add].accent} onClick={() => setEditor({ mode: 'new', kind: sec.add })}>+ {sec.addLabel}</VButton>
          </SectionBox>
        )
      })}
      {editor && <GoalEditor target={editor} onClose={() => setEditor(null)} />}
      {payment && <GoalPaymentSheet target={payment} onClose={() => setPayment(null)} />}
    </div>
  )
}

function SavingsCard({ goal, account, onPlan, onRecord }: { goal: FinanceGoal; account?: string; onPlan: () => void; onRecord: () => void }) {
  const tools = useMoneyTools()
  const currency = tools.goalCurrency(goal)
  const money = (n: number) => formatAmount(n, currency)
  const accent = kindInfo[goal.kind].accent
  const debt = goal.kind === 'debt'
  const payments = schedule(goal)
  const finish = projectedFinish(goal, payments)
  const series = goalSeries(goal, payments)
  const done = isComplete(goal)
  const figure = debt
    ? `${money(amountRemaining(goal))} owed`
    : goal.targetAmount > 0 ? `${money(amountPaid(goal))} of ${money(goal.targetAmount)}` : `${money(amountPaid(goal))} put in`

  return (
    <div className="card savings-card">
      <div className="row spread" style={{ alignItems: 'baseline' }}>
        <span style={{ fontWeight: 500, fontSize: 15 }}>{goal.title || kindInfo[goal.kind].label}</span>
        <span className="mono muted">{goal.kind === 'setAside' ? 'Set-aside' : ''}{account ? `${goal.kind === 'setAside' ? ' · ' : ''}${account}` : ''}</span>
      </div>
      <div className="savings-figure">{done ? (debt ? 'Paid off' : 'Reached') : figure}</div>
      <Sparkline points={series} accent={accent} />
      <span className="caption">
        {goal.paymentAmount > 0 ? planText(goal, money) : 'No payments planned yet'}
        {!done && finish ? ` · ${debt ? 'paid off' : 'done'} around ${monthYear(finish)}` : ''}
      </span>
      <div className="button-row">
        <VButton small kind="primary" accent={accent} onClick={onRecord}>Record payment</VButton>
        <VButton small accent={accent} onClick={onPlan}>Plan payments</VButton>
      </div>
    </div>
  )
}

/** A small line: recorded solid, the plan dotted, today marked. */
function Sparkline({ points, accent }: { points: SeriesPoint[]; accent: string }) {
  if (points.length < 2) return null
  const W = 300
  const H = 56
  const t0 = points[0].date.getTime()
  const t1 = Math.max(t0 + 1, points[points.length - 1].date.getTime())
  const max = Math.max(1, ...points.map(p => p.value))
  const x = (d: Date) => ((d.getTime() - t0) / (t1 - t0)) * W
  const y = (v: number) => H - 4 - (v / max) * (H - 8)
  const path = (ps: SeriesPoint[]) => ps.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const lastRecorded = points.reduce((k, p, i) => (p.planned ? k : i), 0)
  const recorded = points.slice(0, lastRecorded + 1)
  const plan = points.slice(lastRecorded)
  const now = Date.now()
  return (
    <svg className="sparkline" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" style={{ color: accent }}>
      <line x1="0" x2={W} y1={H - 4} y2={H - 4} className="sparkline-base" />
      {now > t0 && now < t1 && <line x1={x(new Date(now))} x2={x(new Date(now))} y1="0" y2={H} className="sparkline-today" />}
      {plan.length > 1 && <path d={path(plan)} className="sparkline-plan" />}
      {recorded.length > 1 && <path d={path(recorded)} className="sparkline-done" />}
    </svg>
  )
}
