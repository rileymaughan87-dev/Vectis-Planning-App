// Logged spending and the weekly pot, from SpendingStore.swift. Saved to
// spending_entries.json and spending_pot.json.

import { startOfDay, toISO } from '@suite/dates'
import { newID } from '@suite/ids'
import { create } from 'zustand'
import { decodePot, decodeSpendingEntries, type SpendingEntry, type SpendingPot } from '../model/spending'
import { Filename, storage } from './persist'

interface SpendingState {
  entries: SpendingEntry[]
  pot: SpendingPot
  log(amount: number, note: string, date: Date): void
  update(entry: SpendingEntry): void
  remove(id: string): void
  /** Turns the pot on from today. The caller ends repeating flexible entries at the same moment, so nothing counts twice. */
  startPot(weeklyAmount: number): void
  setPotAmount(weeklyAmount: number): void
  stopPot(): void
}

export const useSpending = create<SpendingState>()(set => ({
  entries: decodeSpendingEntries(storage.loadRaw(Filename.spendingEntries)),
  pot: decodePot(storage.loadRaw(Filename.spendingPot)),
  log: (amount, note, date) => {
    if (amount <= 0) return
    set(s => ({ entries: [...s.entries, { id: newID(), date: toISO(date), amount, note: note.trim(), source: 'manual' }] }))
  },
  update: entry => set(s => ({ entries: s.entries.map(e => (e.id === entry.id ? entry : e)) })),
  remove: id => set(s => ({ entries: s.entries.filter(e => e.id !== id) })),
  startPot: weeklyAmount => set({ pot: { weeklyAmount, startDate: toISO(startOfDay(new Date())), isActive: true } }),
  setPotAmount: weeklyAmount => set(s => ({ pot: { ...s.pot, weeklyAmount } })),
  stopPot: () => set(s => ({ pot: { ...s.pot, isActive: false } })),
}))

useSpending.subscribe((state, prev) => {
  if (state.entries !== prev.entries) storage.saveRaw(Filename.spendingEntries, state.entries)
  if (state.pot !== prev.pot) storage.saveRaw(Filename.spendingPot, state.pot)
})

/** Both together, for the budget and calendar totals. */
export const useLogged = () => {
  const entries = useSpending(s => s.entries)
  const pot = useSpending(s => s.pot)
  return { entries, pot }
}
