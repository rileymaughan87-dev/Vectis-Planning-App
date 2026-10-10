// The Word export: a real .docx with the paper's format, headings,
// citations and reference list. (Pictures need the browser's store, so
// they're left to the browser check.)
import type { DocNode } from '@suite/record/noteDoc'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { paperToDocx } from '../export/paperDocx'
import { inText } from '../model/citations'
import { DEFAULT_FORMAT, EMPTY_SOURCE, type Paper } from '../model/papers'

const doc: DocNode = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2, sid: 'a' }, content: [{ type: 'text', text: 'Introduction' }] },
    {
      type: 'paragraph', attrs: { textAlign: 'justify' },
      content: [
        { type: 'text', text: 'Steam ', marks: [{ type: 'bold' }] },
        { type: 'text', text: 'changed everything ' },
        { type: 'citation', attrs: { sourceId: 'q', page: '' } },
      ],
    },
  ],
}

const paper: Paper = {
  id: 'p', title: 'The Age of Steam', body: undefined, plan: {}, research: [
    { id: 'q', kind: 'quote', text: 'x', source: { ...EMPTY_SOURCE, author: 'Smith, J.', year: '2019', title: 'Steam', page: '42' }, createdDate: '' },
  ],
  format: { ...DEFAULT_FORMAT, font: 'georgia', size: 12, lineSpacing: 2, name: 'Riley Maughan', citationStyle: 'apa' },
  createdDate: '', updatedDate: '',
}

describe('the Word export', () => {
  it('writes the paper with its format, citations and references', async () => {
    const blob = await paperToDocx(paper, doc, a => inText('apa', paper.research[0].source, a.page || '42'))
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const xml = await zip.file('word/document.xml')!.async('string')
    const styles = await zip.file('word/styles.xml')!.async('string')
    expect(xml).toContain('Riley Maughan')
    expect(xml).toContain('The Age of Steam')
    // Headings are guides: left out of the finished paper by default.
    expect(xml).not.toContain('Introduction')
    // APA: the title page, then the writing and the references each start a new page.
    expect(xml.match(/w:pageBreakBefore/g)?.length).toBe(2)
    expect(xml).toContain('(Smith, 2019, p. 42)')
    expect(xml).toContain('w:jc w:val="both"') // justified
    expect(xml).toContain('<w:b/>') // bold
    expect(xml).toContain('References')
    expect(xml).toContain('w:hanging="720"')
    expect(styles).toContain('Georgia')
    expect(styles).toContain('w:line="480"') // double spacing
  })

  it('keeps headings when the paper includes them', async () => {
    const withHeadings = { ...paper, format: { ...paper.format, includeHeadings: true } }
    const blob = await paperToDocx(withHeadings, doc, () => '(Smith, 2019)')
    const xml = await (await JSZip.loadAsync(await blob.arrayBuffer())).file('word/document.xml')!.async('string')
    expect(xml).toContain('Introduction')
    expect(xml).toContain('Heading2')
  })
})
