// Logging spending and setting up the weekly pot, from SpendingSheets.swift.
// New compared with the iPhone app: the notes you use most are one tap
// away when logging, and the day can't be set in the future.

import { dayFromKey, dayKey, parseDate, toISO } from '@suite/dates'
import { EditorBox, Field, Sheet, VButton } from '@suite/ui/components'
import { useState } from 'react'
import { runningRepeatingFlexible, weeklyFlexibleEstimate } from '../model/entries'
import { amountText, formatMoney, formatMoneyWhole, parseAmount } from '../model/money'
import { recentNotes, type SpendingEntry } from '../model/spending'
import { useEntries } from '../store/entries'
import { useCurrency } from '../store/settings'
import { useSpending } from '../store/spending'

/** The quick log: amount first (the keyboard opens on it), an optional note, the day. Also edits one. */
export function LogSpendingSheet({ editing, onClose }: { editing?: SpendingEntry; onClose: () => void }) {
  const { entries, log, update, remove } = useSpending()
  const [text, setText] = useState(amountText(editing?.amount ?? 0))
  const [note, setNote] = useState(editing?.note ?? '')
  const [date, setDate] = useState(dayKey(editing ? parseDate(editing.date) : new Date()))
  const value = parseAmount(text)
  const ok = value !== null && value > 0 && Boolean(date)
  const notes = recentNotes(entries).filter(n => n !== note)
  const today = dayKey(new Date())

  const save = () => {
    if (!ok) return
    // Today keeps the current time, so the week's list stays in the order things happened.
    const when = date === today ? new Date() : new Date(dayFromKey(date).getTime() + 12 * 3_600_000)
    if (editing) update({ ...editing, amount: Math.abs(value!), note: note.trim(), date: date === dayKey(parseDate(editing.date)) ? editing.date : toISO(when) })
    else log(Math.abs(value!), note, when)
    onClose()
  }

  return (
    <Sheet title={editing ? 'Edit spending' : 'Log spending'} compact onClose={onClose} right={{ label: editing ? 'Save' : 'Log', onClick: save, disabled: !ok }}>
      <input
        autoFocus={!editing} inputMode="decimal" value={text} onChange={e => setText(e.target.value)} aria-label="Amount" placeholder="0.00"
        onKeyDown={e => e.key === 'Enter' && save()} style={{ fontSize: 26, textAlign: 'center' }}
      />
      <input value={note} onChange={e => setNote(e.target.value)} placeholder="What for? (optional)" aria-label="What for" onKeyDown={e => e.key === 'Enter' && save()} />
      {notes.length > 0 && (
        <div className="chips" aria-label="Recent">
          {notes.map(n => <button key={n} className="chip" onClick={() => setNote(n)}>{n}</button>)}
        </div>
      )}
      <Field label="Day"><input type="date" value={date} max={today} onChange={e => setDate(e.target.value)} /></Field>
      <VButton kind="primary" accent="var(--primary)" onClick={save} disabled={!ok}>{editing ? 'Save' : 'Log it'}</VButton>
      {editing && <VButton kind="destructive" onClick={() => { remove(editing.id); onClose() }}>Delete</VButton>}
    </Sheet>
  )
}

/**
 * Starting or changing the weekly pot. When starting, it says exactly
 * which repeating flexible entries the pot takes over, and suggests an
 * amount from what they add up to.
 */
export function PotSetupSheet({ onClose }: { onClose: () => void }) {
  const { pot, startPot, setPotAmount, stopPot } = useSpending()
  const { events, endRepeatingFlexible } = useEntries()
  const currency = useCurrency()
  const [text, setText] = useState(amountText(pot.isActive ? pot.weeklyAmount : 0))
  const value = parseAmount(text)
  const ok = value !== null && value > 0
  const handOver = runningRepeatingFlexible(events)
  const estimate = weeklyFlexibleEstimate(events)
  const per = (f: string) => (f === 'weekly' ? 'a week' : f === 'fortnightly' ? 'every 2 weeks' : 'a month')

  const save = () => {
    if (!ok) return
    if (pot.isActive) setPotAmount(Math.abs(value!))
    else {
      endRepeatingFlexible(new Date())
      startPot(Math.abs(value!))
    }
    onClose()
  }

  return (
    <Sheet title={pot.isActive ? 'Weekly pot' : 'Set up a weekly pot'} onClose={onClose} right={{ label: pot.isActive ? 'Save' : 'Start', onClick: save, disabled: !ok }}>
      <EditorBox title="Each week" accent="var(--primary)">
        <Field label="For all flexible spending">
          <input autoFocus inputMode="decimal" value={text} onChange={e => setText(e.target.value)} placeholder="0" style={{ fontSize: 19 }} />
        </Field>
        <p className="help">Groceries, eating out, fuel, little things — one amount instead of planning each one. It starts fresh each week; going over one week doesn't carry forward.</p>
        {!pot.isActive && estimate > 0 && (
          <div className="row spread">
            <span className="caption">Your flexible entries come to about {formatMoneyWhole(estimate, currency)} a week</span>
            <button className="text-button" onClick={() => setText(amountText(Math.ceil(estimate)))}>Use this</button>
          </div>
        )}
      </EditorBox>

      {!pot.isActive ? (
        <EditorBox title="What changes" accent="var(--primary)">
          {handOver.length === 0 ? (
            <p className="help">The pot starts today. Log spending as it happens and you'll see what's left each week.</p>
          ) : (
            <>
              <p className="help">These repeating entries stop from today and the pot covers them instead, so nothing is counted twice. Earlier months keep them as they were.</p>
              {handOver.map(e => (
                <div key={e.id} className="row spread list-row">
                  <span>{e.title}</span>
                  <span className="muted">{formatMoney(e.amount, currency)} {per(e.frequency)}</span>
                </div>
              ))}
            </>
          )}
        </EditorBox>
      ) : (
        <>
          <VButton kind="destructive" onClick={() => { stopPot(); onClose() }}>Stop the weekly pot</VButton>
          <p className="help">Spending you've logged stays in the record. Entries the pot replaced don't come back — add them again if you want them.</p>
        </>
      )}
    </Sheet>
  )
}
