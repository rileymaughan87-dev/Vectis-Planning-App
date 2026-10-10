// Papers (Record, Oct 2026): school papers written on the laptop and read
// or edited on the phone. A paper is a title, the document (the shared
// editor's `NoteDoc`), and its format — font, size, spacing, margins,
// title details — set once and then out of the way while writing.
//
// Saved as papers.json under "vectis:" (web only), synced with Record.

import { toISO, type ISODate } from '@suite/dates'
import { bool, isObj, list, num, oneOf, optNum, optStr, record, str, type Raw } from '@suite/decode'
import { newID } from '@suite/ids'
import { decodeDoc, docToPlainText, textToDoc, wrapDoc, type NoteDoc } from '@suite/record/noteDoc'

export type PaperFont = 'times' | 'georgia' | 'arial' | 'calibri' | 'newsreader' | 'plex'
export type LineSpacing = 1 | 1.15 | 1.5 | 2
export type Margins = 'narrow' | 'normal' | 'wide'
export type CitationStyle = 'apa' | 'mla' | 'harvard'

/** Each font with what to show it in — system fonts the school's Word will also have, and the suite's own. */
export const PAPER_FONTS: { id: PaperFont; label: string; css: string }[] = [
  { id: 'times', label: 'Times New Roman', css: "'Times New Roman', Times, 'Liberation Serif', serif" },
  { id: 'georgia', label: 'Georgia', css: "Georgia, 'Times New Roman', serif" },
  { id: 'arial', label: 'Arial', css: "Arial, 'Helvetica Neue', Helvetica, 'Liberation Sans', sans-serif" },
  { id: 'calibri', label: 'Calibri', css: "Calibri, Carlito, 'Segoe UI', sans-serif" },
  { id: 'newsreader', label: 'Newsreader', css: 'var(--font-serif)' },
  { id: 'plex', label: 'IBM Plex Sans', css: 'var(--font)' },
]

export const MARGINS: Record<Margins, { label: string; inches: number }> = {
  narrow: { label: 'Narrow', inches: 0.5 },
  normal: { label: 'Normal', inches: 1 },
  wide: { label: 'Wide', inches: 1.5 },
}

export interface PaperFormat {
  font: PaperFont
  /** Point size, as in Word. */
  size: number
  lineSpacing: LineSpacing
  margins: Margins
  /** Indent the first line of each paragraph (half an inch). */
  indent: boolean
  pageNumbers: boolean
  citationStyle: CitationStyle
  /** Title details, shown above the paper when any are filled in. */
  name: string
  course: string
  teacher: string
  /** As it should read, e.g. "10 October 2026". */
  date: string
}

/** What a section is for, set in Plan: a note on what it needs to say, and a word target. */
export interface SectionPlan {
  note: string
  target?: number
}

export type ResearchKind = 'quote' | 'link' | 'idea'

/** Where something came from — enough to cite it (stage 3). */
export interface SourceDetails {
  author: string
  title: string
  year: string
  publisher: string
  url: string
  page: string
}

/** One thing kept while researching: a quote, a link or an idea, optionally meant for a section. */
export interface ResearchItem {
  id: string
  kind: ResearchKind
  /** The quote itself, what the link is, or the idea. */
  text: string
  source: SourceDetails
  /** The section (heading `sid`) it's meant for, if chosen. */
  sectionID?: string
  createdDate: ISODate
}

export interface Paper {
  id: string
  title: string
  body?: NoteDoc
  format: PaperFormat
  /** A word target for the whole paper. */
  target?: number
  /** Notes and targets per section, by heading `sid`. */
  plan: Record<string, SectionPlan>
  research: ResearchItem[]
  createdDate: ISODate
  updatedDate: ISODate
}

/** A school paper's usual starting point: Times New Roman, 12 point, double spaced, one-inch margins. */
export const DEFAULT_FORMAT: PaperFormat = {
  font: 'times', size: 12, lineSpacing: 2, margins: 'normal', indent: true, pageNumbers: true, citationStyle: 'apa',
  name: '', course: '', teacher: '', date: '',
}

