// The Record tab, ported from RecordView.swift and JournalViews.swift:
// Journal / Notebooks / Jots / Lists & Notes under an underline selector,
// each section swapping in fully rather than stacking on one long scroll.

import { BookOpen, CalendarDays, ChevronLeft, ChevronRight, List, PenSquare, Plus, Search, Target } from 'lucide-react'
import { useState } from 'react'
import { addDays, addMonths, isSameDay, parseDate, startOfDay } from '../model/dates'
import { monthGridDays, startOfMonth } from '../model/longTerm'
import { journalEntryFor } from '../model/planning'
import { noteRichText } from '../model/rtf'
import type { JournalEntry, Note, NoteType, Notebook } from '../model/types'
import { useData } from '../store/data'
import { Sheet, VButton } from '../ui/components'
import type { ThemeColors } from '../ui/theme'
import { NoteEditor, NoteTypePicker, NotebookEditor, newNote, newNotebook } from './NoteEditors'

type Section = 'journal' | 'notebooks' | 'jots' | 'notes'

const sections: { id: Section; label: string }[] = [
  { id: 'journal', label: 'Journal' },
  { id: 'notebooks', label: 'Notebooks' },
  { id: 'jots', label: 'Jots' },
  { id: 'notes', label: 'Lists & Notes' },
]

