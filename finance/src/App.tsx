// Finance's top level: the suite's shared shell with three tabs — Budget
// (where it opens), Calendar and Goals — and Settings in the side menu.

import { useApplyTheme } from '@suite/appearance'
import { AppShell, MenuRow, type ShellTab } from '@suite/ui/AppShell'
import { CalendarDays, ChartColumn, Hammer, Settings, Target } from 'lucide-react'
import { useState } from 'react'
import { APP_NAME } from './brand'
import { CalendarScreen } from './screens/CalendarScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { useSettings } from './store/settings'

type Tab = 'budget' | 'calendar' | 'goals'

const tabs: ShellTab<Tab>[] = [
  { id: 'budget', title: 'Budget', icon: s => <ChartColumn size={s} /> },
  { id: 'calendar', title: 'Calendar', icon: s => <CalendarDays size={s} /> },
  { id: 'goals', title: 'Goals', icon: s => <Target size={s} /> },
]

/** Honest about what isn't built yet, per the suite rules. */
function NotBuiltYet({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty">
      <Hammer size={32} />
      <strong style={{ color: 'var(--text)' }}>{title}</strong>
      <span className="caption">{detail}</span>
    </div>
  )
}

export default function App() {
  const appearance = useSettings(s => s.appearance)
  useApplyTheme(appearance)
  const [tab, setTab] = useState<Tab>(() => (sessionStorage.getItem('finance:ui:tab') as Tab) || 'budget')
  const [settingsOpen, setSettingsOpen] = useState(false)

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
      overlays={settingsOpen && <SettingsScreen onClose={() => setSettingsOpen(false)} />}
    >
      {tab === 'budget' && <NotBuiltYet title="Budget" detail="This week, in and out, sections and room to save — being built after the Calendar and Goals." />}
      {tab === 'calendar' && <CalendarScreen />}
      {tab === 'goals' && <NotBuiltYet title="Goals" detail="Saving, set-asides and debts broken into payments — coming after the Calendar." />}
    </AppShell>
  )
}
