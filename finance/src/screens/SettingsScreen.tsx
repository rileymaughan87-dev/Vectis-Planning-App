// Finance settings: appearance, currency (and international mode) and your data.

import { AppearanceEditor } from '@suite/ui/AppearanceEditor'
import { EditorBox, Sheet, Toggle, VButton } from '@suite/ui/components'
import { useRef, useState } from 'react'
import { SyncBox } from '@suite/ui/SyncBox'
import { currenciesInUse, rateToHome } from '../model/currency'
import { CURRENCIES, amountText, parseAmount, regionCurrency } from '../model/money'
import { useMoneyTools } from '../store/money'
import { useRates } from '../store/rates'
import { useSync } from '../store/sync'
import { backups } from '../store/persist'
import { useSettings } from '../store/settings'
import { useAccounts } from '../store/accounts'
import { SafeToSpendSettings } from './NowScreen'

/**
 * International mode: accounts in more than one currency. Your home currency
 * (above) is what totals add up in; each account can have its own.
 */
function InternationalSettings() {
  const { international, setInternational, rateOverrides, setRateOverride } = useSettings()
  const { home } = useMoneyTools()
  const { rates, error, fetching, refresh } = useRates()
  const others = currenciesInUse(useAccounts(s => s.accounts), home).filter(c => c !== home)

  return (
    <>
      <Toggle label="International (accounts in more than one currency)" checked={international} onChange={setInternational} />
      <p className="help">
        {international
          ? `Each account can have its own currency — set it on the account. Its pay, bills and spending are in that currency, so nothing is planned twice. Totals add up in ${home}. A current account in another currency shows what to transfer to it before payday.`
          : 'For money in more than one country — say pounds in a UK account and dollars in a US one.'}
      </p>
      {international && others.length === 0 && <p className="help">No accounts in another currency yet: open one in Accounts and choose its currency.</p>}
      {international && others.map(code => (
        <RateRow
          key={code}
          code={code}
          home={home}
          daily={rateToHome(code, home, rates, {})}
          own={rateOverrides[code]}
          onOwn={rate => setRateOverride(code, rate)}
        />
      ))}
      {international && others.length > 0 && (
        <p className="help">
          Daily rates are the European Central Bank's{rates ? ` (${rates.date})` : ''}, via Frankfurter.{' '}
          <button className="text-button" disabled={fetching} onClick={() => void refresh(home)}>{fetching ? 'Updating…' : 'Update now'}</button>
        </p>
      )}
      {international && error && <div className="notice">{error}</div>}
    </>
  )
}

function RateRow({ code, home, daily, own, onOwn }: { code: string; home: string; daily: number | null; own?: number; onOwn: (rate: number | undefined) => void }) {
  const [text, setText] = useState(own ? amountText(own) : '')
  return (
    <div className="rate-row">
      <span>1 {code} = {daily ? `${daily.toFixed(4)} ${home}` : 'no rate yet'}{own ? ' (daily)' : ''}</span>
      <label className="row" style={{ gap: 8 }}>
        <span className="caption">Your own rate</span>
        <input
          inputMode="decimal" value={text} placeholder={daily ? daily.toFixed(4) : 'e.g. 0.79'} aria-label={`Your own rate for ${code}`}
          style={{ width: 110 }}
          onChange={e => {
            setText(e.target.value)
            const v = parseAmount(e.target.value)
            onOwn(v && v > 0 ? v : undefined)
          }}
        />
      </label>
    </div>
  )
}

export function SettingsScreen({ onClose }: { onClose: () => void }) {
  const { appearance, setAppearance, currencyOverride, setCurrency } = useSettings()
  const restoreRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  return (
    <Sheet title="Settings" onClose={onClose} leftLabel="Done">
      <SyncBox useSync={useSync} what="your entries, goals, logged spending and weekly pot" />

      <SafeToSpendSettings />

      <AppearanceEditor appearance={appearance} onChange={setAppearance} />

      <EditorBox title="Currency">
        <select value={currencyOverride ?? ''} onChange={e => setCurrency(e.target.value || undefined)} aria-label="Currency">
          <option value="">Follow my region ({regionCurrency()})</option>
          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <InternationalSettings />
      </EditorBox>

      <EditorBox title="Your data">
        <p className="help">
          Your money data stays in this browser on this device. A backup is how to keep a copy or move it to another device.
        </p>
        <div className="button-row">
          <VButton onClick={backups.download}>Download backup</VButton>
          <VButton onClick={() => restoreRef.current?.click()}>Restore backup…</VButton>
        </div>
        <input
          ref={restoreRef} type="file" accept=".json,application/json" className="visually-hidden"
          onChange={async e => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            if (!confirm('Restoring replaces everything stored here with the backup. Continue?')) return
            try {
              await backups.restore(file)
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err))
            }
          }}
        />
        {error && <div className="notice error">{error}</div>}
      </EditorBox>
    </Sheet>
  )
}
