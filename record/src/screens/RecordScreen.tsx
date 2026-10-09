// Record's three tabs — Journal, Notebooks and Notes — one section each.
// (Until Oct 2026 this was Planner's Record tab.)
//
// Notes holds every loose jot, list and note (newest first, grouped by
// when they were last changed, with a filter by kind); Notebooks are the
// organised side. Each journal day is one entry with two foldable
// sections, Journal and Daily review (where the evening review's answer goes).

import { MonthGrid } from '@suite/ui/MonthGrid'
import { BookOpen, CalendarDays, CheckSquare, ChevronRight, FileText, List, PenSquare, Plus, Search, Target, Zap } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ThemeColors } from '@suite/appearance'
import { addDays, isSameDay, parseDate, startOfDay } from '@suite/dates'
import { startOfMonth } from '@suite/months'
import { RichEditor } from '@suite/record/editor/LazyRichEditor'
import { matchesJournal } from '@suite/record/journalSearch'
import {
  JOURNAL_HEADING, REVIEW_HEADING, dayDoc, docToPlainText, isDocEmpty, journalEntryFor, notePlainText, sectionText, type DocNode,
} from '@suite/record/noteDoc'
import type { JournalEntry, Note, NoteType, Notebook } from '@suite/record/types'
import { Sheet, VButton } from '@suite/ui/components'
import { useData } from '../store/data'
import { NoteEditor, NoteTypePicker, NotebookEditor, newNote, newNotebook } from './NoteEditors'

export type Section = 'journal' | 'notebooks' | 'notes'

export function RecordScreen({ section, colors }: { section: Section; colors: ThemeColors }) {
  const [picking, setPicking] = useState<{ notebookID?: string } | null>(null)
  const [editingNote, setEditingNote] = useState<{ note: Note; isNew: boolean } | null>(null)
  const [editingNotebook, setEditingNotebook] = useState<{ notebook: Notebook; isNew: boolean } | null>(null)
  const [openNotebookID, setOpenNotebookID] = useState<string | null>(null)

  const startNote = (type: NoteType, notebookID?: string) => {
    setPicking(null)
    setEditingNote({ note: newNote(type, notebookID), isNew: true })
  }

  return (
    <div className="page record">
      {section === 'notes' && (
        <div className="button-row">
          <VButton small kind="primary" accent={colors.primary} onClick={() => setPicking({})}><PenSquare size={14} /> New</VButton>
        </div>
      )}
      {section === 'notebooks' && (
        <div className="button-row">
          <VButton small kind="primary" accent={colors.primary} onClick={() => setEditingNotebook({ notebook: newNotebook(), isNew: true })}><BookOpen size={14} /> New notebook</VButton>
        </div>
      )}

      {section === 'journal' && <JournalSection colors={colors} />}
      {section === 'notebooks' && <NotebooksSection colors={colors} onOpen={setOpenNotebookID} />}
      {section === 'notes' && <NotesSection colors={colors} onSelect={n => setEditingNote({ note: n, isNew: false })} />}

      {openNotebookID && !editingNote && !picking && !editingNotebook && (
        <NotebookDetail
          id={openNotebookID}
          colors={colors}
          onClose={() => setOpenNotebookID(null)}
          onAddNote={() => setPicking({ notebookID: openNotebookID })}
          onEditNote={n => setEditingNote({ note: n, isNew: false })}
          onEditNotebook={b => setEditingNotebook({ notebook: b, isNew: false })}
        />
      )}
      {picking && <NoteTypePicker onClose={() => setPicking(null)} onPick={type => startNote(type, picking.notebookID)} />}
      {editingNote && <NoteEditor note={editingNote.note} isNew={editingNote.isNew} onClose={() => setEditingNote(null)} />}
      {editingNotebook && (
        <NotebookEditor
          notebook={editingNotebook.notebook}
          isNew={editingNotebook.isNew}
          onClose={() => setEditingNotebook(null)}
          onDeleted={() => setOpenNotebookID(null)}
        />
      )}
    </div>
  )
}

function SearchField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="search-field">
      <Search size={15} className="muted" />
      <input type="search" value={value} onChange={e => onChange(e.target.value)} placeholder={label} aria-label={label} />
    </label>
  )
}

// MARK: - Journal

