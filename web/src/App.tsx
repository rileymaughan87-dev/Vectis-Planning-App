// Planner's top level: the shared shell (suite/ui/AppShell) with five
// tabs, and the side menu's Accountability, partners and Settings. A
// partner's view is laid over the top when one is open.

import { AppShell, MenuRow, type ShellTab } from '@suite/ui/AppShell'
import { CalendarClock, CalendarDays, Home, NotebookText, Settings, Target, UsersRound } from 'lucide-react'
import { useEffect, useState } from 'react'
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

const tabs: ShellTab<Tab>[] = [
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
      <MenuRow
        icon={<UsersRound size={22} color="var(--primary)" />}
        title="Accountability"
        subtitle="Share progress, view partners"
        badge={share.hasUnpublishedChanges ? 'Unpublished changes' : undefined}
        onClick={() => props.onGo('accountability')}
      />
      {share.partners.map(p => (
        <button key={p.id} className="sidebar-row partner-row" onClick={() => props.onPartner(p.id)}>
          <span className="title">{p.name}</span>
        </button>
      ))}
      <div className="sidebar-spacer" />
      <hr className="divider" />
      <MenuRow
        icon={<Settings size={22} color="var(--text-2)" />}
        title="Settings"
        subtitle="Appearance, categories, your data"
        style={{ marginBottom: 8 }}
        onClick={() => props.onGo('settings')}
      />
    </>
  )
}

export default function App() {
  const appearance = useData(s => s.appearance)
  useApplyTheme(appearance)
  const colors = themeColors(appearance)
  const addPartner = useShare(s => s.addPartner)

  const [tab, setTab] = useState<Tab>(() => (sessionStorage.getItem('vectis:ui:tab') as Tab) || 'home')
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

  return (
    <AppShell
      appName={APP_NAME}
      tabs={tabs}
      tab={tab}
      onTab={setTab}
      menu={close => <MenuItems onGo={d => { close(); setDestination(d) }} onPartner={id => { close(); setPartnerID(id) }} />}
      contentClassName={tab === 'daily' ? 'content-daily' : ''}
      overlays={
        <>
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
        </>
      }
    >
      {tab === 'home' && <HomeScreen colors={colors} />}
      {tab === 'goals' && <GoalsScreen colors={colors} />}
      {tab === 'daily' && <DailyScreen colors={colors} />}
      {tab === 'longTerm' && <LongTermScreen colors={colors} />}
      {tab === 'record' && <RecordScreen colors={colors} />}
    </AppShell>
  )
}
