// Adding or editing a money entry, from FinanceEventEditorSheet. Changes
// from the iPhone app: "every 2 weeks" for fortnightly pay; weekly
// entries simply repeat on the first date's weekday (no separate day
// picker to disagree with it); and a repeating entry can be changed or
// stopped from one date on, so past months keep what really happened.

import { dayFromKey, dayKey, parseDate, startOfDay, toISO, weekday } from '@suite/dates'
import { EditorBox, Field, Segmented, Sheet, Toggle, VButton } from '@suite/ui/components'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { newID } from '@suite/ids'
import { isLaterOccurrence, makeFinanceEvent, repeatText, type EntryType, type ExpenseCategory, type FinanceEvent, type Frequency, type SetAsideKind, type SetAsideRule } from '../model/entries'
import { entryAccount, spendableAccounts } from '../model/accounts'
import { amountText, formatAmount, parseAmount } from '../model/money'
import { useEntries } from '../store/entries'
import { useMoneyTools } from '../store/money'

export type EntryEditorTarget =
  | { mode: 'new'; date: Date; entryType?: EntryType; category?: ExpenseCategory }
  /** `occurrence` is the day it was opened from, for "from this date on". */
  | { mode: 'edit'; event: FinanceEvent; occurrence?: Date }

type Repeat = 'once' | 'weekly' | 'fortnightly' | 'monthly'

const longDate = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