export function RecordScreen({ colors }: { colors: ThemeColors }) {
  const [section, setSection] = useState<Section>(() => (sessionStorage.getItem('vectis:ui:record') as Section) || 'journal')
  const [picking, setPicking] = useState<{ notebookID?: string } | null>(null)
  const [editingNote, setEditingNote] = useState<{ note: Note; isNew: boolean } | null>(null)
  const [editingNotebook, setEditingNotebook] = useState<{ notebook: Notebook; isNew: boolean } | null>(null)
  const [openNotebookID, setOpenNotebookID] = useState<string | null>(null)

  const choose = (s: Section) => {
    setSection(s)
    try {
      sessionStorage.setItem('vectis:ui:record', s)
    } catch {
      // Section just won't be remembered.
    }
  }
  const startNote = (type: NoteType, notebookID?: string) => {
    setPicking(null)
    setEditingNote({ note: newNote(type, notebookID), isNew: true })
  }

  return (
    <div className="page record">
      <div className="record-tabs" role="tablist" aria-label="Record sections">
        {sections.map(s => (
          <button key={s.id} role="tab" aria-selected={section === s.id} onClick={() => choose(s.id)}>{s.label}</button>
        ))}
      </div>

      {section !== 'journal' && (
        <div className="button-row">
          <VButton small accent={colors.primary} onClick={() => setPicking({})}><PenSquare size={14} /> New note</VButton>
          <VButton small accent={colors.primary} onClick={() => setEditingNotebook({ notebook: newNotebook(), isNew: true })}><BookOpen size={14} /> New notebook</VButton>
        </div>
      )}

      {section === 'journal' && <JournalSection colors={colors} />}
      {section === 'notebooks' && <NotebooksSection colors={colors} onOpen={setOpenNotebookID} />}
      {section === 'jots' && <NotesList kinds={['jot']} searchLabel="Search jots" colors={colors} onSelect={n => setEditingNote({ note: n, isNew: false })} />}
      {section === 'notes' && <NotesList kinds={['list', 'classic']} searchLabel="Search lists and notes" colors={colors} onSelect={n => setEditingNote({ note: n, isNew: false })} />}

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

function JournalSection({ colors }: { colors: ThemeColors }) {
  const journal = useData(s => s.journal)
  const [query, setQuery] = useState('')
  const [calendar, setCalendar] = useState(false)
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [open, setOpen] = useState<Date | null>(null)

  // Entries with no words yet aren't real entries.
  const entries = journal
    .filter(e => e.text.trim())
    .sort((a, b) => b.date.localeCompare(a.date))
  const q = query.trim().toLowerCase()
  const matches = (e: JournalEntry) => !q || e.text.toLowerCase().includes(q) || (e.reflectionPrompt ?? '').toLowerCase().includes(q)

  const groups: { month: string; entries: JournalEntry[] }[] = []
  for (const e of entries.filter(matches)) {
    const label = parseDate(e.date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    const group = groups[groups.length - 1]
    if (group?.month === label) group.entries.push(e)
    else groups.push({ month: label, entries: [e] })
  }

  return (
    <>
      <div className="row" style={{ gap: 8 }}>
        {!calendar && <div className="grow"><SearchField value={query} onChange={setQuery} label="Search entries" /></div>}
        {calendar && <span className="grow" />}
        <VButton small accent={colors.primary} onClick={() => setCalendar(c => !c)}>
          {calendar ? <><List size={14} /> List</> : <><CalendarDays size={14} /> Jump to date</>}
        </VButton>
        <VButton small kind="primary" accent={colors.primary} onClick={() => setOpen(new Date())}><PenSquare size={14} /> Today</VButton>
      </div>

      {calendar ? (
        <div className="lt-month">
          <div className="row spread month-head">
            <button className="icon-button" onClick={() => setMonth(m => addMonths(m, -1))} aria-label="Previous month"><ChevronLeft size={20} /></button>
            <span className="month-title">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
            <button className="icon-button" onClick={() => setMonth(m => addMonths(m, 1))} aria-label="Next month"><ChevronRight size={20} /></button>
          </div>
          <div className="month-grid journal-grid">
            {monthGridDays(month).map(({ date, inMonth }) => {
              const entry = journalEntryFor(journal, date)
              const has = Boolean(entry?.text.trim())
              return (
                <button
                  key={date.toISOString()}
                  className={`day-cell ${inMonth ? '' : 'outside'} ${isSameDay(date, new Date()) ? 'today' : ''}`}
                  disabled={!has}
                  onClick={() => setOpen(date)}
                  aria-label={`${date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}${has ? ', has an entry' : ''}`}
                >
                  <span className="day-number">{date.getDate()}</span>
                  {has && <span className="journal-dot" style={{ background: colors.primary }} />}
                </button>
              )
            })}
          </div>
        </div>
      ) : entries.length === 0 ? (
        <div className="empty">
          <strong style={{ color: 'var(--text)' }}>No entries yet</strong>
          <span className="caption">Answer the evening review's prompt, or just write something.</span>
        </div>
      ) : groups.length === 0 ? (
        <p className="muted" style={{ textAlign: 'center' }}>No entries match.</p>
      ) : (
        groups.map(g => (
          <section key={g.month}>
            <h3 className="list-heading">{g.month}</h3>
            <div className="list-box">
              {g.entries.map(e => (
                <button key={e.id} className="list-item" onClick={() => setOpen(parseDate(e.date))}>
                  <div className="row" style={{ gap: 6 }}>
                    <strong>{dayLabel(parseDate(e.date))}</strong>
                    {e.reflectionPrompt && <span className="tag">review</span>}
                  </div>
                  {e.reflectionPrompt && <div className="caption" style={{ fontStyle: 'italic' }}>{e.reflectionPrompt}</div>}
                  <div className="caption ellipsis">{e.text}</div>
                </button>
              ))}
            </div>
          </section>
        ))
      )}

      {open && <JournalEntryEditor date={open} onClose={() => setOpen(null)} />}
    </>
  )
}

function JournalEntryEditor({ date, onClose }: { date: Date; onClose: () => void }) {
  const { journal, setJournalText, deleteJournalEntry } = useData()
  const entry = journalEntryFor(journal, date)
  const [text, setText] = useState(entry?.text ?? '')

  return (
    <Sheet title={dayLabel(date, true)} onClose={onClose} leftLabel="Close" right={{ label: 'Save', onClick: () => { setJournalText(date, text); onClose() } }}>
      {entry?.reflectionPrompt && <div className="muted" style={{ fontStyle: 'italic' }}>{entry.reflectionPrompt}</div>}
      <textarea autoFocus rows={12} value={text} onChange={e => setText(e.target.value)} aria-label="Journal entry" style={{ resize: 'vertical', background: 'var(--surface)' }} />
      <p className="help">Answering the review's prompt starts the entry. Keep writing here anytime — same entry, one per day.</p>
      {entry && (
        <VButton kind="destructive" onClick={() => {
          if (confirm('Delete this journal entry?')) {
            deleteJournalEntry(entry.id)
            onClose()
          }
        }}>Delete entry</VButton>
      )}
    </Sheet>
  )
}

// MARK: - Notes

function notePreview(note: Note): string {
  if (note.type === 'jot') return note.jotText
  if (note.type === 'list') return note.checklistItems.map(i => i.text).join(', ')
  return noteRichText(note.richTextData)
}

function GoalTag({ goalID, colors }: { goalID?: string; colors: ThemeColors }) {
  const goal = useData(s => s.goals.find(g => g.id === goalID))
  if (!goal) return null
  return <span className="caption2 row" style={{ gap: 4, color: colors.primary }}><Target size={11} />{goal.title}</span>
}

function NoteRow({ note, colors, onSelect }: { note: Note; colors: ThemeColors; onSelect: (n: Note) => void }) {
  return (
    <button className="list-item" onClick={() => onSelect(note)}>
      {note.type === 'jot' ? (
        <div className="ellipsis">{note.jotText || 'Empty jot'}</div>
      ) : (
        <>
          <strong className="ellipsis">{note.title || 'Untitled'}</strong>
          <div className="caption ellipsis">{notePreview(note) || ' '}</div>
        </>
      )}
      <GoalTag goalID={note.linkedGoalID} colors={colors} />
    </button>
  )
}

function NotesList({ kinds, searchLabel, colors, onSelect }: { kinds: NoteType[]; searchLabel: string; colors: ThemeColors; onSelect: (n: Note) => void }) {
  const notes = useData(s => s.notes)
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  // Notes in a notebook show under their notebook instead of twice.
  const loose = notes
    .filter(n => kinds.includes(n.type) && !n.notebookID)
    .sort((a, b) => b.updatedDate.localeCompare(a.updatedDate))
  const shown = loose.filter(n =>
    !q || n.title.toLowerCase().includes(q) || notePreview(n).toLowerCase().includes(q))

  if (loose.length === 0) return <div className="empty">Nothing here yet</div>
  return (
    <>
      <SearchField value={query} onChange={setQuery} label={searchLabel} />
      {shown.length === 0 ? <p className="muted" style={{ textAlign: 'center' }}>Nothing matches.</p> : (
        <div className="list-box">
          {shown.map(n => <NoteRow key={n.id} note={n} colors={colors} onSelect={onSelect} />)}
        </div>
      )}
    </>
  )
}

function NotebooksSection({ colors, onOpen }: { colors: ThemeColors; onOpen: (id: string) => void }) {
  const { notebooks, notes } = useData()
  const sorted = [...notebooks].sort((a, b) => b.createdDate.localeCompare(a.createdDate))
  if (sorted.length === 0) return <div className="empty">No notebooks yet</div>
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
      <VButton accent={props.colors.primary} onClick={props.onAddNote}><Plus size={16} /> Add note to this notebook</VButton>
    </Sheet>
  )
}
