// A paper's Research: quotes, links and ideas kept while reading, each with
// where it came from (enough to cite it later) and, if you like, the
// section it's meant for. Open from any mode — beside the page on a wide
// screen, over it on a phone.

import { toISO } from '@suite/dates'
import { newID } from '@suite/ids'
import { Segmented, VButton } from '@suite/ui/components'
import { Copy, ExternalLink, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import type { Section } from '../model/outline'
import { EMPTY_SOURCE, sourceLabel, type ResearchItem, type ResearchKind, type SourceDetails } from '../model/papers'

const KIND_LABEL: Record<ResearchKind, string> = { quote: 'Quote', link: 'Link', idea: 'Idea' }
const PLACEHOLDER: Record<ResearchKind, string> = {
  quote: 'Paste or type the quote',
  link: 'What this link is for (optional)',
  idea: 'An idea, a point to make, a question to answer',
}

type Filter = 'all' | ResearchKind

export function ResearchPanel(props: {
  research: ResearchItem[]
  sections: Section[]
  onChange: (research: ResearchItem[]) => void
  onClose: () => void
  /** While writing: put a citation (or the quote and its citation) where the cursor is. */
  onCite?: (item: ResearchItem, withQuote: boolean) => void
}) {
  const [kind, setKind] = useState<ResearchKind>('quote')
  const [text, setText] = useState('')
  const [source, setSource] = useState<SourceDetails>(EMPTY_SOURCE)
  const [sectionID, setSectionID] = useState<string>('')
  const [filter, setFilter] = useState<Filter>('all')
  const [forSection, setForSection] = useState<string>('any')
  const [copied, setCopied] = useState<string | null>(null)

  const canAdd = kind === 'link' ? Boolean(source.url.trim()) : Boolean(text.trim())
  const add = () => {
    if (!canAdd) return
    const item: ResearchItem = { id: newID(), kind, text: text.trim(), source, sectionID: sectionID || undefined, createdDate: toISO(new Date()) }
    props.onChange([item, ...props.research])
    setText('')
    setSource(EMPTY_SOURCE)
  }
  const patch = (id: string, p: Partial<ResearchItem>) => props.onChange(props.research.map(r => (r.id === id ? { ...r, ...p } : r)))
  const sectionName = (sid?: string) => props.sections.find(s => s.sid === sid)?.title || undefined
  const shown = props.research.filter(r =>
    (filter === 'all' || r.kind === filter)
    && (forSection === 'any' || (forSection === 'none' ? !sectionName(r.sectionID) : r.sectionID === forSection)))

  const copy = async (r: ResearchItem) => {
    const label = sourceLabel(r.source)
    const value = r.kind === 'quote' ? `“${r.text}”${label ? ` (${label})` : ''}` : r.kind === 'link' ? r.source.url : r.text
    try {
      await navigator.clipboard.writeText(value)
      setCopied(r.id)
      setTimeout(() => setCopied(c => (c === r.id ? null : c)), 1500)
    } catch {
      // Copying isn't allowed here; the text is still on screen to select.
    }
  }

  const sectionSelect = (value: string, onChange: (v: string) => void, label: string) => (
    <select value={value} onChange={e => onChange(e.target.value)} aria-label={label}>
      <option value="">Not placed yet</option>
      {props.sections.map(s => <option key={s.sid} value={s.sid}>{s.level === 3 ? '— ' : ''}{s.title || 'Untitled section'}</option>)}
    </select>
  )

  return (
    <aside className="research-panel" aria-label="Research">
      <header className="research-head">
        <span className="research-title">Research</span>
        <button className="icon-button" onClick={props.onClose} aria-label="Close research"><X size={18} /></button>
      </header>

      <div className="research-scroll">
        <div className="research-add">
          <Segmented<ResearchKind> label="Kind" value={kind} onChange={setKind} options={(['quote', 'link', 'idea'] as const).map(k => ({ value: k, label: KIND_LABEL[k] }))} />
          {kind === 'link' && (
            <input value={source.url} onChange={e => setSource({ ...source, url: e.target.value })} placeholder="https://…" aria-label="Link" inputMode="url" />
          )}
          <textarea value={text} onChange={e => setText(e.target.value)} rows={kind === 'quote' ? 3 : 2} placeholder={PLACEHOLDER[kind]} aria-label={PLACEHOLDER[kind]} />
          {kind !== 'idea' && (
            <details className="research-source">
              <summary>Source details{sourceLabel(source) ? ` · ${sourceLabel(source)}` : ' (for citing)'}</summary>
              <div className="research-source-grid">
                <input value={source.author} onChange={e => setSource({ ...source, author: e.target.value })} placeholder="Author(s)" aria-label="Author" />
                <input value={source.year} onChange={e => setSource({ ...source, year: e.target.value })} placeholder="Year" aria-label="Year" inputMode="numeric" />
                <input value={source.title} onChange={e => setSource({ ...source, title: e.target.value })} placeholder="Title" aria-label="Source title" />
                <input value={source.page} onChange={e => setSource({ ...source, page: e.target.value })} placeholder="Page(s)" aria-label="Page" />
                <input value={source.publisher} onChange={e => setSource({ ...source, publisher: e.target.value })} placeholder="Publisher or website" aria-label="Publisher" />
                {kind === 'quote' && <input value={source.url} onChange={e => setSource({ ...source, url: e.target.value })} placeholder="Link (if online)" aria-label="Source link" inputMode="url" />}
              </div>
            </details>
          )}
          <label className="row" style={{ gap: 8 }}>
            <span className="caption" style={{ flex: 'none' }}>For</span>
            {sectionSelect(sectionID, setSectionID, 'For section')}
          </label>
          <VButton kind="primary" accent="var(--primary)" onClick={add} disabled={!canAdd}>Save {KIND_LABEL[kind].toLowerCase()}</VButton>
        </div>

        {props.research.length > 0 && (
          <div className="research-filters">
            <div className="kind-filter" role="group" aria-label="Show">
              {(['all', 'quote', 'link', 'idea'] as const).map(f => (
                <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : `${KIND_LABEL[f]}s`}</button>
              ))}
            </div>
            <select value={forSection} onChange={e => setForSection(e.target.value)} aria-label="Which section">
              <option value="any">Every section</option>
              <option value="none">Not placed yet</option>
              {props.sections.map(s => <option key={s.sid} value={s.sid}>{s.title || 'Untitled section'}</option>)}
            </select>
          </div>
        )}

        <div className="research-list">
          {props.research.length === 0 && <p className="help">Keep quotes, links and ideas here as you read. Link each to a section to use it there.</p>}
          {props.research.length > 0 && !props.onCite && <p className="help">In Write, each quote and link can be cited straight into the paper.</p>}
          {props.research.length > 0 && shown.length === 0 && <p className="help">Nothing here with these filters.</p>}
          {shown.map(r => (
            <div key={r.id} className="research-item">
              <span className="mono muted">{KIND_LABEL[r.kind]}</span>
              {r.kind === 'quote' && <p className="research-quote">“{r.text}”</p>}
              {r.kind === 'link' && (
                <a className="research-link" href={r.source.url} target="_blank" rel="noreferrer">
                  {r.source.title || r.source.url} <ExternalLink size={12} style={{ verticalAlign: -1 }} />
                </a>
              )}
              {r.kind !== 'quote' && r.text && <p className="research-text">{r.text}</p>}
              {sourceLabel(r.source) && r.kind === 'quote' && (
                <span className="caption2">{sourceLabel(r.source)}{r.source.page ? `, p. ${r.source.page}` : ''}</span>
              )}
              {props.onCite && r.kind !== 'idea' && (
                <div className="row" style={{ gap: 6 }}>
                  {r.kind === 'quote' && <VButton small accent="var(--primary)" onClick={() => props.onCite!(r, true)}>Quote + cite</VButton>}
                  <VButton small accent="var(--primary)" onClick={() => props.onCite!(r, false)}>Cite</VButton>
                </div>
              )}
              <div className="row" style={{ gap: 6 }}>
                {sectionSelect(r.sectionID && sectionName(r.sectionID) !== undefined ? r.sectionID : '', v => patch(r.id, { sectionID: v || undefined }), 'Section')}
                <button className="icon-button" onClick={() => void copy(r)} aria-label="Copy" title="Copy"><Copy size={15} /></button>
                <button className="icon-button" style={{ color: 'var(--danger)' }} onClick={() => confirm('Delete this?') && props.onChange(props.research.filter(x => x.id !== r.id))} aria-label="Delete" title="Delete"><Trash2 size={15} /></button>
              </div>
              {copied === r.id && <span className="caption2">Copied.</span>}
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}
