// Sidebar → Accountability. Share your goals and calendar through a file
// in your Google Drive, and follow partners who share theirs with you.

import { ChevronRight, Copy, FileUp, RefreshCw, Share2, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { parseDate } from '../model/dates'
import { relativeTime } from '../model/format'
import { useData } from '../store/data'
import { useShare } from '../store/share'
import { downloadJSON } from '../sync/backup'
import { driveLink, fileIDFromLink, googleConfig, isConfiguredFromBuild, saveGoogleConfig, signOut } from '../sync/google'
import { buildSnapshot } from '../sync/shareFile'
import { EditorBox, Field, Sheet, Toggle, VButton } from '../ui/components'

/** The link a partner taps: opens their own Vectis and offers to add you. */
export function partnerLink(fileID: string) {
  return `${location.origin}${location.pathname}#partner=${fileID}`
}

export function AccountabilityScreen({ onClose, onOpenPartner }: { onClose: () => void; onOpenPartner: (id: string) => void }) {
  const share = useShare()
  const [pasted, setPasted] = useState('')
  const [adding, setAdding] = useState(false)
  const [partnerError, setPartnerError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [config, setConfig] = useState(googleConfig)
  const [configSaved, setConfigSaved] = useState(false)

  const link = share.fileID ? partnerLink(share.fileID) : null

  const copyLink = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      prompt('Copy this link:', link)
    }
  }

  const shareLink = async () => {
    if (!link) return
    const name = share.ownerName.trim() || 'me'
    try {
      await navigator.share({ title: 'Vectis', text: `Follow ${name}'s goals on Vectis`, url: link })
    } catch {
      // Cancelled, or sharing isn't supported; the copy button still works.
    }
  }

  const addFromLink = async () => {
    const id = fileIDFromLink(pasted)
    if (!id) {
      setPartnerError("That doesn't look like a Vectis or Google Drive link.")
      return
    }
    setAdding(true)
    setPartnerError(null)
    try {
      const partner = await share.addPartner(id)
      setPasted('')
      onOpenPartner(partner.id)
    } catch (error) {
      setPartnerError(error instanceof Error ? error.message : String(error))
    } finally {
      setAdding(false)
    }
  }

  const status = share.status === 'publishing' ? 'Publishing…'
    : share.hasUnpublishedChanges ? 'You have changes your partners can\'t see yet.'
    : share.lastPublishedAt ? `Up to date · published ${relativeTime(parseDate(share.lastPublishedAt))}`
    : null

  return (
    <Sheet title="Accountability" onClose={onClose} leftLabel="Done">
      <EditorBox title="Share my progress">
        <p className="help">
          Partners see your goals, how consistently you've done them, and your calendar — read-only. Your journal, notes and people
          stay on this device.
        </p>
        <Field label="Your name, as partners see it">
          <input value={share.ownerName} onChange={e => share.setOwnerName(e.target.value)} placeholder="e.g. Riley" />
        </Field>

        {!share.fileID ? (
          <VButton kind="primary" accent="var(--primary)" onClick={() => void share.publishNow()} disabled={share.status === 'publishing'}>
            {share.status === 'publishing' ? 'Connecting…' : 'Share through Google Drive'}
          </VButton>
        ) : (
          <>
            {status && <div className={`notice ${share.hasUnpublishedChanges ? '' : 'ok'}`}>{status}</div>}
            <VButton onClick={() => void share.publishNow()} disabled={share.status === 'publishing'}>
              <RefreshCw size={15} /> Publish now
            </VButton>
            <Toggle label="Publish changes automatically" checked={share.autoPublish} onChange={share.setAutoPublish} />
            <p className="help">Works while you're signed in to Google (about an hour at a time). Otherwise, tap Publish now.</p>

            <Field label="Send this link to your partner">
              <div className="code" style={{ background: 'var(--surface-2)', padding: '8px 10px', borderRadius: 4 }}>{link}</div>
            </Field>
            <div className="button-row">
              <VButton onClick={copyLink}><Copy size={15} /> {copied ? 'Copied' : 'Copy link'}</VButton>
              {'share' in navigator && <VButton onClick={shareLink}><Share2 size={15} /> Share…</VButton>}
            </div>
            <p className="help">
              It opens their Vectis and adds you as a partner. The file itself is <a href={driveLink(share.fileID)} target="_blank" rel="noreferrer">in your Google Drive</a>;
              deleting it there stops sharing.
            </p>
            <button className="text-button" style={{ color: 'var(--danger)', textAlign: 'left' }} onClick={() => {
              if (confirm('Stop sharing from this device? Your partners keep the last version they saw until you delete the file in Google Drive.')) {
                share.stopSharing()
                signOut()
              }
            }}>Stop sharing</button>
          </>
        )}

        {share.status === 'error' && share.error && <div className="notice error">{share.error}</div>}

        <button className="text-button" style={{ textAlign: 'left' }} onClick={() => {
          const snapshot = buildSnapshot(useData.getState(), share.ownerName)
          downloadJSON(JSON.stringify(snapshot), `vectis-share-${(share.ownerName || 'me').toLowerCase().replace(/\s+/g, '-')}.json`)
        }}>
          Or save a share file to send yourself
        </button>
      </EditorBox>

      <EditorBox title="Partners">
        {share.partners.length === 0 && <p className="help">No partners yet. Paste a link someone sent you, or open a share file.</p>}
        {share.partners.map(p => (
          <div key={p.id} className="row">
            <button className="row grow" style={{ textAlign: 'left' }} onClick={() => onOpenPartner(p.id)}>
              <span className="grow">
                <div style={{ fontWeight: 500 }}>{p.name}</div>
                <div className="caption2">
                  {p.snapshot ? `Published ${relativeTime(parseDate(p.snapshot.publishedAt))}` : 'Not loaded yet'}
                  {p.id.startsWith('file:') ? ' · from a file' : ''}
                </div>
              </span>
              <ChevronRight size={16} className="muted" />
            </button>
            <button className="icon-button" aria-label={`Remove ${p.name}`} style={{ color: 'var(--danger)' }} onClick={() => confirm(`Stop following ${p.name}?`) && share.removePartner(p.id)}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <div className="row">
          <input value={pasted} onChange={e => setPasted(e.target.value)} onKeyDown={e => e.key === 'Enter' && void addFromLink()} placeholder="Paste a partner's link" aria-label="Partner link" />
          <VButton small onClick={() => void addFromLink()} disabled={!pasted.trim() || adding}>{adding ? 'Adding…' : 'Add'}</VButton>
        </div>
        <VButton onClick={() => fileRef.current?.click()}><FileUp size={15} /> Open a share file…</VButton>
        <input
          ref={fileRef} type="file" accept=".json,application/json" className="visually-hidden"
          onChange={async e => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            try {
              const partner = share.addPartnerFromFile(JSON.parse(await file.text()))
              onOpenPartner(partner.id)
            } catch (error) {
              setPartnerError(error instanceof Error ? error.message : "That file couldn't be read.")
            }
          }}
        />
        {partnerError && <div className="notice error">{partnerError}</div>}
      </EditorBox>

      <details className="editor-box">
        <summary style={{ cursor: 'pointer', fontWeight: 500 }}>Google setup</summary>
        {isConfiguredFromBuild ? (
          <p className="help" style={{ marginTop: 10 }}>Google access is built into this version of the app. Nothing to set up.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
            <p className="help">One-time setup, free. Full steps are in docs/GOOGLE-SETUP.md in the project.</p>
            <Field label="OAuth client ID">
              <input value={config.clientId} onChange={e => { setConfig({ ...config, clientId: e.target.value.trim() }); setConfigSaved(false) }} placeholder="….apps.googleusercontent.com" />
            </Field>
            <Field label="API key">
              <input value={config.apiKey} onChange={e => { setConfig({ ...config, apiKey: e.target.value.trim() }); setConfigSaved(false) }} placeholder="AIza…" />
            </Field>
            <VButton onClick={() => { saveGoogleConfig(config); setConfigSaved(true) }}>{configSaved ? 'Saved' : 'Save'}</VButton>
          </div>
        )}
      </details>
    </Sheet>
  )
}
