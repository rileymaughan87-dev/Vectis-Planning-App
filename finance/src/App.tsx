// Finance's top level: the suite's shared shell with its tabs — Now
// (where it opens: safe to spend until payday), Accounts, Plan, Calendar
// and Goals — and Settings in the side menu.
// Opening the app with "?log" goes straight to logging spending (the
// home-screen shortcut on Android, or a bookmark anywhere).

import { useApplyTheme } from '@suite/appearance'
import { AppShell, MenuRow, type ShellTab } from '@suite/ui/AppShell'
import { Settings } from 'lucide-react'
import { useState } from 'react'
import { APP_NAME } from './brand'
import { AccountsScreen } from './screens/AccountsScreen'
import { NowScreen } from './screens/NowScreen'
import { PlanScreen } from './screens/PlanScreen'
import { CalendarScreen } from './screens/CalendarScreen'
import { GoalsScreen } from './screens/GoalsScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { LogSpendingSheet } from './screens/SpendingSheets'
import { useSettings } from './store/settings'

type Tab = 'now' | 'accounts' | 'plan' | 'calendar' | 'goals'

const tabs: ShellTab<Tab>[] = [
  { id: 'now', title: 'Now' },
  { id: 'accounts', title: 'Accounts' },
  { id: 'plan', title: 'Plan' },
  { id: 'calendar', title: 'Calendar' },
  { id: 'goals', title: 'Goals' },
]

export default function App() {
  const appearance = useSettings(s => s.appearance)
  useApplyTheme(appearance)
  const [tab, setTab] = useState<Tab>(() => (sessionStorage.getItem('finance:ui:tab') as Tab | 'budget' | null)?.replace('budget', 'plan') as Tab || 'now')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [quickLog, setQuickLog] = useState(() => new URLSearchParams(location.search).has('log'))
  const closeQuickLog = () => {
    setQuickLog(false)
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
            subtitle="Appearance, your data"
            style={{ marginBottom: 8 }}
            onClick={() => { close(); setSettingsOpen(true) }}
          />
        </>
      )}
      overlays={<>
        {settingsOpen && <SettingsScreen onClose={() => setSettingsOpen(false)} />}
        {quickLog && <LogSpendingSheet onClose={closeQuickLog} />}
      </>}
    >
      {tab === 'now' && <NowScreen onGo={choose} />}
      {tab === 'accounts' && <AccountsScreen />}
      {tab === 'plan' && <PlanScreen />}
      {tab === 'calendar' && <CalendarScreen />}
      {tab === 'goals' && <GoalsScreen />}
    </AppShell>
  )
}
