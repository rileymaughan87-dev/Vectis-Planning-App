// Note and notebook editors, ported from NoteSheets.swift and
// NotebookViews.swift. Each works on a local copy until Save.

import { CheckSquare, FileText, Trash2, Zap } from 'lucide-react'
import { useState } from 'react'
import { toISO } from '../model/dates'
import { newID } from '../model/ids'
import type { Goal, Note, NoteType, Notebook } from '../model/types'
import { useData } from '../store/data'
import { CompletionMark, EditorBox, Field, Sheet, VButton } from '../ui/components'
import { RichTextEditor } from '../ui/RichTextEditor'

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
    checklistItems: type === 'list' ? [{ id: newID(), text: '', done: false }] : [],
    notebookID,
    updatedDate: toISO(new Date()),
  }
}

export function NoteEditor({ note: original, isNew, onClose }: { note: Note; isNew: boolean; onClose: () => void }) {
  const { notebooks, saveNote, deleteNote } = useData()
  const [note, setNote] = useState(() =>
    original.type === 'list' && original.checklistItems.length === 0
      ? { ...original, checklistItems: [{ id: newID(), text: '', done: false }] }
      : original,
  )
  const patch = (p: Partial<Note>) => setNote(n => ({ ...n, ...p }))
  const setItem = (id: string, p: Partial<Note['checklistItems'][number]>) =>
    patch({ checklistItems: note.checklistItems.map(i => (i.id === id ? { ...i, ...p } : i)) })
  const addItem = (afterID?: string) => {
    const item = { id: newID(), text: '', done: false }
    const index = afterID ? note.checklistItems.findIndex(i => i.id === afterID) + 1 : note.checklistItems.length
    const items = [...note.checklistItems]
    items.splice(index, 0, item)
    patch({ checklistItems: items })
    // Focus the new row once it renders.
    setTimeout(() => document.getElementById(`item-${item.id}`)?.focus(), 0)
  }

  const save = () => {
    saveNote({
      ...note,
      title: note.title.trim(),
      checklistItems: note.checklistItems.filter(i => i.text.trim()),
    })
    onClose()
  }

  const titles: Record<NoteType, string> = { jot: 'jot', list: 'list', classic: 'note' }
  const sortedNotebooks = [...notebooks].sort((a, b) => b.createdDate.localeCompare(a.createdDate))

  return (
    <Sheet title={`${isNew ? 'New' : 'Edit'} ${titles[note.type]}`} onClose={onClose} right={{ label: isNew ? 'Add' : 'Save', onClick: save }}>
      {note.type === 'jot' && (
        <div className="editor-box">
          <textarea autoFocus rows={6} value={note.jotText} onChange={e => patch({ jotText: e.target.value })} aria-label="Jot" placeholder="Jot something down" style={{ resize: 'vertical' }} />
        </div>
      )}

      {note.type !== 'jot' && (
        <EditorBox title="Title">
          <input autoFocus={isNew} value={note.title} onChange={e => patch({ title: e.target.value })} placeholder="Title" aria-label="Title" />
        </EditorBox>
      )}

      {note.type === 'list' && (
        <EditorBox title="Items">
          {note.checklistItems.map(item => (
            <div key={item.id} className="row">
              <button onClick={() => setItem(item.id, { done: !item.done })} aria-label={item.done ? 'Mark not done' : 'Mark done'} aria-pressed={item.done}>
                <CompletionMark on={item.done} />
              </button>
              <input
                id={`item-${item.id}`}
                value={item.text}
                onChange={e => setItem(item.id, { text: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addItem(item.id))}
                placeholder="Item"
                aria-label="Item"
                className={item.done ? 'strike' : ''}
              />
              <button className="icon-button" aria-label="Remove item" style={{ color: 'var(--danger)' }} onClick={() => patch({ checklistItems: note.checklistItems.filter(i => i.id !== item.id) })}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button className="text-button" style={{ textAlign: 'left' }} onClick={() => addItem()}>+ Add item</button>
        </EditorBox>
      )}

      {note.type === 'classic' && (
        <EditorBox title="Content">
          <RichTextEditor label="Note content" value={note.richTextData} onChange={richTextData => patch({ richTextData })} />
          <p className="help">Select some text first, then tap a style to apply it.</p>
        </EditorBox>
      )}

      {note.type !== 'jot' && (
        <EditorBox title="Links">
          <Field label="Goal (optional)"><GoalSelect value={note.linkedGoalID} onChange={linkedGoalID => patch({ linkedGoalID })} /></Field>
          <Field label="Notebook (optional)">
            <select value={note.notebookID ?? ''} onChange={e => patch({ notebookID: e.target.value || undefined })}>
              <option value="">None</option>
              {sortedNotebooks.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
            </select>
          </Field>
        </EditorBox>
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
