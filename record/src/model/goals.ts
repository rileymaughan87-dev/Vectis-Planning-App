// The little of Planner's goals that Record needs: enough to link a note
// or notebook to one and show its name. Read only — Planner owns goals.

import { isObj, list, oneOf, optStr, str, type Raw } from '@suite/decode'

export interface GoalRef {
  id: string
  title: string
  kind: 'shortTerm' | 'longTerm'
  linkedToGoalID?: string
}

function decodeGoalRef(r: Raw): GoalRef | null {
  if (typeof r.id !== 'string') return null
  return {
    id: r.id,
    title: str(r.title, ''),
    kind: oneOf(r.kind, ['shortTerm', 'longTerm'] as const, 'shortTerm'),
    linkedToGoalID: optStr(r.linkedToGoalID),
  }
}

export const decodeGoalRefs = (raw: unknown): GoalRef[] => (Array.isArray(raw) ? list(raw.filter(isObj), decodeGoalRef) : [])
