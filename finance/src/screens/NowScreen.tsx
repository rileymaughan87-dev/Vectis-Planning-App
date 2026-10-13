// The Now tab (Finance rework, stage 2): where Finance opens. One answer —
// what's safe to spend until payday — worked out from the main current
// account's balance, what's coming before payday, and the cushion; then
// everything coming up, and the pay that starts the next stretch.
// International mode adds what to send to an account in another currency
// (your US account, say) to cover its bills before payday.

import { dayKey, toISO } from '@suite/dates'
import { EditorBox, Field, SectionBox, Sheet, VButton } from '@suite/ui/components'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { sinceText, type Account, type Movement } from '../model/accounts'
import { forward, payOptions, type TransferNeed } from '../model/forward'
import { amountText, formatMoney, parseAmount } from '../model/money'
import { weekOf, weekStatus } from '../model/spending'
import { useAccounts } from '../store/accounts'
import { useEntries } from '../store/entries'
import { useGoals } from '../store/goals'
import { useMoneyTools } from '../store/money'
import { useSettings } from '../store/settings'
import { useSpending } from '../store/spending'
import { UNCONFIRMED } from '../ui/semantic'
import { LogSpendingSheet } from './SpendingSheets'

const shortDate = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

export function NowScreen({ onGo }: { onGo: (tab: 'accounts' | 'calendar') => void }) {
  const { audits, transfers } = useAccounts()
  const events = useEntries(s => s.events)
  const goals = useGoals(s => s.goals)
  const { entries: spending, pot } = useSpending()
  const { cushion, paydayEntryID } = useSettings()
  const tools = useMoneyTools()
  const { accounts } = tools
  const [logging, setLogging] = useState(false)
  const [adjusting, setAdjusting] = useState(false)
  const [sending, setSending] = useState<TransferNeed | null>(null)

  const f = forward({ accounts, audits, events, goals, spending, transfers }, { cushion, paydayEntryID, convert: tools.byAccount })
  // Safe to spend is in the main account's own currency.
  const money = (n: number) => formatMoney(n, f.kind === 'noAccount' ? tools.home : tools.currencyOf(f.account))

  if (f.kind !== 'ready') {
    return (
      <div className="page finance-now">
        <SectionBox title="Until payday" accent="var(--brand)">
          <p className="help" style={{ margin: 0 }}>
            {f.kind === 'noAccount'
              ? "Add your current account — the one pay lands in — and Finance works out what's safe to spend until payday, from what's really in it."
              : `Check what's in ${f.account.name || 'your current account'} to see what's safe to spend until payday.`}
          </p>
          <VButton kind="primary" accent="var(--brand)" onClick={() => onGo('accounts')}>
            {f.kind === 'noAccount' ? 'Add an account' : 'Check balance'}
          </VButton>
        </SectionBox>
      </div>
    )
  }

  const outgoing = f.comingUp.filter(m => m.amount < 0).reduce((a, m) => a - m.amount, 0)
  const incoming = f.comingUp.filter(m => m.amount > 0).reduce((a, m) => a + m.amount, 0)
  const week = pot.isActive ? weekStatus(spending, pot, weekOf(new Date())) : null

  return (
    <div className="page finance-now">
      <SectionBox
        title="Until payday"
        accent="var(--brand)"
        subtitle={f.payday ? `${f.days} ${f.days === 1 ? 'day' : 'days'} · ${shortDate(f.payday)}` : 'Next 30 days'}
      >
        <div className="safe">
          <div className="headline-number">
            {f.safe < 0 ? '−' : ''}{money(Math.abs(f.safe))} <span className="headline-suffix">{f.safe < 0 ? 'short before payday' : 'safe to spend'}</span>
          </div>
          {f.safe > 0 && <span className="caption">About {money(f.perDay)} a day.</span>}
          {f.safe <= 0 && <span className="caption">Just information: bills before payday come to more than what's there after your cushion.</span>}
        </div>

        <div className="breakdown">
          <div className="row spread"><span>In {f.account.name || 'your account'} now</span><span className="amount">{money(f.balanceNow)}</span></div>
          {incoming > 0 && <div className="row spread"><span>Coming in before payday</span><span className="amount">+{money(incoming)}</span></div>}
          {outgoing > 0 && <div className="row spread"><span>Going out before payday</span><span className="amount">−{money(outgoing)}</span></div>}
          {f.transfers.filter(t => t.need > 0).map(t => (
            <div key={t.account.id} className="row spread">
              <span>To send to {t.account.name || 'your other account'}</span>
              <span className="amount">{t.inMain === null ? `${tools.forAccount(t.need, t.account)}*` : `−${money(t.inMain)}`}</span>
            </div>
          ))}
          {f.cushion > 0 && <div className="row spread"><span>Cushion kept back</span><span className="amount">−{money(f.cushion)}</span></div>}
        </div>

        <div className="row spread">
          <span className="mono muted">Checked {sinceText(f.checked.date)}</span>
          <button className="text-button" onClick={() => onGo('accounts')}>Check balance</button>
        </div>

        {f.dip && (
          <div className="notice">
            Your balance gets down to {f.dip.balance < 0 ? '−' : ''}{money(Math.abs(f.dip.balance))} on {shortDate(f.dip.date)}
            {f.cushion > 0 ? ', below your cushion' : ''}. Worth a look — moving a payment or some money could smooth it.
          </div>
        )}
        {!f.payday && (
          <div className="notice">
            Add your pay as a repeating entry (in Calendar) and this runs until payday. For now it looks 30 days ahead.
            <div style={{ marginTop: 6 }}><button className="text-button" onClick={() => onGo('calendar')}>Go to Calendar</button></div>
          </div>
        )}

        <VButton kind="primary" accent="var(--brand)" onClick={() => setLogging(true)}><Plus size={16} /> Log spending</VButton>
        {week && (
          <span className="caption">This week's pot: {week.left >= 0 ? `${money(week.left)} left` : `${money(-week.left)} over`}.</span>
        )}
        <button className="text-button" style={{ alignSelf: 'flex-start' }} onClick={() => setAdjusting(true)}>Payday and cushion</button>
      </SectionBox>

      {f.transfers.map(t => (
        <SectionBox
          key={t.account.id}
          title={`To ${t.account.name || 'your other account'}`}
          accent="var(--brand)"
          subtitle={f.payday ? `Before ${shortDate(f.payday)}` : 'Next 30 days'}
        >
          {t.need > 0 ? (
            <>
              <div className="headline-number">
                {tools.forAccount(t.need, t.account)} <span className="headline-suffix">to transfer</span>
              </div>
              <span className="caption">
                {t.inMain !== null ? `About ${money(t.inMain)} from ${f.account.name || 'your main account'}, at today's rate. ` : 'No exchange rate yet — set one in Settings. '}
                Covers its bills before payday so it never goes below zero.
              </span>
            </>
          ) : (
            <span className="caption">Nothing to send: its balance covers its bills before payday.</span>
          )}
          {!t.checked && <div className="notice">Check {t.account.name || 'this account'}'s balance (in Accounts) for an exact figure — for now it's counted from nothing.</div>}
          {t.bills.length > 0 && (
            <div className="money-rows">
              {t.bills.map((m, i) => <ComingRow key={i} m={m} money={n => tools.forAccount(n, t.account)} />)}
            </div>
          )}
          <VButton accent="var(--brand)" onClick={() => setSending(t)}>Log a transfer</VButton>
        </SectionBox>
      ))}

      <SectionBox title="Coming up" accent="var(--brand)" subtitle={f.payday ? `Before ${shortDate(f.payday)}` : undefined}>
        {f.comingUp.length === 0 && <p className="help" style={{ margin: 0 }}>Nothing else going in or out before payday.</p>}
        <div className="money-rows">
          {f.comingUp.map((m, i) => <ComingRow key={i} m={m} money={money} />)}
        </div>
        {f.onPayday.length > 0 && (
          <div className="payday-rows">
            <span className="mono" style={{ color: 'var(--brand)' }}>Payday · starts the next stretch</span>
            {f.onPayday.map((m, i) => <ComingRow key={i} m={m} money={money} />)}
          </div>
        )}
      </SectionBox>

      {logging && <LogSpendingSheet onClose={() => setLogging(false)} />}
      {sending && <TransferSheet from={f.account} to={sending.account} amountIn={sending.need} onClose={() => setSending(null)} />}
      {adjusting && (
        <Sheet title="Payday and cushion" compact onClose={() => setAdjusting(false)} leftLabel="Done">
          <SafeToSpendSettings />
        </Sheet>
      )}
    </div>
  )
}

/** Logs money moved from your main account to another (in another currency): what arrived, and what left. */
function TransferSheet({ from, to, amountIn, onClose }: { from: Account; to: Account; amountIn: number; onClose: () => void }) {
  const tools = useMoneyTools()
  const addTransfer = useAccounts(s => s.addTransfer)
  const [inText, setInText] = useState(amountText(amountIn))
  const [outText, setOutText] = useState(() => amountText(tools.byAccount(amountIn, to, from) ?? 0))
  const [outTouched, setOutTouched] = useState(false)
  const [date, setDate] = useState(dayKey(new Date()))
  const amountInValue = parseAmount(inText)
  const amountOutValue = parseAmount(outText)
  const valid = amountInValue !== null && amountInValue > 0 && amountOutValue !== null && amountOutValue > 0

  return (
    <Sheet
      title={`Transfer to ${to.name || 'account'}`}
      compact
      onClose={onClose}
      right={{
        label: 'Save', disabled: !valid,
        onClick: () => {
          const [y, m, d] = date.split('-').map(Number)
          // Today's is stamped now, so it counts after a balance checked earlier today.
          const when = date === dayKey(new Date()) ? new Date() : new Date(y, m - 1, d, 12)
          addTransfer({ date: toISO(when), fromAccountID: from.id, toAccountID: to.id, amountIn: Math.abs(amountInValue!), amountOut: Math.abs(amountOutValue!) })
          onClose()
        },
      }}
    >
      <Field label={`Arrived in ${to.name || 'the account'} (${tools.currencyOf(to)})`}>
        <input
          inputMode="decimal" value={inText} autoFocus
          onChange={e => {
            setInText(e.target.value)
            const v = parseAmount(e.target.value)
            // Until you type what really left, it follows today's rate.
            if (v !== null && !outTouched) setOutText(amountText(tools.byAccount(Math.abs(v), to, from) ?? 0))
          }}
        />
      </Field>
      <Field label={`Left ${from.name || 'your main account'} (${tools.currencyOf(from)})`}>
        <input inputMode="decimal" value={outText} onChange={e => { setOutText(e.target.value); setOutTouched(true) }} />
      </Field>
      <Field label="Date"><input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} /></Field>
      <p className="help">Put in what your bank actually took, fees included, so both balances stay right.</p>
    </Sheet>
  )
}

