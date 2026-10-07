// The saved data, shaped exactly like the iPhone app's JSON files so the
// two can read each other's data. Dates are ISO 8601 strings (Swift's
// `.iso8601` strategy), weekday sets are arrays of 1 = Sunday … 7 =
// Saturday, and day keys are "yyyy-MM-dd" in local time.

import type { NoteDoc } from './noteDoc'

export type ID = string
export type ISODate = string

export interface CalendarCategory {
  id: ID
  name: string
  colorHex: string
}

export type EventRecurrence = 'none' | 'daily' | 'weekly' | 'monthly'
export type EventOrigin = 'daily' | 'longTerm'

/** One piece of a segmented event. */
export interface EventPart {
  id: ID
  title: string
  estimatedMinutes: number
  actualMinutes?: number
}

export interface CalendarEvent {
  id: ID
  title: string
  notes: string
  startDate: ISODate
  endDate: ISODate
  categoryID: ID
  /** Whether this also gets a slot on the Daily grid. */
  flowsToDaily: boolean
  isAllDay: boolean
  recurrence: EventRecurrence
  recurrenceEndDate?: ISODate
  linkedGoalID?: ID
  linkedTaskID?: ID
  isCompleted: boolean
  linkedPersonID?: ID
  /** Day keys skipped for a repeating event ("delete just this one"). */
  excludedOccurrences: string[]
  /** Which screen it was made on — decides whether Long-Term shows it. */
  origin: EventOrigin
  isFlexible: boolean
  /** Weekdays a `daily` repeat lands on. */
  repeatDays: number[]
  /** Per-day start time (minutes from midnight) for one moved occurrence. */
  timeOverrides: Record<string, number>
  parts: EventPart[]
  /** The plan's duration, frozen the first time an actual is logged. */
  estimatedMinutes?: number
  actualMinutes?: number
}

export interface Milestone {
  id: ID
  title: string
  done: boolean
  addToCalendar: boolean
  date?: ISODate
}

export interface GoalNote {
  id: ID
  date: ISODate
  text: string
}

/** One superseded snapshot of a goal's schedule. */
export interface ScheduleVersion {
  id: ID
  effectiveFrom: ISODate
  repeatDays: number[]
  startMinutes: number
  durationMinutes: number
}

export type GoalKind = 'shortTerm' | 'longTerm'
export type RecurrenceFrequency = 'none' | 'daily' | 'weekly' | 'custom'
export type GoalFrequencyType = 'specificDays' | 'timesPerWeek' | 'timesPerDay'

export interface Goal {
  id: ID
  title: string
  kind: GoalKind
  frequency: RecurrenceFrequency
  durationMinutes?: number
  categoryID?: ID
  createdDate: ISODate
  /** Day key → done that day. */
  completions: Record<string, boolean>
  milestones: Milestone[]
  notes: GoalNote[]
  /** Set on a short-term habit that belongs to a long-term goal. */
  linkedToGoalID?: ID
  repeatDays: number[]
  scheduledOnCalendar: boolean
  scheduledStartMinutes: number
  scheduledDurationMinutes: number
  isFlexible: boolean
  endDate?: ISODate
  targetDate?: ISODate
  challengeTemplateID?: string
  challengeStartDate?: ISODate
  challengeStrictMode: boolean
  challengeAttempt: number
  linkedAppScheme?: string
  linkedAppName?: string
  linkedAppID?: string
  linkedPersonID?: ID
  frequencyType: GoalFrequencyType
  timesPerWeekTarget: number
  timesPerDayTarget: number
  completionCounts: Record<string, number>
  /** Per-day start time for one dragged occurrence. */
  scheduledTimeOverrides: Record<string, number>
  /** Superseded schedules only; the live fields above are current. */
  scheduleVersions: ScheduleVersion[]
  /** When the live schedule took effect. */
  currentScheduleEffectiveFrom: ISODate
  /**
   * Set when a challenge restarts: statistics count from here. Earlier
   * ticks stay in `completions`, they just aren't counted.
   */
  statsStartDate?: ISODate
  /** Day keys whose calendar block was removed ("Remove from [day]"). */
  hiddenBlockDays: string[]
}

export interface VectisTask {
  id: ID
  text: string
  done: boolean
  createdDate: ISODate
  durationMinutes?: number
  /** Where it was dropped on the Daily grid; unset means unplaced. */
  scheduledDate?: ISODate
}

/**
 * One per day. The evening review's reflection and freeform journaling
 * are the same entry, never two records for one day.
 */
export interface JournalEntry {
  id: ID
  /** The day this entry is for, not necessarily when it was written. */
  date: ISODate
  /** Set only if the evening review's prompt started it. */
  reflectionPrompt?: string
  /** Plain text — what Home, search and the evening review read. */
  text: string
  /** The formatted entry from the shared editor; see model/noteDoc.ts. */
  body?: NoteDoc
}

export type NoteType = 'jot' | 'list' | 'classic'

export interface ChecklistItem {
  id: ID
  text: string
  done: boolean
}

export interface Notebook {
  id: ID
  title: string
  linkedGoalID?: ID
  createdDate: ISODate
}

/** One note; only the fields for its `type` are used. */
export interface Note {
  id: ID
  type: NoteType
  title: string
  /** Jots only. */
  jotText: string
  /** Classic notes only: RTF, base64-encoded (Swift `Data`). */
  richTextData?: string
  /** Lists only. */
  checklistItems: ChecklistItem[]
  /**
   * The formatted note from the shared editor (model/noteDoc.ts). When
   * set it's the note's content; the fields above are only read for
   * notes saved before it existed, such as iPhone imports.
   */
  body?: NoteDoc
  linkedGoalID?: ID
  /** Unset means it sits loose in its type's section. */
  notebookID?: ID
  updatedDate: ISODate
}

export interface CalendarHours {
  startHour: number
  endHour: number
}

export type ColorSchemeMode = 'light' | 'dark' | 'system'

export interface AppearanceSettings {
  mode: ColorSchemeMode
  selectedPresetID: string
  isCustom: boolean
  customPrimaryHex: string
  customSecondaryHex: string
  customTertiaryHex: string
}

export interface PlanReviewSettings {
  isEnabled: boolean
  reviewTimeEstimates: boolean
  rehearsePlans: boolean
  flagRepeatedMisses: boolean
  freshStartPrompts: boolean
  eveningReviewMinutes: number
}
