// Saving, set-asides and debts, ported from FinanceGoalsStore.swift.
// Starts empty on purpose: made-up goals mixed in with real ones would
// make the record untrue from day one. Saved to finance_goals.json.

import { dayKey } from '@suite/dates'
import { create } from 'zustand'
import { decodeGoals, type FinanceGoal } from '../model/goals'
import { Filename, storage } from './persist'

interface GoalsState {
  goals: FinanceGoal[]
  addGoal(goal: FinanceGoal): void
  updateGoal(goal: FinanceGoal): void
  deleteGoal(id: string): void
  /** Confirms a planned payment for what really went in; 0 records a skip. */
  recordPayment(id: string, date: Date, amount: number): void
  /** A payment outside the plan; adds to anything already on that day. */
  addExtraPayment(id: string, date: Date, amount: number): void
  /** Takes a recorded payment off the record (it was a mistake). */
  removePayment(id: string, date: Date): void
}

const patch = (goals: FinanceGoal[], id: string, f: (g: FinanceGoal) => FinanceGoal) => goals.map(g => (g.id === id ? f(g) : g))

export const useGoals = create<GoalsState>()(set => ({
  goals: decodeGoals(storage.loadRaw(Filename.financeGoals)),
  addGoal: goal => set(s => ({ goals: [...s.goals, goal] })),
  updateGoal: goal => set(s => ({ goals: patch(s.goals, goal.id, () => goal) })),
  deleteGoal: id => set(s => ({ goals: s.goals.filter(g => g.id !== id) })),
  recordPayment: (id, date, amount) =>
    set(s => ({ goals: patch(s.goals, id, g => ({ ...g, payments: { ...g.payments, [dayKey(date)]: Math.max(amount, 0) } })) })),
  addExtraPayment: (id, date, amount) => {
    if (amount <= 0) return
    set(s => ({ goals: patch(s.goals, id, g => ({ ...g, payments: { ...g.payments, [dayKey(date)]: (g.payments[dayKey(date)] ?? 0) + amount } })) }))
  },
  removePayment: (id, date) =>
    set(s => ({
      goals: patch(s.goals, id, g => {
        const { [dayKey(date)]: _removed, ...rest } = g.payments
        return { ...g, payments: rest }
      }),
    })),
}))

useGoals.subscribe((state, prev) => {
  if (state.goals !== prev.goals) storage.saveRaw(Filename.financeGoals, state.goals)
})
