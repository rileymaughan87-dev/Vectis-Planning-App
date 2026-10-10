// The finished paper in each style: title page or MLA header, headings left out, references apart.
import type { DocNode } from '@suite/record/noteDoc'
import { describe, expect, it } from 'vitest'
import { finished } from '../model/layout'
import { DEFAULT_FORMAT, EMPTY_SOURCE, type Paper, type PaperFormat } from '../model/papers'

const doc: DocNode = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Introduction' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Steam.' }, { type: 'citation', attrs: { sourceId: 'q' } }] },
  ],
}
const paper = (f: Partial<PaperFormat>): Paper => ({
  id: 'p', title: 'The Age of Steam', plan: {}, createdDate: '', updatedDate: '',
  research: [{ id: 'q', kind: 'quote', text: '', source: { ...EMPTY_SOURCE, author: 'Smith, J.', year: '2019', title: 'Steam' }, createdDate: '' }],
  format: { ...DEFAULT_FORMAT, name: 'Riley Maughan', course: 'HIST 101', teacher: 'Dr Lee', institution: 'BYU', date: '10 October 2026', ...f },
})

describe('the finished paper', () => {
  it('APA: a title page, the title again above the writing, headings left out', () => {
    const p = finished(paper({ citationStyle: 'apa' }), doc)
    expect(p.titlePage).toEqual({ title: 'The Age of Steam', lines: ['Riley Maughan', 'BYU', 'HIST 101', 'Dr Lee', '10 October 2026'] })
    expect(p.bodyTitle).toEqual({ text: 'The Age of Steam', bold: true })
    expect(p.body.map(n => n.type)).toEqual(['paragraph'])
    expect(p.references?.heading).toBe('References')
    expect(p.runningHead).toBe('')
  })

  it('MLA: the header block and a plain title, surname in the running head', () => {
    const p = finished(paper({ citationStyle: 'mla' }), doc)
    expect(p.titlePage).toBeUndefined()
    expect(p.header).toEqual(['Riley Maughan', 'Dr Lee', 'HIST 101', '10 October 2026'])
    expect(p.bodyTitle).toEqual({ text: 'The Age of Steam', bold: false })
    expect(p.references).toMatchObject({ heading: 'Works Cited', bold: false, align: 'center' })
    expect(p.runningHead).toBe('Maughan')
  })

  it('Harvard: a title page, no repeated title; headings kept when asked', () => {
    const p = finished(paper({ citationStyle: 'harvard', includeHeadings: true }), doc)
    expect(p.titlePage?.title).toBe('The Age of Steam')
    expect(p.bodyTitle).toBeUndefined()
    expect(p.body.map(n => n.type)).toEqual(['heading', 'paragraph'])
    expect(p.references).toMatchObject({ heading: 'Reference list', align: 'left' })
  })
})
