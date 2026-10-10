// Papers (Record): the list, and each paper on a page of its own. Write
// keeps to the words — a quiet toolbar, headings that fold, one section in
// focus at a time — and saves as you type. Format holds everything that's
// set once (font, size, spacing, margins, title details) and stays out of
// the way. Plan is the draft: the outline, what each section should say,
// word targets. Research — quotes, links, ideas — is open from any mode.

import { parseDate } from '@suite/dates'
import { RichEditor } from '@suite/record/editor/LazyRichEditor'
import { docToPlainText, isDocEmpty, textToDoc, wrapDoc, type DocNode } from '@suite/record/noteDoc'
import { EditorBox, Field, Segmented, Toggle, VButton } from '@suite/ui/components'
import { BookMarked, ChevronLeft, FileText, Plus } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  MARGINS, PAPER_FONTS, newPaper, paperWords, titleLines, wordCount, type CitationStyle, type LineSpacing, type Margins, type Paper, type PaperFont,
  type PaperFormat, type ResearchItem, type SectionPlan,
} from '../model/papers'
import { ensureSectionIds, outlineOf } from '../model/outline'
import { useData } from '../store/data'
import { PlanPanel } from './PaperPlan'
import { ResearchPanel } from './PaperResearch'

const editedText = (iso: string) => {
  const d = parseDate(iso)
  const days = Math.round((Date.now() - d.getTime()) / 86_400_000)
  if (days < 1) return 'edited today'
  if (days === 1) return 'edited yesterday'
  return `edited ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
}

export function PapersSection() {
  const papers = useData(s => s.papers)
  const [open, setOpen] = useState<Paper | null>(null)
  const sorted = [...papers].sort((a, b) => b.updatedDate.localeCompare(a.updatedDate))
  // A new paper takes its format from the one you set up most recently.
  const start = () => setOpen(newPaper(sorted[0]))

  return (
    <>
      <div className="button-row">
        <VButton small kind="primary" accent="var(--primary)" onClick={start}><Plus size={14} /> New paper</VButton>
      </div>
      {sorted.length === 0 ? (
        <div className="empty">
          <strong>No papers yet</strong>
          <span className="caption">For school papers: write on your laptop, read and edit on your phone. Set the font and spacing once in Format.</span>
        </div>
      ) : (
        <div>
          {sorted.map(p => (
            <button key={p.id} className="paper-row" onClick={() => setOpen(p)}>
              <FileText size={16} className="muted" />
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="paper-row-title ellipsis">{p.title || 'Untitled paper'}</span>
                <span className="mono muted">{paperWords(p).toLocaleString()} words · {editedText(p.updatedDate)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {open && <PaperPage paper={open} onClose={() => setOpen(null)} />}
    </>
  )
}

type Mode = 'plan' | 'write' | 'format'
const MODE_LABEL: Record<Mode, string> = { plan: 'Plan', write: 'Write', format: 'Format' }

/** CSS for the page: the chosen font, size and spacing, and the margins (narrower on a phone). */
function pageStyle(f: PaperFormat): CSSProperties {
  return {
    '--paper-font': PAPER_FONTS.find(x => x.id === f.font)?.css,
    '--paper-size': `${(f.size * 4) / 3}px`,
    '--paper-spacing': String(f.lineSpacing),
    '--paper-margin': `${MARGINS[f.margins].inches * 96}px`,
    '--paper-indent': f.indent ? '0.5in' : '0',
  } as CSSProperties
}

/**
 * One paper, filling the screen. Everything saves as you go: there's no
 * Save button to forget, and closing never loses anything.
 */
export function PaperPage({ paper: original, onClose }: { paper: Paper; onClose: () => void }) {
  const { savePaper, deletePaper } = useData()
  const [initial] = useState(() => original.body?.doc ?? textToDoc(''))
  const exists = useRef(useData.getState().papers.some(p => p.id === original.id))
  // A brand-new paper starts in Plan: sketch first, then write.
  const [mode, setMode] = useState<Mode>(() => (!exists.current && isDocEmpty(initial) ? 'plan' : 'write'))
  const [title, setTitle] = useState(original.title)
  const [format, setFormat] = useState(original.format)
  const [plan, setPlan] = useState(original.plan)
  const [target, setTarget] = useState(original.target)
  const [research, setResearch] = useState(original.research)
  const [researchOpen, setResearchOpen] = useState(false)
  const docRef = useRef<DocNode>(mode === 'plan' ? ensureSectionIds(initial) : initial)
  // Plan changes the paper's headings outside the editor; the editor starts afresh from them when you go back to Write.
  const [planDoc, setPlanDoc] = useState<DocNode>(docRef.current)
  const [docVersion, setDocVersion] = useState(0)
  const planChanged = useRef(false)
  const [words, setWords] = useState(() => wordCount(docToPlainText(initial)))
  const [status, setStatus] = useState<'saved' | 'saving'>('saved')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latest = useRef({ title, format, plan, target, research })
  latest.current = { title, format, plan, target, research }

  /** Saves now. A brand-new paper with nothing in it isn't kept. */
  const flush = () => {
    clearTimeout(timer.current)
    const { title: t, format: f, plan: pl, target: tg, research: rs } = latest.current
    const blank = !t.trim() && isDocEmpty(docRef.current) && !rs.length
    if (blank && !exists.current) return setStatus('saved')
    savePaper({ ...original, title: t.trim(), format: f, plan: pl, target: tg, research: rs, body: wrapDoc(docRef.current) })
    exists.current = true
    setStatus('saved')
  }
  const soon = () => {
    setStatus('saving')
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, 600)
  }
  // Leaving the page (or the app) saves straight away.
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flush()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [])

  const patchFormat = (p: Partial<PaperFormat>) => {
    setFormat(f => ({ ...f, ...p }))
    soon()
  }

  const go = (next: Mode) => {
    if (next === 'plan') {
      // Every heading gets its id before planning (a new one means the editor restarts with it).
      const withIDs = ensureSectionIds(docRef.current)
      if (withIDs !== docRef.current) {
        docRef.current = withIDs
        planChanged.current = true
        soon()
      }
      setPlanDoc(docRef.current)
    } else if (planChanged.current) {
      planChanged.current = false
      setDocVersion(v => v + 1)
    }
    setMode(next)
  }
  const planDocChange = (doc: DocNode) => {
    docRef.current = doc
    setPlanDoc(doc)
    planChanged.current = true
    setWords(wordCount(docToPlainText(doc)))
    soon()
  }
  const patchPlan = (sid: string, p: Partial<SectionPlan>) => {
    setPlan(all => ({ ...all, [sid]: { ...(all[sid] ?? { note: '' }), ...p } }))
    planChanged.current = true
    soon()
  }
  const changeResearch = (r: ResearchItem[]) => {
    setResearch(r)
    soon()
  }
  const notes = Object.fromEntries(Object.entries(plan).map(([sid, p]) => [sid, p.note]))
  const sections = outlineOf(mode === 'plan' ? planDoc : docRef.current)
  const close = () => {
    flush()
    onClose()
  }
  const lines = titleLines(format)

  return (
    <div className="paper-page" role="dialog" aria-label={title || 'Untitled paper'}>
      <header className="paper-bar">
        <button className="text-button paper-back" onClick={close} aria-label="Back to papers"><ChevronLeft size={18} style={{ verticalAlign: -4 }} /><span className="paper-back-label"> Papers</span></button>
        <div className="paper-modes segmented" role="group" aria-label="Mode">
          {(['plan', 'write', 'format'] as const).map(m => (
            <button key={m} aria-pressed={mode === m} onClick={() => go(m)}>{MODE_LABEL[m]}</button>
          ))}
        </div>
        <span className="paper-bar-end">
          <span className="mono muted paper-status">{status === 'saving' ? 'Saving…' : `${words.toLocaleString()} words`}</span>
          <button className={`icon-button research-toggle ${researchOpen ? 'is-on' : ''}`} onClick={() => setResearchOpen(o => !o)} aria-pressed={researchOpen} aria-label="Research" title="Research">
            <BookMarked size={18} />{research.length > 0 && <span className="research-count">{research.length}</span>}
          </button>
        </span>
      </header>

      <div className="paper-body">
      <div className="paper-scroll">
        {mode === 'plan' && (
          <PlanPanel
            doc={planDoc}
            totalWords={words}
            plan={plan}
            target={target}
            research={research}
            onDoc={planDocChange}
            onPlan={patchPlan}
            onTarget={t => { setTarget(t); soon() }}
            onOpenResearch={() => setResearchOpen(true)}
          />
        )}
        {/* Write stays mounted while Format is open, so the editor (and its undo history) carries on where it was. */}
        <article className="paper-sheet" style={pageStyle(format)} hidden={mode !== 'write'}>
          {lines.length > 0 && (
            <div className="paper-title-block">
              {lines.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}
          <input
            className="paper-title"
            value={title}
            onChange={e => { setTitle(e.target.value); soon() }}
            placeholder="Title"
            aria-label="Title"
          />
          <RichEditor
            key={docVersion}
            initial={docRef.current}
            sectionNotes={notes}
            variant="paper"
            label="Paper"
            placeholder="Start writing…"
            autofocus={docVersion === 0 && !original.title && isDocEmpty(initial)}
            onChange={doc => {
              docRef.current = doc
              setWords(wordCount(docToPlainText(doc)))
              soon()
            }}
          />
        </article>
        {mode === 'format' && (
          <FormatPanel
            format={format}
            onChange={patchFormat}
            onDelete={() => {
              if (!confirm('Delete this paper?')) return
              clearTimeout(timer.current)
              exists.current = false
              deletePaper(original.id)
              latest.current = { title: '', format, plan: {}, target: undefined, research: [] }
              docRef.current = textToDoc('')
              onClose()
            }}
            canDelete={exists.current}
          />
        )}
      </div>
      {researchOpen && <ResearchPanel research={research} sections={sections} onChange={changeResearch} onClose={() => setResearchOpen(false)} />}
      </div>
    </div>
  )
}

/** Everything set once: font, size, spacing, page, title details, citation style. */
function FormatPanel({ format: f, onChange, onDelete, canDelete }: { format: PaperFormat; onChange: (p: Partial<PaperFormat>) => void; onDelete: () => void; canDelete: boolean }) {
  return (
    <div className="paper-format">
      <EditorBox title="Text">
        <Field label="Font">
          <select value={f.font} onChange={e => onChange({ font: e.target.value as PaperFont })} style={{ fontFamily: PAPER_FONTS.find(x => x.id === f.font)?.css }}>
            {PAPER_FONTS.map(x => <option key={x.id} value={x.id} style={{ fontFamily: x.css }}>{x.label}</option>)}
          </select>
        </Field>
        <Field label="Size">
          <select value={f.size} onChange={e => onChange({ size: Number(e.target.value) })}>
            {[10, 11, 12, 13, 14, 16].map(n => <option key={n} value={n}>{n} pt</option>)}
          </select>
        </Field>
        <span className="field-label">Line spacing</span>
        <Segmented<string>
          label="Line spacing"
          value={String(f.lineSpacing)}
          onChange={v => onChange({ lineSpacing: Number(v) as LineSpacing })}
          options={[{ value: '1', label: 'Single' }, { value: '1.15', label: '1.15' }, { value: '1.5', label: '1.5' }, { value: '2', label: 'Double' }]}
        />
        <Toggle label="Indent the first line of each paragraph" checked={f.indent} onChange={indent => onChange({ indent })} />
        <p className="help" style={{ fontFamily: PAPER_FONTS.find(x => x.id === f.font)?.css, fontSize: `${(f.size * 4) / 3}px`, lineHeight: f.lineSpacing, color: 'var(--text)' }}>
          The quick brown fox jumps over the lazy dog.
        </p>
      </EditorBox>

      <EditorBox title="Page">
        <span className="field-label">Margins</span>
        <Segmented<Margins>
          label="Margins"
          value={f.margins}
          onChange={margins => onChange({ margins })}
          options={(Object.keys(MARGINS) as Margins[]).map(m => ({ value: m, label: `${MARGINS[m].label} (${MARGINS[m].inches}″)` }))}
        />
        <Toggle label="Page numbers (when printed or exported)" checked={f.pageNumbers} onChange={pageNumbers => onChange({ pageNumbers })} />
      </EditorBox>

      <EditorBox title="Title details">
        <p className="help">Shown above the title when filled in, in this order. New papers start with the same details.</p>
        <Field label="Your name"><input value={f.name} onChange={e => onChange({ name: e.target.value })} /></Field>
        <Field label="Teacher"><input value={f.teacher} onChange={e => onChange({ teacher: e.target.value })} /></Field>
        <Field label="Course"><input value={f.course} onChange={e => onChange({ course: e.target.value })} /></Field>
        <Field label="Date"><input value={f.date} onChange={e => onChange({ date: e.target.value })} placeholder={new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })} /></Field>
      </EditorBox>

      <EditorBox title="Citations">
        <select value={f.citationStyle} onChange={e => onChange({ citationStyle: e.target.value as CitationStyle })} aria-label="Citation style">
          <option value="apa">APA (7th edition)</option>
          <option value="mla">MLA (9th edition)</option>
          <option value="harvard">Harvard</option>
        </select>
        <p className="help">Used for sources and the reference list, coming with Research.</p>
      </EditorBox>

      {canDelete && <VButton kind="destructive" onClick={onDelete}>Delete paper</VButton>}
    </div>
  )
}
