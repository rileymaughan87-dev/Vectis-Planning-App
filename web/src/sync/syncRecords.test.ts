// The shared sync records (suite/sync/records.ts), checked with Planner's data.
import { describe as group, expect, it } from 'vitest'
import { diff, docID, readRecord, rebuild, recordsFor, type SyncRecord } from '@suite/sync/records'
import { Filename } from '../store/persist'

const goals = [{ id: 'A', title: 'Read' }, { id: 'B/2', title: 'Run' }]

group('records', () => {
  it('makes one record per item, escaping ids, and one for a single value', () => {
    const r = recordsFor(Filename.goals, 'list', goals)
    expect([...r.keys()]).toEqual(['goals__A', 'goals__B%2F2'])
    expect(r.get('goals__B%2F2')).toMatchObject({ id: 'B/2', index: 1, deleted: false })
    expect([...recordsFor(Filename.calendarHours, 'single', { startHour: 6 }).keys()]).toEqual(['calendar_hours'])
    expect(docID('notes.json', '')).toBe('notes')
  })

  it('round-trips a list in order', () => {
    const r = recordsFor(Filename.goals, 'list', goals)
    expect(rebuild(r, Filename.goals, 'list')).toEqual(goals)
    expect(rebuild(new Map(), Filename.calendarHours, 'single')).toBeUndefined()
  })
})

group('working out what to send', () => {
  const known = recordsFor(Filename.goals, 'list', goals)

  it('sends nothing when nothing changed', () => {
    expect(diff(known, Filename.goals, recordsFor(Filename.goals, 'list', goals)).size).toBe(0)
  })

  it('sends changed and new items, and a tombstone for a removed one', () => {
    const next = recordsFor(Filename.goals, 'list', [{ id: 'A', title: 'Read more' }, { id: 'C', title: 'Swim' }])
    const writes = diff(known, Filename.goals, next)
    expect([...writes.keys()].sort()).toEqual(['goals__A', 'goals__B%2F2', 'goals__C'])
    expect(writes.get('goals__B%2F2')).toMatchObject({ deleted: true, json: '' })
    // Removed items drop out when rebuilt.
    const merged = new Map([...known, ...writes])
    expect(rebuild(merged, Filename.goals, 'list')).toEqual([{ id: 'A', title: 'Read more' }, { id: 'C', title: 'Swim' }])
  })

  it('only looks at its own file', () => {
    const notes = recordsFor(Filename.notes, 'list', [{ id: 'N' }])
    expect(diff(new Map([...known, ...notes]), Filename.notes, notes).size).toBe(0)
  })

  it('brings a deleted item back if it reappears', () => {
    const tomb: SyncRecord = { file: Filename.goals, id: 'A', index: 0, json: '', deleted: true }
    expect(diff(new Map([['goals__A', tomb]]), Filename.goals, recordsFor(Filename.goals, 'list', [goals[0]])).size).toBe(1)
  })
})

group('reading and describing', () => {
  it('ignores malformed records', () => {
    expect(readRecord({ file: 'goals.json' })).toBeNull()
    expect(readRecord({ file: 'goals.json', json: '{}', index: 'x' })).toMatchObject({ index: 0, deleted: false })
  })

  it('summarises what a side holds', async () => {
    const { countIn, describeCounts } = await import('@suite/sync/records')
    const r = new Map([...recordsFor(Filename.goals, 'list', goals), ...recordsFor(Filename.journalEntries, 'list', [{ id: 'J1' }, { id: 'J2' }])])
    expect(describeCounts([['goal', 'goals', countIn(r, Filename.goals)], ['journal entry', 'journal entries', countIn(r, Filename.journalEntries)]])).toBe('2 goals, 2 journal entries')
    expect(describeCounts([['goal', 'goals', 0]])).toBe('nothing yet')
  })
})
