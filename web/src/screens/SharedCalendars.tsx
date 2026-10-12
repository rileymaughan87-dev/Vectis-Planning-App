// Shared calendars in Settings: the ones you're in (tick to show them on
// your calendar), inviting people with a link, leaving, and making a new
// one. Joining from a link is the JoinSharedSheet, opened from App.

import { useEffect, useState, type CSSProperties } from 'react'
import { isShown, useShared } from '../store/shared'
import { useSync } from '../store/sync'
import { EditorBox, Field, Sheet, Toggle, VButton } from '../ui/components'

const COLOURS = ['#5B8DEF', '#E0703C', '#3BA272', '#C2509B', '#8E6CD1', '#D4A72C']

/** The link that invites someone into a calendar: Planner's address with #join=calendar~code. */
const inviteLink = (id: string, code: string) => `${location.origin}${location.pathname}#join=${id}~${code}`

export function SharedCalendarsBox() {
  const phase = useSync(s => s.phase)
  const { live, api, calendars, mine, error, setShown } = useShared()
  const [making, setMaking] = useState(false)
  const [inviting, setInviting] = useState<{ name: string; link?: string; error?: string } | null>(null)

  if (phase === 'unavailable') return null

  const invite = async (id: string, name: string, colorHex: string) => {
    if (!api) return
    setInviting({ name })
    try {
      const code = await api.invite(id, name, colorHex)
      setInviting({ name, link: inviteLink(id, code) })
    } catch (e) {
      setInviting({ name, error: e instanceof Error ? e.message : String(e) })
    }
  }

  return (
    <EditorBox title="Shared calendars">
      {phase !== 'live' ? (
        <p className="help" style={{ margin: 0 }}>
          A calendar you share with family or a partner: everyone in it sees its events and can add or change them, and each of you
          chooses whether it shows. It uses the same Google sign-in as sync — turn on Sync between devices above first.
        </p>
      ) : (
        <>
          {calendars.length === 0 && live && (
            <p className="help" style={{ margin: 0 }}>
              None yet. Make one and invite people with a link, or open a link someone sent you. Everyone in a shared calendar sees its
              events and can add or change them; each of you chooses whether it shows on your calendar.
            </p>
          )}
          {calendars.map(c => {
            const others = c.members.filter(m => m !== api?.uid).map(m => c.names[m] ?? 'Someone')
            return (
              <div key={c.id} className="shared-calendar">
                <Toggle
                  label={<span className="row" style={{ gap: 8 }}><span className="swatch" style={{ background: c.colorHex }} />{c.name}</span>}
                  checked={isShown(mine, c.id)}
                  onChange={on => setShown(c.id, on)}
                />
                <span className="caption2">{others.length ? `With ${others.join(', ')}` : 'Just you so far'} · {isShown(mine, c.id) ? 'shown on your calendar' : 'hidden from your calendar'}</span>
                <div className="button-row">
                  <VButton small onClick={() => void invite(c.id, c.name, c.colorHex)}>Invite someone</VButton>
                  <VButton small kind="destructive" onClick={() => {
                    if (confirm(`Leave ${c.name}? Its events leave your calendar; everyone else keeps them.`)) void api?.leave(c.id)
                  }}>Leave</VButton>
                </div>
              </div>
            )
          })}
          <VButton onClick={() => setMaking(true)} disabled={!api}>New shared calendar</VButton>
          <p className="help" style={{ margin: 0 }}>To add an event to a shared calendar, choose it as the event's category.</p>
        </>
      )}
      {error && <div className="notice error">{error}</div>}

      {making && <NewSharedSheet onClose={() => setMaking(false)} />}
      {inviting && (
        <Sheet title={`Invite to ${inviting.name}`} compact onClose={() => setInviting(null)}>
          {inviting.error ? <div className="notice error">{inviting.error}</div> : !inviting.link ? <p>Making a link…</p> : (
            <>
              <p style={{ margin: 0 }}>Send this link. Whoever opens it in Planner (signed in with Google) can join {inviting.name}.</p>
              <input readOnly value={inviting.link} onFocus={e => e.target.select()} aria-label="Invite link" />
              <VButton kind="primary" accent="var(--primary)" onClick={() => {
                const link = inviting.link!
                if (navigator.share) void navigator.share({ title: `Join ${inviting.name}`, url: link }).catch(() => {})
                else void navigator.clipboard?.writeText(link)
              }}>
                {typeof navigator.share === 'function' ? 'Share link' : 'Copy link'}
              </VButton>
              <p className="help">Anyone with the link can join, so send it only to the people you mean.</p>
            </>
          )}
        </Sheet>
      )}
    </EditorBox>
  )
}

