// "Sync between devices" in an app's Settings: sign in with Google once
// per device, then everything stays the same on each, live. The first
// time a device joins with data of its own, you take the synced data or
// combine the two; nothing in the cloud is ever deleted by that choice.
// Shared by Planner and Finance; each passes its own sync store.

import { Cloud, CloudOff, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import type { SyncStore } from '../sync/store'
import { EditorBox, Sheet, VButton } from './components'

const ago = (t?: number) => {
  if (!t) return ''
  const s = Math.round((Date.now() - t) / 1000)
  return s < 10 ? 'just now' : s < 60 ? `${s} seconds ago` : `${Math.round(s / 60)} min ago`
}

/** The one-time choice when a device joins with data of its own. */
function SyncChoice({ choice, choose }: { choice: { device: string; cloud: string }; choose: (side: 'combine' | 'cloud') => Promise<void> }) {
  return (
    <>
      <strong>This device has data of its own</strong>
      <p className="help" style={{ margin: 0 }}>
        A one-time choice for this device. Neither option deletes anything from your synced data, and this device's copy is set aside in case you need it.
      </p>
      <div className="sync-choice">
        <button type="button" onClick={() => void choose('combine')}>
          <strong>Combine both</strong>
          <span className="caption">Adds this device's {choice.device}</span>
          <span className="caption2">Keeps everything synced and adds this device's items. Where both have the same item, this device's version is kept. The usual choice.</span>
        </button>
        <button type="button" onClick={() => void choose('cloud')}>
          <strong>Use only the synced data</strong>
          <span className="caption">{choice.cloud}</span>
          <span className="caption2">Leaves out this device's items. They're set aside, and can be added back from here later.</span>
        </button>
      </div>
    </>
  )
}

/**
 * The same choice over the app, wherever you are: with one sign-in for
 * every app, an app can start syncing without its Settings being open.
 * "Later" hides it until the app is next opened; nothing syncs meanwhile.
 */
export function SyncChoiceSheet({ useSync, appName }: { useSync: SyncStore; appName: string }) {
  const { phase, choice, choose } = useSync()
  const [later, setLater] = useState(false)
  if (phase !== 'choose' || !choice || later) return null
  return (
    <Sheet title={`Sync ${appName}`} compact onClose={() => setLater(true)} leftLabel="Later">
      <p style={{ margin: 0 }}>You're signed in, so {appName} can sync now too.</p>
      <SyncChoice choice={choice} choose={choose} />
    </Sheet>
  )
}

export function SyncBox({ useSync, what, notYet }: {
  useSync: SyncStore
  /** What stays the same on both, e.g. "your goals, calendar, tasks, notes and journal". */
  what: string
  /** Anything that doesn't sync yet, said plainly. */
  notYet?: string
}) {
  const { phase, email, status, lastSyncedAt, error, choice, signIn, signOut, choose, setAside, bringBack, dismissSetAside } = useSync()
  const [, redraw] = useState(0)
  const aside = phase === 'connecting' || phase === 'choose' ? null : setAside()

  if (phase === 'unavailable') return null

  return (
    <EditorBox title="Sync between devices">
      {phase === 'signedOut' && (
        <>
          <p className="help" style={{ margin: 0 }}>
            Sign in with Google on your phone and your laptop, and {what} stay the same on both — changes show up on the other in a
            moment. One sign-in covers every Vectis app (Planner, Finance, Record) on this device. Your data is kept in your own private
            Firebase database, readable only when signed in as you.
          </p>
          <VButton kind="primary" accent="var(--primary)" onClick={() => void signIn()}>Sign in with Google</VButton>
        </>
      )}

      {phase === 'connecting' && (
        <div className="row" style={{ gap: 8 }}><RefreshCw size={16} className="spin" /> <span>Connecting{email ? ` as ${email}` : ''}…</span></div>
      )}

      {phase === 'choose' && choice && <SyncChoice choice={choice} choose={choose} />}

      {phase === 'live' && (
        <>
          <div className="row" style={{ gap: 8 }}>
            {status === 'offline' ? <CloudOff size={18} color="var(--text-2)" /> : <Cloud size={18} color="var(--primary)" />}
            <span className="grow">
              <div>{status === 'offline' ? 'Offline — changes will send when you reconnect' : status === 'sending' ? 'Sending changes…' : `Up to date${lastSyncedAt ? ` · ${ago(lastSyncedAt)}` : ''}`}</div>
              {email && <div className="caption2">Signed in as {email}</div>}
            </span>
          </div>
          <VButton onClick={() => void signOut()}>Stop syncing on this device</VButton>
          <p className="help" style={{ margin: 0 }}>
            Stopping signs out every Vectis app on this device, and keeps everything here as it is; it just stops sending and receiving
            changes.{notYet ? ` ${notYet}` : ''}
          </p>
        </>
      )}

      {phase === 'error' && (
        <>
          <VButton onClick={() => void signOut()}>Sign out and try again</VButton>
        </>
      )}

      {aside && (
        <div className="notice">
          <strong>Set aside when this device first synced</strong>
          <p className="help" style={{ margin: '4px 0 8px' }}>
            From this device{aside.savedAt ? ` on ${new Date(aside.savedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}, not
            here now: {aside.summary}. Adding back keeps everything you have and sends them to your other devices.
          </p>
          <div className="button-row">
            <VButton small kind="primary" accent="var(--primary)" onClick={() => { bringBack(); redraw(n => n + 1) }}>Add them back</VButton>
            <VButton small onClick={() => { dismissSetAside(); redraw(n => n + 1) }}>Not needed</VButton>
          </div>
        </div>
      )}

      {error && <div className="notice error">{error}</div>}
    </EditorBox>
  )
}
