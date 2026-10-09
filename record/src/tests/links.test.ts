// Links between the apps: Record's addresses, and notes counted per goal.
import { recordGoalLink, recordJournalLink, notesPerGoal, parseRecordLink } from '@suite/links'
import type { Note, Notebook } from '@suite/record/types'
import { describe, expect, it } from 'vitest'

const note = (id: string, fields: Partial<Note> = {}): Note => ({
  id, type: 'classic', title: id, jotText: '', checklistItems: [], mathResults: true, updatedDate: '', ...fields,
})

describe('links between the apps', () => {
  it('round-trips a journal day and a goal', () => {
    const link = parseRecordLink(recordJournalLink(new Date(2026, 9, 10)).split('#')[1])
    expect(link?.kind === 'journal' && link.date.getDate()).toBe(10)
    expect(parseRecordLink(recordGoalLink('a/b').split('#')[1])).toEqual({ kind: 'goal', goalID: 'a/b' })
    expect(parseRecordLink('#partner=x')).toBeNull()
    expect(parseRecordLink('#journal=soon')).toBeNull()
  })

  it('counts notes linked to a goal, directly or through their notebook', () => {
    const books: Notebook[] = [{ id: 'B', title: 'Course', linkedGoalID: 'G', createdDate: '' }]
    const counts = notesPerGoal([note('1', { linkedGoalID: 'G' }), note('2', { notebookID: 'B' }), note('3'), note('4', { linkedGoalID: 'H' })], books)
    expect(counts.get('G')).toBe(2)
    expect(counts.get('H')).toBe(1)
  })
})
