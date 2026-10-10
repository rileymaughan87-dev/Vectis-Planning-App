// Citations for papers (stage 3): in-text citations and reference-list
// entries in APA (7th), MLA (9th) or Harvard, from a research item's
// source details. Kept simple and forgiving — authors are typed freely
// ("Smith, J.", "Jane Smith", "Smith and Jones") and anything missing is
// left out rather than guessed.

import type { DocNode } from '@suite/record/noteDoc'
import type { CitationStyle, ResearchItem, SourceDetails } from './papers'

/** A run of reference text; titles are italic. */
export interface Segment {
  text: string
  italic?: boolean
}

export const REFERENCES_HEADING: Record<CitationStyle, string> = { apa: 'References', mla: 'Works Cited', harvard: 'Reference list' }

/** The people in an author field, as typed. */
function authors(s: SourceDetails): string[] {
  return s.author.split(/\s*(?:;|&|\band\b)\s*/i).map(a => a.trim()).filter(Boolean)
}

/** "Smith, J." → Smith; "Jane Smith" → Smith. */
function surname(name: string): string {
  if (name.includes(',')) return name.split(',')[0].trim()
  const words = name.trim().split(/\s+/)
  return words[words.length - 1]
}

/** Who to name in the text: one or two surnames, or the first and "et al.". */
function inTextAuthors(s: SourceDetails, style: CitationStyle): string {
  const names = authors(s).map(surname)
  if (!names.length) return s.title.trim() ? `“${s.title.trim()}”` : s.url.trim() ? hostOf(s.url) : 'Unknown'
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} ${style === 'apa' ? '&' : 'and'} ${names[1]}`
  return `${names[0]} et al.`
}

const hostOf = (url: string) => url.trim().replace(/^https?:\/\/(www\.)?/, '').split('/')[0]
const withoutScheme = (url: string) => url.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
const pages = (p: string) => (/[-–,]/.test(p) ? 'pp.' : 'p.')

/** The citation in the text: (Smith, 2019, p. 42) · (Smith 42) · (Smith 2019, p. 42). */
export function inText(style: CitationStyle, s: SourceDetails, page = s.page): string {
  const who = inTextAuthors(s, style)
  const year = s.year.trim() || 'n.d.'
  const p = page.trim()
  switch (style) {
    case 'apa': return `(${who}, ${year}${p ? `, ${pages(p)} ${p}` : ''})`
    case 'mla': return `(${who}${p ? ` ${p}` : ''})`
    case 'harvard': return `(${who} ${year}${p ? `, ${pages(p)} ${p}` : ''})`
  }
}

/** All the authors written out for the reference list, as typed but joined the style's way. */
function listAuthors(s: SourceDetails, style: CitationStyle): string {
  const names = authors(s)
  if (names.length <= 1) return names[0] ?? ''
  if (style === 'mla') return names.length === 2 ? `${names[0]}, and ${names[1]}` : `${names[0]}, et al.`
  const joiner = style === 'apa' ? ', & ' : ' and '
  return `${names.slice(0, -1).join(', ')}${joiner}${names[names.length - 1]}`
}

const end = (t: string) => (/[.?!]$/.test(t) ? t : `${t}.`)

/** One entry for the reference list, as text runs (the title in italics). */
export function referenceEntry(style: CitationStyle, s: SourceDetails): Segment[] {
  const who = listAuthors(s, style)
  const year = s.year.trim()
  const title = s.title.trim() || (s.url.trim() ? hostOf(s.url) : 'Untitled')
  const publisher = s.publisher.trim()
  const url = s.url.trim()
  const out: Segment[] = []
  const add = (text: string, italic = false) => text && out.push({ text, italic })

  switch (style) {
    case 'apa':
      // Author. (Year). *Title*. Publisher. URL
      add(who ? `${end(who)} ` : '')
      add(`(${year || 'n.d.'}). `)
      add(end(title), true)
      add(publisher ? ` ${end(publisher)}` : '')
      add(url ? ` ${url}` : '')
      break
    case 'mla':
      // Author. *Title*. Publisher, Year. URL.
      add(who ? `${end(who)} ` : '')
      add(end(title), true)
      add(publisher || year ? ` ${[publisher, year].filter(Boolean).join(', ')}.` : '')
      add(url ? ` ${withoutScheme(url)}.` : '')
      break
    case 'harvard':
      // Author (Year) *Title*. Publisher. Available at: URL.
      add(who ? `${who} ` : '')
      add(`(${year || 'no date'}) `)
      add(end(title), true)
      add(publisher ? ` ${end(publisher)}` : '')
      add(url ? ` Available at: ${url}.` : '')
      break
  }
  return out
}

/** The research items cited in a paper, in the order they're first cited. */
export function citedIDs(doc: DocNode): string[] {
  const ids: string[] = []
  const walk = (n: DocNode) => {
    if (n.type === 'citation') {
      const id = String(n.attrs?.sourceId ?? '')
      if (id && !ids.includes(id)) ids.push(id)
    }
    n.content?.forEach(walk)
  }
  walk(doc)
  return ids
}

/** The reference list: every cited source, alphabetical by its first word (as each style asks). */
export function referenceList(style: CitationStyle, doc: DocNode, research: ResearchItem[]): Segment[][] {
  const cited = citedIDs(doc).map(id => research.find(r => r.id === id)).filter((r): r is ResearchItem => Boolean(r))
  // The same source cited from two items (two quotes from one book) appears once.
  const seen = new Set<string>()
  const entries: Segment[][] = []
  for (const r of cited) {
    const entry = referenceEntry(style, r.source)
    const key = entry.map(s => s.text).join('')
    if (seen.has(key)) continue
    seen.add(key)
    entries.push(entry)
  }
  const sortKey = (e: Segment[]) => e.map(s => s.text).join('').replace(/^[“"(]+/, '').toLowerCase()
  return entries.sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
}
