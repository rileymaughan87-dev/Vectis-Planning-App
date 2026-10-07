// First-launch content and the fixed defaults, matching the iPhone app.

import { WEEKDAYS_ONLY, addDays, addMonths, atMinutes, dayKey, startOfDay, toISO } from './dates'
import { makeEvent } from './events'
import { makeGoal } from './goals'
import { newID } from './ids'
import { base64FromRtf, paragraphsToRtf } from './rtf'
import type { CalendarCategory, CalendarEvent, Goal, Note } from './types'

/** Fixed ids, so events never lose their category's colour. */
export const DEFAULT_CATEGORIES: CalendarCategory[] = [
  { id: '00000000-0000-0000-0000-00000000C001', name: 'Work', colorHex: '#4A7FE8' },
  { id: '00000000-0000-0000-0000-00000000C002', name: 'Personal', colorHex: '#8E5CC7' },
  { id: '00000000-0000-0000-0000-00000000C003', name: 'School', colorHex: '#C9922E' },
]

export interface PalettePreset {
  id: string
  name: string
  theory: string
  primaryHex: string
  secondaryHex: string
  tertiaryHex: string
}

export const PALETTE_PRESETS: PalettePreset[] = [
  // The ids are what gets saved, so they keep their original names even
  // though the colours are now blue — renaming them would reset saved choices.
  { id: 'tealCoral', name: 'Blue and coral', theory: 'Complementary — blue paired with its warm opposite', primaryHex: '0068B5', secondaryHex: 'D2574A', tertiaryHex: 'C9922E' },
  { id: 'indigoAmber', name: 'Indigo and amber', theory: 'Classic professional pairing, cool and warm balance', primaryHex: '3F51B5', secondaryHex: 'F2A93B', tertiaryHex: '6B7FD7' },
  { id: 'forestClay', name: 'Forest and clay', theory: 'Analogous earth tones, calm and grounded', primaryHex: '3F6B4E', secondaryHex: 'C97B4A', tertiaryHex: '8FA679' },
  { id: 'plumSage', name: 'Plum and sage', theory: 'Muted complementary, sophisticated and quiet', primaryHex: '6B4C7A', secondaryHex: '7C9473', tertiaryHex: 'C99A6B' },
  { id: 'monoTeal', name: 'Monochrome blue', theory: "Single hue at three depths — minimal, can't clash", primaryHex: '0068B5', secondaryHex: '66A4D3', tertiaryHex: '004679' },
]

export function sampleGoals(): Goal[] {
  const today = startOfDay(new Date())

  const read = makeGoal('Read for 30 min', {
    frequency: 'daily',
    endDate: toISO(addMonths(today, 2)),
    createdDate: toISO(addDays(today, -6)),
  })
  for (let offset = 1; offset <= 6; offset++) {
    const d = addDays(today, -offset)
    read.completions[dayKey(d)] = offset % 3 !== 0
  }

  const degree = makeGoal('Finish degree', {
    kind: 'longTerm',
    targetDate: toISO(new Date(2027, 7, 1)),
    milestones: [
      { id: newID(), title: 'Submit thesis proposal', done: true, addToCalendar: true, date: toISO(addDays(today, -10)) },
      { id: newID(), title: 'Pass finals', done: false, addToCalendar: true, date: toISO(addDays(today, -2)) },
      { id: newID(), title: 'Graduation ceremony', done: false, addToCalendar: true, date: toISO(addDays(today, 90)) },
    ],
  })

  const study = makeGoal('Study 1 hour', {
    frequency: 'daily',
    linkedToGoalID: degree.id,
    repeatDays: [...WEEKDAYS_ONLY],
  })

  const health = makeGoal('Eat healthier', {
    kind: 'longTerm',
    notes: [
      { id: newID(), date: toISO(addDays(today, -6)), text: 'Started meal prepping' },
      { id: newID(), date: toISO(addDays(today, -1)), text: 'Cut out soda' },
    ],
  })

  return [read, degree, study, health]
}

export function sampleEvents(categories: CalendarCategory[]): CalendarEvent[] {
  const today = new Date()
  const at = (h: number, m = 0) => toISO(atMinutes(today, h * 60 + m))
  const id = (name: string) => categories.find(c => c.name === name)?.id ?? categories[0].id
  return [
    makeEvent({ title: 'Team standup', startDate: at(9), endDate: at(9, 30), categoryID: id('Work'), flowsToDaily: true }),
    makeEvent({ title: 'Lecture: Systems', startDate: at(10), endDate: at(11, 30), categoryID: id('School'), flowsToDaily: true }),
    makeEvent({ title: 'Study group', startDate: at(10, 30), endDate: at(11, 45), categoryID: id('School'), flowsToDaily: true }),
    makeEvent({ title: 'Lunch', startDate: at(12), endDate: at(13), categoryID: id('Personal'), flowsToDaily: true }),
  ]
}


export function sampleNotes(): Note[] {
  const now = toISO(new Date())
  const note = (fields: Partial<Note> & Pick<Note, 'type'>): Note => ({
    id: newID(), title: '', jotText: '', checklistItems: [], updatedDate: now, ...fields,
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
