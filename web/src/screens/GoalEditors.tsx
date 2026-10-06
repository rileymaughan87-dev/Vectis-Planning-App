// Goal editors, ported from GoalSheets.swift. Each works on a local copy;
// nothing reaches the store until Save, so Cancel just throws it away.

import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { ALL_DAYS, addDays, addMonths, dayFromKey, dayKey, parseDate, toISO } from '../model/dates'
import { formatTimeRange } from '../model/format'
import { liveSchedule, makeGoal } from '../model/goals'
import { newID } from '../model/ids'
import type { Goal, GoalFrequencyType } from '../model/types'
import { useData } from '../store/data'
import { CompletionMark, EditorBox, Field, RepeatDaysPicker, Segmented, Sheet, Stepper, Toggle, VButton } from '../ui/components'

/** An optional date, off by default, with quick presets. */
export function OptionalDate(props: {
  value?: string
  onChange: (iso: string | undefined) => void
  toggleLabel: string
  dateLabel: string
  presets?: boolean
}) {
  const defaultDate = () => toISO(addMonths(new Date(), 1))
  return (
    <>
      <Toggle label={props.toggleLabel} checked={Boolean(props.value)} onChange={on => props.onChange(on ? (props.value ?? defaultDate()) : undefined)} />
      {props.value && (
        <>
          <Field label={props.dateLabel}>
            <input
              type="date"
              value={dayKey(parseDate(props.value))}
              onChange={e => e.target.value && props.onChange(toISO(dayFromKey(e.target.value)))}
            />
          </Field>
          {props.presets !== false && (
            <div className="presets">
              <button onClick={() => props.onChange(toISO(addDays(new Date(), 14)))}>2 weeks</button>
              <button onClick={() => props.onChange(toISO(addMonths(new Date(), 1)))}>1 month</button>
              <button onClick={() => props.onChange(toISO(addMonths(new Date(), 2)))}>2 months</button>
              <button onClick={() => props.onChange(toISO(addMonths(new Date(), 3)))}>3 months</button>
            </div>
          )}
        </>
      )}
    </>
  )
}

export function AddShortTermGoalSheet({ onClose }: { onClose: () => void }) {
  const add = useData(s => s.addShortTermGoal)
  const [title, setTitle] = useState('')
  const [repeatDays, setRepeatDays] = useState([...ALL_DAYS])
  const [endDate, setEndDate] = useState<string | undefined>()
  const valid = title.trim() !== '' && repeatDays.length > 0

  return (
    <Sheet
      title="New short-term goal"
      onClose={onClose}
      right={{ label: 'Add', disabled: !valid, onClick: () => { add({ title: title.trim(), repeatDays, endDate }); onClose() } }}
    >
      <EditorBox title="Name">
        <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Read for 30 min" aria-label="Name" />
        <p className="help">To tie a habit to a long-term goal, add it from within that goal instead.</p>
      </EditorBox>
      <EditorBox title="Repeats on">
        <RepeatDaysPicker days={repeatDays} onChange={setRepeatDays} />
      </EditorBox>
      <EditorBox title="Duration">
        <OptionalDate value={endDate} onChange={setEndDate} toggleLabel="Set a duration" dateLabel="Ends on" />
      </EditorBox>
    </Sheet>
  )
}

const lengths = [15, 30, 45, 60, 90, 120]
const lengthLabel = (m: number) => (m < 60 ? `${m} min` : m === 60 ? '1 hour' : m === 90 ? '1½ hours' : '2 hours')
const toTimeInput = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
const fromTimeInput = (value: string) => {
  const [h, m] = value.split(':').map(Number)
  return h * 60 + m
}