export function EntryEditor({ target, onClose }: { target: EntryEditorTarget; onClose: () => void }) {
  const { events, addEvent, updateEvent, deleteEvent, endFrom, changeFrom } = useEntries()
  const original = target.mode === 'edit' ? target.event : null
  const occurrence = target.mode === 'edit' ? target.occurrence : undefined

  const [title, setTitle] = useState(original?.title ?? '')
  const asked = target.mode === 'new' ? target : undefined
  const [entryType, setEntryType] = useState<EntryType>(original?.entryType ?? asked?.entryType ?? 'expense')
  const [category, setCategory] = useState<ExpenseCategory>(original?.expenseCategory ?? asked?.category ?? 'fixed')
  const [amount, setAmount] = useState(original ? amountText(original.amount) : '')
  const [date, setDate] = useState(dayKey(original ? parseDate(original.date) : target.mode === 'new' ? target.date : new Date()))
  const [repeat, setRepeat] = useState<Repeat>(!original?.repeats || original.frequency === 'none' ? 'once' : original.frequency)
  const [amountVaries, setAmountVaries] = useState(original?.amountVaries ?? false)
  const [endDate, setEndDate] = useState(original?.endDate)
  const [askScope, setAskScope] = useState(false)
  // Pay: shares set aside each time it lands (tithing, saving, investing).
  const [setAsides, setSetAsides] = useState<SetAsideRule[]>(original?.setAsides ?? [])
  // International mode: which account it's paid from or into (and so its currency).
  const tools = useMoneyTools()
  const accountChoices = tools.international ? spendableAccounts(tools.accounts) : []
  const [accountID, setAccountID] = useState(() => (original ? entryAccount(original, tools.accounts)?.id : undefined))
  const account = tools.accounts.find(a => a.id === accountID) ?? entryAccount({ accountID } as FinanceEvent, tools.accounts)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const parsed = parseAmount(amount)
  const repeats = repeat !== 'once'
  const anchor = date ? dayFromKey(date) : startOfDay(new Date())
  const canSave = parsed !== null && Boolean(date)

  const fields = (): Partial<FinanceEvent> => {
    const frequency: Frequency = repeats ? repeat : 'none'
    return {
      title: title.trim() || 'Untitled',
      entryType,
      expenseCategory: entryType === 'expense' ? category : undefined,
      amount: Math.abs(parsed ?? 0),
      repeats,
      frequency,
      weekday: frequency === 'weekly' ? weekday(anchor) : undefined,
      amountVaries: repeats && amountVaries,
      endDate: repeats ? endDate : undefined,
      setAsides: entryType === 'income' && setAsides.length ? setAsides.map(r => ({ ...r, title: r.title.trim() || 'Set aside' })) : undefined,
      // The main current account is the default, so it's saved as none.
      ...(tools.international ? { accountID: accountID && accountID !== entryAccount({} as FinanceEvent, tools.accounts)?.id ? accountID : undefined } : {}),
    }
  }

  // Only worth asking when it's opened from a later day and the first
  // date itself wasn't touched (moving the start reshapes every occurrence).
  const canScope = original !== null && occurrence !== undefined && isLaterOccurrence(original, occurrence)
    && date === dayKey(parseDate(original.date)) && repeats

  const save = (scope?: 'from' | 'all') => {
    if (!canSave) return
    const f = fields()
    if (!original) {
      addEvent(makeFinanceEvent({ ...f, title: f.title!, entryType, date: toISO(anchor) }))
    } else if (canScope && !scope && changed(original, f)) {
      setAskScope(true)
      return
    } else if (scope === 'from' && occurrence) {
      changeFrom(original.id, occurrence, f)
    } else {
      updateEvent({ ...original, ...f, date: toISO(anchor) })
    }
    onClose()
  }

  return (
    <Sheet title={original ? 'Edit entry' : 'New entry'} onClose={onClose} right={{ label: original ? 'Save' : 'Add', onClick: () => save(), disabled: !canSave }}>
      <EditorBox title="What">
        <input autoFocus={!original} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Rent, Pay, Phone" aria-label="Title" style={{ fontSize: 19 }} />
        <Segmented<EntryType>
          label="Money in or out"
          value={entryType}
          onChange={setEntryType}
          options={[{ value: 'income', label: 'Money in' }, { value: 'expense', label: 'Money out' }]}
        />
        {entryType === 'expense' && (
          <>
            <Segmented<ExpenseCategory>
              label="Kind of spending"
              value={category}
              onChange={setCategory}
              options={[{ value: 'fixed', label: 'Fixed bill' }, { value: 'flexible', label: 'Flexible' }]}
            />
            <p className="help">{category === 'fixed' ? 'The same each time and has to be paid — rent, phone, subscriptions.' : 'Spending you can adjust — food, going out, fuel.'}</p>
          </>
        )}
      </EditorBox>

      <EditorBox title={tools.international ? `Amount (${tools.currencyOf(account)})` : 'Amount'}>
        {accountChoices.length > 1 && (
          <Field label={entryType === 'income' ? 'Paid into' : 'Paid from'}>
            <select value={account?.id ?? ''} onChange={e => setAccountID(e.target.value)}>
              {accountChoices.map(a => <option key={a.id} value={a.id}>{a.name || 'Account'} · {tools.currencyOf(a)}</option>)}
            </select>
          </Field>
        )}
        <input
          inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} aria-label="Amount"
          placeholder={amountVaries && repeats ? 'Usual amount' : '0.00'} style={{ fontSize: 19 }}
        />
        {amount !== '' && parsed === null && <span className="caption2 danger-text">That doesn't look like an amount.</span>}
      </EditorBox>

      <EditorBox title="When">
        <Field label={repeats ? 'First date' : 'Date'}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </Field>
        <Segmented<Repeat>
          label="Repeats"
          value={repeat}
          onChange={setRepeat}
          options={[{ value: 'once', label: 'Once' }, { value: 'weekly', label: 'Weekly' }, { value: 'fortnightly', label: '2 weeks' }, { value: 'monthly', label: 'Monthly' }]}
        />
        {repeats && date && <span className="caption">{repeatText({ repeats, frequency: repeat, date: toISO(anchor) })}</span>}
        {repeats && (
          <>
            <Toggle label="Amount varies each time" checked={amountVaries} onChange={setAmountVaries} />
            {amountVaries && <p className="help">The amount above is used as an estimate and flagged amber until you confirm the real figure each time — good for pay with overtime.</p>}
            <Toggle label="Stops on a date" checked={Boolean(endDate)} onChange={on => setEndDate(on ? toISO(new Date(anchor.getFullYear() + 1, anchor.getMonth(), anchor.getDate())) : undefined)} />
            {endDate && (
              <Field label="Last one is before">
                <input type="date" value={dayKey(parseDate(endDate))} onChange={e => e.target.value && setEndDate(toISO(dayFromKey(e.target.value)))} />
              </Field>
            )}
          </>
        )}
      </EditorBox>

      {entryType === 'income' && (
        <SetAsidesBox
          rules={setAsides}
          onChange={setSetAsides}
          pay={parsed ?? 0}
          currency={tools.currencyOf(account)}
          hasTithingEntry={events.some(e => e.entryType === 'expense' && /tith/i.test(e.title))}
        />
      )}

      {original && !confirmDelete && (
        <VButton kind="destructive" onClick={() => (original.repeats ? setConfirmDelete(true) : (deleteEvent(original.id), onClose()))}>
          {original.repeats ? 'Stop or delete…' : 'Delete entry'}
        </VButton>
      )}
      {original && confirmDelete && (
        <div className="editor-box">
          <strong>This repeats</strong>
          {occurrence && isLaterOccurrence(original, occurrence) ? (
            <>
              <p className="help">Stopping keeps every earlier one, so past months stay as they were.</p>
              <VButton onClick={() => { endFrom(original.id, occurrence); onClose() }}>Stop from {longDate(occurrence)}</VButton>
            </>
          ) : <p className="help">Deleting removes every occurrence, past ones included.</p>}
          <VButton kind="destructive" onClick={() => { deleteEvent(original.id); onClose() }}>Delete every occurrence</VButton>
          <button className="text-button" onClick={() => setConfirmDelete(false)}>Keep it</button>
        </div>
      )}

      {askScope && occurrence && (
        <Sheet title="Repeating entry" compact onClose={() => setAskScope(false)} leftLabel="Back">
          <p className="help" style={{ textAlign: 'center' }}>Change it from {longDate(occurrence)} on, or every time including the past?</p>
          <VButton kind="primary" accent="var(--primary)" onClick={() => save('from')}>From {longDate(occurrence)} on</VButton>
          <VButton onClick={() => save('all')}>Every time, past included</VButton>
        </Sheet>
      )}
    </Sheet>
  )
}

