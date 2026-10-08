// Money entries, ported from FinanceStore.swift. Saved to
// finance_events.json whenever they change.

import { dayKey, toISO, startOfDay } from '@suite/dates'
import { create } from 'zustand'
import { decodeFinanceEvents, runningRepeatingFlexible, splitFrom, type FinanceEvent } from '../model/entries'
import { Filename, storage } from './persist'

interface EntriesState {
  events: FinanceEvent[]
  addEvent(event: FinanceEvent): void
  updateEvent(event: FinanceEvent): void
  deleteEvent(id: string): void
  /** The real amount for one occurrence of a varying entry. */
  confirmAmount(id: string, date: Date, amount: number): void
  /** Back to the estimate for one occurrence. */
  clearConfirmation(id: string, date: Date): void
  /** Stops a repeating entry from `date` on; earlier ones stay. */
  endFrom(id: string, date: Date): void
  /** Changes a repeating entry from `date` on; earlier ones keep the old details. */
  changeFrom(id: string, date: Date, changes: Partial<FinanceEvent>): void
  /** The weekly pot takes over: running repeating flexible entries stop from `date`. */
  endRepeatingFlexible(date: Date): void
}

const patch = (events: FinanceEvent[], id: string, f: (e: FinanceEvent) => FinanceEvent) => events.map(e => (e.id === id ? f(e) : e))

export const useEntries = create<EntriesState>()(set => ({
  events: decodeFinanceEvents(storage.loadRaw(Filename.financeEvents)),
  addEvent: event => set(s => ({ events: [...s.events, event] })),
  updateEvent: event => set(s => ({ events: patch(s.events, event.id, () => event) })),
  deleteEvent: id => set(s => ({ events: s.events.filter(e => e.id !== id) })),
  confirmAmount: (id, date, amount) =>
    set(s => ({ events: patch(s.events, id, e => ({ ...e, confirmedAmounts: { ...e.confirmedAmounts, [dayKey(date)]: amount } })) })),
  clearConfirmation: (id, date) =>
    set(s => ({
      events: patch(s.events, id, e => {
        const { [dayKey(date)]: _removed, ...rest } = e.confirmedAmounts
        return { ...e, confirmedAmounts: rest }
      }),
    })),
  endFrom: (id, date) => set(s => ({ events: patch(s.events, id, e => ({ ...e, endDate: toISO(startOfDay(date)) })) })),
  changeFrom: (id, date, changes) => set(s => ({ events: splitFrom(s.events, id, date, changes) })),
  endRepeatingFlexible: date => set(s => {
    const ids = new Set(runningRepeatingFlexible(s.events, date).map(e => e.id))
    return { events: s.events.map(e => (ids.has(e.id) ? { ...e, endDate: toISO(startOfDay(date)) } : e)) }
  }),
}))

useEntries.subscribe((state, prev) => {
  if (state.events !== prev.events) storage.saveRaw(Filename.financeEvents, state.events)
})
