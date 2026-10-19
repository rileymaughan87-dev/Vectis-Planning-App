// Finance's top level: the suite's shared shell with four tabs, one
// question each (Oct 2026): Now (what's safe until payday, what to send
// abroad), Months (the plan by pay period, with Calendar and every entry),
// Accounts (balances and checks) and Goals (debts and savings) — and
// Settings in the side menu.
// Opening the app with "?log" goes straight to logging spending (the
// home-screen shortcut on Android, or a bookmark anywhere).

import { useApplyTheme } from '@suite/appearance'
import { useFreshRates } from './store/money'
import { AppShell, MenuRow, type ShellTab } from '@suite/ui/AppShell'
import { SyncChoiceSheet } from '@suite/ui/SyncBox'
import { useSync } from './store/sync'
import { Settings } from 'lucide-react'
import { useState } from 'react'
import { APP_NAME } from './brand'
import { AccountsScreen } from './screens/AccountsScreen'
import { NowScreen } from './screens/NowScreen'
import { MonthsScreen } from './screens/MonthsScreen'
import { GoalsScreen } from './screens/GoalsScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { LogSpendingSheet } from './screens/SpendingSheets'
import { readLogLink } from './model/walletLink'
import { useSettings } from './store/settings'

type Tab = 'now' | 'months' | 'accounts' | 'goals'

const tabs: ShellTab<Tab>[] = [
  { id: 'now', title: 'Now' },
  { id: 'months', title: 'Months' },
  { id: 'accounts', title: 'Accounts' },
  { id: 'goals', title: 'Goals' },
]

/** The tab to reopen; Plan, Calendar (and the older Budget) live in Months now. */
function savedTab(): Tab {
  const saved = sessionStorage.getItem('finance:ui:tab')
  if (saved === 'plan' || saved === 'calendar' || saved === 'budget') return 'months'
  return saved === 'months' || saved === 'accounts' || saved === 'goals' ? saved : 'now'
}

export default function App() {
  const appearance = useSettings(s => s.appearance)
  useApplyTheme(appearance)
  // International mode: today's exchange rate.
  useFreshRates()
  const [tab, setTab] = useState<Tab>(savedTab)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // "?log" opens Log spending; from an Apple Wallet Shortcut it carries the amount, shop and card (model/walletLink.ts).
  const [quickLog, setQuickLog] = useState(() => readLogLink(location.search))
  const closeQuickLog = () => {
    setQuickLog(null)
    // Drop "?log" so a reload doesn't open it again.
    history.replaceState(null, '', location.pathname)
  }

  const choose = (t: Tab) => {
    setTab(t)
    try {
      sessionStorage.setItem('finance:ui:tab', t)
    } catch {
      // The tab just won't be remembered.
    }
  }

  return (
    <AppShell
      appName={APP_NAME}
      homeHref="../"
      tabs={tabs}
      tab={tab}
      onTab={choose}
      menu={close => (
        <>
          <div className="sidebar-spacer" />
          <hr className="divider" />
          <MenuRow
            icon={<Settings size={22} color="var(--text-2)" />}
            title="Settings"
            subtitle="Money, logging, sync, your data"
            style={{ marginBottom: 8 }}
            onClick={() => { close(); setSettingsOpen(true) }}
          />
        </>
      )}
      overlays={<>
        {settingsOpen && <SettingsScreen onClose={() => setSettingsOpen(false)} />}
        {quickLog && <LogSpendingSheet wallet={quickLog.amount || quickLog.note || quickLog.card ? quickLog : undefined} onClose={closeQuickLog} />}
        {!settingsOpen && <SyncChoiceSheet useSync={useSync} appName="Finance" />}
      </>}
    >
      {tab === 'now' && <NowScreen onGo={choose} />}
      {tab === 'months' && <MonthsScreen />}
      {tab === 'accounts' && <AccountsScreen />}
      {tab === 'goals' && <GoalsScreen />}
    </AppShell>
  )
}
