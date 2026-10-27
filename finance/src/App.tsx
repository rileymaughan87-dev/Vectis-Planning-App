// Finance's top level (pivot, Oct 2026): the suite's shared shell with
// three tabs, one job each — Budget (the plan by pay period, like a
// spreadsheet, and its calendar), Accounts (what's in each and what to send
// at payday) and Savings (savings, investments and debts, with their
// graphs) — and Settings in the side menu.
// Opening the app with "?log" goes straight to logging spending (the
// Apple Wallet Shortcut, the home-screen shortcut on Android, or a bookmark).

import { useApplyTheme } from '@suite/appearance'
import { useFreshRates } from './store/money'
import { AppShell, MenuRow, type ShellTab } from '@suite/ui/AppShell'
import { SyncChoiceSheet } from '@suite/ui/SyncBox'
import { useSync } from './store/sync'
import { Settings } from 'lucide-react'
import { useState } from 'react'
import { APP_NAME } from './brand'
import { AccountsScreen } from './screens/AccountsScreen'
import { BudgetScreen } from './screens/BudgetScreen'
import { SavingsScreen } from './screens/SavingsScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { LogSpendingSheet } from './screens/SpendingSheets'
import { readLogLink } from './model/walletLink'
import { useSettings } from './store/settings'

type Tab = 'budget' | 'accounts' | 'savings'

const tabs: ShellTab<Tab>[] = [
  { id: 'budget', title: 'Budget' },
  { id: 'accounts', title: 'Accounts' },
  { id: 'savings', title: 'Savings' },
]

/** The tab to reopen. Older tabs map onto the new ones: Now, Months, Plan and Calendar are Budget; Goals is Savings. */
function savedTab(): Tab {
  const saved = sessionStorage.getItem('finance:ui:tab')
  if (saved === 'accounts') return 'accounts'
  if (saved === 'savings' || saved === 'goals') return 'savings'
  return 'budget'
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
      {tab === 'budget' && <BudgetScreen />}
      {tab === 'accounts' && <AccountsScreen />}
      {tab === 'savings' && <SavingsScreen />}
    </AppShell>
  )
}
