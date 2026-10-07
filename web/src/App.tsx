// The app shell. On a phone: header, five tabs along the bottom, and a
// slide-in side menu. On a wider screen the tabs and side-menu items sit
// together in a permanent sidebar instead. A partner's view is laid over
// the top when one is open.

import { CalendarClock, CalendarDays, Home, Menu, NotebookText, Settings, Target, UsersRound, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { AccountabilityScreen } from './screens/AccountabilityScreen'
import { DailyScreen } from './screens/DailyScreen'
import { GoalsScreen } from './screens/GoalsScreen'
import { HomeScreen } from './screens/HomeScreen'
import { LongTermScreen } from './screens/LongTermScreen'
import { PartnerView } from './screens/PartnerView'
import { RecordScreen } from './screens/RecordScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { useData } from './store/data'
import { useShare } from './store/share'
import { fileIDFromLink } from './sync/google'
import { Sheet, VButton } from './ui/components'
import { APP_NAME } from './ui/brand'
import { themeColors, useApplyTheme } from './ui/theme'

type Tab = 'home' | 'goals' | 'daily' | 'longTerm' | 'record'
type SidebarDestination = 'accountability' | 'settings'

const tabs: { id: Tab; title: string; icon: (size: number) => ReactNode }[] = [
  { id: 'home', title: 'Home', icon: s => <Home size={s} /> },
  { id: 'goals', title: 'Goals', icon: s => <Target size={s} /> },
  { id: 'daily', title: 'Daily', icon: s => <CalendarDays size={s} /> },
  { id: 'longTerm', title: 'Long-Term', icon: s => <CalendarClock size={s} /> },
  { id: 'record', title: 'Record', icon: s => <NotebookText size={s} /> },
]

/** Accountability (with partners under it), then Settings set apart. */
function MenuItems(props: { onGo: (d: SidebarDestination) => void; onPartner: (id: string) => void }) {
  const share = useShare()
  return (
    <>
      <button className="sidebar-row" onClick={() => props.onGo('accountability')}>
        <UsersRound size={22} color="var(--primary)" />
        <span>
          <div className="title">Accountability</div>
          <div className="subtitle">Share progress, view partners</div>
        </span>
        {share.hasUnpublishedChanges && <span className="badge" aria-label="Unpublished changes" />}
      </button>
      {share.partners.map(p => (
        <button key={p.id} className="sidebar-row partner-row" onClick={() => props.onPartner(p.id)}>
          <span className="title">{p.name}</span>
        </button>
      ))}
      <div className="sidebar-spacer" />
      <hr className="divider" />
      <button className="sidebar-row" style={{ marginBottom: 8 }} onClick={() => props.onGo('settings')}>
        <Settings size={22} color="var(--text-2)" />
        <span>
          <div className="title">Settings</div>
          <div className="subtitle">Appearance, categories, your data</div>
        </span>
      </button>
    </>
  )
}

export default function App() {
  const appearance = useData(s => s.appearance)
  useApplyTheme(appearance)
  const colors = themeColors(appearance)
  const addPartner = useShare(s => s.addPartner)

  const [tab, setTab] = useState<Tab>(() => (sessionStorage.getItem('vectis:ui:tab') as Tab) || 'home')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [destination, setDestination] = useState<SidebarDestination | null>(null)
  const [partnerID, setPartnerID] = useState<string | null>(null)
  const [invite, setInvite] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteBusy, setInviteBusy] = useState(false)

  useEffect(() => {
    try {
      sessionStorage.setItem('vectis:ui:tab', tab)
    } catch {
      // Tab just won't be remembered.
    }
  }, [tab])

  // Opening a partner's link (…#partner=<file id>) offers to follow them.
  useEffect(() => {
    const check = () => {
      if (!location.hash.includes('partner=')) return
      const id = fileIDFromLink(location.hash)
      history.replaceState(null, '', location.pathname + location.search)
      if (!id) return
      if (useShare.getState().partners.some(p => p.id === id)) setPartnerID(id)
      else setInvite(id)
    }
    check()
    window.addEventListener('hashchange', check)
    return () => window.removeEventListener('hashchange', check)
  }, [])

  const acceptInvite = async () => {
    if (!invite) return
    setInviteBusy(true)
    setInviteError(null)
    try {
      const partner = await addPartner(invite)
      setInvite(null)
      setPartnerID(partner.id)
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : String(error))
    } finally {
      setInviteBusy(false)
    }
  }

  const go = (d: SidebarDestination) => {
    setSidebarOpen(false)
    setDestination(d)
  }
  const openPartner = (id: string) => {
    setSidebarOpen(false)
    setPartnerID(id)
  }

  const title = tabs.find(t => t.id === tab)!.title

  return (
    <div className="app">
      <aside className="rail" aria-label="Navigation">
        <div className="rail-head"><span className="wordmark">{APP_NAME}</span></div>
        <nav aria-label="Sections">
          {tabs.map(t => (
            <button key={t.id} className="rail-tab" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
              {t.icon(18)}
              {t.title}
            </button>
          ))}
        </nav>
        <hr className="divider" style={{ margin: '10px 0' }} />
        <MenuItems onGo={go} onPartner={openPartner} />
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-row">
            <span className="wordmark">{APP_NAME}</span>
            <button className="icon-button menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <Menu size={22} />
            </button>
          </div>
          {/* Read by screen readers; not shown, per the design system. */}
          <h1 className="visually-hidden">{title}</h1>
        </header>

        <main className={`content ${tab === 'daily' ? 'content-daily' : ''}`}>
          {tab === 'home' && <HomeScreen colors={colors} />}
          {tab === 'goals' && <GoalsScreen colors={colors} />}
          {tab === 'daily' && <DailyScreen colors={colors} />}
          {tab === 'longTerm' && <LongTermScreen colors={colors} />}
          {tab === 'record' && <RecordScreen colors={colors} />}
        </main>

        <nav className="tabbar" aria-label="Sections">
          {tabs.map(t => (
            <button key={t.id} className="tab" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
              {t.icon(19)}
              {t.title}
            </button>
          ))}
        </nav>
      </div>

      {sidebarOpen && (
        <>
          <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
          <aside className="sidebar" aria-label="Menu">
            <div className="sidebar-head">
              <button className="icon-button" style={{ color: 'var(--text-2)' }} onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X size={20} /></button>
              <span className="wordmark">{APP_NAME}</span>
            </div>
            <MenuItems onGo={go} onPartner={openPartner} />
          </aside>
        </>
      )}

      {destination === 'settings' && <SettingsScreen onClose={() => setDestination(null)} />}
      {destination === 'accountability' && (
        <AccountabilityScreen onClose={() => setDestination(null)} onOpenPartner={id => { setDestination(null); setPartnerID(id) }} />
      )}

      {invite && (
        <Sheet title="Accountability partner" compact onClose={() => setInvite(null)}>
          <p style={{ margin: 0 }}>Someone shared their Planner with you. Follow them to see their goals and calendar, read-only.</p>
          {inviteError && <div className="notice error">{inviteError}</div>}
          <VButton kind="primary" accent="var(--primary)" onClick={() => void acceptInvite()} disabled={inviteBusy}>
            {inviteBusy ? 'Loading…' : 'Follow'}
          </VButton>
          <VButton onClick={() => setInvite(null)}>Not now</VButton>
        </Sheet>
      )}

      {partnerID && <PartnerView partnerID={partnerID} colors={colors} onBack={() => setPartnerID(null)} />}
    </div>
  )
}
