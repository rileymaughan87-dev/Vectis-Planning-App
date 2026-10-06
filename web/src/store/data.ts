// The app's data and every action that changes it — the web counterpart
// of GoalsStore, CalendarStore, TasksStore, AppearanceStore and
// PlanReviewStore. One store rather than five, so the share file can be
// built from a single snapshot and published whenever anything changes.
//
// Each slice saves to its own file whenever it changes.

import { create } from 'zustand'
import { dayKey, isSameDay, parseDate, startOfDay, toISO } from '../model/dates'
import {
  decodeAppearance, decodeCategory, decodeEvent, decodeGoal, decodeHours, decodeJournalEntry, decodeNote, decodeNotebook, decodePlanReview, decodeTask, list,
} from '../model/decode'
import { moved, resized } from '../model/events'
import { applyScheduleChange, liveSchedule, makeGoal, withCompletion, withCount } from '../model/goals'
import { newID } from '../model/ids'
import { DEFAULT_CATEGORIES, sampleEvents, sampleGoals, sampleNotes } from '../model/sample'
import type {
  AppearanceSettings, CalendarCategory, CalendarEvent, CalendarHours, Goal, JournalEntry, Note, Notebook, PlanReviewSettings, VectisTask,
} from '../model/types'
import { Filename, loadRaw, saveRaw } from './persist'

export interface DataState {
  goals: Goal[]
  events: CalendarEvent[]
  categories: CalendarCategory[]
  hours: CalendarHours
  tasks: VectisTask[]
  appearance: AppearanceSettings
  planReview: PlanReviewSettings
  journal: JournalEntry[]
  notes: Note[]
  notebooks: Notebook[]
}

interface Actions {
  // Goals
  setCompletion(goalID: string, date: Date, done: boolean): void
  setCount(goalID: string, date: Date, count: number): void
  addShortTermGoal(fields: Partial<Goal> & { title: string }): void
  addGoal(goal: Goal): void
  /** Saves an edited goal. `previous` is its schedule before editing, for versioning. */
  updateGoal(goal: Goal, previousSchedule?: ReturnType<typeof liveSchedule>): void
  deleteGoal(id: string): void
  toggleMilestone(goalID: string, milestoneID: string): void
  scheduleGoalOnCalendar(goalID: string, startMinutes: number, durationMinutes: number): void
  setGoalTimeOverride(goalID: string, date: Date, startMinutes: number): void
  /** A goal's length before it's on the calendar — nothing to version yet. */
  setGoalDuration(goalID: string, minutes: number): void
  // Events
  addEvent(event: CalendarEvent): void
  updateEvent(event: CalendarEvent): void
  moveEvent(id: string, newStart: Date): void
  resizeEvent(id: string, newEnd: Date): void
  setOccurrenceTime(eventID: string, date: Date, startMinutes: number): void
  deleteEvent(id: string): void
  deleteOccurrence(eventID: string, date: Date): void
  setCategories(categories: CalendarCategory[]): void
  setHours(hours: CalendarHours): void
  // Tasks
  addTask(text: string): void
  toggleTask(id: string): void
  setTaskDuration(id: string, minutes: number | undefined): void
  placeTask(id: string, at: Date | undefined): void
  deleteTask(id: string): void
  // Settings
  setAppearance(patch: Partial<AppearanceSettings>): void
  setPlanReview(patch: Partial<PlanReviewSettings>): void
  // Journal
  /** Attaches the review's prompt to the day's entry; never touches its text. */
  seedReflection(date: Date, prompt: string): void
  setJournalText(date: Date, text: string): void
  deleteJournalEntry(id: string): void
  // Notes
  /** Adds or replaces a note, stamping it as just updated. */
  saveNote(note: Note): void
  deleteNote(id: string): void
  saveNotebook(notebook: Notebook): void
  /** Keeps its notes — they go back to their own sections. */
  deleteNotebook(id: string): void
  /** Replaces whole slices — used by import from the iPhone app. */
  replace(patch: Partial<DataState>): void
}

