// The Accounts tab (Finance pivot, Oct 2026), kept simple: at payday, what
// to send to each account (model/payday.ts) with a Sent tap; then each
// account with its balance, and the everyday account with what's left
// until payday. Checking a balance — typing in what the bank says — keeps
// it all honest; each check is kept as the account's history.

import { parseDate, toISO } from '@suite/dates'
import { EditorBox, Field, SectionBox, Segmented, Sheet, Toggle, VButton } from '@suite/ui/components'
import { Check, ChevronRight, Plus } from 'lucide-react'
import { useState } from 'react'
import {
  ACCOUNT_KINDS, accountKindInfo, describeGap, expectedBalance, history, latestAudit, sinceText, spendingAccount,
  type Account, type AccountKind, type GapNote, type MoneyData,
} from '../model/accounts'
import { CURRENCIES, amountText, formatAmount, parseAmount } from '../model/money'
import { kindInfo, schedule } from '../model/goals'
import { everydayAccount, everydayLeft, payday, type Payday } from '../model/payday'
import { useAccounts } from '../store/accounts'
import { useSettings } from '../store/settings'
import { LogSpendingSheet } from './SpendingSheets'
import { useEntries } from '../store/entries'
import { useGoals } from '../store/goals'
import { useSpending } from '../store/spending'
import { UNCONFIRMED } from '../ui/semantic'
import { useMoneyTools } from '../store/money'

