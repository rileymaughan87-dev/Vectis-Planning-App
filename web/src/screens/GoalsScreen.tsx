import { notesPerGoal } from '@suite/links'
import { decodeNote, decodeNotebook } from '@suite/record/decode'
import { Flag, Plus } from 'lucide-react'
import { useState } from 'react'
import { unresolvedDays } from '../model/challenges'
import type { Goal } from '../model/types'
import { useData } from '../store/data'
import { list } from '../model/decode'
import { Filename, loadRaw } from '../store/persist'
import { SectionBox, VButton } from '../ui/components'
import { LongTermGoalCard, ShortTermGoalRow, type GoalHandlers } from '../ui/goalCards'
import type { ThemeColors } from '../ui/theme'
import { ChallengeBrowser, ChallengeCatchUp } from './ChallengeSheets'
import { AddShortTermGoalSheet, LongTermGoalEditor, ShortTermGoalEditor, newLongTermGoal } from './GoalEditors'

const ASKED_KEY = 'vectis:ui:catchup-asked'

/** Challenges whose catch-up was already offered this visit. */
function askedThisVisit(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(ASKED_KEY) ?? '[]')
  } catch {
    return []
  }
}

export function GoalsScreen({ colors }: { colors: ThemeColors }) {
  const goals = useData(s => s.goals)
  const { setCompletion, setCount, toggleMilestone } = useData()
  const [adding, setAdding] = useState(false)
  const [editingShort, setEditingShort] = useState<Goal | null>(null)
  const [editingLong, setEditingLong] = useState<{ goal: Goal; isNew: boolean } | null>(null)
  const [browsing, setBrowsing] = useState(false)
  // The first challenge with unconfirmed days, offered once per visit.
  const [catchUp, setCatchUp] = useState<Goal | null>(() => {
    const asked = askedThisVisit()
    const goal = goals.find(g => g.challengeTemplateID && !asked.includes(g.id) && unresolvedDays(goals, g).length > 0) ?? null
    if (goal) {
      try {
        sessionStorage.setItem(ASKED_KEY, JSON.stringify([...asked, goal.id]))
      } catch {
        // It may just ask again next time.
      }
    }
    return goal
  })

  // Record's notes, read once (Record owns them; they share this browser's storage).
  const [notesCount] = useState(() =>
    notesPerGoal(list(loadRaw(Filename.notes), decodeNote), list(loadRaw(Filename.notebooks), decodeNotebook)))

  const handlers: GoalHandlers = {
    notesFor: id => notesCount.get(id) ?? 0,
    onEdit: g => (g.kind === 'longTerm' ? setEditingLong({ goal: g, isNew: false }) : setEditingShort(g)),
    onSetDone: (g, date, done) => setCompletion(g.id, date, done),
    onSetCount: (g, date, count) => setCount(g.id, date, count),
    onToggleMilestone: (g, id) => toggleMilestone(g.id, id),
  }

  const shortTerm = goals.filter(g => g.kind === 'shortTerm' && !g.linkedToGoalID)
  const longTerm = goals.filter(g => g.kind === 'longTerm')

  return (
    <div className="page goals">
      <SectionBox title="Short-term goals" accent={colors.primary}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {shortTerm.map(g => <ShortTermGoalRow key={g.id} goal={g} accent={colors.primary} {...handlers} />)}
          <VButton accent={colors.primary} onClick={() => setAdding(true)}><Plus size={16} /> Add goal</VButton>
        </div>
      </SectionBox>

      <SectionBox title="Long-term goals" accent={colors.secondary}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {longTerm.map(g => (
            <LongTermGoalCard key={g.id} goal={g} allGoals={goals} accent={colors.secondary} habitAccent={colors.primary} {...handlers} />
          ))}
          <div className="button-row">
            <VButton accent={colors.secondary} onClick={() => setEditingLong({ goal: newLongTermGoal(), isNew: true })}>
              <Plus size={16} /> Add goal
            </VButton>
            <VButton accent={colors.secondary} onClick={() => setBrowsing(true)}>
              <Flag size={16} /> Challenges
            </VButton>
          </div>
        </div>
      </SectionBox>

      {adding && <AddShortTermGoalSheet onClose={() => setAdding(false)} />}
      {browsing && <ChallengeBrowser colors={colors} onClose={() => setBrowsing(false)} />}
      {catchUp && <ChallengeCatchUp goal={catchUp} colors={colors} onClose={() => setCatchUp(null)} />}
      {editingShort && <ShortTermGoalEditor goal={editingShort} onClose={() => setEditingShort(null)} />}
      {editingLong && (
        <LongTermGoalEditor goal={editingLong.goal} isNew={editingLong.isNew} accent={colors.secondary} onClose={() => setEditingLong(null)} />
      )}
    </div>
  )
}
