// Papers (Record): the list, and each paper on a page of its own. Write
// keeps to the words — a quiet toolbar, headings that fold, one section in
// focus at a time — and saves as you type. Format holds everything that's
// set once (font, size, spacing, margins, title details) and stays out of
// the way. Plan is the draft: the outline, what each section should say,
// word targets. Research — quotes, links, ideas — is open from any mode,
// and cites into the paper; the reference list builds itself. Export
// gives a Word document, or prints (and so a PDF).

import { parseDate } from '@suite/dates'
import { RichEditor } from '@suite/record/editor/LazyRichEditor'
import { isDocEmpty, textToDoc, wrapDoc, type DocNode } from '@suite/record/noteDoc'
import { EditorBox, Field, Segmented, Sheet, Toggle, VButton } from '@suite/ui/components'
import { setCitationText, type CitationAttrs } from '@suite/record/editor/citationText'
import { BookMarked, ChevronLeft, Download, Eye, FileText, Plus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Editor } from '@tiptap/react'
import {
  MARGINS, PAPER_FONTS, bodyWords, newPaper, paperWords, type CitationStyle, type LineSpacing, type Margins, type Paper, type PaperFont,
  type PaperFormat, type ResearchItem, type SectionPlan,
} from '../model/papers'
import { REFERENCES_HEADING, citedIDs, inText, referenceList } from '../model/citations'
import { hasTitlePage } from '../model/layout'
import { ensureSectionIds, outlineOf } from '../model/outline'
import { useData } from '../store/data'
import { PlanPanel } from './PaperPlan'
import { PaperPreview } from './PaperPreview'
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

