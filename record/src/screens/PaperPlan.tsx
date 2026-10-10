// A paper's Plan (draft mode): the outline of headings and subheadings,
// each with a note on what it needs to say, a word target and the research
// meant for it. Everything here is the paper's own headings — add, rename
// or move a section here and it's done in the writing too.

import type { DocNode } from '@suite/record/noteDoc'
import { VButton } from '@suite/ui/components'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { addSection, isEmptySection, moveSection, outlineOf, removeSection, renameSection, type Section } from '../model/outline'
import { sourceLabel, type ResearchItem, type SectionPlan } from '../model/papers'

const STARTER = ['Introduction', 'Main point', 'Main point', 'Conclusion']

export function PlanPanel(props: {
  doc: DocNode
  totalWords: number
  plan: Record<string, SectionPlan>
  target?: number
  research: ResearchItem[]
  onDoc: (doc: DocNode) => void
  onPlan: (sid: string, patch: Partial<SectionPlan>) => void
  onTarget: (target: number | undefined) => void
  onOpenResearch: () => void
}) {
  const sections = outlineOf(props.doc)
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const [adding, setAdding] = useState('')
  const toggle = (sid: string) => setOpen(s => {
    const next = new Set(s)
    if (next.has(sid)) next.delete(sid)
    else next.add(sid)
    return next
  })
  const add = (title: string, parent?: string) => {
    if (!title.trim()) return
    props.onDoc(addSection(props.doc, title, parent))
  }
  const unplaced = props.research.filter(r => !r.sectionID || !sections.some(s => s.sid === r.sectionID))

  return (
    <div className="paper-plan">
      <div className="plan-target">
        <label className="row" style={{ gap: 10 }}>
          <span className="grow">Word target for the paper</span>
          <input
            inputMode="numeric" value={props.target ?? ''} placeholder="None" aria-label="Word target" style={{ width: 96, textAlign: 'right' }}
            onChange={e => {
              const n = Number(e.target.value.replace(/\D/g, ''))
              props.onTarget(n > 0 ? n : undefined)
            }}
          />
        </label>
        <Progress words={props.totalWords} target={props.target} />
      </div>

      {sections.length === 0 ? (
        <div className="plan-empty">
          <p className="help" style={{ margin: 0 }}>
            Sketch the paper first: the sections it needs, a line on what each should say, and how long. Then write one section at a time.
          </p>
          <VButton accent="var(--primary)" onClick={() => props.onDoc(STARTER.reduce((d, t) => addSection(d, t), props.doc))}>
            Start with Introduction, two main points and Conclusion
          </VButton>
        </div>
      ) : (
        <ol className="plan-outline">
          {sections.map(s => (
            <PlanItem
              key={s.sid || s.index}
              section={s}
              doc={props.doc}
              plan={props.plan[s.sid]}
              research={props.research.filter(r => r.sectionID === s.sid)}
              open={open.has(s.sid)}
              onToggle={() => toggle(s.sid)}
              onDoc={props.onDoc}
              onPlan={patch => props.onPlan(s.sid, patch)}
              onAddSub={title => add(title, s.sid)}
            />
          ))}
        </ol>
      )}

      <form className="plan-add" onSubmit={e => { e.preventDefault(); add(adding); setAdding('') }}>
        <Plus size={16} className="muted" />
        <input value={adding} onChange={e => setAdding(e.target.value)} placeholder="Add a section" aria-label="New section" />
      </form>

      <button className="link-row" onClick={props.onOpenResearch}>
        <span className="grow">
          Research{props.research.length ? ` · ${props.research.length} saved` : ''}{unplaced.length ? ` · ${unplaced.length} not placed yet` : ''}
        </span>
        <span aria-hidden="true">→</span>
      </button>
    </div>
  )
}

