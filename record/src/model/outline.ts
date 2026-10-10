// A paper's outline (Papers stage 2): its headings, read from and written
// to the document itself, so Plan and Write can never disagree. Each
// heading carries a hidden id (`sid`), so a section's note, word target and
// linked research follow it when it's renamed or moved.
//
// Pure functions over the editor's JSON document.

import { newID } from '@suite/ids'
import type { DocNode } from '@suite/record/noteDoc'
import { wordCount } from './papers'

export interface Section {
  sid: string
  level: number
  title: string
  /** Index of the heading among the document's top-level blocks. */
  index: number
  /** Where its section ends (exclusive): the next heading of the same or a higher rank. */
  end: number
  /** Words written under it (subsections included), heading not counted. */
  words: number
}

const blocks = (doc: DocNode) => doc.content ?? []
const isHeading = (n: DocNode) => n.type === 'heading'
const levelOf = (n: DocNode) => Number(n.attrs?.level ?? 2)

function text(node: DocNode): string {
  if (node.type === 'text') return node.text ?? ''
  return (node.content ?? []).map(text).join(node.type === 'doc' ? '\n' : ' ')
}

/**
 * Every heading gets an id it keeps from now on (older or newly typed
 * ones get one here). A heading split in two copies its id, so a repeat
 * gets a new one; the first keeps it, with its plan and research.
 */
export function ensureSectionIds(doc: DocNode, makeID: () => string = newID): DocNode {
  let changed = false
  const seen = new Set<string>()
  const content = blocks(doc).map(n => {
    if (!isHeading(n)) return n
    const sid = n.attrs?.sid as string | undefined
    if (sid && !seen.has(sid)) {
      seen.add(sid)
      return n
    }
    changed = true
    const fresh = makeID()
    seen.add(fresh)
    return { ...n, attrs: { ...n.attrs, sid: fresh } }
  })
  return changed ? { ...doc, content } : doc
}

function sectionEnd(content: DocNode[], index: number, level: number): number {
  for (let i = index + 1; i < content.length; i++) if (isHeading(content[i]) && levelOf(content[i]) <= level) return i
  return content.length
}

/** The outline: each heading with its place, its end and its words. */
export function outlineOf(doc: DocNode): Section[] {
  const content = blocks(doc)
  const out: Section[] = []
  content.forEach((n, index) => {
    if (!isHeading(n)) return
    const level = levelOf(n)
    const end = sectionEnd(content, index, level)
    const body = content.slice(index + 1, end).filter(b => !isHeading(b)).map(text).join(' ')
    out.push({ sid: String(n.attrs?.sid ?? ''), level, title: text(n).trim(), index, end, words: wordCount(body) })
  })
  return out
}

const heading = (title: string, level: number, sid: string): DocNode =>
  ({ type: 'heading', attrs: { level, sid }, content: title ? [{ type: 'text', text: title }] : undefined })
const emptyParagraph = (): DocNode => ({ type: 'paragraph' })

/**
 * Adds a section: at the end of the paper, or — given a parent — as a
 * subheading at the end of that section. An empty line follows, ready to
 * write in.
 */
export function addSection(doc: DocNode, title: string, parentSid?: string, makeID: () => string = newID): DocNode {
  const content = [...blocks(doc)]
  const parent = parentSid ? outlineOf(doc).find(s => s.sid === parentSid) : undefined
  const level = parent ? Math.min(parent.level + 1, 3) : 2
  const at = parent ? parent.end : content.length
  content.splice(at, 0, heading(title.trim(), level, makeID()), emptyParagraph())
  return { ...doc, content }
}

export function renameSection(doc: DocNode, sid: string, title: string): DocNode {
  const content = blocks(doc).map(n => (isHeading(n) && n.attrs?.sid === sid
    ? { ...n, content: title ? [{ type: 'text', text: title }] : undefined }
    : n))
  return { ...doc, content }
}

/** Moves a section (and everything under it) above or below its neighbour at the same level. */
export function moveSection(doc: DocNode, sid: string, direction: -1 | 1): DocNode {
  const content = blocks(doc)
  const outline = outlineOf(doc)
  const me = outline.find(s => s.sid === sid)
  if (!me) return doc
  // Siblings: same level, same parent (no higher-ranked heading in between).
  const siblings = outline.filter(s => s.level === me.level && !outline.some(o => o.level < me.level && between(o.index, s.index, me.index)))
  const at = siblings.findIndex(s => s.sid === sid)
  const other = siblings[at + direction]
  if (!other) return doc
  const [first, second] = direction === -1 ? [other, me] : [me, other]
  const next = [
    ...content.slice(0, first.index),
    ...content.slice(second.index, second.end),
    ...content.slice(first.index, second.index),
    ...content.slice(second.end),
  ]
  return { ...doc, content: next }
}

const between = (x: number, a: number, b: number) => x > Math.min(a, b) && x < Math.max(a, b)

/** Removes a heading and the section under it — only offered when nothing's been written there. */
export function removeSection(doc: DocNode, sid: string): DocNode {
  const me = outlineOf(doc).find(s => s.sid === sid)
  if (!me) return doc
  const content = blocks(doc)
  return { ...doc, content: [...content.slice(0, me.index), ...content.slice(me.end)] }
}

/** True when a section has no writing of its own and no subsections. */
export function isEmptySection(doc: DocNode, sid: string): boolean {
  const me = outlineOf(doc).find(s => s.sid === sid)
  if (!me) return false
  return blocks(doc).slice(me.index + 1, me.end).every(n => !isHeading(n) && !text(n).trim())
}
