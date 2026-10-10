// Citations: in-text and reference entries in APA, MLA and Harvard.
import type { DocNode } from '@suite/record/noteDoc'
import { describe, expect, it } from 'vitest'
import { citedIDs, inText, referenceEntry, referenceList } from '../model/citations'
import { EMPTY_SOURCE, type ResearchItem, type SourceDetails } from '../model/papers'

const book: SourceDetails = { ...EMPTY_SOURCE, author: 'Smith, J.', year: '2019', title: 'The Age of Steam', publisher: 'Penguin', page: '42' }
const pair: SourceDetails = { ...EMPTY_SOURCE, author: 'Ann Jones and Bo Lee', year: '2020', title: 'Mills', page: '3-5' }
const web: SourceDetails = { ...EMPTY_SOURCE, title: 'Coal in Britain', url: 'https://www.example.org/coal', year: '' }
const text = (segments: { text: string; italic?: boolean }[]) => segments.map(s => (s.italic ? `*${s.text}*` : s.text)).join('')

describe('citations', () => {
  it('cites in the text in each style', () => {
    expect(inText('apa', book)).toBe('(Smith, 2019, p. 42)')
    expect(inText('mla', book)).toBe('(Smith 42)')
    expect(inText('harvard', book)).toBe('(Smith 2019, p. 42)')
    expect(inText('apa', pair)).toBe('(Jones & Lee, 2020, pp. 3-5)')
    expect(inText('mla', pair)).toBe('(Jones and Lee 3-5)')
    expect(inText('apa', web)).toBe('(“Coal in Britain”, n.d.)')
  })

  it('writes reference entries with the title in italics', () => {
    expect(text(referenceEntry('apa', book))).toBe('Smith, J. (2019). *The Age of Steam.* Penguin.')
    expect(text(referenceEntry('mla', book))).toBe('Smith, J. *The Age of Steam.* Penguin, 2019.')
    expect(text(referenceEntry('harvard', book))).toBe('Smith, J. (2019) *The Age of Steam.* Penguin.')
    expect(text(referenceEntry('apa', pair))).toBe('Ann Jones, & Bo Lee. (2020). *Mills.*')
    expect(text(referenceEntry('mla', web))).toBe('*Coal in Britain.* www.example.org/coal.')
  })

  it('lists each cited source once, alphabetically', () => {
    const item = (id: string, source: SourceDetails): ResearchItem => ({ id, kind: 'quote', text: '', source, createdDate: '' })
    const research = [item('a', book), item('b', pair), item('c', book), item('d', web)]
    const doc: DocNode = { type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'citation', attrs: { sourceId: 'a' } }, { type: 'citation', attrs: { sourceId: 'b' } }, { type: 'citation', attrs: { sourceId: 'c' } },
    ] }] }
    expect(citedIDs(doc)).toEqual(['a', 'b', 'c'])
    expect(referenceList('apa', doc, research).map(e => e[0].text)).toEqual(['Ann Jones, & Bo Lee. ', 'Smith, J. '])
  })
})