export function ShortTermGoalEditor({ goal: original, onClose }: { goal: Goal; onClose: () => void }) {
  const update = useData(s => s.updateGoal)
  const remove = useData(s => s.deleteGoal)
  const [goal, setGoal] = useState(original)
  const patch = (p: Partial<Goal>) => setGoal(g => ({ ...g, ...p }))

  const save = () => {
    // Versioned against the schedule as it was when the editor opened,
    // so the change only affects today onward.
    update(goal, liveSchedule(original))
    onClose()
  }

  const help: Record<GoalFrequencyType, string> = {
    specificDays: 'Tracks specific weekdays, like Monday/Wednesday/Friday.',
    timesPerWeek: 'Any days count, up to the weekly target — good for "workout 3 times a week".',
    timesPerDay: 'Tracks several completions in one day, like drinking water 4 times.',
  }

  return (
    <Sheet title="Edit goal" onClose={onClose} right={{ label: 'Save', onClick: save, disabled: goal.repeatDays.length === 0 || !goal.title.trim() }}>
      <EditorBox title="Name">
        <input value={goal.title} onChange={e => patch({ title: e.target.value })} aria-label="Name" />
      </EditorBox>

      <EditorBox title="Track by">
        <Segmented
          label="Track by"
          value={goal.frequencyType}
          onChange={frequencyType => patch({ frequencyType })}
          options={[
            { value: 'specificDays', label: 'Specific days' },
            { value: 'timesPerWeek', label: 'Per week' },
            { value: 'timesPerDay', label: 'Per day' },
          ]}
        />
        {goal.frequencyType === 'specificDays' && <RepeatDaysPicker days={goal.repeatDays} onChange={repeatDays => patch({ repeatDays })} />}
        {goal.frequencyType === 'timesPerWeek' && (
          <Stepper label={`${goal.timesPerWeekTarget} times a week`} value={goal.timesPerWeekTarget} min={1} max={14} onChange={timesPerWeekTarget => patch({ timesPerWeekTarget })} />
        )}
        {goal.frequencyType === 'timesPerDay' && (
          <Stepper label={`${goal.timesPerDayTarget} times a day`} value={goal.timesPerDayTarget} min={1} max={20} onChange={timesPerDayTarget => patch({ timesPerDayTarget })} />
        )}
        <p className="help">{help[goal.frequencyType]}</p>
      </EditorBox>

      <EditorBox title="Duration">
        <OptionalDate value={goal.endDate} onChange={endDate => patch({ endDate })} toggleLabel="Set a duration" dateLabel="Ends on" />
      </EditorBox>

      <EditorBox title="Calendar">
        <Toggle label="Add to calendar" checked={goal.scheduledOnCalendar} onChange={scheduledOnCalendar => patch({ scheduledOnCalendar })} />
        {goal.scheduledOnCalendar && (
          <>
            <div className="inline-fields">
              <Field label="Start time">
                <input type="time" value={toTimeInput(goal.scheduledStartMinutes)} onChange={e => e.target.value && patch({ scheduledStartMinutes: fromTimeInput(e.target.value) })} />
              </Field>
              <Field label="Length">
                <select value={goal.scheduledDurationMinutes} onChange={e => patch({ scheduledDurationMinutes: Number(e.target.value) })}>
                  {lengths.map(m => <option key={m} value={m}>{lengthLabel(m)}</option>)}
                  {!lengths.includes(goal.scheduledDurationMinutes) && (
                    <option value={goal.scheduledDurationMinutes}>{goal.scheduledDurationMinutes} min</option>
                  )}
                </select>
              </Field>
            </div>
            <p className="help">
              Shows at {formatTimeRange(goal.scheduledStartMinutes, goal.scheduledStartMinutes + goal.scheduledDurationMinutes)} on your daily planner, on the days set above.
            </p>
            <Toggle label="Flexible" checked={goal.isFlexible} onChange={isFlexible => patch({ isFlexible })} />
            <p className="help">On means planning can nudge this around the day. Off treats it like a fixed appointment.</p>
          </>
        )}
      </EditorBox>

      <VButton kind="destructive" onClick={() => { remove(goal.id); onClose() }}>Delete goal</VButton>
    </Sheet>
  )
}

