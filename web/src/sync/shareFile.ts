// The file an accountability partner reads: goals and calendar only.
// Journal, notes and people never leave the device, and per-goal links
// to people and apps are stripped. Versioned so the format can grow.

import { toISO } from '../model/dates'
import { decodeCategory, decodeEvent, decodeGoal, decodeHours, decodeTask, list } from '../model/decode'
import type { CalendarCategory, CalendarEvent, CalendarHours, Goal, VectisTask } from '../model/types'
import type { DataState } from '../store/data'

export const SHARE_FORMAT = 'vectis-share'
export const SHARE_VERSION = 1

export interface ShareSnapshot {
  format: typeof SHARE_FORMAT
  version: number
  ownerName: string
  publishedAt: string
  goals: Goal[]
  events: CalendarEvent[]
  categories: CalendarCategory[]
  hours: CalendarHours
  /** Only tasks placed on the calendar — they're part of the day's plan. */
  tasks: VectisTask[]
}

export function buildSnapshot(data: DataState, ownerName: string): ShareSnapshot {
  return {
    format: SHARE_FORMAT,
    version: SHARE_VERSION,
    ownerName: ownerName.trim() || 'Your partner',
    publishedAt: toISO(new Date()),
    goals: data.goals.map(g => ({
      ...g,
      linkedPersonID: undefined,
      linkedAppScheme: undefined,
      linkedAppName: undefined,
      linkedAppID: undefined,
    })),
    events: data.events.map(e => ({ ...e, notes: '', linkedPersonID: undefined })),
    categories: data.categories,
    hours: data.hours,
    tasks: data.tasks.filter(t => t.scheduledDate),
  }
}

/** Reads a share file, or throws with a message worth showing. */
export function parseSnapshot(raw: unknown): ShareSnapshot {
  if (typeof raw !== 'object' || raw === null || (raw as { format?: unknown }).format !== SHARE_FORMAT) {
    throw new Error("That file isn't a Planner share file.")
  }
  const r = raw as Record<string, unknown>
  return {
    format: SHARE_FORMAT,
    version: typeof r.version === 'number' ? r.version : 1,
    ownerName: typeof r.ownerName === 'string' ? r.ownerName : 'Your partner',
    publishedAt: typeof r.publishedAt === 'string' ? r.publishedAt : toISO(new Date(0)),
    goals: list(r.goals, decodeGoal),
    events: list(r.events, decodeEvent),
    categories: list(r.categories, decodeCategory),
    hours: decodeHours(r.hours),
    tasks: list(r.tasks, decodeTask),
  }
}