type Mode = 'plan' | 'write' | 'format' | 'preview'
const MODE_LABEL: Record<Exclude<Mode, 'preview'>, string> = { plan: 'Plan', write: 'Write', format: 'Format' }

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
  const [words, setWords] = useState(() => bodyWords(initial, original.format.includeHeadings))
  const [status, setStatus] = useState<'saved' | 'saving'>('saved')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latest = useRef({ title, format, plan, target, research })
  latest.current = { title, format, plan, target, research }
  const editorRef = useRef<Editor | null>(null)
  const onEditor = useCallback((e: Editor | null) => { editorRef.current = e }, [])
  // Which sources are cited, so the reference list redraws when one's added or removed.
  const [cited, setCited] = useState(() => citedIDs(initial).join())
  const [exporting, setExporting] = useState(false)

  // How citations read: the paper's style and its research.
  const citation = useCallback((a: CitationAttrs) => {
    const r = research.find(x => x.id === a.sourceId)
    return r ? inText(format.citationStyle, r.source, a.page || r.source.page) : '(source removed)'
  }, [research, format.citationStyle])
  useEffect(() => setCitationText(citation), [citation])

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
    if (p.includeHeadings !== undefined) setWords(bodyWords(docRef.current, p.includeHeadings))
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
    setWords(bodyWords(doc, latest.current.format.includeHeadings))
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
  const targets = Object.fromEntries(Object.entries(plan).flatMap(([sid, p]) => (p.target ? [[sid, p.target]] : [])))
  const style = format.citationStyle
  const today = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
  // The title-page details, filled in where they'll appear; new papers start with the same ones.
  const field = (key: 'name' | 'institution' | 'course' | 'teacher' | 'date', placeholder: string) => (
    <input className="paper-line" value={format[key]} onChange={e => patchFormat({ [key]: e.target.value })} placeholder={placeholder} aria-label={placeholder} />
  )
  const titleInput = (
    <input className="paper-title" value={title} onChange={e => { setTitle(e.target.value); soon() }} placeholder="Title" aria-label="Title" />
  )

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
          <button className={`icon-button research-toggle ${mode === 'preview' ? 'is-on' : ''}`} onClick={() => go(mode === 'preview' ? 'write' : 'preview')} aria-pressed={mode === 'preview'} aria-label="Preview the finished paper" title="Preview the finished paper"><Eye size={18} /></button>
          <button className="icon-button research-toggle" onClick={() => setExporting(true)} aria-label="Export" title="Export"><Download size={18} /></button>
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
        {/* Write stays mounted while Format is open, so the editor (and its undo history) carries on where it was.
            Its pages are the finished paper's: a title page (APA, Harvard), the writing, the references. */}
        <div className={`paper-pages${format.showWordCounts ? '' : ' no-counts'}`} style={pageStyle(format)} hidden={mode !== 'write'}>
          {hasTitlePage(style) && (
            <section className="paper-sheet paper-title-page" aria-label="Title page">
              {titleInput}
              <div className="paper-title-lines">
                {field('name', 'Your name')}
                {field('institution', 'School or university')}
                {field('course', 'Course')}
                {field('teacher', 'Instructor')}
                {field('date', today)}
              </div>
            </section>
          )}
          <article className="paper-sheet">
            {format.showWordCounts && (
              <div className="paper-count mono">
                {words.toLocaleString()} words{target ? ` of ${target.toLocaleString()}` : ''}
              </div>
            )}
            {style === 'mla' && (
              <div className="paper-header-lines">
                {field('name', 'Your name')}
                {field('teacher', 'Instructor')}
                {field('course', 'Course')}
                {field('date', today)}
              </div>
            )}
            {style !== 'harvard' && titleInput}
            <RichEditor
              key={docVersion}
              initial={docRef.current}
              sectionNotes={notes}
              sectionTargets={targets}
              variant="paper"
              label="Paper"
              placeholder="Start writing…"
              autofocus={docVersion === 0 && !original.title && isDocEmpty(initial)}
              onEditor={onEditor}
              onChange={doc => {
                docRef.current = doc
                setWords(bodyWords(doc, latest.current.format.includeHeadings))
                setCited(citedIDs(doc).join())
                soon()
              }}
            />
          </article>
          <References paper={{ ...original, format, research }} doc={docRef.current} cited={cited} />
        </div>
        {mode === 'preview' && (
          <PaperPreview paper={{ ...original, title, format, plan, target, research }} doc={docRef.current} style={pageStyle(format)} />
        )}
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
      {researchOpen && (
        <ResearchPanel
          research={research}
          sections={sections}
          onChange={changeResearch}
          onClose={() => setResearchOpen(false)}
          onCite={mode === 'write' ? (item, withQuote) => {
            const editor = editorRef.current
            if (!editor) return
            const cite = { type: 'citation', attrs: { sourceId: item.id, page: '' } }
            // A space first, unless the cursor's already after one (or at the start of a line).
            const { from, $from } = editor.state.selection
            const before = $from.parentOffset > 0 ? editor.state.doc.textBetween(from - 1, from, '', ' ') : ' '
            const gap = /\s/.test(before) ? '' : ' '
            editor.chain().focus().insertContent(withQuote
              ? [{ type: 'text', text: `${gap}“${item.text}” ` }, cite, { type: 'text', text: ' ' }]
              : [...(gap ? [{ type: 'text', text: gap }] : []), cite]).run()
            // On a phone Research covers the page: step back to see it.
            if (!matchMedia('(min-width: 1000px)').matches) setResearchOpen(false)
          } : undefined}
        />
      )}
      {exporting && (
        <ExportSheet
          onClose={() => setExporting(false)}
          onWord={async () => {
            flush()
            const { paperToDocx } = await import('../export/paperDocx')
            const paper = { ...original, title: title.trim(), format, plan, target, research }
            download(await paperToDocx(paper, docRef.current, citation), `${fileName(title)}.docx`)
          }}
          onPrint={() => {
            flush()
            setExporting(false)
            setResearchOpen(false)
            setMode('preview')
            // Once the preview is showing: the page's own margins and numbering, then the browser's print (and Save as PDF).
            setTimeout(() => printPaper(format), 50)
          }}
        />
      )}
      </div>
    </div>
  )
}

