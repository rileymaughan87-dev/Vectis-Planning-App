// First-launch content and the fixed defaults, matching the iPhone app.

import { WEEKDAYS_ONLY, addDays, addMonths, atMinutes, dayKey, startOfDay, toISO } from './dates'
import { makeEvent } from './events'
import { makeGoal } from './goals'
import { newID } from './ids'
import type { CalendarCategory, CalendarEvent, Goal } from './types'

/** Fixed ids, so events never lose their category's colour. */
export const DEFAULT_CATEGORIES: CalendarCategory[] = [
  { id: '00000000-0000-0000-0000-00000000C001', name: 'Work', colorHex: '#4A7FE8' },
  { id: '00000000-0000-0000-0000-00000000C002', name: 'Personal', colorHex: '#8E5CC7' },
  { id: '00000000-0000-0000-0000-00000000C003', name: 'School', colorHex: '#C9922E' },
]

export { PALETTE_PRESETS, type PalettePreset } from '@suite/appearance'

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
