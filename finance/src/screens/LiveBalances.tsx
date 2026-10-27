// Settings → Live balances: link UK banks (Enable Banking) and US banks
// (SimpleFIN), and choose which Finance account each bank account
// follows. Read-only: nothing here can move money.

import { EditorBox, Field, Sheet, VButton } from '@suite/ui/components'
import { useEffect, useMemo, useState } from 'react'
import { pickBalance, renewNote, type LinkedBalance } from '../model/bankLink'
import { formatAmount } from '../model/money'
import { useAccounts } from '../store/accounts'
import { useBank, type UKBank } from '../store/bankLink'
import { useSync } from '../store/sync'

export function LiveBalancesBox() {
  const phase = useSync(s => s.phase)
  const bank = useBank()
  const { accounts, updateAccount } = useAccounts()
  const [sheet, setSheet] = useState<'uk' | 'us' | null>(null)
  const live = phase === 'live'

  // Opening Settings shows what's linked.
  useEffect(() => {
    if (live && useBank.getState().phase === 'idle') void useBank.getState().refresh()
  }, [live])

  const groups = useMemo(() => {
    const m = new Map<string, LinkedBalance[]>()
    // By bank (SimpleFIN brings several banks through one link).
    for (const b of bank.linked) {
      const k = `${b.connection}|${b.institution}`
      m.set(k, [...(m.get(k) ?? []), b])
    }
    return [...m.entries()]
  }, [bank.linked])

  const follow = (key: string, accountID: string) => {
    for (const a of accounts) {
      if (a.id === accountID && a.link !== key) updateAccount({ ...a, link: key })
      else if (a.id !== accountID && a.link === key) updateAccount({ ...a, link: undefined })
    }
    // Record its balance straight away.
    if (accountID) void bank.refresh()
  }

  return (
    <EditorBox title="Live balances">
      <p className="help" style={{ marginTop: 0 }}>
        Your banks' balances, read-only, checked when you open Finance. Each one is recorded as a balance check, so Payday and
        Everyday use the real numbers. UK banks through Open Banking (Enable Banking); US banks and Fidelity through SimpleFIN.
      </p>
      {!live ? (
        <p className="help">Turn on sync (above) first — live balances use the same sign-in.</p>
      ) : (
        <>
          {groups.map(([group, list]) => {
            const { connection, institution } = list[0]
            const renew = renewNote(list[0])
            const sfAll = [...new Set(bank.linked.filter(b => b.connection === 'sf').map(b => b.institution))].join(' and ')
            return (
              <div key={group} className="live-group">
                <div className="row spread" style={{ alignItems: 'baseline' }}>
                  <strong>{institution}</strong>
                  <button className="text-button" onClick={() => {
                    const what = connection === 'sf' ? `SimpleFIN (${sfAll})` : institution
                    if (confirm(`Unlink ${what}? Accounts that follow it go back to being checked by hand.`)) void bank.unlink(connection)
                  }}>Unlink</button>
                </div>
                {renew && <div className="notice">{renew}{connection.startsWith('eb:') ? ` — link ${institution} again below.` : ''}</div>}
                {list.map(b => {
                  const following = accounts.find(a => a.link === b.key)
                  const shown = pickBalance(b, following ?? { kind: 'current' })
                  return (
                    <div key={b.key} className="live-row">
                      <div className="row spread">
                        <span className="ellipsis">{b.name}</span>
                        <span className="amount">{shown === null ? '—' : formatAmount(shown, b.currency)}</span>
                      </div>
                      <Field label="Follows">
                        <select value={following?.id ?? ''} onChange={e => follow(b.key, e.target.value)}>
                          <option value="">Not used</option>
                          {accounts.map(a => <option key={a.id} value={a.id}>{a.name || 'Account'}</option>)}
                        </select>
                      </Field>
                    </div>
                  )
                })}
              </div>
            )
          })}
          {bank.problems.map(p => <div key={p} className="notice">{p}</div>)}
          {bank.error && <div className="notice error">{bank.error}</div>}
          <div className="button-row">
            <VButton onClick={() => setSheet('uk')}>Link a UK bank</VButton>
            <VButton onClick={() => setSheet('us')}>Connect US banks</VButton>
          </div>
          {bank.linked.length > 0 && (
            <button className="text-button" disabled={bank.phase === 'loading'} onClick={() => void bank.refresh()}>
              {bank.phase === 'loading' ? 'Checking…' : `Check now${bank.checkedAt ? ` · last ${new Date(bank.checkedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : ''}`}
            </button>
          )}
        </>
      )}
      {sheet === 'uk' && <UKBankSheet onClose={() => setSheet(null)} />}
      {sheet === 'us' && <SimplefinSheet onClose={() => setSheet(null)} />}
    </EditorBox>
  )
}

function UKBankSheet({ onClose }: { onClose: () => void }) {
  const [banks, setBanks] = useState<UKBank[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [going, setGoing] = useState<string | null>(null)
  useEffect(() => {
    useBank.getState().ukBanks().then(setBanks, e => setError(e instanceof Error ? e.message : String(e)))
  }, [])
  const q = query.trim().toLowerCase()
  const shown = (banks ?? []).filter(b => !q || b.name.toLowerCase().includes(q)).slice(0, 40)

  return (
    <Sheet title="Link a UK bank" compact onClose={onClose}>
      <p className="help" style={{ margin: 0 }}>
        You'll go to your bank to approve read-only access, then come back here. Access lasts about 90 days; Finance tells you
        when to renew.
      </p>
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search — HSBC, Monzo…" aria-label="Search banks" />
      {!banks && !error && <p className="help">Loading banks…</p>}
      {error && <div className="notice error">{error}</div>}
      <div className="bank-list">
        {shown.map(b => (
          <button
            key={b.name} className="bank-choice" disabled={going !== null}
            onClick={async () => {
              setGoing(b.name)
              try {
                await useBank.getState().linkUK(b.name)
              } catch (e) {
                setGoing(null)
                setError(e instanceof Error ? e.message : String(e))
              }
            }}
          >
            {going === b.name ? `Opening ${b.name}…` : b.name}
          </button>
        ))}
      </div>
    </Sheet>
  )
}

function SimplefinSheet({ onClose }: { onClose: () => void }) {
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const connect = async () => {
    setBusy(true)
    setError(null)
    try {
      await useBank.getState().connectSimplefin(token)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }
  return (
    <Sheet title="Connect US banks" compact onClose={onClose} right={{ label: 'Connect', onClick: connect, disabled: !token.trim() || busy }}>
      <ol className="help steps">
        <li>On <a href="https://bridge.simplefin.org" target="_blank" rel="noreferrer">bridge.simplefin.org</a>, connect America First and Fidelity.</li>
        <li>Make a new setup token there (Apps → New connection) and copy it.</li>
        <li>Paste it here. It works once; Finance swaps it for read-only access kept on the server.</li>
      </ol>
      <textarea value={token} onChange={e => setToken(e.target.value)} rows={4} placeholder="Setup token" aria-label="Setup token" />
      {error && <div className="notice error">{error}</div>}
      <VButton kind="primary" accent="var(--primary)" onClick={connect} disabled={!token.trim() || busy}>{busy ? 'Connecting…' : 'Connect'}</VButton>
    </Sheet>
  )
}