function dayLabel(date: Date, long = false): string {
  const today = startOfDay(new Date())
  if (isSameDay(date, today)) return 'Today'
  if (isSameDay(date, addDays(today, -1))) return 'Yesterday'
  return date.toLocaleDateString(undefined, long ? { weekday: 'long', month: 'long', day: 'numeric' } : { weekday: 'long', day: 'numeric' })
}

/** What's written under each heading of a day. */
function parts(e: JournalEntry): { journal: string; review: string } {
  const doc = dayDoc(e)
  return { journal: sectionText(doc, JOURNAL_HEADING).trim(), review: sectionText(doc, REVIEW_HEADING).trim() }
}

/** A day with anything written in it. */
const hasWriting = (e?: JournalEntry) => {
  if (!e) return false
  const p = parts(e)
  return Boolean(p.journal || p.review)
}

function JournalSection({ colors }: { colors: ThemeColors }) {
  const journal = useData(s => s.journal)
  const [query, setQuery] = useState('')
  const [calendar, setCalendar] = useState(false)
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [open, setOpen] = useState<Date | null>(null)

  const entries = journal.filter(hasWriting).sort((a, b) => b.date.localeCompare(a.date))

  const groups: { month: string; entries: JournalEntry[] }[] = []
  for (const e of entries.filter(e => matchesJournal(e, query))) {
    const label = parseDate(e.date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    const group = groups[groups.length - 1]
    if (group?.month === label) group.entries.push(e)
    else groups.push({ month: label, entries: [e] })
  }

  return (
    <>
      <div className="row" style={{ gap: 8 }}>
        {!calendar && <div className="grow"><SearchField value={query} onChange={setQuery} label="Search words or dates" /></div>}
        {calendar && <span className="grow" />}
        <VButton small accent={colors.primary} onClick={() => setCalendar(c => !c)}>
          {calendar ? <><List size={14} /> List</> : <><CalendarDays size={14} /> Calendar</>}
        </VButton>
        <VButton small kind="primary" accent={colors.primary} onClick={() => setOpen(new Date())}><PenSquare size={14} /> Today</VButton>
      </div>

      {calendar ? (
        <div className="lt-month">
          <MonthGrid
            month={month}
            onMonthChange={setMonth}
            showWeekdays={false}
            className="journal-grid"
            renderDay={({ date, inMonth, isToday }) => {
              const has = hasWriting(journalEntryFor(journal, date))
              return (
                <button
                  key={date.toISOString()}
                  className={`day-cell ${inMonth ? '' : 'outside'} ${isToday ? 'today' : ''}`}
                  onClick={() => setOpen(date)}
                  aria-label={`${date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}${has ? ', has an entry' : ''}`}
                >
                  <span className="day-number">{date.getDate()}</span>
                  {has && <span className="journal-dot" style={{ background: colors.primary }} />}
                </button>
              )
            }}
          />
        </div>
      ) : entries.length === 0 ? (
        <div className="empty">
          <strong>No entries yet</strong>
          <span className="caption">Write about your day, or answer the evening review — it's kept as that day's daily review.</span>
        </div>
      ) : groups.length === 0 ? (
        <p className="muted" style={{ textAlign: 'center' }}>No entries match. Try a word, or a date like "12 Oct" or "Monday".</p>
      ) : (
        groups.map(g => (
          <section key={g.month}>
            <h3 className="list-heading">{g.month}</h3>
            <div>
              {g.entries.map(e => {
                const p = parts(e)
                const day = parseDate(e.date)
                return (
                  <button key={e.id} className="journal-row" onClick={() => setOpen(day)} aria-label={dayLabel(day, true)}>
                    <span className="journal-day">
                      <span className="journal-day-number">{day.getDate()}</span>
                      <span className="mono muted">{day.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                    </span>
                    <span className="journal-text">
                      <span className="journal-heading">{p.journal ? JOURNAL_HEADING : REVIEW_HEADING}</span>
                      <span className="journal-clamp">{(p.journal || p.review).replace(/\n+/g, ' · ')}</span>
                      {p.journal && p.review && <span className="mono muted">+ {REVIEW_HEADING}</span>}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        ))
      )}

      {open && <JournalEntryEditor date={open} onClose={() => setOpen(null)} />}
    </>
  )
}

/**
 * One day, one entry: the "Journal" and "Daily review" headings are part
 * of it, and each folds away with its arrow (the editor's foldable
 * sections; folding is remembered).
 */
function JournalEntryEditor({ date, onClose }: { date: Date; onClose: () => void }) {
  const { journal, setJournalDoc, deleteJournalEntry } = useData()
  const entry = journalEntryFor(journal, date)
  const [initial] = useState(() => dayDoc(entry))
  const docRef = useRef<DocNode>(initial)
  const changed = useRef(false)

  const save = () => {
    // A brand-new day left with just its headings isn't worth keeping.
    const written = sectionText(docRef.current, JOURNAL_HEADING).trim() || sectionText(docRef.current, REVIEW_HEADING).trim()
      || !isDocEmpty({ type: 'doc', content: (docRef.current.content ?? []).filter(n => n.type !== 'heading') })
    if (!entry && !written) return onClose()
    // An older day opens reshaped with the headings; saving keeps it that way.
    if (changed.current || docToPlainText(docRef.current) !== entry?.text) setJournalDoc(date, docRef.current)
    onClose()
  }

  return (
    <Sheet fullscreen title={dayLabel(date, true)} onClose={onClose} leftLabel="Close" right={{ label: 'Save', onClick: save }}>
      {entry?.reflectionPrompt && <div className="caption">Review question: <em>{entry.reflectionPrompt}</em></div>}
      <RichEditor
        initial={initial}
        onChange={doc => { docRef.current = doc; changed.current = true }}
        label="Journal entry"
        placeholder="Write about your day…"
      />
      <p className="help">Tap the arrow beside a heading to fold its section away. The evening review's answer goes under Daily review.</p>

      {entry && (
        <VButton kind="destructive" onClick={() => {
          if (confirm('Delete this day — both the journal and the daily review?')) {
            deleteJournalEntry(entry.id)
            onClose()
          }
        }}>Delete this day</VButton>
      )}
    </Sheet>
  )
}

// MARK: - Notes

/** One line of a note's text, whichever form it's saved in. */
function notePreview(note: Note): string {
  return notePlainText(note).split('\n').filter(l => l.trim()).join(' · ')
}

const KIND_ICON: Record<NoteType, typeof Zap> = { jot: Zap, list: CheckSquare, classic: FileText }
const KIND_LABEL: Record<NoteType, string> = { jot: 'Jot', list: 'List', classic: 'Note' }

function GoalTag({ goalID, colors }: { goalID?: string; colors: ThemeColors }) {
  const goal = useData(s => s.goals.find(g => g.id === goalID))
  if (!goal) return null
  return <span className="caption2 row" style={{ gap: 4, color: colors.primary }}><Target size={11} />{goal.title}</span>
}

function NoteRow({ note, colors, onSelect, notebook }: { note: Note; colors: ThemeColors; onSelect: (n: Note) => void; notebook?: string }) {
  const Icon = KIND_ICON[note.type]
  return (
    <button className="list-item note-row" onClick={() => onSelect(note)}>
      <Icon size={15} className="muted" aria-label={KIND_LABEL[note.type]} />
      <span className="grow" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {note.type === 'jot' ? (
          <span className="ellipsis">{notePreview(note) || 'Empty jot'}</span>
        ) : (
          <>
            <strong className="ellipsis">{note.title || 'Untitled'}</strong>
            <span className="caption ellipsis">{notePreview(note) || ' '}</span>
          </>
        )}
        {notebook && <span className="caption2 row" style={{ gap: 4 }}><BookOpen size={11} />{notebook}</span>}
        <GoalTag goalID={note.linkedGoalID} colors={colors} />
      </span>
    </button>
  )
}

type Kind = 'all' | NoteType

/** Groups by when a note was last changed: Today, This week, This month, then by month. */
function recencyLabel(iso: string, today = startOfDay(new Date())): string {
  const d = parseDate(iso)
  if (d >= today) return 'Today'
  if (d >= addDays(today, -6)) return 'This week'
  if (d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth()) return 'Earlier this month'
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function NotesSection({ colors, onSelect }: { colors: ThemeColors; onSelect: (n: Note) => void }) {
  const { notes, notebooks } = useData()
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<Kind>('all')
  const q = query.trim().toLowerCase()
  const notebookName = (id?: string) => notebooks.find(b => b.id === id)?.title

  // Loose notes live here; notes in a notebook show under it — except when
  // searching, which looks everywhere so nothing is hard to find.
  const pool = notes
    .filter(n => (q ? true : !n.notebookID) && (kind === 'all' || n.type === kind))
    .filter(n => !q || n.title.toLowerCase().includes(q) || notePreview(n).toLowerCase().includes(q))
    .sort((a, b) => b.updatedDate.localeCompare(a.updatedDate))

  const groups: { label: string; notes: Note[] }[] = []
  for (const n of pool) {
    const label = recencyLabel(n.updatedDate)
    const g = groups[groups.length - 1]
    if (g?.label === label) g.notes.push(n)
    else groups.push({ label, notes: [n] })
  }

  const kinds: { id: Kind; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'classic', label: 'Notes' }, { id: 'list', label: 'Lists' }, { id: 'jot', label: 'Jots' }]
  const anyLoose = notes.some(n => !n.notebookID)

  return (
    <>
      <SearchField value={query} onChange={setQuery} label="Search all notes" />
      <div className="kind-filter" role="group" aria-label="Show">
        {kinds.map(k => <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>{k.label}</button>)}
      </div>
      {!anyLoose && !q ? (
        <div className="empty">
          <strong style={{ color: 'var(--text)' }}>No notes yet</strong>
          <span className="caption">Tap New for a quick jot, a list, or a note.</span>
        </div>
      ) : groups.length === 0 ? (
        <p className="muted" style={{ textAlign: 'center' }}>{q ? 'Nothing matches.' : `No ${kinds.find(k => k.id === kind)!.label.toLowerCase()} here yet.`}</p>
      ) : (
        groups.map(g => (
          <section key={g.label}>
            <h3 className="list-heading">{g.label}</h3>
            <div className="list-box">
              {g.notes.map(n => <NoteRow key={n.id} note={n} colors={colors} onSelect={onSelect} notebook={n.notebookID ? notebookName(n.notebookID) : undefined} />)}
            </div>
          </section>
        ))
      )}
    </>
  )
}

function NotebooksSection({ colors, onOpen }: { colors: ThemeColors; onOpen: (id: string) => void }) {
  const { notebooks, notes } = useData()
  const sorted = [...notebooks].sort((a, b) => b.createdDate.localeCompare(a.createdDate))
  if (sorted.length === 0) {
    return (
      <div className="empty">
        <strong style={{ color: 'var(--text)' }}>No notebooks yet</strong>
        <span className="caption">A notebook keeps related notes together — a course, a project, a trip.</span>
      </div>
    )
  }
  return (
    <div className="list-box">
      {sorted.map(b => {
        const count = notes.filter(n => n.notebookID === b.id).length
        return (
          <button key={b.id} className="list-item row" style={{ flexDirection: 'row' }} onClick={() => onOpen(b.id)}>
            <span className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <strong>{b.title}</strong>
              <span className="caption">{count} note{count === 1 ? '' : 's'}</span>
              <GoalTag goalID={b.linkedGoalID} colors={colors} />
            </span>
            <ChevronRight size={16} className="muted" />
          </button>
        )
      })}
    </div>
  )
}

function NotebookDetail(props: {
  id: string
  colors: ThemeColors
  onClose: () => void
  onAddNote: () => void
  onEditNote: (n: Note) => void
  onEditNotebook: (b: Notebook) => void
}) {
  const { notebooks, notes } = useData()
  const notebook = notebooks.find(b => b.id === props.id)
  if (!notebook) return null
  const inside = notes.filter(n => n.notebookID === notebook.id).sort((a, b) => b.updatedDate.localeCompare(a.updatedDate))
  return (
    <Sheet title={notebook.title} onClose={props.onClose} leftLabel="Close" right={{ label: 'Edit', onClick: () => props.onEditNotebook(notebook) }}>
      {inside.length === 0 ? <p className="help">No notes in this notebook yet.</p> : (
        <div className="list-box">
          {inside.map(n => <NoteRow key={n.id} note={n} colors={props.colors} onSelect={props.onEditNote} />)}
        </div>
      )}
      <VButton accent={props.colors.primary} onClick={props.onAddNote}><Plus size={16} /> Add to this notebook</VButton>
    </Sheet>
  )
}
