// A paper's outline, read from and written to the document.
import type { DocNode } from '@suite/record/noteDoc'
import { describe, expect, it } from 'vitest'
import { addSection, ensureSectionIds, isEmptySection, moveSection, outlineOf, removeSection, renameSection } from '../model/outline'

const h = (level: number, t: string, sid: string): DocNode => ({ type: 'heading', attrs: { level, sid }, content: [{ type: 'text', text: t }] })
const p = (t: string): DocNode => ({ type: 'paragraph', content: t ? [{ type: 'text', text: t }] : undefined })
const doc = (...content: DocNode[]): DocNode => ({ type: 'doc', content })

const paper = doc(h(2, 'Intro', 'a'), p('One two three.'), h(2, 'Causes', 'b'), p('Coal.'), h(3, 'Steam', 'c'), p('Engines everywhere.'), h(2, 'End', 'd'), p(''))
const titles = (d: DocNode) => outlineOf(d).map(s => `${s.level}:${s.title}`)

describe('the outline', () => {
  it('reads sections with their words, subsections included', () => {
    expect(outlineOf(paper).map(s => [s.title, s.words])).toEqual([['Intro', 3], ['Causes', 3], ['Steam', 2], ['End', 0]])
  })

  it('gives headings without an id one, and keeps existing ids', () => {
    let n = 0
    const d = ensureSectionIds(doc(h(2, 'Old', ''), { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'New' }] }), () => `id${++n}`)
    expect(outlineOf(d).map(s => s.sid)).toEqual(['id1', 'id2'])
    expect(ensureSectionIds(paper)).toBe(paper)
    // A heading split in two: the second half gets its own id.
    expect(outlineOf(ensureSectionIds(doc(h(2, 'Cau', 'x'), h(2, 'ses', 'x')), () => 'y')).map(s => s.sid)).toEqual(['x', 'y'])
  })

  it('adds a section at the end, or a subheading at the end of its parent', () => {
    expect(titles(addSection(paper, 'Sources', undefined, () => 'e'))).toEqual(['2:Intro', '2:Causes', '3:Steam', '2:End', '2:Sources'])
    expect(titles(addSection(paper, 'Iron', 'b', () => 'f'))).toEqual(['2:Intro', '2:Causes', '3:Steam', '3:Iron', '2:End'])
  })

  it('moves a whole section past its neighbour, subsections with it', () => {
    expect(titles(moveSection(paper, 'b', -1))).toEqual(['2:Causes', '3:Steam', '2:Intro', '2:End'])
    expect(titles(moveSection(paper, 'b', 1))).toEqual(['2:Intro', '2:End', '2:Causes', '3:Steam'])
    expect(moveSection(paper, 'c', -1)).toBe(paper) // the only subsection: nowhere to go
  })

  it('renames, and removes only what is empty', () => {
    expect(titles(renameSection(paper, 'a', 'Introduction'))[0]).toBe('2:Introduction')
    expect(isEmptySection(paper, 'd')).toBe(true)
    expect(isEmptySection(paper, 'b')).toBe(false)
    expect(titles(removeSection(paper, 'd'))).toEqual(['2:Intro', '2:Causes', '3:Steam'])
  })
})
