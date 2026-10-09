// Record's top level: the suite's shared shell with three tabs — Journal
// (where it opens), Notebooks and Notes — and Settings in the side menu.

import { themeColors, useApplyTheme } from '@suite/appearance'
import { AppShell, MenuRow, type ShellTab } from '@suite/ui/AppShell'
import { BookOpen, NotebookPen, Settings, StickyNote } from 'lucide-react'
import { useState } from 'react'
import { APP_NAME } from './brand'
import { RecordScreen, type Section } from './screens/RecordScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { useData } from './store/data'

const tabs: ShellTab<Section>[] = [
  { id: 'journal', title: 'Journal', icon: s => <NotebookPen size={s} /> },
  { id: 'notebooks', title: 'Notebooks', icon: s => <BookOpen size={s} /> },
  { id: 'notes', title: 'Notes', icon: s => <StickyNote size={s} /> },
]

function savedTab(): Section {
  try {
    const saved = sessionStorage.getItem('record:ui:tab')
    return saved === 'notebooks' || saved === 'notes' ? saved : 'journal'
  } catch {
    return 'journal'
  }
}

export default function App() {
  const appearance = useData(s => s.appearance)
  useApplyTheme(appearance)
  const colors = themeColors(appearance)
  const [tab, setTab] = useState<Section>(savedTab)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const choose = (t: Section) => {
    setTab(t)
    try {
      sessionStorage.setItem('record:ui:tab', t)
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
            subtitle="Sync, appearance, your data"
            style={{ marginBottom: 8 }}
            onClick={() => { close(); setSettingsOpen(true) }}
          />
        </>
      )}
      overlays={settingsOpen && <SettingsScreen onClose={() => setSettingsOpen(false)} />}
    >
      <RecordScreen key={tab} section={tab} colors={colors} />
    </AppShell>
  )
}
