// Notes opened from older content (iPhone RTF, jots, lists), moved from
// Planner's model tests when Record became its own app.

import { startOfDay, toISO } from '@suite/dates'
import { describe, expect, it } from 'vitest'

const today = startOfDay(new Date(2026, 9, 5))

describe('classic note RTF', () => {
  // What Cocoa writes for the iPhone's sample "Trip planning" note.
  const cocoa = String.raw`{\rtf1\ansi\ansicpg1252\cocoartf2761
\cocoatextscaling0\cocoaplatform1{\fonttbl\f0\fswiss\fcharset0 Helvetica-Bold;\f1\fswiss\fcharset0 Helvetica;\f2\fswiss\fcharset0 Helvetica-Oblique;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\deftab720
\pard\pardeftab720\partightenfactor0

\f0\b\fs32 \cf0 Flights booked for June 14\
\f1\b0 Need to sort out accommodation still. 
\f2\i Check reviews before booking. Caf\'e9 \uc0\u8212  done}`

  it('reads Cocoa RTF, including fonts that carry bold and italic', async () => {
    const { rtfToParagraphs, paragraphsToText } = await import('@suite/record/rtf')
    const paras = rtfToParagraphs(cocoa)
    expect(paragraphsToText(paras)).toBe('Flights booked for June 14\nNeed to sort out accommodation still. Check reviews before booking. Café — done')
    expect(paras[0][0]).toMatchObject({ bold: true, italic: false })
    expect(paras[1].find(r => r.text.startsWith('Check'))).toMatchObject({ italic: true, bold: false })
  })

  it('round-trips styles, headings, escapes and non-ASCII', async () => {
    const { rtfToParagraphs, paragraphsToRtf, base64FromRtf, rtfFromBase64 } = await import('@suite/record/rtf')
    const original = [
      [{ text: 'Plan', bold: true, italic: false, heading: true }],
      [{ text: 'Mix ', bold: false, italic: false, heading: false }, { text: 'bold', bold: true, italic: false, heading: false }, { text: ' and {braces} \ 😀 é', bold: false, italic: true, heading: false }],
      [],
      [{ text: 'End', bold: false, italic: false, heading: false }],
    ]
    const rtf = rtfFromBase64(base64FromRtf(paragraphsToRtf(original)))
    const back = rtfToParagraphs(rtf)
    expect(back).toEqual(original.map(p => p.map(r => (r.heading ? { ...r, bold: true } : r))))
  })
})

describe('note documents', () => {
  it('opens old notes of every type without losing content', async () => {
    const { noteDoc, docToPlainText } = await import('@suite/record/noteDoc')
    const { base64FromRtf, paragraphsToRtf } = await import('@suite/record/rtf')
    const base = { id: 'N', title: '', jotText: '', checklistItems: [], mathResults: true, updatedDate: toISO(today) }
    const jot = noteDoc({ ...base, type: 'jot', jotText: 'line one\nline two' })
    expect(docToPlainText(jot)).toBe('line one\nline two')

    const list = noteDoc({ ...base, type: 'list', checklistItems: [{ id: 'a', text: 'Eggs', done: true }, { id: 'b', text: 'Milk', done: false }] })
    expect(list.content?.[0].type).toBe('taskList')
    expect(list.content?.[0].content?.map(i => i.attrs?.checked)).toEqual([true, false])
    expect(docToPlainText(list)).toBe('Eggs\nMilk')

    const rtf = base64FromRtf(paragraphsToRtf([
      [{ text: 'Plan', bold: true, italic: false, heading: true }],
      [{ text: 'Book ', bold: false, italic: false, heading: false }, { text: 'hotel', bold: true, italic: true, heading: false }],
    ]))
    const classic = noteDoc({ ...base, type: 'classic', richTextData: rtf })
    expect(classic.content?.[0]).toMatchObject({ type: 'heading', attrs: { level: 2 } })
    expect(classic.content?.[1].content?.[1]).toEqual({ type: 'text', text: 'hotel', marks: [{ type: 'bold' }, { type: 'italic' }] })
    expect(docToPlainText(classic)).toBe('Plan\nBook hotel')
  })

  it('prefers the saved document, and plain text when the two disagree', async () => {
    const { noteDoc, textToDoc, wrapDoc, decodeDoc } = await import('@suite/record/noteDoc')
    const doc = textToDoc('Saved version')
    expect(noteDoc({ id: 'N', type: 'jot', title: '', jotText: 'old', checklistItems: [], mathResults: true, updatedDate: '', body: wrapDoc(doc) })).toBe(doc)
    expect(decodeDoc({ format: 'something-else', doc })).toBeUndefined()
    expect(decodeDoc(JSON.parse(JSON.stringify(wrapDoc(doc))))?.doc).toEqual(doc)
  })
})
