// The Accounts tab (Finance rework, stage 1): where you stand, each account
// with its last audited balance, and auditing — typing in what the bank
// says, any gap noted in one tap. Each audit is kept, so an account's
// history shows it rising (savings) or falling (debts) over time.

import { parseDate } from '@suite/dates'
import { EditorBox, Field, SectionBox, Segmented, Sheet, Toggle, VButton } from '@suite/ui/components'
import { ChevronRight, Plus } from 'lucide-react'
import { useState } from 'react'
import {
  ACCOUNT_KINDS, accountKindInfo, describeGap, expectedBalance, history, latestAudit, sinceText, spendingAccount, standing,
  type Account, type AccountKind, type GapNote, type MoneyData,
} from '../model/accounts'
import { amountText, formatMoney, parseAmount } from '../model/money'
import { useAccounts } from '../store/accounts'
import { useEntries } from '../store/entries'
import { useGoals } from '../store/goals'
import { useCurrency } from '../store/settings'
import { useSpending } from '../store/spending'
import { UNCONFIRMED } from '../ui/semantic'

const SHORT_KIND: Record<AccountKind, string> = { current: 'Current', savings: 'Savings', credit: 'Card', loan: 'Loan' }
const dateText = (iso: string) => parseDate(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

/** Everything the expected balance is worked out from. */
function useMoneyData(): MoneyData {
  return {
    accounts: useAccounts(s => s.accounts),
    events: useEntries(s => s.events),
    goals: useGoals(s => s.goals),
    spending: useSpending(s => s.entries),
  }
}

/** Gaps at an audit only mean something where spending runs through: the main current account and cards. */
const tracksSpending = (account: Account, accounts: Account[]) => account.kind === 'credit' || spendingAccount(accounts)?.id === account.id

export function AccountsScreen() {
  const { accounts, audits } = useAccounts()
  const currency = useCurrency()
  const money = (n: number) => formatMoney(n, currency)
  const data = useMoneyData()
  const [editing, setEditing] = useState<{ account?: Account } | null>(null)
  const [auditing, setAuditing] = useState<Account | null>(null)
  const [viewing, setViewing] = useState<Account | null>(null)
  const { have, owe } = standing(accounts, audits)
  const ordered = ACCOUNT_KINDS.flatMap(k => accounts.filter(a => a.kind === k))
  // Gone once deleted from its own editor.
  const viewed = viewing ? accounts.find(a => a.id === viewing.id) : undefined

  return (
    <div className="page finance-accounts">
      {accounts.length === 0 ? (
        <SectionBox title="Accounts" accent="var(--brand)">
          <p className="help" style={{ margin: 0 }}>
            Add the accounts you want to keep an eye on — a current account, savings, a credit card, a loan. Type in what's in each
            (or owed) now; then, whenever you like, check it against your bank. Finance works out what it expected in between, and over
            time you'll see savings go up and debts come down.
          </p>
          <VButton kind="primary" accent="var(--brand)" onClick={() => setEditing({})}><Plus size={16} /> Add your first account</VButton>
        </SectionBox>
      ) : (
        <>
          <SectionBox title="Where you stand" accent="var(--brand)">
            <div className="standing">
              <div><span className="mono muted">You have</span><span className="standing-figure">{money(have)}</span></div>
              {owe > 0 && <div><span className="mono muted">You owe</span><span className="standing-figure">{money(owe)}</span></div>}
              {owe > 0 && <div><span className="mono muted">Altogether</span><span className="standing-figure">{have - owe < 0 ? '−' : ''}{money(Math.abs(have - owe))}</span></div>}
            </div>
            <p className="help" style={{ margin: 0 }}>From each account's last check.</p>
          </SectionBox>

          <SectionBox title="Accounts" accent="var(--brand)">
            {ordered.map(a => (
              <AccountCard
                key={a.id}
                account={a}
                money={money}
                data={data}
                onAudit={() => setAuditing(a)}
                onOpen={() => setViewing(a)}
              />
            ))}
            <VButton accent="var(--brand)" onClick={() => setEditing({})}><Plus size={16} /> Add an account</VButton>
          </SectionBox>
        </>
      )}

      {editing && <AccountEditor account={editing.account} onClose={() => setEditing(null)} />}
      {viewed && !editing && !auditing && (
        <AccountDetail
          account={viewed}
          money={money}
          onClose={() => setViewing(null)}
          onAudit={() => setAuditing(viewing)}
          onEdit={() => setEditing({ account: viewed })}
        />
      )}
      {auditing && <AuditSheet account={auditing} money={money} data={data} onClose={() => setAuditing(null)} />}
    </div>
  )
}

function AccountCard({ account, money, data, onAudit, onOpen }: { account: Account; money: (n: number) => string; data: MoneyData; onAudit: () => void; onOpen: () => void }) {
  const audits = useAccounts(s => s.audits)
  const last = latestAudit(audits, account.id)
  const info = accountKindInfo[account.kind]
  const exp = expectedBalance(account, audits, data)
  const changed = exp && last && Math.abs(exp.expected - last.balance) >= 0.005
  const isMain = spendingAccount(data.accounts)?.id === account.id

  return (
    <div className="card account-card">
      <button className="row spread" style={{ width: '100%', textAlign: 'left', alignItems: 'baseline' }} onClick={onOpen}>
        <span style={{ fontWeight: 500, fontSize: 15 }}>{account.name || info.label}</span>
        <span className="mono muted">{SHORT_KIND[account.kind]}{isMain && data.accounts.filter(a => a.kind === 'current').length > 1 ? ' · main' : ''}</span>
      </button>
      {last ? (
        <>
          <div className="account-balance">
            {money(last.balance)}{info.owed && <span className="headline-suffix"> owed</span>}
          </div>
          <span className="mono muted">Checked {sinceText(last.date)}</span>
          {changed && <span className="caption">Expected now: <span className="amount">{money(exp!.expected)}</span>{info.owed ? ' owed' : ''}</span>}
        </>
      ) : <span className="caption">Not checked yet.</span>}
      <div className="row spread">
        <VButton small kind="primary" accent="var(--brand)" onClick={onAudit}>Check balance</VButton>
        <button className="text-button" onClick={onOpen}>History <ChevronRight size={14} style={{ verticalAlign: -2 }} /></button>
      </div>
    </div>
  )
}

/**
 * Checking an account against the bank: what Finance expected (and why),
 * what the bank says, and — where spending runs through it — what any gap
 * was, in one tap. No gap is a failure; it's what happened.
 */
function AuditSheet({ account, money, data, onClose }: { account: Account; money: (n: number) => string; data: MoneyData; onClose: () => void }) {
  const { audits, audit } = useAccounts()
  const info = accountKindInfo[account.kind]
  const exp = expectedBalance(account, audits, data)
  const [text, setText] = useState('')
  const value = parseAmount(text)
  const spendingRuns = tracksSpending(account, data.accounts)
  const gap = value !== null && exp && spendingRuns ? describeGap(account, value, exp.expected) : null
  const [note, setNote] = useState<GapNote | null>(null)
  const chosen: GapNote | undefined = gap ? (note ?? (gap.unlogged ? 'everyday' : 'extraIn')) : undefined
  const change = value !== null && exp?.since ? value - exp.since.balance : null

  const save = () => {
    if (value === null) return
    audit(account.id, value, exp && spendingRuns ? exp.expected : undefined, chosen)
    onClose()
  }

  return (
    <Sheet title={`Check ${account.name || info.label}`} onClose={onClose} right={{ label: 'Save', onClick: save, disabled: value === null }}>
      {exp?.since && (
        <EditorBox title="Since you last checked" trailing={dateText(exp.since.date)}>
          <div className="row spread"><span className="caption">Then</span><span className="amount">{money(exp.since.balance)}{info.owed ? ' owed' : ''}</span></div>
          {exp.movements.length > 0 && (
            <div className="money-rows">
              {exp.movements.map((m, i) => (
                <div key={i} className="row spread money-row" style={{ padding: '6px 0' }}>
                  <span className="grow ellipsis">
                    <span className="mono muted" style={{ marginRight: 8 }}>{m.date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                    {m.title}
                  </span>
                  <span className="amount" style={{ color: m.estimate ? UNCONFIRMED : undefined }}>{m.amount >= 0 ? '+' : '−'}{money(Math.abs(m.amount))}</span>
                </div>
              ))}
            </div>
          )}
          {spendingRuns && (
            <div className="row spread"><strong>Expected now</strong><span className="amount" style={{ fontWeight: 600 }}>{money(exp.expected)}{info.owed ? ' owed' : ''}</span></div>
          )}
          {exp.movements.some(m => m.estimate) && <p className="help">Amber amounts are estimates or plans not confirmed yet.</p>}
        </EditorBox>
      )}

      <EditorBox title={info.owed ? 'What you owe now' : "What's in it now"}>
        <input
          autoFocus inputMode="decimal" value={text} onChange={e => { setText(e.target.value); setNote(null) }} placeholder="0.00"
          aria-label="Balance now" onKeyDown={e => e.key === 'Enter' && save()} style={{ fontSize: 26, textAlign: 'center' }}
        />
        <p className="help">As your bank shows it today.</p>
      </EditorBox>

      {value !== null && exp && spendingRuns && (
        gap ? (
          <EditorBox title={gap.unlogged ? `${money(gap.size)} more went out than expected` : `${money(gap.size)} more came in than expected`}>
            <p className="help" style={{ margin: 0 }}>
              {gap.unlogged
                ? "Usually everyday spending that wasn't logged. That's fine — it's what checking is for."
                : 'A refund, a bill that came in lower, or money in that isn’t on your list.'}
            </p>
            <div className="sync-choice">
              <button type="button" aria-pressed={chosen === (gap.unlogged ? 'everyday' : 'extraIn')} onClick={() => setNote(gap.unlogged ? 'everyday' : 'extraIn')}>
                <strong>{gap.unlogged ? 'Everyday spending' : 'Extra money in'}</strong>
                <span className="caption2">Noted with this check, so your history shows where it went.</span>
              </button>
              <button type="button" aria-pressed={chosen === 'left'} onClick={() => setNote('left')}>
                <strong>Leave it unexplained</strong>
                <span className="caption2">The balance is still saved as it is.</span>
              </button>
            </div>
          </EditorBox>
        ) : <div className="notice ok">Matches what Finance expected.</div>
      )}

      {change !== null && !spendingRuns && Math.abs(change) >= 0.005 && (
        <div className="notice ok">
          {info.owed
            ? (change < 0 ? `${money(-change)} less owed than last time.` : `${money(change)} more owed than last time.`)
            : (change > 0 ? `${money(change)} more than last time.` : `${money(-change)} less than last time.`)}
        </div>
      )}

      <VButton kind="primary" accent="var(--brand)" onClick={save} disabled={value === null}>Save balance</VButton>
    </Sheet>
  )
}

/** One account: its balance over time (newest first), and editing. */
function AccountDetail({ account, money, onClose, onAudit, onEdit }: { account: Account; money: (n: number) => string; onClose: () => void; onAudit: () => void; onEdit: () => void }) {
  const { audits, deleteAudit } = useAccounts()
  const info = accountKindInfo[account.kind]
  const rows = history(audits, account.id)
  const gapText: Record<GapNote, string> = { everyday: 'everyday spending', extraIn: 'extra in', left: 'unexplained' }

  return (
    <Sheet title={account.name || info.label} onClose={onClose} leftLabel="Close" right={{ label: 'Edit', onClick: onEdit }}>
      <VButton kind="primary" accent="var(--brand)" onClick={onAudit}>Check balance</VButton>
      <EditorBox title="History" trailing={rows.length === 1 ? '1 check' : `${rows.length} checks`}>
        {rows.length === 0 && <p className="help">No checks yet.</p>}
        <div className="money-rows">
          {rows.map(({ audit, change }, i) => {
            return (
              <div key={audit.id} className="money-row row" style={{ gap: 10 }}>
                <span className="grow" style={{ minWidth: 0 }}>
                  <div>{dateText(audit.date)}</div>
                  <div className="mono muted">
                    {change === undefined ? 'Starting balance' : `${change >= 0 ? '+' : '−'}${money(Math.abs(change))}`}
                    {audit.gap && audit.expected !== undefined && Math.abs(audit.balance - audit.expected) >= 0.005
                      ? ` · ${money(Math.abs(audit.balance - audit.expected))} ${gapText[audit.gap]}` : ''}
                  </div>
                </span>
                <span className="amount">{money(audit.balance)}</span>
                {i === 0 && rows.length > 1 && (
                  <button className="text-button" style={{ color: 'var(--danger)', fontSize: 12 }} onClick={() => confirm('Remove this check?') && deleteAudit(audit.id)}>Undo</button>
                )}
              </div>
            )
          })}
        </div>
        <p className="help">{info.owed ? 'What you owe, each time you checked.' : "What was in it, each time you checked."}</p>
      </EditorBox>
    </Sheet>
  )
}

function AccountEditor({ account, onClose }: { account?: Account; onClose: () => void }) {
  const { accounts, addAccount, updateAccount, makePrimary, deleteAccount } = useAccounts()
  const [name, setName] = useState(account?.name ?? '')
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? 'current')
  const [text, setText] = useState(amountText(0))
  const value = parseAmount(text)
  const info = accountKindInfo[kind]
  const currentCount = accounts.filter(a => a.kind === 'current').length
  const isMain = account ? spendingAccount(accounts)?.id === account.id : false
  const ok = Boolean(name.trim()) && (account ? true : value !== null)

  const save = () => {
    if (!ok) return
    if (account) updateAccount({ ...account, name: name.trim(), kind })
    else addAccount(name, kind, Math.abs(value!))
    onClose()
  }

  return (
    <Sheet title={account ? 'Edit account' : 'New account'} onClose={onClose} right={{ label: account ? 'Save' : 'Add', onClick: save, disabled: !ok }}>
      <EditorBox title="Account">
        <Segmented<AccountKind> label="Kind" value={kind} onChange={setKind} options={ACCOUNT_KINDS.map(k => ({ value: k, label: SHORT_KIND[k] }))} />
        <p className="help">{info.help}</p>
        <Field label="Name"><input autoFocus={!account} value={name} onChange={e => setName(e.target.value)} placeholder={info.placeholder} /></Field>
      </EditorBox>
      {!account && (
        <EditorBox title={info.owed ? 'Owed now' : 'In it now'}>
          <input inputMode="decimal" value={text} onChange={e => setText(e.target.value)} aria-label="Balance now" onKeyDown={e => e.key === 'Enter' && save()} style={{ fontSize: 22, textAlign: 'center' }} />
          <p className="help">As your bank shows it today. This is the first check; later ones show how it changes.</p>
        </EditorBox>
      )}
      {account && kind === 'current' && currentCount > 1 && (
        <Toggle label="Main account for pay and bills" checked={isMain} onChange={on => on && makePrimary(account.id)} />
      )}
      {account && (
        <VButton kind="destructive" onClick={() => { if (confirm('Delete this account and its history?')) { deleteAccount(account.id); onClose() } }}>
          Delete account
        </VButton>
      )}
    </Sheet>
  )
}