function initialState(): DataState {
  const savedCategories = loadRaw(Filename.categories)
  const categories = savedCategories === undefined ? DEFAULT_CATEGORIES : list(savedCategories, decodeCategory)

  const savedGoals = loadRaw(Filename.goals)
  const savedEvents = loadRaw(Filename.calendarEvents)
  const savedTasks = loadRaw(Filename.tasks)
  const savedNotes = loadRaw(Filename.notes)

  let events = savedEvents === undefined ? sampleEvents(categories) : list(savedEvents, decodeEvent)
  events = repairOrphanedEvents(events, categories)

  return {
    goals: savedGoals === undefined ? sampleGoals() : list(savedGoals, decodeGoal),
    events,
    categories,
    hours: decodeHours(loadRaw(Filename.calendarHours)),
    tasks: savedTasks === undefined ? [] : list(savedTasks, decodeTask),
    appearance: decodeAppearance(loadRaw(Filename.appearance)),
    planReview: decodePlanReview(loadRaw(Filename.planReviewSettings)),
    journal: list(loadRaw(Filename.journalEntries), decodeJournalEntry),
    notes: savedNotes === undefined ? sampleNotes() : list(savedNotes, decodeNote),
    notebooks: list(loadRaw(Filename.notebooks), decodeNotebook),
  }
}

/** Points any event whose category no longer exists at the first one. */
function repairOrphanedEvents(events: CalendarEvent[], categories: CalendarCategory[]): CalendarEvent[] {
  const valid = new Set(categories.map(c => c.id))
  const fallback = categories[0]?.id
  if (!fallback) return events
  return events.map(e => (valid.has(e.categoryID) ? e : { ...e, categoryID: fallback }))
}

const mapGoal = (goals: Goal[], id: string, f: (g: Goal) => Goal) => goals.map(g => (g.id === id ? f(g) : g))
const mapEvent = (events: CalendarEvent[], id: string, f: (e: CalendarEvent) => CalendarEvent) =>
  events.map(e => (e.id === id ? f(e) : e))
const mapTask = (tasks: VectisTask[], id: string, f: (t: VectisTask) => VectisTask) => tasks.map(t => (t.id === id ? f(t) : t))
const clampStart = (minutes: number, max: number) => Math.min(Math.max(minutes, 0), max)

