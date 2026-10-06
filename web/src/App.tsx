// The app shell: header, five tabs, the slide-in side menu, and a
// partner's view laid over the top when one is open.

import { CalendarClock, CalendarDays, Hammer, Home, Menu, NotebookText, Settings, Target, Users, UsersRound, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { DailyScreen } from './screens/DailyScreen'
import { GoalsScreen } from './screens/GoalsScreen'
import { HomeScreen } from './screens/HomeScreen'
import { AccountabilityScreen } from './screens/AccountabilityScreen'
import { PartnerView } from './screens/PartnerView'
import { SettingsScreen } from './screens/SettingsScreen'
import { useData } from './store/data'
import { useShare } from './store/share'
import { fileIDFromLink } from './sync/google'
import { Sheet, VButton } from './ui/components'
import { themeColors, useApplyTheme } from './ui/theme'

type Tab = 'home' | 'goals' | 'daily' | 'longTerm' | 'record'
type SidebarDestination = 'accountability' | 'people' | 'settings'

const tabs: { id: Tab; title: string; icon: ReactNode }[] = [
  { id: 'home', title: 'Home', icon: <Home size={19} /> },
  { id: 'goals', title: 'Goals', icon: <Target size={19} /> },
  { id: 'daily', title: 'Daily', icon: <CalendarDays size={19} /> },
  { id: 'longTerm', title: 'Long-Term', icon: <CalendarClock size={19} /> },
  { id: 'record', title: 'Record', icon: <NotebookText size={19} /> },
]

function ComingSoon({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty">
      <Hammer size={32} />
      <strong style={{ color: 'var(--text)' }}>{title}</strong>
      <span className="caption">{detail}</span>
    </div>
  )
}

export default function App() {
  const appearance = useData(s => s.appearance)
  useApplyTheme(appearance)
  const colors = themeColors(appearance)
  const share = useShare()

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
      const partner = await share.addPartner(invite)
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

  const title = tabs.find(t => t.id === tab)!.title

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-row">
          <span className="wordmark">Vectis</span>
          <button className="icon-button" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <Menu size={22} />
          </button>
        </div>
        <h1>{title}</h1>
      </header>

      <main className="content" style={tab === 'daily' ? { overflow: 'hidden' } : undefined}>
        {tab === 'home' && <HomeScreen colors={colors} />}
        {tab === 'goals' && <GoalsScreen colors={colors} />}
        {tab === 'daily' && <DailyScreen colors={colors} />}
        {tab === 'longTerm' && <ComingSoon title="Long-Term calendar" detail="The month view is next in line for the web version. Your long-term events and milestones are safe in the meantime." />}
        {tab === 'record' && <ComingSoon title="Record" detail="Journal, notebooks and notes are coming to the web version after the Long-Term calendar." />}
      </main>

      <nav className="tabbar" aria-label="Sections">
        {tabs.map(t => (
          <button key={t.id} className="tab" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            {t.icon}
            {t.title}
          </button>
        ))}
      </nav>

      {sidebarOpen && (
        <>
          <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
          <aside className="sidebar" aria-label="Menu">
            <div className="sidebar-head">
              <button className="icon-button" style={{ color: 'var(--text-2)' }} onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X size={20} /></button>
              <span className="wordmark">Vectis</span>
            </div>
            <button className="sidebar-row" onClick={() => go('accountability')}>
              <UsersRound size={22} color="var(--primary)" />
              <span>
                <div className="title">Accountability</div>
                <div className="subtitle">Share progress, view partners</div>
              </span>
              {share.hasUnpublishedChanges && <span className="badge" aria-label="Unpublished changes" />}
            </button>
            {share.partners.map(p => (
              <button key={p.id} className="sidebar-row" style={{ paddingLeft: 52 }} onClick={() => { setSidebarOpen(false); setPartnerID(p.id) }}>
                <span className="title" style={{ fontWeight: 400 }}>{p.name}</span>
              </button>
            ))}
            <button className="sidebar-row" onClick={() => go('people')}>
              <Users size={22} color="var(--primary)" />
              <span>
                <div className="title">People</div>
                <div className="subtitle">Contacts, birthdays, quick actions</div>
              </span>
            </button>
            <div className="sidebar-spacer" />
            <hr className="divider" />
            <button className="sidebar-row" style={{ marginBottom: 8 }} onClick={() => go('settings')}>
              <Settings size={22} color="var(--text-2)" />
              <span>
                <div className="title">Settings</div>
                <div className="subtitle">Appearance, categories, your data</div>
              </span>
            </button>
          </aside>
        </>
      )}

      {destination === 'settings' && <SettingsScreen onClose={() => setDestination(null)} />}
      {destination === 'accountability' && (
        <AccountabilityScreen onClose={() => setDestination(null)} onOpenPartner={id => { setDestination(null); setPartnerID(id) }} />
      )}
      {destination === 'people' && (
        <Sheet title="People" onClose={() => setDestination(null)}>
          <ComingSoon title="People" detail="Contacts on the web work differently from the iPhone. This page is planned after Record." />
        </Sheet>
      )}

      {invite && (
        <Sheet title="Accountability partner" compact onClose={() => setInvite(null)}>
          <p style={{ margin: 0 }}>Someone shared their Vectis with you. Follow them to see their goals and calendar, read-only.</p>
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
