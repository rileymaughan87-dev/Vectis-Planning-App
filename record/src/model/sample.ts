// What a first launch shows in Notes, so it doesn't open empty: one of
// each kind, as they'd arrive from the iPhone app.

import { toISO } from '@suite/dates'
import { newID } from '@suite/ids'
import { base64FromRtf, paragraphsToRtf } from '@suite/record/rtf'
import type { Note } from '@suite/record/types'

export function sampleNotes(): Note[] {
  const now = toISO(new Date())
  const note = (fields: Partial<Note> & Pick<Note, 'type'>): Note => ({
    id: newID(), title: '', jotText: '', checklistItems: [], mathResults: true, updatedDate: now, ...fields,
  })
  const body = (text: string, style: { bold?: boolean; italic?: boolean } = {}) =>
    ({ text, bold: Boolean(style.bold), italic: Boolean(style.italic), heading: false })
  return [
    note({ type: 'jot', jotText: '4 cups flour, 2 eggs, 1 cup sugar' }),
    note({
      type: 'list',
      title: 'Grocery list',
      checklistItems: [
        { id: newID(), text: 'Oat milk', done: true },
        { id: newID(), text: 'Eggs', done: false },
        { id: newID(), text: 'Spinach', done: false },
      ],
    }),
    note({
      type: 'classic',
      title: 'Trip planning',
      richTextData: base64FromRtf(paragraphsToRtf([
        [body('Flights booked for June 14', { bold: true })],
        [body('Need to sort out accommodation still. '), body('Check reviews before booking.', { italic: true })],
      ])),
    }),
  ]
}
