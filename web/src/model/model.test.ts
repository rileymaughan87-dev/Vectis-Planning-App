import { describe, expect, it } from 'vitest'
import { addDays, atMinutes, dayKey, startOfDay, toISO } from './dates'
import { commitmentFraction, dayBlocks, layoutBlocks, minutesIntoDay } from './dayBlocks'
import { decodeEvent, decodeGoal } from './decode'
import { makeEvent, occupies, resized, timesOn } from './events'
import {
  applyScheduleChange, consecutiveMisses, isScheduled, liveSchedule, makeGoal, missNudge, recentHistory, scheduleOn,
} from './goals'

const today = startOfDay(new Date(2026, 9, 5)) // Monday 5 Oct 2026

describe('goal schedule versioning', () => {
  it('keeps past days on the old schedule and moves future days', () => {
    const goal = makeGoal('Read', { createdDate: toISO(addDays(today, -30)), scheduledStartMinutes: 21 * 60 })
    const previous = liveSchedule(goal)
    const edited = applyScheduleChange({ ...goal, scheduledStartMinutes: 7 * 60, repeatDays: [2, 4, 6] }, previous, today)

    expect(scheduleOn(edited, addDays(today, -3)).startMinutes).toBe(21 * 60)
    expect(scheduleOn(edited, addDays(today, -3)).repeatDays).toHaveLength(7)
    expect(scheduleOn(edited, today).startMinutes).toBe(7 * 60)
    expect(scheduleOn(edited, addDays(today, 5)).repeatDays).toEqual([2, 4, 6])
    expect(edited.scheduleVersions).toHaveLength(1)
  })

  it('records nothing when the schedule did not change', () => {
    const goal = makeGoal('Read')
    expect(applyScheduleChange(goal, liveSchedule(goal)).scheduleVersions).toHaveLength(0)
  })
})

describe('goal fairness', () => {
  it('does not count days before the goal began', () => {
    const goal = makeGoal('New', { createdDate: toISO(today) })
    expect(isScheduled(goal, addDays(today, -1))).toBe(false)
    expect(consecutiveMisses(goal, today)).toBe(0)
    expect(recentHistory(goal, 14, today).slice(0, 13).every(s => s === 'notScheduled')).toBe(true)
  })

  it('counts from the oldest logged day when older than createdDate', () => {
    const goal = makeGoal('Old', { createdDate: toISO(today), completions: { [dayKey(addDays(today, -5))]: true } })
    expect(isScheduled(goal, addDays(today, -5))).toBe(true)
  })

  it('nudges at two misses, not one, and clears once done today', () => {
    const goal = makeGoal('Habit', { createdDate: toISO(addDays(today, -10)) })
    goal.completions[dayKey(addDays(today, -3))] = true
    expect(consecutiveMisses(goal, today)).toBe(2)
    expect(missNudge(goal, today)).toContain('Missed 2')
    goal.completions[dayKey(today)] = true
    expect(missNudge(goal, today)).toBeNull()
  })
})

describe('events', () => {
  const cat = 'C'
  it('repeats weekly on the same weekday and respects excluded days', () => {
    const e = makeEvent({ title: 'Class', startDate: toISO(atMinutes(today, 600)), endDate: toISO(atMinutes(today, 660)), categoryID: cat, recurrence: 'weekly' })
    expect(occupies(e, addDays(today, 7))).toBe(true)
    expect(occupies(e, addDays(today, 8))).toBe(false)
    e.excludedOccurrences = [dayKey(addDays(today, 14))]
    expect(occupies(e, addDays(today, 14))).toBe(false)
  })

  it('clamps a monthly 31st to shorter months', () => {
    const anchor = new Date(2026, 0, 31, 9)
    const e = makeEvent({ title: 'Rent', startDate: toISO(anchor), endDate: toISO(addDays(anchor, 0)), categoryID: cat, recurrence: 'monthly' })
    expect(occupies(e, new Date(2026, 1, 28))).toBe(true)
    expect(occupies(e, new Date(2026, 3, 30))).toBe(true)
  })

  it('moves one occurrence via an override without touching the anchor', () => {
    const e = makeEvent({ title: 'Gym', startDate: toISO(atMinutes(today, 360)), endDate: toISO(atMinutes(today, 420)), categoryID: cat, recurrence: 'daily' })
    e.timeOverrides = { [dayKey(addDays(today, 2))]: 480 }
    const t = timesOn(e, addDays(today, 2))
    expect(t.start.getHours()).toBe(8)
    expect(t.end.getHours()).toBe(9)
    expect(timesOn(e, addDays(today, 3)).start.getHours()).toBe(6)
  })

  it('only logs an actual after the event started', () => {
    const e = makeEvent({ title: 'Write', startDate: toISO(atMinutes(today, 600)), endDate: toISO(atMinutes(today, 660)), categoryID: cat })
    const before = resized(e, atMinutes(today, 690), atMinutes(today, 500))
    expect(before.actualMinutes).toBeUndefined()
    const after = resized(e, atMinutes(today, 690), atMinutes(today, 700))
    expect(after.estimatedMinutes).toBe(60)
    expect(after.actualMinutes).toBe(90)
  })
})