/** Whether saving would change anything about the entry itself. */
function changed(original: FinanceEvent, f: Partial<FinanceEvent>): boolean {
  return (Object.keys(f) as (keyof FinanceEvent)[]).some(k => JSON.stringify(f[k]) !== JSON.stringify(original[k]))
}

const KINDS: { value: SetAsideKind; label: string }[] = [
  { value: 'giving', label: 'Giving' }, { value: 'saving', label: 'Saving' }, { value: 'investing', label: 'Investing' },
]

/**
 * "Set aside from this pay": a share of each pay, worked out as it lands —
 * the real amount once it's confirmed — and taken off before anything else.
 * Nothing is added unless you add it; 10% tithing is one tap away.
 */
function SetAsidesBox({ rules, onChange, pay, currency, hasTithingEntry }: {
  rules: SetAsideRule[]
  onChange: (rules: SetAsideRule[]) => void
  pay: number
  currency: string
  hasTithingEntry: boolean
}) {
  const patch = (id: string, p: Partial<SetAsideRule>) => onChange(rules.map(r => (r.id === id ? { ...r, ...p } : r)))
  const add = (rule: Omit<SetAsideRule, 'id'>) => onChange([...rules, { ...rule, id: newID() }])
  const hasTithing = rules.some(r => /tith/i.test(r.title))
  return (
    <EditorBox title="Set aside from this pay">
      {rules.map(r => (
        <div key={r.id} className="set-aside">
          <div className="set-aside-fields">
            <input value={r.title} onChange={e => patch(r.id, { title: e.target.value })} placeholder="e.g. Tithing" aria-label="Name" />
            <label className="percent-field">
              <input
                type="number" inputMode="decimal" min={0} max={100} step={0.5} value={r.percent} aria-label={`${r.title || 'Set-aside'} percent`}
                onChange={e => patch(r.id, { percent: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
              />
              <span>%</span>
            </label>
            <button className="icon-button" onClick={() => onChange(rules.filter(x => x.id !== r.id))} aria-label={`Remove ${r.title || 'set-aside'}`} title="Remove">
              <Trash2 size={16} />
            </button>
          </div>
          <Segmented<SetAsideKind> label="Kind" value={r.kind} onChange={kind => patch(r.id, { kind })} options={KINDS} />
          {pay > 0 && (
            <span className="caption">
              {r.percent}% of {formatAmount(pay, currency)} = {formatAmount(Math.round(pay * r.percent) / 100, currency)}
            </span>
          )}
        </div>
      ))}
      <div className="button-row">
        {!hasTithing && (
          <VButton small accent="var(--brand)" onClick={() => add({ title: 'Tithing', percent: 10, kind: 'giving' })}>Add 10% tithing</VButton>
        )}
        <VButton small accent="var(--brand)" onClick={() => add({ title: '', percent: 10, kind: 'saving' })}>Add a set-aside</VButton>
      </div>
      {hasTithingEntry && rules.length > 0 && (
        <p className="help">You also have a Tithing entry of its own. If this replaces it, delete that one so it isn't counted twice.</p>
      )}
      <p className="help">
        Worked out from each pay as it lands — the real amount once you confirm it — and set aside before anything else. It shows in
        Months under Set aside and comes off safe to spend.
      </p>
    </EditorBox>
  )
}
