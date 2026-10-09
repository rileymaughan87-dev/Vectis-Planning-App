// The little of Planner's goals that Record needs: enough to link a note
// or notebook to one and show its name. Read only — Planner owns goals.

import { isObj, list, oneOf, optStr, str, type Raw } from '@suite/decode'

export interface GoalRef {
  id: string
  title: string
  kind: 'shortTerm' | 'longTerm'
  linkedToGoalID?: string
  /** Days it was done ("2026-10-10"), ticked or counted. */
  doneDays: string[]
}

const doneKeys = (v: unknown, done: (x: unknown) => boolean) =>
  isObj(v) ? Object.entries(v).filter(([, x]) => done(x)).map(([k]) => k) : []

function decodeGoalRef(r: Raw): GoalRef | null {
  if (typeof r.id !== 'string') return null
  return {
    id: r.id,
    title: str(r.title, ''),
    kind: oneOf(r.kind, ['shortTerm', 'longTerm'] as const, 'shortTerm'),
    linkedToGoalID: optStr(r.linkedToGoalID),
    doneDays: [...new Set([
      ...doneKeys(r.completions, x => x === true),
      ...doneKeys(r.completionCounts, x => typeof x === 'number' && x > 0),
    ])],
  }
}

/** The goals done on a day, by title. */
export const goalsDoneOn = (goals: GoalRef[], key: string) => goals.filter(g => g.doneDays.includes(key)).map(g => g.title)

export const decodeGoalRefs = (raw: unknown): GoalRef[] => (Array.isArray(raw) ? list(raw.filter(isObj), decodeGoalRef) : [])