describe('day blocks', () => {
  it('measures a block that crosses midnight from the start of the shown day', () => {
    expect(minutesIntoDay(atMinutes(addDays(today, 1), 60), today)).toBe(25 * 60)
  })

  it('includes events, goal blocks and placed tasks in one list', () => {
    const data = {
      events: [makeEvent({ title: 'Meet', startDate: toISO(atMinutes(today, 540)), endDate: toISO(atMinutes(today, 600)), categoryID: 'C', flowsToDaily: true })],
      goals: [makeGoal('Read', { createdDate: toISO(addDays(today, -1)), scheduledOnCalendar: true, scheduledStartMinutes: 570 })],
      tasks: [{ id: 'T', text: 'Email', done: false, createdDate: toISO(today), durationMinutes: 30, scheduledDate: toISO(atMinutes(today, 720)) }],
      categories: [{ id: 'C', name: 'Work', colorHex: '#4A7FE8' }],
    }
    const blocks = dayBlocks(data, today)
    expect(blocks.map(b => b.kind)).toEqual(['event', 'goal', 'task'])

    // 9:00–10:00 and 9:30–10:00 overlap and count once; plus 12:00–12:30.
    expect(commitmentFraction(data, { startHour: 8, endHour: 18 }, today)).toBeCloseTo(90 / 600)
    expect(layoutBlocks(blocks).find(l => l.item.kind === 'goal')?.columnCount).toBe(2)
  })
})

describe('reading iPhone save files', () => {
  it('fills in defaults for missing fields', () => {
    const goal = decodeGoal({ id: 'A', title: 'Old goal', createdDate: '2026-09-01T10:00:00Z', repeatDays: [2, 3] })
    expect(goal.frequencyType).toBe('specificDays')
    expect(goal.isFlexible).toBe(true)
    expect(goal.currentScheduleEffectiveFrom).toBe('0001-01-01T00:00:00Z')
    expect(goal.repeatDays).toEqual([2, 3])
  })

  it('drops an event that has no start time instead of failing', () => {
    expect(decodeEvent({ title: 'Broken', categoryID: 'C', endDate: '2026-10-05T10:00:00Z' })).toBeNull()
  })
})

describe('long-term calendar', () => {
  it('starts weeks on the region\'s first day', async () => {
    const { firstWeekday, startOfWeek } = await import('./dates')
    expect(firstWeekday('en-US')).toBe(1)
    expect(firstWeekday('en-GB')).toBe(2)
    expect(startOfWeek(today, 2).getDay()).toBe(1) // Monday
    expect(startOfWeek(today, 1).getDay()).toBe(0) // Sunday
  })

  it('lays a month out in whole weeks', async () => {
    const { monthGridDays } = await import('./longTerm')
    const days = monthGridDays(new Date(2026, 9, 1))
    expect(days.length % 7).toBe(0)
    expect(days.filter(d => d.inMonth)).toHaveLength(31)
  })

  it('shows long-term events and dated milestones, not daily-only events', async () => {
    const { longTermItems } = await import('./longTerm')
    const goal = makeGoal('Degree', { kind: 'longTerm', milestones: [{ id: 'M', title: 'Finals', done: false, addToCalendar: true, date: toISO(atMinutes(today, 600)) }] })
    const events = [
      makeEvent({ title: 'Holiday', startDate: toISO(today), endDate: toISO(atMinutes(addDays(today, 2), 0)), categoryID: 'C', isAllDay: true, origin: 'longTerm' }),
      makeEvent({ title: 'Standup', startDate: toISO(atMinutes(today, 540)), endDate: toISO(atMinutes(today, 570)), categoryID: 'C', flowsToDaily: true }),
    ]
    const items = longTermItems({ events, goals: [goal], categories: [] }, today, '#D2574A')
    expect(items.map(i => i.title)).toEqual(['Holiday', 'Finals'])
    expect(longTermItems({ events, goals: [goal], categories: [] }, addDays(today, 1), '#000').map(i => i.title)).toEqual(['Holiday'])
  })
})

