// Note and notebook editors, ported from NoteSheets.swift and
// NotebookViews.swift. Each works on a local copy until Save.

import { CheckSquare, FileText, Zap } from 'lucide-react'
import { useRef, useState } from 'react'
import { toISO } from '../model/dates'
import { newID } from '../model/ids'
import { checklistToDoc, isDocEmpty, noteDoc, textToDoc, wrapDoc, type DocNode } from '../model/noteDoc'
import type { Goal, Note, NoteType, Notebook } from '../model/types'
import { useData } from '../store/data'
import { EditorBox, Field, Sheet, VButton } from '../ui/components'
import { RichEditor } from '../ui/editor/LazyRichEditor'

/** Any goal, grouped the way the iPhone picker groups them. */
export function GoalSelect({ value, onChange }: { value?: string; onChange: (id: string | undefined) => void }) {
  const goals = useData(s => s.goals)
  const longTerm = goals.filter(g => g.kind === 'longTerm')
  const shortTerm = goals.filter(g => g.kind === 'shortTerm' && !g.linkedToGoalID)
  const habits = goals.filter(g => g.linkedToGoalID)
  const habitLabel = (h: Goal) => {
    const parent = goals.find(g => g.id === h.linkedToGoalID)
    return parent ? `${h.title} (${parent.title})` : h.title
  }
  return (
    <select value={value ?? ''} onChange={e => onChange(e.target.value || undefined)} aria-label="Linked goal">
      <option value="">None</option>
      {longTerm.length > 0 && <optgroup label="Long-term">{longTerm.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</optgroup>}
      {shortTerm.length > 0 && <optgroup label="Short-term">{shortTerm.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</optgroup>}
      {habits.length > 0 && <optgroup label="Daily habits">{habits.map(g => <option key={g.id} value={g.id}>{habitLabel(g)}</option>)}</optgroup>}
    </select>
  )
}

const typeOptions: { type: NoteType; label: string; description: string; icon: typeof Zap }[] = [
  { type: 'jot', label: 'Jot', description: 'Quick, titleless, fast to capture', icon: Zap },
  { type: 'list', label: 'List', description: 'Starts with a checklist ready to go', icon: CheckSquare },
  { type: 'classic', label: 'Note', description: 'A regular note with formatting', icon: FileText },
]

export function NoteTypePicker({ onPick, onClose }: { onPick: (type: NoteType) => void; onClose: () => void }) {
  return (
    <Sheet title="New note" compact onClose={onClose}>
      {typeOptions.map(({ type, label, description, icon: Icon }) => (
        <button key={type} className="summary-row" style={{ gap: 12 }} onClick={() => onPick(type)}>
          <Icon size={20} color="var(--primary)" />
          <span className="grow">
            <div style={{ fontWeight: 600 }}>{label}</div>
            <div className="caption">{description}</div>
          </span>
        </button>
      ))}
    </Sheet>
  )
}

export function newNote(type: NoteType, notebookID?: string): Note {
  return {
    id: newID(),
    type,
    title: '',
    jotText: '',
    checklistItems: [],
    notebookID,
    // A list starts with a checkbox ready to type into; the others start blank.
    body: wrapDoc(type === 'list' ? checklistToDoc([]) : textToDoc('')),
    updatedDate: toISO(new Date()),
  }
}

/**
 * Every note type edits in the same rich editor. The type only decides
 * how a new note starts (a jot has no title; a list opens on a checkbox).
 */
export function NoteEditor({ note: original, isNew, onClose }: { note: Note; isNew: boolean; onClose: () => void }) {
  const { notebooks, saveNote, deleteNote } = useData()
  const [note, setNote] = useState(original)
  // Converted from whatever the note held before, once, on open.
  const [initialDoc] = useState(() => noteDoc(original))
  const docRef = useRef<DocNode>(initialDoc)
  const patch = (p: Partial<Note>) => setNote(n => ({ ...n, ...p }))

  const save = () => {
    const doc = docRef.current
    // A brand-new note left completely empty isn't worth keeping.
    if (isNew && !note.title.trim() && isDocEmpty(doc)) return onClose()
    saveNote({ ...note, title: note.title.trim(), body: wrapDoc(doc) })
    onClose()
  }

  const titles: Record<NoteType, string> = { jot: 'jot', list: 'list', classic: 'note' }
  const sortedNotebooks = [...notebooks].sort((a, b) => b.createdDate.localeCompare(a.createdDate))

  return (
    <Sheet fullscreen title={`${isNew ? 'New' : 'Edit'} ${titles[note.type]}`} onClose={onClose} right={{ label: isNew ? 'Add' : 'Save', onClick: save }}>
      {note.type !== 'jot' && (
        <input
          className="note-title"
          autoFocus={isNew}
          value={note.title}
          onChange={e => patch({ title: e.target.value })}
          placeholder="Title"
          aria-label="Title"
        />
      )}

      <RichEditor
        initial={initialDoc}
        onChange={doc => { docRef.current = doc }}
        label={note.type === 'jot' ? 'Jot' : 'Note'}
        placeholder={note.type === 'jot' ? 'Jot something down' : 'Start writing…'}
        autofocus={isNew && note.type === 'jot'}
      />

      {note.type !== 'jot' && (
        <details className="editor-box links-box">
          <summary>Links{note.linkedGoalID || note.notebookID ? ' · set' : ''}</summary>
          <Field label="Goal (optional)"><GoalSelect value={note.linkedGoalID} onChange={linkedGoalID => patch({ linkedGoalID })} /></Field>
          <Field label="Notebook (optional)">
            <select value={note.notebookID ?? ''} onChange={e => patch({ notebookID: e.target.value || undefined })}>
              <option value="">None</option>
              {sortedNotebooks.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
            </select>
          </Field>
        </details>
      )}

      {!isNew && <VButton kind="destructive" onClick={() => { deleteNote(note.id); onClose() }}>Delete note</VButton>}
    </Sheet>
  )
}

export function NotebookEditor({ notebook: original, isNew, onClose, onDeleted }: { notebook: Notebook; isNew: boolean; onClose: () => void; onDeleted?: () => void }) {
  const { saveNotebook, deleteNotebook } = useData()
  const [notebook, setNotebook] = useState(original)
  return (
    <Sheet
      title={isNew ? 'New notebook' : 'Edit notebook'}
      onClose={onClose}
      right={{ label: isNew ? 'Create' : 'Save', disabled: !notebook.title.trim(), onClick: () => { saveNotebook({ ...notebook, title: notebook.title.trim() }); onClose() } }}
    >
      <EditorBox title="Name">
        <input autoFocus value={notebook.title} onChange={e => setNotebook({ ...notebook, title: e.target.value })} placeholder="Notebook name" aria-label="Notebook name" />
      </EditorBox>
      <EditorBox title="Link to a goal (optional)">
        <GoalSelect value={notebook.linkedGoalID} onChange={linkedGoalID => setNotebook({ ...notebook, linkedGoalID })} />
      </EditorBox>
      {!isNew && (
        <>
          <VButton kind="destructive" onClick={() => { deleteNotebook(notebook.id); onClose(); onDeleted?.() }}>Delete notebook</VButton>
          <p className="help">Notes inside this notebook won't be deleted — they'll move back to their own sections.</p>
        </>
      )}
    </Sheet>
  )
}

export function newNotebook(): Notebook {
  return { id: newID(), title: '', createdDate: toISO(new Date()) }
}
