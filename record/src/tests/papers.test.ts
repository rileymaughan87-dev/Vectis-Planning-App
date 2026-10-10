// Papers: format defaults and reading, new papers, word counts.
import { describe, expect, it } from 'vitest'
import { DEFAULT_FORMAT, bodyWords, decodeFormat, decodePapers, newPaper, wordCount } from '../model/papers'

describe('papers', () => {
  it('starts like a school paper and reads saved formats safely', () => {
    expect(decodeFormat(undefined)).toEqual(DEFAULT_FORMAT)
    const f = decodeFormat({ font: 'arial', size: 99, lineSpacing: 1.5, margins: 'huge', indent: false })
    expect([f.font, f.size, f.lineSpacing, f.margins, f.indent]).toEqual(['arial', 24, 1.5, 'normal', false])
    expect(decodePapers([{ title: 'Essay' }])[0].format.font).toBe('times')
  })

  it('carries the last format (title details included) into a new paper', () => {
    const first = newPaper()
    first.format = { ...first.format, font: 'georgia', name: 'Riley' }
    const second = newPaper(first)
    expect([second.format.font, second.format.name, second.title]).toEqual(['georgia', 'Riley', ''])
    expect(second.format).not.toBe(first.format)
  })

  it('counts words, keeping contractions and hyphens together', () => {
    expect(wordCount("It's a well-known fact — 42 times.")).toBe(6)
    expect(wordCount('   ')).toBe(0)
    const doc = { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Two words' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Three more words' }] }] }
    expect(bodyWords(doc)).toBe(3)
    expect(bodyWords(doc, true)).toBe(5)
  })
})
