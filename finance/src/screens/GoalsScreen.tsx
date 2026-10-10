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
import { onBalance, type MoneyData } from '../model/accounts'
import { useAccounts } from '../store/accounts'
import { useEntries } from '../store/entries'
import { useGoals } from '../store/goals'
import { useSpending } from '../store/spending'
import { useCurrency } from '../store/settings'
import { GoalEditor, GoalPaymentSheet, type GoalEditorTarget, type PaymentTarget } from './GoalSheets'

const monthYear = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })

export function GoalsScreen() {
  const goals = useGoals(s => s.goals)
  const { accounts, audits } = useAccounts()
  const data: MoneyData = { accounts, goals, events: useEntries(s => s.events), spending: useSpending(s => s.entries) }
  // A goal linked to an account follows its real balance.
  const real = (g: FinanceGoal) => onBalance(g, accounts, audits, data)
  const accountName = (g: FinanceGoal) => accounts.find(a => a.id === g.accountID)?.name
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
              <GoalCard key={g.id} goal={real(g)} account={accountName(g)} onEdit={() => setEditor({ mode: 'edit', goal: g })} onConfirm={p => setPayment({ mode: 'confirm', payment: p })} />
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

function GoalCard({ goal, account, onEdit, onConfirm }: { goal: FinanceGoal; account?: string; onEdit: () => void; onConfirm: (p: NonNullable<ReturnType<typeof nextPayment>>) => void }) {
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
    <div className="card goal-card" style={accentStyle(accent)}>
      <button className="row spread" style={{ textAlign: 'left', width: '100%', alignItems: 'baseline' }} onClick={onEdit}>
        <span style={{ fontWeight: 500, fontSize: 15 }}>{goal.title || 'Untitled'}</span>
        {done ? <CompletionMark on size={18} color={accent} /> : <span className="caption num">{amounts}</span>}
      </button>
      <div className="progress" role="progressbar" aria-valuenow={Math.round(progress(goal) * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ width: `${progress(goal) * 100}%` }} />
      </div>
      <span className="mono muted">{bits.join(' · ')}</span>
      {account && <span className="mono muted">On {account} · from your last check</span>}
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
