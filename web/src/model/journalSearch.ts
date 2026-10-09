// Searching the journal by words or by date: "walk", "12 Oct", "october
// 2026", "monday", "12th", "2026-10-12", "12/10" or "yesterday" all find
// their days. Every word typed has to match, either the day's date or
// what was written that day.

import { addDays, dayKey, isSameDay, parseDate, startOfDay } from './dates'
import { JOURNAL_HEADING, REVIEW_HEADING } from './noteDoc'
import type { JournalEntry } from './types'

/** Words a day can be found by: names of the weekday and month, numbers, and ISO and slashed forms. */
export function dateWords(date: Date, today: Date = new Date()): string[] {
  const words = new Set<string>()
  const add = (s: string) => {
    for (const w of s.toLowerCase().split(/[\s,.]+/)) if (w) words.add(w)
  }
  add(date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))
  add(date.toLocaleDateString(undefined, { weekday: 'short', month: 'short' }))
  const d = date.getDate()
  const m = date.getMonth() + 1
  words.add(String(d))
  words.add(String(date.getFullYear()))
  words.add(dayKey(date))
  // Both orders, since 12/10 means different days in different places; either way it narrows things down.
  for (const s of [`${d}/${m}`, `${m}/${d}`, `${d}/${m}/${date.getFullYear()}`, `${m}/${d}/${date.getFullYear()}`]) words.add(s)
  const t = startOfDay(today)
  if (isSameDay(date, t)) words.add('today')
  if (isSameDay(date, addDays(t, -1))) words.add('yesterday')
  return [...words]
}

/** The words of a query, with "12th" read as 12. */
export function queryWords(query: string): string[] {
  return query.toLowerCase().split(/[\s,]+/).filter(Boolean).map(w => w.replace(/^(\d+)(st|nd|rd|th)$/, '$1'))
}

export function matchesJournal(entry: JournalEntry, query: string, today: Date = new Date()): boolean {
  const words = queryWords(query)
  if (!words.length) return true
  const date = dateWords(parseDate(entry.date), today)
  // What was written — not the "Journal" / "Daily review" headings every day has,
  // nor the review's prompt (always one of the same two questions).
  const headings = new Set([JOURNAL_HEADING.toLowerCase(), REVIEW_HEADING.toLowerCase()])
  const content = entry.text.split('\n').filter(l => !headings.has(l.trim().toLowerCase())).join('\n').toLowerCase()
  return words.every(w => {
    // Numbers match a date exactly (12 isn't the 1st–2nd); words can be the start of a name ("oct", "mon").
    const onDate = /^\d+$/.test(w) ? date.includes(w) : date.some(d => d.startsWith(w))
    return onDate || content.includes(w)
  })
}
