// Shared calendars: edits to a shared event go to its calendar (new ones
// record who added them, deleted ones are removed), and only the calendars
// you've ticked show.
import { describe, expect, it, vi } from 'vitest'
import { makeEvent } from '../model/events'
import type { CalendarEvent } from '../model/types'
import { sharedCategoryID, useShared, visibleShared, type SharedApi } from './shared'

const dinner = makeEvent({
  title: 'Dinner at Mum’s', categoryID: sharedCategoryID('fam'), startDate: '2026-10-16T18:00:00Z', endDate: '2026-10-16T20:00:00Z',
  sharedCalendarID: 'fam',
})

function fakeApi() {
  const write = vi.fn<(events: CalendarEvent[], added: Set<string>) => void>()
  const remove = vi.fn<(events: CalendarEvent[]) => void>()
  const api = { uid: 'me', name: 'Riley', write, remove } as unknown as SharedApi
  return { api, write, remove }
}

describe('shared calendars', () => {
  it('sends a changed event, marks a new one as added, removes a deleted one', () => {
    const { api, write, remove } = fakeApi()
    useShared.setState({ api, eventsBy: { fam: [dinner] } })

    useShared.getState().apply(list => list.map(e => (e.id === dinner.id ? { ...e, title: 'Dinner at Gran’s' } : e)))
    expect(write).toHaveBeenLastCalledWith([expect.objectContaining({ title: 'Dinner at Gran’s' })], new Set())

    const walk = { ...dinner, id: 'walk', title: 'Park walk' }
    useShared.getState().apply(list => [...list, walk])
    expect(write).toHaveBeenLastCalledWith([walk], new Set(['walk']))

    useShared.getState().apply(list => list.filter(e => e.id !== 'walk'))
    expect(remove).toHaveBeenLastCalledWith([walk])
    expect(useShared.getState().eventsBy.fam.map(e => e.id)).toEqual([dinner.id])
  })

  it('shows only the calendars you have ticked (new ones show)', () => {
    const calendars = [
      { id: 'fam', name: 'Family', colorHex: '#5B8DEF', members: ['me', 'sam'], names: {} },
      { id: 'club', name: 'Club', colorHex: '#E0703C', members: ['me'], names: {} },
    ]
    const eventsBy = { fam: [dinner], club: [{ ...dinner, id: 'x', sharedCalendarID: 'club' }] }
    const v = visibleShared({ calendars, eventsBy, mine: [{ id: 'club', shown: false }] })
    expect(v.categories.map(c => c.name)).toEqual(['Family'])
    expect(v.events.map(e => e.id)).toEqual([dinner.id])
  })
})