export const useData = create<DataState & Actions>()(set => ({
  ...initialState(),

  setCompletion: (goalID, date, done) => set(s => ({ goals: mapGoal(s.goals, goalID, g => withCompletion(g, date, done)) })),
  setCount: (goalID, date, count) => set(s => ({ goals: mapGoal(s.goals, goalID, g => withCount(g, date, count)) })),

  addShortTermGoal: fields => set(s => ({ goals: [...s.goals, makeGoal(fields.title, { frequency: 'daily', ...fields, kind: 'shortTerm' })] })),
  addGoal: goal => set(s => ({ goals: [...s.goals, goal] })),

  updateGoal: (goal, previousSchedule) =>
    set(s => ({
      goals: mapGoal(s.goals, goal.id, () => (previousSchedule ? applyScheduleChange(goal, previousSchedule) : goal)),
    })),

  // A long-term goal takes its linked habits with it rather than orphaning them.
  deleteGoal: id => set(s => ({ goals: s.goals.filter(g => g.id !== id && g.linkedToGoalID !== id) })),

  toggleMilestone: (goalID, milestoneID) =>
    set(s => ({
      goals: mapGoal(s.goals, goalID, g => ({
        ...g,
        milestones: g.milestones.map(m => (m.id === milestoneID ? { ...m, done: !m.done } : m)),
      })),
    })),

  scheduleGoalOnCalendar: (goalID, startMinutes, durationMinutes) =>
    set(s => ({
      goals: mapGoal(s.goals, goalID, g => {
        const previous = liveSchedule(g)
        const edited = { ...g, scheduledStartMinutes: startMinutes, scheduledDurationMinutes: durationMinutes, scheduledOnCalendar: true }
        return applyScheduleChange(edited, previous)
      }),
    })),

  setGoalTimeOverride: (goalID, date, startMinutes) =>
    set(s => ({
      goals: mapGoal(s.goals, goalID, g => ({
        ...g,
        scheduledTimeOverrides: { ...g.scheduledTimeOverrides, [dayKey(date)]: clampStart(startMinutes, 23 * 60 + 30) },
      })),
    })),

  setGoalDuration: (goalID, minutes) =>
    set(s => ({ goals: mapGoal(s.goals, goalID, g => ({ ...g, scheduledDurationMinutes: Math.max(5, minutes) })) })),

  addEvent: event => set(s => ({ events: [...s.events, event] })),
  updateEvent: event => set(s => ({ events: mapEvent(s.events, event.id, () => event) })),
  moveEvent: (id, newStart) => set(s => ({ events: mapEvent(s.events, id, e => moved(e, newStart)) })),
  resizeEvent: (id, newEnd) => set(s => ({ events: mapEvent(s.events, id, e => resized(e, newEnd)) })),

  setOccurrenceTime: (eventID, date, startMinutes) =>
    set(s => ({
      events: mapEvent(s.events, eventID, e => ({
        ...e,
        timeOverrides: { ...e.timeOverrides, [dayKey(date)]: clampStart(startMinutes, 23 * 60 + 55) },
      })),
    })),

  deleteEvent: id => set(s => ({ events: s.events.filter(e => e.id !== id) })),
  deleteOccurrence: (eventID, date) =>
    set(s => ({
      events: mapEvent(s.events, eventID, e => ({ ...e, excludedOccurrences: [...new Set([...e.excludedOccurrences, dayKey(date)])] })),
    })),

  setCategories: categories => set({ categories }),
  setHours: hours => set({ hours }),

  addTask: text => {
    const trimmed = text.trim()
    if (!trimmed) return
    set(s => ({ tasks: [...s.tasks, { id: newID(), text: trimmed, done: false, createdDate: toISO(new Date()) }] }))
  },
  toggleTask: id => set(s => ({ tasks: mapTask(s.tasks, id, t => ({ ...t, done: !t.done })) })),
  setTaskDuration: (id, minutes) => set(s => ({ tasks: mapTask(s.tasks, id, t => ({ ...t, durationMinutes: minutes })) })),
  placeTask: (id, at) => set(s => ({ tasks: mapTask(s.tasks, id, t => ({ ...t, scheduledDate: at ? toISO(at) : undefined })) })),
  deleteTask: id => set(s => ({ tasks: s.tasks.filter(t => t.id !== id) })),

  setAppearance: patch => set(s => ({ appearance: { ...s.appearance, ...patch } })),
  setPlanReview: patch => set(s => ({ planReview: { ...s.planReview, ...patch } })),

  seedReflection: (date, prompt) =>
    set(s => {
      const existing = s.journal.find(e => isSameDay(parseDate(e.date), date))
      if (existing) {
        if (existing.reflectionPrompt) return {}
        return { journal: s.journal.map(e => (e === existing ? { ...e, reflectionPrompt: prompt } : e)) }
      }
      return { journal: [...s.journal, { id: newID(), date: toISO(startOfDay(date)), reflectionPrompt: prompt, text: '' }] }
    }),

  setJournalText: (date, text) =>
    set(s => {
      const existing = s.journal.find(e => isSameDay(parseDate(e.date), date))
      if (existing) return { journal: s.journal.map(e => (e === existing ? { ...e, text } : e)) }
      return { journal: [...s.journal, { id: newID(), date: toISO(startOfDay(date)), text }] }
    }),

  deleteJournalEntry: id => set(s => ({ journal: s.journal.filter(e => e.id !== id) })),

  saveNote: note =>
    set(s => {
      const stamped = { ...note, updatedDate: toISO(new Date()) }
      const exists = s.notes.some(n => n.id === note.id)
      return { notes: exists ? s.notes.map(n => (n.id === note.id ? stamped : n)) : [...s.notes, stamped] }
    }),
  deleteNote: id => set(s => ({ notes: s.notes.filter(n => n.id !== id) })),
  saveNotebook: notebook =>
    set(s => ({
      notebooks: s.notebooks.some(b => b.id === notebook.id)
        ? s.notebooks.map(b => (b.id === notebook.id ? notebook : b))
        : [...s.notebooks, notebook],
    })),
  deleteNotebook: id =>
    set(s => ({
      notebooks: s.notebooks.filter(b => b.id !== id),
      notes: s.notes.map(n => (n.notebookID === id ? { ...n, notebookID: undefined } : n)),
    })),

  replace: patch => set(patch),
}))

// Save each slice to its own file whenever it changes.
const fileFor: Record<keyof DataState, string> = {
  goals: Filename.goals,
  events: Filename.calendarEvents,
  categories: Filename.categories,
  hours: Filename.calendarHours,
  tasks: Filename.tasks,
  appearance: Filename.appearance,
  planReview: Filename.planReviewSettings,
  journal: Filename.journalEntries,
  notes: Filename.notes,
  notebooks: Filename.notebooks,
}

useData.subscribe((state, prev) => {
  for (const key of Object.keys(fileFor) as (keyof DataState)[]) {
    if (state[key] !== prev[key]) saveRaw(fileFor[key], state[key])
  }
})

/** Sorted the way Home shows them: unfinished first, then oldest first. */
export function sortedTasks(tasks: VectisTask[]): VectisTask[] {
  return [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    return parseDate(a.createdDate).getTime() - parseDate(b.createdDate).getTime()
  })
}

