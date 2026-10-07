// Reads saved JSON into the model types, filling in a default for any
// field that's missing — the same rule as the iPhone app's hand-written
// Codable. Adding a field later never makes old data unreadable.
//
// An item missing something it genuinely can't do without (an event with
// no start time) is dropped on its own rather than failing the whole file.

import { ALL_DAYS, DISTANT_PAST, toISO } from './dates'
import { newID } from './ids'
import { decodeDoc } from './noteDoc'
import type {
  AppearanceSettings, CalendarCategory, CalendarEvent, CalendarHours, EventPart,
  ChecklistItem, Goal, GoalNote, JournalEntry, Milestone, Note, Notebook, PlanReviewSettings, ScheduleVersion, VectisTask,
} from './types'

type Raw = Record<string, unknown>

const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d)
const optStr = (v: unknown) => (typeof v === 'string' ? v : undefined)
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const optNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
const nums = (v: unknown, d: number[]) => (Array.isArray(v) ? v.filter(x => typeof x === 'number') : d)
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const oneOf = <T extends string>(v: unknown, options: readonly T[], d: T): T =>
  (typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : d)

function record<T>(v: unknown, pick: (x: unknown) => T | undefined): Record<string, T> {
  const out: Record<string, T> = {}
  if (!isObj(v)) return out
  for (const [k, x] of Object.entries(v)) {
    const value = pick(x)
    if (value !== undefined) out[k] = value
  }
  return out
}

export function list<T>(v: unknown, decode: (x: Raw) => T | null): T[] {
  if (!Array.isArray(v)) return []
  return v.flatMap(x => {
    if (!isObj(x)) return []
    const item = decode(x)
    return item ? [item] : []
  })
}

const now = () => toISO(new Date())

export function decodeCategory(r: Raw): CalendarCategory {
  return { id: str(r.id, newID()), name: str(r.name, ''), colorHex: str(r.colorHex, '#999999') }
}

export function decodePart(r: Raw): EventPart {
  return {
    id: str(r.id, newID()),
    title: str(r.title, ''),
    estimatedMinutes: num(r.estimatedMinutes, 30),
    actualMinutes: optNum(r.actualMinutes),
  }
}

export function decodeEvent(r: Raw): CalendarEvent | null {
  const startDate = optStr(r.startDate)
  const endDate = optStr(r.endDate)
  const categoryID = optStr(r.categoryID)
  if (!startDate || !endDate || !categoryID) return null
  return {
    id: str(r.id, newID()),
    title: str(r.title, ''),
    notes: str(r.notes, ''),
    startDate,
    endDate,
    categoryID,
    flowsToDaily: bool(r.flowsToDaily, false),
    isAllDay: bool(r.isAllDay, false),
    recurrence: oneOf(r.recurrence, ['none', 'daily', 'weekly', 'monthly'] as const, 'none'),
    recurrenceEndDate: optStr(r.recurrenceEndDate),
    linkedGoalID: optStr(r.linkedGoalID),
    linkedTaskID: optStr(r.linkedTaskID),
    isCompleted: bool(r.isCompleted, false),
    linkedPersonID: optStr(r.linkedPersonID),
    excludedOccurrences: strs(r.excludedOccurrences),
    origin: oneOf(r.origin, ['daily', 'longTerm'] as const, 'daily'),
    isFlexible: bool(r.isFlexible, false),
    repeatDays: nums(r.repeatDays, ALL_DAYS),
    timeOverrides: record(r.timeOverrides, x => optNum(x)),
    parts: list(r.parts, decodePart),
    estimatedMinutes: optNum(r.estimatedMinutes),
    actualMinutes: optNum(r.actualMinutes),
  }
}

export function decodeMilestone(r: Raw): Milestone {
  return {
    id: str(r.id, newID()),
    title: str(r.title, ''),
    done: bool(r.done, false),
    addToCalendar: bool(r.addToCalendar, false),
    date: optStr(r.date),
  }
}

export function decodeGoalNote(r: Raw): GoalNote {
  return { id: str(r.id, newID()), date: str(r.date, now()), text: str(r.text, '') }
}

export function decodeScheduleVersion(r: Raw): ScheduleVersion {
  return {
    id: str(r.id, newID()),
    effectiveFrom: str(r.effectiveFrom, DISTANT_PAST),
    repeatDays: nums(r.repeatDays, ALL_DAYS),
    startMinutes: num(r.startMinutes, 21 * 60),
    durationMinutes: num(r.durationMinutes, 30),
  }
}