export function LongTermGoalEditor({ goal: original, isNew, onClose, accent }: { goal: Goal; isNew: boolean; onClose: () => void; accent: string }) {
  const { addGoal, updateGoal, deleteGoal, addShortTermGoal } = useData()
  const allGoals = useData(s => s.goals)
  const habits = allGoals.filter(g => g.linkedToGoalID === original.id)
  const [goal, setGoal] = useState(original)
  const [habitName, setHabitName] = useState('')
  const patch = (p: Partial<Goal>) => setGoal(g => ({ ...g, ...p }))
  const patchMilestone = (id: string, p: Partial<Goal['milestones'][number]>) =>
    patch({ milestones: goal.milestones.map(m => (m.id === id ? { ...m, ...p } : m)) })

  const cancel = () => {
    // Cancelling a brand-new goal also removes habits added while creating it.
    if (isNew) deleteGoal(goal.id)
    onClose()
  }
  const save = () => {
    if (isNew) addGoal({ ...goal, kind: 'longTerm' })
    else updateGoal(goal)
    onClose()
  }
  const addHabit = () => {
    const title = habitName.trim()
    if (!title) return
    addShortTermGoal({ title, linkedToGoalID: goal.id })
    setHabitName('')
  }

  return (
    <Sheet title={isNew ? 'New goal' : 'Edit goal'} onClose={cancel} right={{ label: isNew ? 'Create' : 'Save', onClick: save, disabled: !goal.title.trim() }}>
      <EditorBox title="Name" accent={accent}>
        <input autoFocus={isNew} value={goal.title} onChange={e => patch({ title: e.target.value })} placeholder="e.g. Finish degree" aria-label="Name" />
      </EditorBox>

      <EditorBox title="Target date" accent={accent}>
        <OptionalDate value={goal.targetDate} onChange={targetDate => patch({ targetDate })} toggleLabel="Set a target date" dateLabel="Complete by" />
      </EditorBox>

      <EditorBox title="Milestones" accent={accent}>
        {goal.milestones.map(m => (
          <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 10, borderBottom: '0.5px solid var(--separator)' }}>
            <div className="row">
              <button onClick={() => patchMilestone(m.id, { done: !m.done })} aria-label={m.done ? 'Mark not done' : 'Mark done'}>
                <CompletionMark on={m.done} color={accent} />
              </button>
              <input value={m.title} onChange={e => patchMilestone(m.id, { title: e.target.value })} placeholder="Milestone name" aria-label="Milestone name" />
              <button className="icon-button" aria-label="Remove milestone" style={{ color: 'var(--danger)' }} onClick={() => patch({ milestones: goal.milestones.filter(x => x.id !== m.id) })}>
                <Trash2 size={16} />
              </button>
            </div>
            <Toggle label="Add to calendar" checked={m.addToCalendar} onChange={on => patchMilestone(m.id, { addToCalendar: on, date: m.date ?? toISO(new Date()) })} />
            {m.addToCalendar && (
              <Field label="Date">
                <input type="date" value={dayKey(parseDate(m.date ?? toISO(new Date())))} onChange={e => e.target.value && patchMilestone(m.id, { date: toISO(dayFromKey(e.target.value)) })} />
              </Field>
            )}
          </div>
        ))}
        <button className="text-button" style={{ textAlign: 'left' }} onClick={() => patch({ milestones: [...goal.milestones, { id: newID(), title: '', done: false, addToCalendar: false }] })}>
          + Add milestone
        </button>
      </EditorBox>

      <EditorBox title="Daily habits" accent={accent}>
        {habits.length === 0 && <p className="help">No daily habits linked yet.</p>}
        {habits.map(h => <div key={h.id}>{h.title}</div>)}
        <div className="row">
          <input value={habitName} onChange={e => setHabitName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addHabit()} placeholder="e.g. Study 1 hour" aria-label="New habit" />
          <VButton small accent={accent} onClick={addHabit} disabled={!habitName.trim()}>Add</VButton>
        </div>
      </EditorBox>

      {!isNew && (
        <>
          <VButton kind="destructive" onClick={() => { deleteGoal(goal.id); onClose() }}>Delete goal</VButton>
          <p className="help">Any daily habits linked to this goal will be deleted too.</p>
        </>
      )}
    </Sheet>
  )
}

export function newLongTermGoal(): Goal {
  return makeGoal('', { kind: 'longTerm' })
}
