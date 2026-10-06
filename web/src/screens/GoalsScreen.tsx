import { Plus } from 'lucide-react'
import { useState } from 'react'
import type { Goal } from '../model/types'
import { useData } from '../store/data'
import { SectionBox, VButton } from '../ui/components'
import { LongTermGoalCard, ShortTermGoalRow, type GoalHandlers } from '../ui/goalCards'
import type { ThemeColors } from '../ui/theme'
import { AddShortTermGoalSheet, LongTermGoalEditor, ShortTermGoalEditor, newLongTermGoal } from './GoalEditors'

export function GoalsScreen({ colors }: { colors: ThemeColors }) {
  const goals = useData(s => s.goals)
  const { setCompletion, setCount, toggleMilestone } = useData()
  const [adding, setAdding] = useState(false)
  const [editingShort, setEditingShort] = useState<Goal | null>(null)
  const [editingLong, setEditingLong] = useState<{ goal: Goal; isNew: boolean } | null>(null)

  const handlers: GoalHandlers = {
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
          <VButton accent={colors.secondary} onClick={() => setEditingLong({ goal: newLongTermGoal(), isNew: true })}>
            <Plus size={16} /> Add goal
          </VButton>
        </div>
      </SectionBox>

      {adding && <AddShortTermGoalSheet onClose={() => setAdding(false)} />}
      {editingShort && <ShortTermGoalEditor goal={editingShort} onClose={() => setEditingShort(null)} />}
      {editingLong && (
        <LongTermGoalEditor goal={editingLong.goal} isNew={editingLong.isNew} accent={colors.secondary} onClose={() => setEditingLong(null)} />
      )}
    </div>
  )
}
