// The rich document behind notes and journal entries, edited by the
// shared editor (ui/NoteEditor). Stored as the editor's own JSON tree,
// wrapped with a format tag and version so it can evolve safely.
//
// Older content — iPhone RTF notes, jots, lists and plain journal text —
// is converted when opened and only replaced when saved, so nothing is
// lost on the way in. Pure functions only: no editor or DOM here.

import { rtfFromBase64, rtfToParagraphs, type Paragraph } from './rtf'
import type { ChecklistItem, JournalEntry, Note } from './types'

/** A node in the editor's JSON tree (ProseMirror/TipTap `JSONContent`). */
export interface DocNode {
  type: string
  attrs?: Record<string, unknown>
  content?: DocNode[]
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  text?: string
}

export const DOC_FORMAT = 'vectis-doc'
export const DOC_VERSION = 1

export interface NoteDoc {
  format: typeof DOC_FORMAT
  version: number
  doc: DocNode
}

export function wrapDoc(doc: DocNode): NoteDoc {
  return { format: DOC_FORMAT, version: DOC_VERSION, doc }
}

/** A saved document, or undefined if the value isn't one. */
export function decodeDoc(v: unknown): NoteDoc | undefined {
  if (typeof v !== 'object' || v === null) return undefined
  const r = v as Record<string, unknown>
  if (r.format !== DOC_FORMAT || !isNode(r.doc) || (r.doc as DocNode).type !== 'doc') return undefined
  return { format: DOC_FORMAT, version: typeof r.version === 'number' ? r.version : 1, doc: r.doc as DocNode }
}

function isNode(v: unknown): v is DocNode {
  return typeof v === 'object' && v !== null && typeof (v as DocNode).type === 'string'
}

// MARK: - Building blocks

const text = (t: string, marks?: DocNode['marks']): DocNode => (marks?.length ? { type: 'text', text: t, marks } : { type: 'text', text: t })
const paragraph = (content: DocNode[] = []): DocNode => (content.length ? { type: 'paragraph', content } : { type: 'paragraph' })
const emptyDoc = (): DocNode => ({ type: 'doc', content: [paragraph()] })

export function textToDoc(plain: string): DocNode {
  if (!plain) return emptyDoc()
  return { type: 'doc', content: plain.split('\n').map(line => paragraph(line ? [text(line)] : [])) }
}

/** The iPhone's RTF paragraphs: bold, italic, and heading-sized lines. */
export function rtfParagraphsToDoc(paragraphs: Paragraph[]): DocNode {
  const content = paragraphs.map(p => {
    const runs = p.filter(r => r.text)
    const nodes = runs.map(r => {
      const marks: NonNullable<DocNode['marks']> = []
      if (r.bold && !r.heading) marks.push({ type: 'bold' })
      if (r.italic) marks.push({ type: 'italic' })
      return text(r.text, marks)
    })
    if (runs.length > 0 && runs.every(r => r.heading)) return { type: 'heading', attrs: { level: 2 }, content: nodes }
    return paragraph(nodes)
  })
  return { type: 'doc', content: content.length ? content : [paragraph()] }
}

export function checklistToDoc(items: ChecklistItem[]): DocNode {
  if (items.length === 0) return { type: 'doc', content: [{ type: 'taskList', content: [taskItem('', false)] }] }
  return { type: 'doc', content: [{ type: 'taskList', content: items.map(i => taskItem(i.text, i.done)) }] }
}

function taskItem(t: string, checked: boolean): DocNode {
  return { type: 'taskItem', attrs: { checked }, content: [paragraph(t ? [text(t)] : [])] }
}

// MARK: - Which document to open

/**
 * A note's document: its saved one if it has one, otherwise built from
 * whatever its type stored before the shared editor existed.
 */
export function noteDoc(note: Note): DocNode {
  if (note.body) return note.body.doc
  switch (note.type) {
    case 'jot': return textToDoc(note.jotText)
    case 'list': return checklistToDoc(note.checklistItems)
    case 'classic': return note.richTextData ? rtfParagraphsToDoc(rtfToParagraphs(rtfFromBase64(note.richTextData))) : emptyDoc()
  }
}

// MARK: - Journal days

export const JOURNAL_HEADING = 'Journal'
export const REVIEW_HEADING = 'Daily review'

const heading = (title: string): DocNode => ({ type: 'heading', attrs: { level: 2 }, content: [text(title)] })
const nodeText = (n: DocNode): string => (n.type === 'text' ? n.text ?? '' : (n.content ?? []).map(nodeText).join(''))
const isSectionHeading = (n: DocNode, title: string) =>
  n.type === 'heading' && (n.attrs?.level ?? 2) === 2 && nodeText(n).trim().toLowerCase() === title.toLowerCase()