function NewSharedSheet({ onClose }: { onClose: () => void }) {
  const api = useShared(s => s.api)
  const [name, setName] = useState('')
  const [colorHex, setColorHex] = useState(COLOURS[0])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const make = async () => {
    if (!api || !name.trim()) return
    setBusy(true)
    try {
      await api.create(name.trim(), colorHex)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }
  return (
    <Sheet title="New shared calendar" compact onClose={onClose} right={{ label: busy ? 'Making…' : 'Make', disabled: busy || !name.trim(), onClick: () => void make() }}>
      <Field label="Name"><input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Family, Us" /></Field>
      <span className="field-label">Colour</span>
      <div className="chips">
        {COLOURS.map(c => (
          <button key={c} className="chip" aria-pressed={colorHex === c} aria-label={c} style={{ '--chip-color': c } as CSSProperties} onClick={() => setColorHex(c)}>
            <span className="swatch" style={{ background: c }} />
          </button>
        ))}
      </div>
      {error && <div className="notice error">{error}</div>}
    </Sheet>
  )
}

/** Opening an invite link: sign in if needed, then join (or not). */
export function JoinSharedSheet({ invite, onClose }: { invite: { id: string; code: string }; onClose: () => void }) {
  const phase = useSync(s => s.phase)
  const signIn = useSync(s => s.signIn)
  const api = useShared(s => s.api)
  const already = useShared(s => s.calendars.some(c => c.id === invite.id))
  const [info, setInfo] = useState<{ name: string; colorHex: string; by: string } | null | 'missing'>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!api) return
    let live = true
    api.inviteInfo(invite.id, invite.code)
      .then(i => live && setInfo(i ?? 'missing'))
      .catch(e => live && setError(e instanceof Error ? e.message : String(e)))
    return () => { live = false }
  }, [api, invite.id, invite.code])

  const join = async () => {
    if (!api) return
    setBusy(true)
    try {
      await api.join(invite.id, invite.code)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <Sheet title="Shared calendar" compact onClose={onClose}>
      {phase !== 'live' ? (
        <>
          <p style={{ margin: 0 }}>Someone invited you to a shared calendar. Sign in with Google first (this also turns on sync for Planner), then you can join.</p>
          {phase === 'connecting' ? <p className="help">Connecting…</p> : phase === 'choose' ? (
            <p className="help">Finish the one-time sync choice in Settings, then open the link again.</p>
          ) : (
            <VButton kind="primary" accent="var(--primary)" onClick={() => void signIn()}>Sign in with Google</VButton>
          )}
        </>
      ) : already ? (
        <p style={{ margin: 0 }}>You're already in this calendar.</p>
      ) : info === 'missing' ? (
        <p style={{ margin: 0 }}>This invitation doesn't work any more. Ask for a new link.</p>
      ) : !info ? (
        <p style={{ margin: 0 }}>Loading…</p>
      ) : (
        <>
          <p style={{ margin: 0 }}>
            <span className="swatch" style={{ background: info.colorHex, display: 'inline-block', marginRight: 6 }} />
            <strong>{info.by}</strong> invited you to <strong>{info.name}</strong>. Everyone in it sees its events and can add or change them;
            you can hide it from your calendar any time.
          </p>
          <VButton kind="primary" accent="var(--primary)" disabled={busy} onClick={() => void join()}>{busy ? 'Joining…' : `Join ${info.name}`}</VButton>
          <VButton onClick={onClose}>Not now</VButton>
        </>
      )}
      {error && <div className="notice error">{error}</div>}
    </Sheet>
  )
}
