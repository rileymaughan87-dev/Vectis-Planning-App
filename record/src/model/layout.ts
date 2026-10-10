// What the finished paper looks like, in each citation style — one answer
// shared by the preview, printing and the Word export, so they can't
// disagree.
//
//   APA (7th, student)  a title page; the paper starts on a new page with
//                       its title (bold, centred); References on its own page.
//   MLA (9th)           no title page: name, instructor, course and date
//                       top left, then the title centred; "Surname 1" in the
//                       page header; Works Cited on its own page.
//   Harvard             a title page; the paper on a new page; the Reference
//                       list on its own page.
//
// Headings are guides while writing: they're left out unless the paper's
// format includes them.

import type { DocNode } from '@suite/record/noteDoc'
import { REFERENCES_HEADING, referenceList, type Segment } from './citations'
import type { Paper } from './papers'

export interface Finished {
  /** A title page: the title, then the details beneath it (blank ones left out). */
  titlePage?: { title: string; lines: string[] }
  /** MLA's block at the top left of the first page. */
  header?: string[]
  /** The title at the top of the first page of writing. */
  bodyTitle?: { text: string; bold: boolean }
  /** The writing, headings left out unless included. */
  body: DocNode[]
  references?: { heading: string; entries: Segment[][]; align: 'center' | 'left'; bold: boolean }
  /** What goes before the page number in the page header (MLA: the surname). */
  runningHead: string
}

const filled = (lines: string[]) => lines.map(l => l.trim()).filter(Boolean)

export const hasTitlePage = (style: Paper['format']['citationStyle']) => style !== 'mla'

export function finished(paper: Paper, doc: DocNode): Finished {
  const f = paper.format
  const style = f.citationStyle
  const title = paper.title.trim()
  const body = (doc.content ?? []).filter(n => f.includeHeadings || n.type !== 'heading')
  const entries = referenceList(style, doc, paper.research)
  const references = entries.length
    ? { heading: REFERENCES_HEADING[style], entries, align: style === 'harvard' ? 'left' as const : 'center' as const, bold: style !== 'mla' }
    : undefined
  const surname = f.name.trim().split(/\s+/).at(-1) ?? ''
  // A blank date means today's, as its placeholder says.
  const date = f.date.trim() || new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

  if (style === 'mla') {
    return {
      header: filled([f.name, f.teacher, f.course, date]),
      bodyTitle: title ? { text: title, bold: false } : undefined,
      body,
      references,
      runningHead: surname,
    }
  }
  return {
    titlePage: { title, lines: filled([f.name, f.institution, f.course, f.teacher, date]) },
    // APA repeats the title above the writing; Harvard's title page is enough.
    bodyTitle: style === 'apa' && title ? { text: title, bold: true } : undefined,
    body,
    references,
    runningHead: '',
  }
}