const SHORT_KIND: Record<AccountKind, string> = { current: 'Current', savings: 'Savings', investment: 'Invest', credit: 'Card', loan: 'Loan' }
const dateText = (iso: string) => parseDate(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

/** Everything the expected balance is worked out from. */
function useMoneyData(): MoneyData {
  return {
    accounts: useMoneyTools().accounts,
    transfers: useAccounts(s => s.transfers),
    events: useEntries(s => s.events),
    goals: useGoals(s => s.goals),
    spending: useSpending(s => s.entries),
  }
}

/** Gaps at an audit only mean something where spending runs through: the main current account and cards. */
const tracksSpending = (account: Account, accounts: Account[]) => account.kind === 'credit' || spendingAccount(accounts)?.id === account.id

export function AccountsScreen() {
  const audits = useAccounts(s => s.audits)
  const tools = useMoneyTools()
  const { accounts } = tools
  const data = useMoneyData()
  const paydayEntryID = useSettings(s => s.paydayEntryID)
  const [editing, setEditing] = useState<{ account?: Account } | null>(null)
  const [auditing, setAuditing] = useState<Account | null>(null)
  const [viewing, setViewing] = useState<Account | null>(null)
  const [logging, setLogging] = useState(false)
  const ordered = ACCOUNT_KINDS.flatMap(k => accounts.filter(a => a.kind === k))
  // Gone once deleted from its own editor.
  const viewed = viewing ? accounts.find(a => a.id === viewing.id) : undefined
  const plan = payday({ ...data, audits }, { paydayEntryID, convert: tools.byAccount })
  const everyday = plan.kind === 'ready' ? everydayAccount(data, plan.period) : undefined

  return (
    <div className="page finance-accounts">
      {accounts.length === 0 ? (
        <SectionBox title="Accounts" accent="var(--brand)">
          <p className="help" style={{ margin: 0 }}>
            Add the accounts you use — where pay lands, where bills go out, your everyday spending account, savings. Then Finance
            shows what to send to each at payday.
          </p>
          <VButton kind="primary" accent="var(--brand)" onClick={() => setEditing({})}><Plus size={16} /> Add your first account</VButton>
        </SectionBox>
      ) : (
        <>
          <PaydayCard plan={plan} />

          <SectionBox title="Accounts" accent="var(--brand)">
            {ordered.map(a => (
              <AccountCard
                key={a.id}
                account={a}
                money={n => tools.forAccount(n, a)}
                data={data}
                everyday={everyday?.id === a.id && plan.kind === 'ready' ? everydayLeft(a, data, plan.period) : undefined}
                onLog={() => setLogging(true)}
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
          money={n => tools.forAccount(n, viewed)}
          onClose={() => setViewing(null)}
          onAudit={() => setAuditing(viewing)}
          onEdit={() => setEditing({ account: viewed })}
        />
      )}
      {auditing && <AuditSheet account={auditing} money={n => tools.forAccount(n, auditing)} data={data} onClose={() => setAuditing(null)} />}
      {logging && <LogSpendingSheet onClose={() => setLogging(false)} />}
    </div>
  )
}

const shortDate = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

/**
 * At payday: the pay landing, what to send to each account (each with a
 * Sent tap), goal payments, and what stays. One look, one list.
 */
function PaydayCard({ plan }: { plan: Payday }) {
  const tools = useMoneyTools()
  const addTransfer = useAccounts(s => s.addTransfer)
  const recordPayment = useGoals(s => s.recordPayment)

  if (plan.kind !== 'ready') {
    return (
      <SectionBox title="Payday" accent="var(--brand)">
        <p className="help" style={{ margin: 0 }}>
          {plan.kind === 'noPay'
            ? 'Add your pay in Budget (as a repeating entry, paid into the account it lands in) and this shows what to send to each account at payday.'
            : 'Add the account your pay lands in.'}
        </p>
      </SectionBox>
    )
  }
  // Whole pounds unless there are pence, as in Budget.
  const amt = (n: number, a: Account) => formatAmount(n, tools.currencyOf(a))
  const pay = (n: number) => amt(n, plan.payAccount)
  const sends = plan.topUps.filter(t => t.need > 0)
  const unchecked = plan.topUps.filter(t => !t.checked)

  return (
    <SectionBox title="Payday" accent="var(--brand)" subtitle={plan.passed ? `Was ${shortDate(plan.period.start)}` : shortDate(plan.period.start)}>
      <p className="payday-lead">
        <span className={plan.payEstimate ? 'est' : undefined}>{pay(plan.payAmount)}</span> lands in {plan.payAccount.name || 'your main account'}. Send:
      </p>
      <div className="payday-rows">
        {sends.map(t => {
          const done = t.remaining <= 0
          return (
            <div key={t.account.id} className={`payday-row${done ? ' is-done' : ''}`}>
              <span className="payday-to">
                <span>→ {t.account.name || 'Account'}</span>
                <span className="caption2">
                  {amt(t.budget, t.account)} until next payday{t.carry > 0 ? ` − ${amt(t.carry, t.account)} already there` : ''}
                </span>
              </span>
              <span className="payday-amount">
                <span>{amt(done ? t.need : t.remaining, t.account)}</span>
                {t.remainingInPay && t.account.currency !== plan.payAccount.currency ? <span className="caption2">≈ {pay(t.remainingInPay)}</span> : null}
              </span>
              {done
                ? <span className="payday-done" aria-label="Sent"><Check size={16} /> Sent</span>
                : (
                  <VButton small accent="var(--brand)" onClick={() => addTransfer({
                    date: toISO(new Date()), fromAccountID: plan.payAccount.id, toAccountID: t.account.id,
                    amountIn: t.remaining, amountOut: t.remainingInPay ?? t.remaining,
                  })}>Sent</VButton>
                )}
            </div>
          )
        })}
        {plan.goals.map(g => (
          <div key={g.goal.id} className={`payday-row${g.done ? ' is-done' : ''}`}>
            <span className="payday-to">
              <span>→ {g.to?.name ?? g.goal.title}</span>
              <span className="caption2">{g.goal.kind === 'debt' ? 'Payment' : kindInfo[g.goal.kind].label}{g.to ? ` · ${g.goal.title}` : ''}</span>
            </span>
            <span className="payday-amount"><span>{amt(g.amount, plan.payAccount)}</span></span>
            {g.done
              ? <span className="payday-done" aria-label="Done"><Check size={16} /> Done</span>
              : <VButton small accent="var(--brand)" onClick={() => g.dates.forEach(d => {
                const planned = schedule(g.goal).find(p => p.date.getTime() === d.getTime())
                recordPayment(g.goal.id, d, planned?.amount ?? g.goal.paymentAmount)
              })}>Done</VButton>}
          </div>
        ))}
        {!sends.length && !plan.goals.length && <p className="help" style={{ margin: 0 }}>Nothing to send: every account is covered until the next payday.</p>}
      </div>
      <div className={`payday-stays${plan.stays < 0 ? ' short' : ''}`}>
        <span>{plan.stays < 0 ? 'Short this month' : `Stays in ${plan.payAccount.name || 'your main account'}`}</span>
        <span className="payday-stays-figure">{plan.stays < 0 ? `−${pay(-plan.stays)}` : pay(plan.stays)}</span>
      </div>
      <span className="caption">
        {plan.stays < 0
          ? 'Just information: what goes out this pay period comes to more than the pay. Budget shows where.'
          : `After its own bills (${pay(plan.ownBudget)}) and everything above.`}
      </span>
      {unchecked.length > 0 && (
        <div className="notice">Check {unchecked.map(t => t.account.name).join(' and ')}'s balance for an exact amount — for now it's counted from nothing.</div>
      )}
    </SectionBox>
  )
}

function AccountCard({ account, money, data, everyday, onLog, onAudit, onOpen }: {
  account: Account
  money: (n: number) => string
  data: MoneyData
  /** The everyday account: what's left of its budget until payday. */
  everyday?: { budget: number; spent: number; left: number }
  onLog: () => void
  onAudit: () => void
  onOpen: () => void
}) {
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
        <span className="mono muted">{everyday ? 'Everyday' : SHORT_KIND[account.kind]}{isMain && data.accounts.filter(a => a.kind === 'current').length > 1 ? ' · main' : ''}</span>
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
      {everyday && everyday.budget > 0 && (
        <div className="everyday-left">
          <span><strong className={everyday.left < 0 ? 'short-text' : undefined}>{everyday.left < 0 ? `−${money(-everyday.left)}` : money(everyday.left)}</strong> {everyday.left < 0 ? 'over' : 'left'} of {money(everyday.budget)} until payday</span>
          <div className="progress-track" aria-hidden="true"><div className="progress-fill" style={{ width: `${Math.min(100, (everyday.spent / everyday.budget) * 100)}%` }} /></div>
        </div>
      )}
      <div className="row spread">
        {everyday
          ? <VButton small kind="primary" accent="var(--brand)" onClick={onLog}>Log spending</VButton>
          : <VButton small kind="primary" accent="var(--brand)" onClick={onAudit}>Check balance</VButton>}
        {everyday && <button className="text-button" onClick={onAudit}>Check balance</button>}
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
  const { accounts, addAccount, updateAccount, makePrimary, makeEveryday, deleteAccount } = useAccounts()
  const { home, international } = useMoneyTools()
  const [currency, setCurrency] = useState(account?.currency ?? home)
  const [walletCard, setWalletCard] = useState(account?.walletCard ?? '')
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
    // Your home currency is stored as none, so changing home later carries those accounts with it.
    const own = international && currency !== home ? currency : undefined
    if (account) updateAccount({ ...account, name: name.trim(), kind, currency: international ? own : account.currency, walletCard: walletCard.trim() || undefined })
    else addAccount(name, kind, Math.abs(value!), own)
    onClose()
  }

  return (
    <Sheet title={account ? 'Edit account' : 'New account'} onClose={onClose} right={{ label: account ? 'Save' : 'Add', onClick: save, disabled: !ok }}>
      <EditorBox title="Account">
        <Segmented<AccountKind> label="Kind" value={kind} onChange={setKind} options={ACCOUNT_KINDS.map(k => ({ value: k, label: SHORT_KIND[k] }))} />
        <p className="help">{info.help}</p>
        <Field label="Name"><input autoFocus={!account} value={name} onChange={e => setName(e.target.value)} placeholder={info.placeholder} /></Field>
        {international && (
          <Field label="Currency">
            <select value={currency} onChange={e => setCurrency(e.target.value)}>
              {[home, ...CURRENCIES.filter(c => c !== home)].map(c => <option key={c} value={c}>{c}{c === home ? ' (home)' : ''}</option>)}
            </select>
          </Field>
        )}
        {international && account && currency !== (account.currency ?? home) && (
          <p className="help">Its balances, and the bills and spending on it, are read as {currency} from now on — the numbers aren't converted.</p>
        )}
      </EditorBox>
      {!account && (
        <EditorBox title={info.owed ? 'Owed now' : 'In it now'}>
          <input inputMode="decimal" value={text} onChange={e => setText(e.target.value)} aria-label="Balance now" onKeyDown={e => e.key === 'Enter' && save()} style={{ fontSize: 22, textAlign: 'center' }} />
          <p className="help">As your bank shows it today. This is the first check; later ones show how it changes.</p>
        </EditorBox>
      )}
      {account && (kind === 'current' || kind === 'credit') && (
        <EditorBox title="Apple Wallet">
          <Field label="Card name in Wallet (optional)">
            <input value={walletCard} onChange={e => setWalletCard(e.target.value)} placeholder={name || 'As Wallet shows it'} />
          </Field>
          <p className="help">Payments with this card, logged from the Apple Wallet Shortcut, go to this account. Leave empty if the account's name already appears in the card's name.</p>
        </EditorBox>
      )}
      {account && kind === 'current' && currentCount > 1 && (
        <Toggle label="Main account (pay lands here)" checked={isMain} onChange={on => on && makePrimary(account.id)} />
      )}
      {account && (kind === 'current' || kind === 'credit') && (
        <>
          <Toggle label="Everyday spending (groceries, fuel, fun)" checked={Boolean(account.everyday)} onChange={on => makeEveryday(on ? account.id : undefined)} />
          <p className="help">Spends you log go here, and it shows what's left of its budget until payday.</p>
        </>
      )}
      {account && (
        <VButton kind="destructive" onClick={() => { if (confirm('Delete this account and its history?')) { deleteAccount(account.id); onClose() } }}>
          Delete account
        </VButton>
      )}
    </Sheet>
  )
}