describe('plan and review', () => {
  it('lists unplaced goals and tasks with durations, longest first', async () => {
    const { planningItems } = await import('./planning')
    const goals = [
      makeGoal('Read', { createdDate: toISO(addDays(today, -1)), scheduledDurationMinutes: 30 }),
      makeGoal('Gym', { createdDate: toISO(addDays(today, -1)), scheduledOnCalendar: true }),
      makeGoal('Degree', { kind: 'longTerm' }),
    ]
    const tasks = [
      { id: 'A', text: 'Essay', done: false, createdDate: toISO(today), durationMinutes: 90 },
      { id: 'B', text: 'Milk', done: false, createdDate: toISO(today) },
      { id: 'C', text: 'Placed', done: false, createdDate: toISO(today), durationMinutes: 15, scheduledDate: toISO(today) },
    ]
    expect(planningItems(goals, tasks, today).map(i => i.title)).toEqual(['Essay', 'Read'])
  })

  it('asks the diagnostic question only when misses are flagged', async () => {
    const { flaggedGoals, reviewPrompt } = await import('./planning')
    const missed = makeGoal('Habit', { createdDate: toISO(addDays(today, -5)) })
    expect(reviewPrompt(flaggedGoals([missed], today, true))).toBe('What slowed you down today?')
    expect(reviewPrompt(flaggedGoals([missed], today, false))).toBe('What worked today?')
  })
})

describe('classic note RTF', () => {
  // What Cocoa writes for the iPhone's sample "Trip planning" note.
  const cocoa = String.raw`{\rtf1\ansi\ansicpg1252\cocoartf2761
\cocoatextscaling0\cocoaplatform1{\fonttbl\f0\fswiss\fcharset0 Helvetica-Bold;\f1\fswiss\fcharset0 Helvetica;\f2\fswiss\fcharset0 Helvetica-Oblique;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\deftab720
\pard\pardeftab720\partightenfactor0

\f0\b\fs32 \cf0 Flights booked for June 14\
\f1\b0 Need to sort out accommodation still. 
\f2\i Check reviews before booking. Caf\'e9 \uc0\u8212  done}`

  it('reads Cocoa RTF, including fonts that carry bold and italic', async () => {
    const { rtfToParagraphs, paragraphsToText } = await import('./rtf')
    const paras = rtfToParagraphs(cocoa)
    expect(paragraphsToText(paras)).toBe('Flights booked for June 14\nNeed to sort out accommodation still. Check reviews before booking. Café — done')
    expect(paras[0][0]).toMatchObject({ bold: true, italic: false })
    expect(paras[1].find(r => r.text.startsWith('Check'))).toMatchObject({ italic: true, bold: false })
  })

  it('round-trips styles, headings, escapes and non-ASCII', async () => {
    const { rtfToParagraphs, paragraphsToRtf, base64FromRtf, rtfFromBase64 } = await import('./rtf')
    const original = [
      [{ text: 'Plan', bold: true, italic: false, heading: true }],
      [{ text: 'Mix ', bold: false, italic: false, heading: false }, { text: 'bold', bold: true, italic: false, heading: false }, { text: ' and {braces} \ 😀 é', bold: false, italic: true, heading: false }],
      [],
      [{ text: 'End', bold: false, italic: false, heading: false }],
    ]
    const rtf = rtfFromBase64(base64FromRtf(paragraphsToRtf(original)))
    const back = rtfToParagraphs(rtf)
    expect(back).toEqual(original.map(p => p.map(r => (r.heading ? { ...r, bold: true } : r))))
  })
})
