// Logging spending, from SpendingSheets.swift — into the everyday account
// unless another is chosen (by hand, or from the Apple Wallet Shortcut).
// The notes you use most are one tap away, and the day can't be set in
// the future.

import { dayFromKey, dayKey, parseDate, toISO } from '@suite/dates'
import { Field, Sheet, VButton } from '@suite/ui/components'
import { useState } from 'react'
import { amountText, parseAmount } from '../model/money'
import { recentNotes, type SpendingEntry } from '../model/spending'
import { spendableAccounts, spendingAccount } from '../model/accounts'
import { useAccounts } from '../store/accounts'
import { useSpending } from '../store/spending'
import { useMoneyTools } from '../store/money'
import { accountForCard, type WalletLog } from '../model/walletLink'

/** The quick log: amount first (the keyboard opens on it), an optional note, the day. Also edits one. */
export function LogSpendingSheet({ editing, wallet, onClose }: { editing?: SpendingEntry; wallet?: WalletLog; onClose: () => void }) {
  const { entries, log, update, remove } = useSpending()
  const tools = useMoneyTools()
  const [text, setText] = useState(amountText(editing?.amount ?? wallet?.amount ?? 0))
  const [note, setNote] = useState(editing?.note ?? wallet?.note ?? '')
  const [date, setDate] = useState(dayKey(editing ? parseDate(editing.date) : new Date()))
  const accounts = useAccounts(s => s.accounts)
  const spendable = spendableAccounts(accounts)
  // From Apple Wallet: the account the card belongs to.
  const [accountID, setAccountID] = useState(() =>
    editing?.accountID ?? (wallet ? accountForCard(wallet, tools.accounts, tools.currencyOf, tools.international)?.id : undefined)
      // Spends go to the everyday account unless you choose another.
      ?? accounts.find(a => a.everyday)?.id ?? spendingAccount(accounts)?.id)
  const value = parseAmount(text)
  const ok = value !== null && value > 0 && Boolean(date)
  const notes = recentNotes(entries).filter(n => n !== note)
  const today = dayKey(new Date())

  const save = () => {
    if (!ok) return
    // Today keeps the current time, so the week's list stays in the order things happened.
    const when = date === today ? new Date() : new Date(dayFromKey(date).getTime() + 12 * 3_600_000)
    // The main current account is the default, so it's left unset (spending logged before accounts existed reads the same way).
    const account = accountID === spendingAccount(accounts)?.id ? undefined : accountID
    if (editing) update({ ...editing, amount: Math.abs(value!), note: note.trim(), accountID: account, date: date === dayKey(parseDate(editing.date)) ? editing.date : toISO(when) })
    else log(Math.abs(value!), note, when, account, wallet ? 'shortcut' : 'manual')
    onClose()
  }

  return (
    <Sheet title={editing ? 'Edit spending' : 'Log spending'} compact onClose={onClose} right={{ label: editing ? 'Save' : 'Log', onClick: save, disabled: !ok }}>
      {wallet && (
        <p className="caption" style={{ margin: 0, textAlign: 'center' }}>
          From Apple Wallet{wallet.card ? ` · ${wallet.card}` : ''} — check it, then tap Log it.
          {wallet.currency && tools.international && wallet.currency !== tools.currencyOf(tools.accounts.find(a => a.id === accountID))
            ? ` The payment was in ${wallet.currency}; this account is in ${tools.currencyOf(tools.accounts.find(a => a.id === accountID))} — put in what it cost there.`
            : ''}
        </p>
      )}
      <input
        autoFocus={!editing && !wallet?.amount} inputMode="decimal" value={text} onChange={e => setText(e.target.value)} aria-label="Amount"
        placeholder={tools.international ? `0.00 ${tools.currencyOf(tools.accounts.find(a => a.id === accountID))}` : '0.00'}
        onKeyDown={e => e.key === 'Enter' && save()} style={{ fontSize: 26, textAlign: 'center' }}
      />
      <input value={note} onChange={e => setNote(e.target.value)} placeholder="What for? (optional)" aria-label="What for" onKeyDown={e => e.key === 'Enter' && save()} />
      {notes.length > 0 && (
        <div className="chips" aria-label="Recent">
          {notes.map(n => <button key={n} className="chip" onClick={() => setNote(n)}>{n}</button>)}
        </div>
      )}
      <Field label="Day"><input type="date" value={date} max={today} onChange={e => setDate(e.target.value)} /></Field>
      {spendable.length > 1 && (
        <Field label="Paid from">
          <select value={accountID ?? ''} onChange={e => setAccountID(e.target.value || undefined)}>
            {spendable.map(a => <option key={a.id} value={a.id}>{a.name}{tools.international ? ` · ${tools.currencyOf(a)}` : ''}</option>)}
          </select>
        </Field>
      )}
      <VButton kind="primary" accent="var(--primary)" onClick={save} disabled={!ok}>{editing ? 'Save' : 'Log it'}</VButton>
      {editing && <VButton kind="destructive" onClick={() => { remove(editing.id); onClose() }}>Delete</VButton>}
    </Sheet>
  )
}
