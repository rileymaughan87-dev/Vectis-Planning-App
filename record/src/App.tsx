// Record's top level: the suite's shared shell with four tabs — Journal
// (where it opens), Notebooks, Notes and Papers — and Settings in the side menu.
// Links from the other apps (suite/links.ts) open a journal day or a
// goal's notes.

import { themeColors, useApplyTheme } from '@suite/appearance'
import { AppShell, MenuRow, type ShellTab } from '@suite/ui/AppShell'
import { Settings } from 'lucide-react'
import { parseRecordLink, type RecordLink } from '@suite/links'
import { useEffect, useState } from 'react'
import { APP_NAME } from './brand'
import { RecordScreen, type Section } from './screens/RecordScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { useData } from './store/data'

const tabs: ShellTab<Section>[] = [
  { id: 'journal', title: 'Journal' },
  { id: 'notebooks', title: 'Notebooks' },
  { id: 'notes', title: 'Notes' },
  { id: 'papers', title: 'Papers' },
]

function savedTab(): Section {
  try {
    const saved = sessionStorage.getItem('record:ui:tab')
    return saved === 'notebooks' || saved === 'notes' || saved === 'papers' ? saved : 'journal'
  } catch {
    return 'journal'
  }
}

/** A link in the address, taken once and then cleared so a reload doesn't repeat it. */
function takeLink(): RecordLink | null {
  const link = parseRecordLink(location.hash)
  if (link) history.replaceState(null, '', location.pathname + location.search)
  return link
}

const tabFor = (link: RecordLink): Section => (link.kind === 'journal' ? 'journal' : 'notes')

export default function App() {
  const appearance = useData(s => s.appearance)
  useApplyTheme(appearance)
  const colors = themeColors(appearance)
  const [link, setLink] = useState(() => ({ link: takeLink(), n: 0 }))
  const [tab, setTab] = useState<Section>(() => (link.link ? tabFor(link.link) : savedTab()))
  const [settingsOpen, setSettingsOpen] = useState(false)

  // A link followed while Record is already open.
  useEffect(() => {
    const onHash = () => {
      const next = takeLink()
      if (!next) return
      setLink(l => ({ link: next, n: l.n + 1 }))
      setTab(tabFor(next))
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

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
      <RecordScreen key={`${tab}:${link.n}`} section={tab} colors={colors} link={link.link && tabFor(link.link) === tab ? link.link : null} />
    </AppShell>
  )
}
