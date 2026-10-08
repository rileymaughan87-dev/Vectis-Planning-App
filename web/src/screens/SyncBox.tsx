// "Sync between devices" in Settings: sign in with Google once per device,
// then everything stays the same on each, live. The first time a device
// joins, if both sides have data, you choose which to keep.

import { Cloud, CloudOff, RefreshCw } from 'lucide-react'
import { useSync } from '../store/sync'
import { EditorBox, VButton } from '../ui/components'

const ago = (t?: number) => {
  if (!t) return ''
  const s = Math.round((Date.now() - t) / 1000)
  return s < 10 ? 'just now' : s < 60 ? `${s} seconds ago` : `${Math.round(s / 60)} min ago`
}

export function SyncBox() {
  const { phase, email, status, lastSyncedAt, error, choice, signIn, signOut, choose } = useSync()

  if (phase === 'unavailable') return null

  return (
    <EditorBox title="Sync between devices">
      {phase === 'signedOut' && (
        <>
          <p className="help" style={{ margin: 0 }}>
            Sign in with Google on your phone and your laptop, and your goals, calendar, tasks, notes and journal stay the same on both — changes
            show up on the other in a moment. Your data is kept in your own private Firebase database, readable only when signed in as you.
          </p>
          <VButton kind="primary" accent="var(--primary)" onClick={() => void signIn()}>Sign in with Google</VButton>
        </>
      )}

      {phase === 'connecting' && (
        <div className="row" style={{ gap: 8 }}><RefreshCw size={16} className="spin" /> <span>Connecting{email ? ` as ${email}` : ''}…</span></div>
      )}

      {phase === 'choose' && choice && (
        <>
          <strong>Both have data — which do you want to keep?</strong>
          <p className="help" style={{ margin: 0 }}>
            This is a one-time choice for this device. The other copy isn't deleted: it's set aside on this device in case you need it.
          </p>
          <div className="sync-choice">
            <button type="button" onClick={() => void choose('cloud')}>
              <strong>Use the synced data</strong>
              <span className="caption">{choice.cloud}</span>
              <span className="caption2">Replaces what's on this device. Pick this on your second device.</span>
            </button>
            <button type="button" onClick={() => void choose('device')}>
              <strong>Use this device's data</strong>
              <span className="caption">{choice.device}</span>
              <span className="caption2">Replaces what's synced.</span>
            </button>
          </div>
        </>
      )}

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
          <p className="help" style={{ margin: 0 }}>Stopping keeps everything on this device as it is; it just stops sending and receiving changes. Pictures in notes don't sync yet.</p>
        </>
      )}

      {phase === 'error' && (
        <>
          <VButton onClick={() => void signOut()}>Sign out and try again</VButton>
        </>
      )}

      {error && <div className="notice error">{error}</div>}
    </EditorBox>
  )
}
