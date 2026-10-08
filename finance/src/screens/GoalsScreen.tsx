// The Goals tab, from FinanceGoalsView.swift: one section each for
// saving, set-asides and debts. Each card shows progress, the plan in one
// line, and — once a payment's day has come — a Confirm button right there.

import { CompletionMark, SectionBox, VButton, accentStyle } from '@suite/ui/components'
import { useState } from 'react'
import {
  GOAL_KINDS, amountPaid, amountRemaining, isComplete, isDue, kindInfo, nextPayment, pace, planText, progress, projectedFinish, schedule,
  type FinanceGoal,
} from '../model/goals'
import { formatMoney, formatMoneyWhole } from '../model/money'
import { useGoals } from '../store/goals'
import { useCurrency } from '../store/settings'
import { GoalEditor, GoalPaymentSheet, type GoalEditorTarget, type PaymentTarget } from './GoalSheets'

const monthYear = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })

export function GoalsScreen() {
  const goals = useGoals(s => s.goals)
  const [editor, setEditor] = useState<GoalEditorTarget | null>(null)
  const [payment, setPayment] = useState<PaymentTarget | null>(null)

  return (
    <div className="page finance-goals">
      {GOAL_KINDS.map(kind => {
        const info = kindInfo[kind]
        const mine = goals.filter(g => g.kind === kind)
        return (
          <SectionBox key={kind} title={info.section} accent={info.accent}>
            {mine.length === 0 && <p className="help" style={{ margin: 0 }}>{info.empty}</p>}
            {mine.map(g => (
              <GoalCard key={g.id} goal={g} onEdit={() => setEditor({ mode: 'edit', goal: g })} onConfirm={p => setPayment({ mode: 'confirm', payment: p })} />
            ))}
            <VButton accent={info.accent} onClick={() => setEditor({ mode: 'new', kind })}>+ Add {info.label.toLowerCase()}</VButton>
          </SectionBox>
        )
      })}
      {editor && <GoalEditor target={editor} onClose={() => setEditor(null)} />}
      {payment && <GoalPaymentSheet target={payment} onClose={() => setPayment(null)} />}
    </div>
  )
}

function GoalCard({ goal, onEdit, onConfirm }: { goal: FinanceGoal; onEdit: () => void; onConfirm: (p: NonNullable<ReturnType<typeof nextPayment>>) => void }) {
  const currency = useCurrency()
  const money = (n: number) => formatMoney(n, currency)
  const accent = kindInfo[goal.kind].accent
  const plan = schedule(goal)
  const next = nextPayment(plan)
  const finish = projectedFinish(goal, plan)
  const done = isComplete(goal)
  const p = pace(goal)

  // What's left is the number that matters for a debt.
  const amounts = goal.kind === 'debt'
    ? `${formatMoneyWhole(amountRemaining(goal), currency)} left of ${formatMoneyWhole(goal.targetAmount, currency)}`
    : `${formatMoneyWhole(amountPaid(goal), currency)} of ${formatMoneyWhole(goal.targetAmount, currency)}`

  const bits = done ? [goal.kind === 'debt' ? 'Paid off' : 'Reached'] : [
    planText(goal, money),
    ...(finish ? [`done around ${monthYear(finish)}`] : []),
    ...(goal.targetDate ? [`aiming for ${monthYear(new Date(goal.targetDate))}`] : []),
  ]

  return (
    <div className="card goal-card" style={{ ...accentStyle(accent), border: 0, background: 'var(--surface-2)' }}>
      <button className="row spread" style={{ textAlign: 'left', width: '100%' }} onClick={onEdit}>
        <span style={{ fontWeight: 500, fontSize: 14 }}>{goal.title || 'Untitled'}</span>
        {done ? <CompletionMark on size={18} color={accent} /> : <span className="caption">{amounts}</span>}
      </button>
      <div className="progress" role="progressbar" aria-valuenow={Math.round(progress(goal) * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ width: `${progress(goal) * 100}%` }} />
      </div>
      <span className="caption2">{bits.join(' · ')}</span>
      {p?.kind === 'late' && (
        <span className="caption2">
          A little behind your date{p.needed ? ` — ${planText({ ...goal, paymentAmount: p.needed }, money)} would get there` : ''}.
        </span>
      )}
      {next && isDue(next) && (
        <div className="row spread due-row">
          <span className="caption">{money(next.amount)} planned {next.date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
          <button className="text-button" style={{ color: accent, fontWeight: 600 }} onClick={() => onConfirm(next)}>Confirm</button>
        </div>
      )}
    </div>
  )
}