function ComingRow({ m, money }: { m: Movement; money: (n: number) => string }) {
  return (
    <div className="money-row row" style={{ gap: 10 }}>
      <span className="mono muted" style={{ width: 52, flex: 'none' }}>{m.date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
      <span className="grow ellipsis">{m.title}</span>
      <span className="amount" style={{ color: m.estimate ? UNCONFIRMED : undefined }}>{m.amount >= 0 ? '+' : '−'}{money(Math.abs(m.amount))}</span>
    </div>
  )
}

/** Which pay is payday, and the cushion — shown here and in Settings. */
export function SafeToSpendSettings() {
  const events = useEntries(s => s.events)
  const { cushion, setCushion, paydayEntryID, setPayday } = useSettings()
  const [text, setText] = useState(amountText(cushion))
  const options = payOptions(events)
  const automatic = options.length > 0 && !options.some(e => e.id === paydayEntryID)

  return (
    <EditorBox title="Safe to spend">
      <Field label="Payday is when this arrives">
        <select value={automatic ? '' : paydayEntryID} onChange={e => setPayday(e.target.value || undefined)} disabled={options.length === 0}>
          <option value="">{options.length ? 'Your biggest repeating pay' : 'No pay added yet'}</option>
          {options.map(e => <option key={e.id} value={e.id}>{e.title || 'Untitled'}{e.repeats ? '' : ` (${dayKey(new Date(e.date))})`}</option>)}
        </select>
      </Field>
      <Field label="Cushion to keep back">
        <input
          inputMode="decimal" value={text} aria-label="Cushion"
          onChange={e => {
            setText(e.target.value)
            const v = parseAmount(e.target.value)
            if (v !== null) setCushion(Math.abs(v))
          }}
        />
      </Field>
      <p className="help">
        Safe to spend is what's in your main current account now, plus pay before payday, minus bills, planned spending and saving
        before payday, minus the cushion. Pay arriving on payday starts the next stretch.
      </p>
    </EditorBox>
  )
}
