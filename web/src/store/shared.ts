// Shared calendars (Oct 2026): a calendar several people are in — a
// family, a couple — whose events everyone sees and can change, like
// Apple's Family calendar. Each person ticks which shared calendars show
// on their own calendar; untick one and its events disappear for you
// only. That choice is yours and syncs between your devices
// (shared_calendars.json); the calendars themselves are in Firebase
// (sync/sharedCalendars.ts) and need sync turned on.
//
// A shared calendar appears alongside your categories as "shared:{id}",
// so an event goes into it by choosing it as the event's category.

import { create } from 'zustand'
import { list } from '../model/decode'
import type { CalendarCategory, CalendarEvent } from '../model/types'
import { Filename, loadRaw, saveRaw } from './persist'

export interface SharedCalendar {
  id: string
  name: string
  colorHex: string
  /** Members' sign-in ids, and their first names by id. */
  members: string[]
  names: Record<string, string>
}

/** Your own choice for a shared calendar: whether it shows on your calendar. */
export interface MyShared {
  id: string
  shown: boolean
}

/** What the Firebase side offers once connected (sync/sharedCalendars.ts). */
export interface SharedApi {
  uid: string
  name: string
  create(name: string, colorHex: string): Promise<string>
  update(id: string, patch: { name?: string; colorHex?: string }): Promise<void>
  invite(id: string, name: string, colorHex: string): Promise<string>
  inviteInfo(id: string, code: string): Promise<{ name: string; colorHex: string; by: string } | null>
  join(id: string, code: string): Promise<void>
  leave(id: string): Promise<void>
  /** Saves these events to their calendars; `added` are the new ones (they record who added them). */
  write(events: CalendarEvent[], added: Set<string>): void
  remove(events: CalendarEvent[]): void
}

interface SharedState {
  /** Connected: signed in with sync on, and the calendars loaded at least once. */
  live: boolean
  api?: SharedApi
  error?: string
  calendars: SharedCalendar[]
  /** Every shared calendar's events, by calendar. */
  eventsBy: Record<string, CalendarEvent[]>
  mine: MyShared[]
  setShown(id: string, shown: boolean): void
  /** Changes shared events (the same edits as your own) and saves them to their calendars. */
  apply(f: (events: CalendarEvent[]) => CalendarEvent[]): void
}

export const sharedCategoryID = (calendarID: string) => `shared:${calendarID}`
export const isSharedCategory = (categoryID: string) => categoryID.startsWith('shared:')
export const calendarOfCategory = (categoryID: string) => (isSharedCategory(categoryID) ? categoryID.slice(7) : undefined)

export function decodeMyShared(raw: unknown): MyShared[] {
  return list(raw, r => (typeof r.id === 'string' ? { id: r.id, shown: r.shown !== false } : null))
}

const allEvents = (s: Pick<SharedState, 'eventsBy'>) => Object.values(s.eventsBy).flat()

export const useShared = create<SharedState>()((set, get) => ({
  live: false,
  calendars: [],
  eventsBy: {},
  mine: decodeMyShared(loadRaw(Filename.sharedCalendars)),
  setShown: (id, shown) =>
    set(s => ({ mine: s.mine.some(m => m.id === id) ? s.mine.map(m => (m.id === id ? { ...m, shown } : m)) : [...s.mine, { id, shown }] })),
  apply: f => {
    const { api } = get()
    const before = allEvents(get())
    const after = f(before)
    if (after === before) return
    const was = new Map(before.map(e => [e.id, e]))
    const now = new Map(after.map(e => [e.id, e]))
    const changed = after.filter(e => JSON.stringify(e) !== JSON.stringify(was.get(e.id)))
    const added = new Set(after.filter(e => !was.has(e.id)).map(e => e.id))
    const removed = before.filter(e => !now.has(e.id))
    // Shown straight away; the calendar's own copy follows from Firebase.
    const eventsBy: Record<string, CalendarEvent[]> = {}
    for (const id of Object.keys(get().eventsBy)) eventsBy[id] = []
    for (const e of after) if (e.sharedCalendarID) (eventsBy[e.sharedCalendarID] ??= []).push(e)
    set({ eventsBy })
    api?.write(changed, added)
    if (removed.length) api?.remove(removed)
  },
}))

useShared.subscribe((s, p) => {
  if (s.mine !== p.mine) saveRaw(Filename.sharedCalendars, s.mine)
})

/** Whether a shared calendar shows on your calendar (new ones do). */
export const isShown = (mine: MyShared[], id: string) => mine.find(m => m.id === id)?.shown ?? true

/** The shared calendars that show, as categories, and their events. */
export function visibleShared(s: Pick<SharedState, 'calendars' | 'eventsBy' | 'mine'>): { categories: CalendarCategory[]; events: CalendarEvent[] } {
  const shown = s.calendars.filter(c => isShown(s.mine, c.id))
  return {
    categories: shown.map(c => ({ id: sharedCategoryID(c.id), name: c.name, colorHex: c.colorHex })),
    events: shown.flatMap(c => s.eventsBy[c.id] ?? []),
  }
}