export function decodeGoal(r: Raw): Goal {
  return {
    id: str(r.id, newID()),
    title: str(r.title, ''),
    kind: oneOf(r.kind, ['shortTerm', 'longTerm'] as const, 'shortTerm'),
    frequency: oneOf(r.frequency, ['none', 'daily', 'weekly', 'custom'] as const, 'none'),
    durationMinutes: optNum(r.durationMinutes),
    categoryID: optStr(r.categoryID),
    createdDate: str(r.createdDate, now()),
    completions: record(r.completions, x => (typeof x === 'boolean' ? x : undefined)),
    milestones: list(r.milestones, decodeMilestone),
    notes: list(r.notes, decodeGoalNote),
    linkedToGoalID: optStr(r.linkedToGoalID),
    repeatDays: nums(r.repeatDays, ALL_DAYS),
    scheduledOnCalendar: bool(r.scheduledOnCalendar, false),
    scheduledStartMinutes: num(r.scheduledStartMinutes, 21 * 60),
    scheduledDurationMinutes: num(r.scheduledDurationMinutes, 30),
    isFlexible: bool(r.isFlexible, true),
    endDate: optStr(r.endDate),
    targetDate: optStr(r.targetDate),
    challengeTemplateID: optStr(r.challengeTemplateID),
    challengeStartDate: optStr(r.challengeStartDate),
    challengeStrictMode: bool(r.challengeStrictMode, false),
    challengeAttempt: num(r.challengeAttempt, 1),
    linkedAppScheme: optStr(r.linkedAppScheme),
    linkedAppName: optStr(r.linkedAppName),
    linkedAppID: optStr(r.linkedAppID),
    linkedPersonID: optStr(r.linkedPersonID),
    frequencyType: oneOf(r.frequencyType, ['specificDays', 'timesPerWeek', 'timesPerDay'] as const, 'specificDays'),
    timesPerWeekTarget: num(r.timesPerWeekTarget, 3),
    timesPerDayTarget: num(r.timesPerDayTarget, 2),
    completionCounts: record(r.completionCounts, x => optNum(x)),
    scheduledTimeOverrides: record(r.scheduledTimeOverrides, x => optNum(x)),
    scheduleVersions: list(r.scheduleVersions, decodeScheduleVersion),
    currentScheduleEffectiveFrom: str(r.currentScheduleEffectiveFrom, DISTANT_PAST),
  }
}

export function decodeTask(r: Raw): VectisTask | null {
  if (typeof r.text !== 'string') return null
  return {
    id: str(r.id, newID()),
    text: r.text,
    done: bool(r.done, false),
    createdDate: str(r.createdDate, now()),
    durationMinutes: optNum(r.durationMinutes),
    scheduledDate: optStr(r.scheduledDate),
  }
}

export function decodeJournalEntry(r: Raw): JournalEntry | null {
  if (typeof r.date !== 'string') return null
  return { id: str(r.id, newID()), date: r.date, reflectionPrompt: optStr(r.reflectionPrompt), text: str(r.text, ''), body: decodeDoc(r.body) }
}

export function decodeChecklistItem(r: Raw): ChecklistItem {
  return { id: str(r.id, newID()), text: str(r.text, ''), done: bool(r.done, false) }
}

export function decodeNotebook(r: Raw): Notebook {
  return { id: str(r.id, newID()), title: str(r.title, ''), linkedGoalID: optStr(r.linkedGoalID), createdDate: str(r.createdDate, now()) }
}

export function decodeNote(r: Raw): Note {
  return {
    id: str(r.id, newID()),
    type: oneOf(r.type, ['jot', 'list', 'classic'] as const, 'classic'),
    title: str(r.title, ''),
    jotText: str(r.jotText, ''),
    richTextData: optStr(r.richTextData),
    checklistItems: list(r.checklistItems, decodeChecklistItem),
    body: decodeDoc(r.body),
    linkedGoalID: optStr(r.linkedGoalID),
    notebookID: optStr(r.notebookID),
    updatedDate: str(r.updatedDate, now()),
  }
}

export function decodeHours(v: unknown): CalendarHours {
  const r = isObj(v) ? v : {}
  return { startHour: num(r.startHour, 6), endHour: num(r.endHour, 24) }
}

export function decodeAppearance(v: unknown): AppearanceSettings {
  const r = isObj(v) ? v : {}
  return {
    mode: oneOf(r.mode, ['light', 'dark', 'system'] as const, 'system'),
    selectedPresetID: str(r.selectedPresetID, 'tealCoral'),
    isCustom: bool(r.isCustom, false),
    customPrimaryHex: str(r.customPrimaryHex, '0068B5'),
    customSecondaryHex: str(r.customSecondaryHex, 'D2574A'),
    customTertiaryHex: str(r.customTertiaryHex, 'C9922E'),
  }
}

export function decodePlanReview(v: unknown): PlanReviewSettings {
  const r = isObj(v) ? v : {}
  return {
    isEnabled: bool(r.isEnabled, false),
    reviewTimeEstimates: bool(r.reviewTimeEstimates, true),
    rehearsePlans: bool(r.rehearsePlans, true),
    flagRepeatedMisses: bool(r.flagRepeatedMisses, true),
    freshStartPrompts: bool(r.freshStartPrompts, true),
    eveningReviewMinutes: num(r.eveningReviewMinutes, 20 * 60 + 30),
  }
}