/** Where a section's heading is, and where its content ends (the next heading of the same or higher rank). */
function sectionRange(doc: DocNode, title: string): { at: number; end: number } | null {
  const nodes = doc.content ?? []
  const at = nodes.findIndex(n => isSectionHeading(n, title))
  if (at < 0) return null
  let end = at + 1
  while (end < nodes.length && !(nodes[end].type === 'heading' && ((nodes[end].attrs?.level as number) ?? 2) <= 2)) end++
  return { at, end }
}

/**
 * A journal day as one document with two foldable sections, "Journal"
 * and "Daily review". Older days are shaped into it as they open: what
 * they held goes under Journal, except days that only ever held the
 * evening review's answer (the review used to write plain text), which
 * goes under Daily review.
 */
export function dayDoc(entry: JournalEntry | undefined): DocNode {
  if (!entry) return { type: 'doc', content: [heading(JOURNAL_HEADING), paragraph(), heading(REVIEW_HEADING), paragraph()] }
  const reviewOnly = Boolean(entry.reflectionPrompt) && !entry.body && entry.text.trim() !== ''
  if (reviewOnly) {
    return { type: 'doc', content: [heading(JOURNAL_HEADING), paragraph(), heading(REVIEW_HEADING), ...textToDoc(entry.text).content!] }
  }
  // The plain text is the truth when the two disagree (an older review rewrote text only).
  const base = entry.body && docToPlainText(entry.body.doc) === entry.text ? entry.body.doc : textToDoc(entry.text)
  let content = base.content ?? [paragraph()]
  const hasJournal = content.some(n => isSectionHeading(n, JOURNAL_HEADING))
  const hasReview = content.some(n => isSectionHeading(n, REVIEW_HEADING))
  if (hasJournal && hasReview) return base
  if (!hasJournal) content = [heading(JOURNAL_HEADING), ...content]
  if (!hasReview) content = [...content, heading(REVIEW_HEADING), paragraph()]
  return { type: 'doc', content }
}

/** The plain text under one of the day's headings. */
export function sectionText(doc: DocNode, title: string): string {
  const range = sectionRange(doc, title)
  if (!range) return ''
  return docToPlainText({ type: 'doc', content: (doc.content ?? []).slice(range.at + 1, range.end) })
}

/** The day with one section's content replaced by plain text (the evening review's answer). */
export function withSection(doc: DocNode, title: string, plain: string): DocNode {
  const nodes = doc.content ?? []
  const range = sectionRange(doc, title)
  const body = plain.trim() ? textToDoc(plain).content! : [paragraph()]
  if (!range) return { type: 'doc', content: [...nodes, heading(title), ...body] }
  // Keep the heading itself (and whether it's folded).
  return { type: 'doc', content: [...nodes.slice(0, range.at + 1), ...body, ...nodes.slice(range.end)] }
}

// MARK: - Plain text

const BLOCKS = new Set(['paragraph', 'heading', 'codeBlock', 'taskItem', 'listItem', 'blockquote'])

/** The words of a document, one line per block — for previews and search. */
export function docToPlainText(doc: DocNode): string {
  const lines: string[] = []
  const walk = (node: DocNode): string => {
    if (node.type === 'text') return node.text ?? ''
    if (node.type === 'hardBreak') return '\n'
    if (BLOCKS.has(node.type) && node.type !== 'taskItem' && node.type !== 'listItem' && node.type !== 'blockquote') {
      lines.push((node.content ?? []).map(walk).join(''))
      return ''
    }
    for (const child of node.content ?? []) walk(child)
    return ''
  }
  walk(doc)
  return lines.join('\n').replace(/\n+$/, '')
}

export function isDocEmpty(doc: DocNode): boolean {
  if (docToPlainText(doc).trim()) return false
  // A lone checkbox, divider or picture still counts as something.
  const hasStructure = (n: DocNode): boolean =>
    n.type === 'horizontalRule' || n.type === 'taskItem' || n.type === 'attachment' || (n.content ?? []).some(hasStructure)
  return !hasStructure(doc)
}

/** The pictures a document uses (their ids in store/attachments). */
export function attachmentIDs(doc: DocNode): string[] {
  const ids: string[] = []
  const walk = (n: DocNode) => {
    if (n.type === 'attachment' && typeof n.attrs?.id === 'string') ids.push(n.attrs.id)
    for (const child of n.content ?? []) walk(child)
  }
  walk(doc)
  return ids
}

/** Plain text of a note, whichever form its content is in. */
export function notePlainText(note: Note): string {
  return docToPlainText(noteDoc(note))
}
