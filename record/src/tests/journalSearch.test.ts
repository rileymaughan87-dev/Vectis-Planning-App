import { describe, expect, it } from 'vitest'
import { toISO } from '@suite/dates'
import { matchesJournal } from '@suite/record/journalSearch'
import type { JournalEntry } from '@suite/record/types'

// Monday 12 October 2026.
const day = new Date(2026, 9, 12)
const today = new Date(2026, 9, 13, 9)
const entry: JournalEntry = {
  id: 'J', date: toISO(day), text: 'Journal\nLong walk by the river\nDaily review\nSleep helped', reflectionPrompt: 'What worked today?',
}
const finds = (q: string) => matchesJournal(entry, q, today)

describe('journal search', () => {
  it('finds a day by its date in many forms', () => {
    for (const q of ['12 oct', 'October 2026', 'monday', 'mon', '12th', '2026-10-12', '12/10', '10/12', 'yesterday', 'Oct 12, 2026']) {
      expect(finds(q), q).toBe(true)
    }
  })

  it('finds it by what was written in either part', () => {
    expect(finds('river')).toBe(true)
    expect(finds('sleep')).toBe(true)
    expect(finds('october walk')).toBe(true)
  })

  it("doesn't match other days or missing words", () => {
    // "today" isn't found in the review's prompt ("What worked today?"), only by the date.
    // Nor by the headings every day has.
    for (const q of ['13 oct', 'tuesday', 'november', '2025', 'today', 'swim', '1', 'journal', 'daily review']) expect(finds(q), q).toBe(false)
  })
})