function Progress({ words, target }: { words: number; target?: number }) {
  if (!target) return <span className="mono muted">{words.toLocaleString()} words</span>
  return (
    <span className="plan-progress">
      <span className="mono muted">{words.toLocaleString()} of {target.toLocaleString()} words</span>
      <span className="progress"><span style={{ display: 'block', height: '100%', width: `${Math.min(words / target, 1) * 100}%`, background: 'var(--primary)' }} /></span>
    </span>
  )
}

function PlanItem(props: {
  section: Section
  doc: DocNode
  plan?: SectionPlan
  research: ResearchItem[]
  open: boolean
  onToggle: () => void
  onDoc: (doc: DocNode) => void
  onPlan: (patch: Partial<SectionPlan>) => void
  onAddSub: (title: string) => void
}) {
  const { section: s } = props
  const [sub, setSub] = useState('')
  const note = props.plan?.note ?? ''
  const empty = isEmptySection(props.doc, s.sid)

  return (
    <li className={`plan-item level-${s.level}`}>
      <div className="plan-head">
        <button className="icon-button plan-chevron" onClick={props.onToggle} aria-label={props.open ? 'Fold away' : 'Open'} aria-expanded={props.open}>
          {props.open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <input
          className="plan-title" value={s.title} placeholder="Untitled section" aria-label="Section title"
          onChange={e => props.onDoc(renameSection(props.doc, s.sid, e.target.value))}
        />
        <span className="mono muted plan-words">
          {s.words}{props.plan?.target ? ` / ${props.plan.target}` : ''}
        </span>
      </div>
      {!props.open && note && <p className="plan-note-preview">{note}</p>}

      {props.open && (
        <div className="plan-body">
          <textarea
            value={note} rows={2} placeholder="What this section needs to say" aria-label="What this section needs to say"
            onChange={e => props.onPlan({ note: e.target.value })}
          />
          <label className="row" style={{ gap: 10 }}>
            <span className="grow caption">Word target</span>
            <input
              inputMode="numeric" value={props.plan?.target ?? ''} placeholder="None" aria-label="Section word target" style={{ width: 90, textAlign: 'right' }}
              onChange={e => {
                const n = Number(e.target.value.replace(/\D/g, ''))
                props.onPlan({ target: n > 0 ? n : undefined })
              }}
            />
          </label>
          {props.research.length > 0 && (
            <div className="plan-research">
              <span className="mono muted">Research for this section</span>
              {props.research.map(r => (
                <div key={r.id} className="plan-research-item">
                  <span className={r.kind === 'quote' ? 'research-quote' : ''}>{r.kind === 'quote' ? `“${r.text}”` : r.text || r.source.url}</span>
                  {sourceLabel(r.source) && <span className="mono muted"> — {sourceLabel(r.source)}</span>}
                </div>
              ))}
            </div>
          )}
          {s.level < 3 && (
            <form className="plan-add sub" onSubmit={e => { e.preventDefault(); props.onAddSub(sub); setSub('') }}>
              <Plus size={14} className="muted" />
              <input value={sub} onChange={e => setSub(e.target.value)} placeholder="Add a subheading" aria-label="New subheading" />
            </form>
          )}
          <div className="row" style={{ gap: 4 }}>
            <button className="icon-button" onClick={() => props.onDoc(moveSection(props.doc, s.sid, -1))} aria-label="Move up" title="Move up"><ArrowUp size={16} /></button>
            <button className="icon-button" onClick={() => props.onDoc(moveSection(props.doc, s.sid, 1))} aria-label="Move down" title="Move down"><ArrowDown size={16} /></button>
            <span className="grow" />
            {empty
              ? <button className="icon-button" style={{ color: 'var(--danger)' }} onClick={() => props.onDoc(removeSection(props.doc, s.sid))} aria-label="Remove section" title="Remove section"><Trash2 size={16} /></button>
              : <span className="caption2">Has writing — remove it in Write</span>}
          </div>
        </div>
      )}
    </li>
  )
}
