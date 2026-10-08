// The goal editor and the payment pop-up, from FinanceGoalSheets.swift.
// New compared with the iPhone app: payments every 2 weeks; weekly
// payments land on the first payment's weekday (no separate picker); a
// recorded payment can be corrected or removed; and with a date to aim
// for, the plan says plainly whether it gets there.

import { dayFromKey, dayKey, parseDate, startOfDay, toISO } from '@suite/dates'
import { EditorBox, Field, Segmented, Sheet, Toggle, VButton } from '@suite/ui/components'
import { useState } from 'react'
import {
  GOAL_KINDS, isComplete, kindInfo, makeGoal, planText, schedule, suggestedPayment, type FinanceGoal, type GoalFrequency, type GoalKind,
  type GoalPayment,
} from '../model/goals'
import { amountText, formatMoney, parseAmount } from '../model/money'
import { useGoals } from '../store/goals'
import { useCurrency } from '../store/settings'

const longDate = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
const shortDate = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export type GoalEditorTarget = { mode: 'new'; kind: GoalKind } | { mode: 'edit'; goal: FinanceGoal }

export function GoalEditor({ target, onClose }: { target: GoalEditorTarget; onClose: () => void }) {
  const { goals, addGoal, updateGoal, deleteGoal } = useGoals()
  const currency = useCurrency()
  const money = (n: number) => formatMoney(n, currency)
  const original = target.mode === 'edit' ? target.goal : null
  // The live copy, so payments recorded while the editor is open show and aren't lost on save.
  const live = original ? goals.find(g => g.id === original.id) ?? original : null

  const [title, setTitle] = useState(original?.title ?? '')
  const [kind, setKind] = useState<GoalKind>(original?.kind ?? (target.mode === 'new' ? target.kind : 'savings'))
  const [targetText, setTargetText] = useState(amountText(original?.targetAmount ?? 0))
  const [startingText, setStartingText] = useState(amountText(original?.startingAmount ?? 0))
  const [paymentText, setPaymentText] = useState(amountText(original?.paymentAmount ?? 0))
  const [frequency, setFrequency] = useState<GoalFrequency>(original?.frequency ?? 'monthly')
  const [firstDate, setFirstDate] = useState(dayKey(original ? parseDate(original.firstPaymentDate) : new Date()))
  const [targetDate, setTargetDate] = useState(original?.targetDate)
  const [paymentSheet, setPaymentSheet] = useState<PaymentTarget | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const info = kindInfo[kind]
  const first = firstDate ? dayFromKey(firstDate) : startOfDay(new Date())
  const draft: FinanceGoal = {
    ...(live ?? makeGoal({ title: '', kind })),
    title: title.trim(),
    kind,
    targetAmount: Math.abs(parseAmount(targetText) ?? 0),
    startingAmount: kind === 'debt' ? 0 : Math.abs(parseAmount(startingText) ?? 0),
    paymentAmount: Math.abs(parseAmount(paymentText) ?? 0),
    frequency,
    weekday: frequency === 'weekly' ? first.getDay() + 1 : undefined,
    firstPaymentDate: toISO(first),
    targetDate,
  }
  const plan = schedule(draft)
  const planned = plan.filter(p => !p.confirmed)
  const recorded = plan.filter(p => p.confirmed).reverse()
  const suggestion = suggestedPayment(draft)
  const finish = planned.at(-1)?.date
  const late = Boolean(targetDate && finish && finish > startOfDay(parseDate(targetDate)))

  const projection = draft.targetAmount <= 0 ? 'Enter an amount to see the plan.'
    : isComplete(draft) ? (kind === 'debt' ? 'Already paid off.' : 'Already reached.')
    : draft.paymentAmount <= 0 ? 'No regular payment yet — you can still add payments as you go.'
    : `${planned.length} payment${planned.length === 1 ? '' : 's'} · done around ${finish ? longDate(finish) : '—'}`

  const save = () => {
    const goal = { ...draft, title: draft.title || 'Untitled' }
    if (original) updateGoal(goal)
    else addGoal(goal)
    onClose()
  }

  return (
    <Sheet title={original ? 'Edit goal' : 'New goal'} onClose={onClose} right={{ label: original ? 'Save' : 'Add', onClick: save }}>
      <EditorBox title="Name" accent={info.accent}>
        <input autoFocus={!original} value={title} onChange={e => setTitle(e.target.value)} placeholder={info.placeholder} aria-label="Name" style={{ fontSize: 19 }} />
        <Segmented<GoalKind> label="Kind" value={kind} onChange={setKind} options={GOAL_KINDS.map(k => ({ value: k, label: kindInfo[k].label }))} />
        <p className="help">{info.empty}</p>
      </EditorBox>

      <EditorBox title="Amount" accent={info.accent}>
        <div className="inline-fields">
          <Field label={info.target}>
            <input inputMode="decimal" value={targetText} onChange={e => setTargetText(e.target.value)} placeholder="0" />
          </Field>
          {kind !== 'debt' && (
            <Field label={kind === 'savings' ? 'Already saved' : 'Already put aside'}>
              <input inputMode="decimal" value={startingText} onChange={e => setStartingText(e.target.value)} placeholder="0" />
            </Field>
          )}
        </div>
      </EditorBox>

      <EditorBox title="Payments" accent={info.accent}>
        <Segmented<GoalFrequency>
          label="How often"
          value={frequency}
          onChange={setFrequency}
          options={[{ value: 'weekly', label: 'Weekly' }, { value: 'fortnightly', label: '2 weeks' }, { value: 'monthly', label: 'Monthly' }]}
        />
        <div className="inline-fields">
          <Field label={frequency === 'weekly' ? 'Each week' : frequency === 'fortnightly' ? 'Every 2 weeks' : 'Each month'}>
            <input inputMode="decimal" value={paymentText} onChange={e => setPaymentText(e.target.value)} placeholder="0" />
          </Field>
          <Field label="First payment">
            <input type="date" value={firstDate} onChange={e => setFirstDate(e.target.value)} />
          </Field>
        </div>
        <span className="caption">{projection}</span>
      </EditorBox>

      <EditorBox title={kind === 'setAside' ? 'Needed by' : 'Finish by'} accent={info.accent}>
        <Toggle
          label="Aim for a date"
          checked={Boolean(targetDate)}
          onChange={on => setTargetDate(on ? toISO(new Date(first.getFullYear() + 1, first.getMonth(), first.getDate())) : undefined)}
        />
        {targetDate && (
          <>
            <Field label="Date">
              <input type="date" value={dayKey(parseDate(targetDate))} onChange={e => e.target.value && setTargetDate(toISO(dayFromKey(e.target.value)))} />
            </Field>
            {late && <p className="help">At this rate it's done around {finish && longDate(finish)}, a little after your date.</p>}
            {suggestion !== undefined && suggestion !== draft.paymentAmount && (
              <div className="row spread">
                <span className="caption">{planText({ frequency, paymentAmount: suggestion }, money)} gets there by then</span>
                <button className="text-button" onClick={() => setPaymentText(amountText(suggestion))}>Use this</button>
              </div>
            )}
          </>
        )}
      </EditorBox>

      {live && (
        <EditorBox title="Payments made" accent={info.accent} trailing={recorded.length ? String(recorded.length) : undefined}>
          {recorded.length === 0 && <p className="help">None yet. Planned payments show on the Goals page and the calendar to confirm.</p>}
          {recorded.map(p => (
            <button key={dayKey(p.date)} className="row spread list-row" style={{ textAlign: 'left' }} onClick={() => setPaymentSheet({ mode: 'recorded', payment: p })}>
              <span>{shortDate(p.date)}</span>
              <span className={p.amount === 0 ? 'muted' : ''}>{p.amount === 0 ? 'Skipped' : money(p.amount)}</span>
            </button>
          ))}
          {recorded.length > 0 && <p className="help">Tap a payment to correct it or take it off.</p>}
          <VButton accent={info.accent} onClick={() => setPaymentSheet({ mode: 'extra', goal: draft })}>+ Add an extra payment</VButton>
        </EditorBox>
      )}

      {original && !confirmDelete && <VButton kind="destructive" onClick={() => setConfirmDelete(true)}>Delete goal</VButton>}
      {original && confirmDelete && (
        <div className="editor-box">
          <strong>Delete {original.title || 'this goal'}?</strong>
          <p className="help">Its plan and every recorded payment go with it.</p>
          <VButton kind="destructive" onClick={() => { deleteGoal(original.id); onClose() }}>Delete goal</VButton>
          <button className="text-button" onClick={() => setConfirmDelete(false)}>Keep it</button>
        </div>
      )}

      {paymentSheet && <GoalPaymentSheet target={paymentSheet} onClose={() => setPaymentSheet(null)} />}
    </Sheet>
  )
}

// MARK: - Payments

export type PaymentTarget =
  /** A planned payment: what really went in, or skipped. */
  | { mode: 'confirm'; payment: GoalPayment }
  /** An extra payment outside the plan. */
  | { mode: 'extra'; goal: FinanceGoal }
  /** A recorded one: correct it or take it off. */
  | { mode: 'recorded'; payment: GoalPayment }

/** Skipping is a plain, equal choice rather than a failure — the plan just adds a payment at the end. */
export function GoalPaymentSheet({ target, onClose }: { target: PaymentTarget; onClose: () => void }) {
  const { recordPayment, addExtraPayment, removePayment } = useGoals()
  const currency = useCurrency()
  const title = target.mode === 'extra' ? target.goal.title : target.payment.title
  const kind = target.mode === 'extra' ? target.goal.kind : target.payment.kind
  const accent = kindInfo[kind].accent
  const [text, setText] = useState(target.mode === 'extra' ? '' : amountText(target.payment.amount))
  const [date, setDate] = useState(dayKey(new Date()))
  const value = parseAmount(text)

  const question = target.mode === 'extra' ? 'How much extra went in?'
    : target.mode === 'recorded' ? 'Correct the amount, or take it off the record.'
    : kind === 'debt' ? 'How much did you pay?' : 'How much did you set aside?'

  const done = () => {
    if (value === null) return
    if (target.mode === 'extra') addExtraPayment(target.goal.id, dayFromKey(date), Math.abs(value))
    else recordPayment(target.payment.goalID, target.payment.date, Math.abs(value))
    onClose()
  }

  return (
    <Sheet title={title || 'Payment'} compact onClose={onClose}>
      <p className="help" style={{ textAlign: 'center', margin: 0 }}>{question}</p>
      {target.mode === 'extra' ? (
        <Field label="Date"><input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
      ) : (
        <span className="caption" style={{ textAlign: 'center' }}>
          {target.payment.date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          {target.mode === 'confirm' && ` · planned ${formatMoney(target.payment.amount, currency)}`}
        </span>
      )}
      <input
        autoFocus inputMode="decimal" value={text} onChange={e => setText(e.target.value)} aria-label="Amount" placeholder="0"
        onKeyDown={e => e.key === 'Enter' && done()} style={{ fontSize: 22, textAlign: 'center' }}
      />
      <VButton kind="primary" accent={accent} onClick={done} disabled={value === null || (target.mode === 'extra' && !value)}>
        {target.mode === 'extra' ? 'Add payment' : target.mode === 'recorded' ? 'Save' : 'Confirm'}
      </VButton>
      {target.mode === 'confirm' && (
        <VButton accent={accent} onClick={() => { recordPayment(target.payment.goalID, target.payment.date, 0); onClose() }}>Skipped this one</VButton>
      )}
      {target.mode === 'recorded' && (
        <VButton kind="destructive" onClick={() => { removePayment(target.payment.goalID, target.payment.date); onClose() }}>Take it off the record</VButton>
      )}
    </Sheet>
  )
}