export function decodeFormat(v: unknown): PaperFormat {
  const r: Raw = isObj(v) ? v : {}
  const d = DEFAULT_FORMAT
  const size = num(r.size, d.size)
  const spacing = num(r.lineSpacing, d.lineSpacing)
  return {
    font: oneOf(r.font, PAPER_FONTS.map(f => f.id), d.font),
    size: Math.min(Math.max(Math.round(size), 8), 24),
    lineSpacing: ([1, 1.15, 1.5, 2] as const).find(x => x === spacing) ?? d.lineSpacing,
    margins: oneOf(r.margins, ['narrow', 'normal', 'wide'] as const, d.margins),
    indent: bool(r.indent, d.indent),
    pageNumbers: bool(r.pageNumbers, d.pageNumbers),
    citationStyle: oneOf(r.citationStyle, ['apa', 'mla', 'harvard'] as const, d.citationStyle),
    name: str(r.name, ''),
    course: str(r.course, ''),
    teacher: str(r.teacher, ''),
    date: str(r.date, ''),
  }
}

export const EMPTY_SOURCE: SourceDetails = { author: '', title: '', year: '', publisher: '', url: '', page: '' }

function decodeSource(v: unknown): SourceDetails {
  const r: Raw = isObj(v) ? v : {}
  return {
    author: str(r.author, ''), title: str(r.title, ''), year: str(r.year, ''), publisher: str(r.publisher, ''), url: str(r.url, ''), page: str(r.page, ''),
  }
}

function decodeResearch(r: Raw): ResearchItem {
  return {
    id: str(r.id, newID()),
    kind: oneOf(r.kind, ['quote', 'link', 'idea'] as const, 'idea'),
    text: str(r.text, ''),
    source: decodeSource(r.source),
    sectionID: optStr(r.sectionID),
    createdDate: str(r.createdDate, toISO(new Date())),
  }
}

function decodePlan(v: unknown): Record<string, SectionPlan> {
  return record(v, x => (isObj(x) ? { note: str(x.note, ''), target: optNum(x.target) } : undefined))
}

function decodePaper(r: Raw): Paper {
  const now = toISO(new Date())
  return {
    id: str(r.id, newID()),
    title: str(r.title, ''),
    body: decodeDoc(r.body),
    format: decodeFormat(r.format),
    target: optNum(r.target),
    plan: decodePlan(r.plan),
    research: list(r.research, decodeResearch),
    createdDate: str(r.createdDate, now),
    updatedDate: str(r.updatedDate, now),
  }
}

/** "Smith, 2020", "Smith", or the link or title — a short label for where something came from. */
export function sourceLabel(s: SourceDetails): string {
  const who = s.author.trim().split(/[,;]| and /)[0]?.trim()
  if (who) return s.year.trim() ? `${who}, ${s.year.trim()}` : who
  if (s.title.trim()) return s.title.trim()
  if (s.url.trim()) return s.url.trim().replace(/^https?:\/\/(www\.)?/, '').split('/')[0]
  return ''
}

export const decodePapers = (v: unknown) => list(v, decodePaper)

/** A new paper, taking its format from the last one you set up (title details and all) — set once, really once. */
export function newPaper(previous?: Paper): Paper {
  const now = toISO(new Date())
  return {
    id: newID(), title: '', body: wrapDoc(textToDoc('')), format: { ...(previous?.format ?? DEFAULT_FORMAT) }, plan: {}, research: [],
    createdDate: now, updatedDate: now,
  }
}

/** Words in a paper's text. */
export function wordCount(text: string): number {
  const words = text.trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)
  return words ? words.length : 0
}

export const paperWords = (p: Paper) => (p.body ? wordCount(docToPlainText(p.body.doc)) : 0)

/** Lines of the title block, in the usual order; empty ones left out. */
export const titleLines = (f: PaperFormat) => [f.name, f.teacher, f.course, f.date].map(s => s.trim()).filter(Boolean)