/** The reference list under the paper: every cited source, in the paper's style. */
function References({ paper, doc, cited }: { paper: Paper; doc: DocNode; cited: string }) {
  const entries = cited ? referenceList(paper.format.citationStyle, doc, paper.research) : []
  if (!entries.length) return null
  const style = paper.format.citationStyle
  return (
    <section className={`paper-sheet paper-references style-${style}`} aria-label={REFERENCES_HEADING[style]}>
      <h2>{REFERENCES_HEADING[style]}</h2>
      {entries.map((e, i) => (
        <p key={i}>{e.map((s, j) => (s.italic ? <i key={j}>{s.text}</i> : <span key={j}>{s.text}</span>))}</p>
      ))}
    </section>
  )
}

const fileName = (title: string) => (title.trim() || 'Paper').replace(/[\\/:*?"<>|]+/g, '').slice(0, 80)

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Prints the paper alone, with its margins and page numbers; "Save as PDF" in the print dialog makes a PDF. */
function printPaper(f: PaperFormat) {
  const style = document.createElement('style')
  const surname = f.citationStyle === 'mla' ? (f.name.trim().split(/\s+/).at(-1) ?? '') : ''
  style.textContent = `@page { size: letter; margin: ${MARGINS[f.margins].inches}in;${
    f.pageNumbers ? ` @top-right { content: "${surname ? `${surname.replace(/"/g, '')} ` : ''}" counter(page); font-family: ${PAPER_FONTS.find(x => x.id === f.font)?.css}; font-size: ${f.size}pt; }` : ''
  } }`
  document.head.append(style)
  document.body.classList.add('printing-paper')
  const done = () => {
    style.remove()
    document.body.classList.remove('printing-paper')
    window.removeEventListener('afterprint', done)
  }
  window.addEventListener('afterprint', done)
  window.print()
}

function ExportSheet({ onClose, onWord, onPrint }: { onClose: () => void; onWord: () => Promise<void>; onPrint: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <Sheet title="Export" compact onClose={onClose}>
      <VButton kind="primary" accent="var(--primary)" disabled={busy} onClick={async () => {
        setBusy(true)
        setError(null)
        try {
          await onWord()
          onClose()
        } catch {
          setError("The Word file couldn't be made. Try again, or print to PDF instead.")
        } finally {
          setBusy(false)
        }
      }}>
        {busy ? 'Making the Word file…' : 'Word document (.docx)'}
      </VButton>
      <VButton accent="var(--primary)" onClick={onPrint}>Print, or save as PDF</VButton>
      <p className="help">
        The Word file keeps your font, spacing, margins, headings, pictures, citations and reference list. To make a PDF, choose
        “Save as PDF” in the print window.
      </p>
      {error && <div className="notice error">{error}</div>}
    </Sheet>
  )
}

/** Everything set once: font, size, spacing, page, what the finished paper includes, citation style. */
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

      <EditorBox title="The finished paper">
        <Toggle label="Include headings" checked={f.includeHeadings} onChange={includeHeadings => onChange({ includeHeadings })} />
        <p className="help">Headings guide you while writing. Most papers leave them out; turn this on if yours needs them.</p>
        <Toggle label="Show word counts while writing" checked={f.showWordCounts} onChange={showWordCounts => onChange({ showWordCounts })} />
        <p className="help">The total above the writing, and each section's count beside its heading.</p>
        <p className="help">Your name, course and the rest are filled in on the title page (APA, Harvard) or at the top of the first page (MLA).</p>
      </EditorBox>

      <EditorBox title="Citations">
        <select value={f.citationStyle} onChange={e => onChange({ citationStyle: e.target.value as CitationStyle })} aria-label="Citation style">
          <option value="apa">APA (7th edition)</option>
          <option value="mla">MLA (9th edition)</option>
          <option value="harvard">Harvard</option>
        </select>
        <p className="help">How citations read, the reference list, and the paper's layout: APA and Harvard start with a title page; MLA puts your details at the top of the first page. The references always start a page of their own.</p>
      </EditorBox>

      {canDelete && <VButton kind="destructive" onClick={onDelete}>Delete paper</VButton>}
    </div>
  )
}
