// Morning planning, stage 1: capture, not placement. Ported from
// DailyPlanningCaptureView.swift. Shows what's already fixed today, then
// works through anything flexible still waiting for a slot — big things
// first. Steps with nothing in them are skipped. Goals can be given a
// time here; anything still unplaced at the end goes to the drag tray.

import { CheckCircle2, Lock, Target } from 'lucide-react'
import { useState } from 'react'
import { parseDate } from '../model/dates'
import { commitmentFraction } from '../model/dayBlocks'
import { formatDuration, formatTime } from '../model/format'
import { BIG_ITEM_MINUTES, fixedEvents, planningItems, type PlanningItem } from '../model/planning'
import { useData } from '../store/data'
import { CommitmentBar, Sheet, Stepper, VButton } from '../ui/components'
import type { ThemeColors } from '../ui/theme'

type Step = 'context' | 'big' | 'small'

export function PlanningCapture({ date, colors, onClose, onStartPlacing }: {
  date: Date
  colors: ThemeColors
  onClose: () => void
  /** Called on finish if anything is still unplaced — opens the tray. */
  onStartPlacing: () => void
}) {
  const { goals, events, tasks, categories, hours } = useData()
  const fixed = fixedEvents(events, date)
  const items = planningItems(goals, tasks, date)
  const big = items.filter(i => i.durationMinutes >= BIG_ITEM_MINUTES)
  const small = items.filter(i => i.durationMinutes < BIG_ITEM_MINUTES)
  const fraction = commitmentFraction({ goals, events, tasks, categories }, hours, date)

  // Fixed once on open, so an item moving between steps (or being
  // placed) doesn't make a step vanish out from under you.
  const [steps] = useState<Step[]>(() =>
    (['context', 'big', 'small'] as Step[]).filter(s => (s === 'context' ? fixed.length : s === 'big' ? big.length : small.length) > 0),
  )
  // Same for which items each step holds: changing a length across the
  // hour mark shouldn't whisk the item into another step mid-edit.
  const [stepIDs] = useState(() => ({ big: big.map(i => i.id), small: small.map(i => i.id) }))
  const itemsFor = (s: 'big' | 'small') =>
    stepIDs[s].flatMap(id => items.filter(i => i.id === id))
  const [index, setIndex] = useState(0)
  const step = steps[index]
  const isLast = index >= steps.length - 1

  const finish = () => {
    onClose()
    if (items.length > 0) onStartPlacing()
  }

  const right = steps.length === 0 ? undefined
    : !isLast ? { label: 'Next', onClick: () => setIndex(i => i + 1) }
    : { label: items.length ? 'Place on calendar' : 'Done', onClick: finish }

  return (
    <Sheet title="Plan today" onClose={onClose} leftLabel="Close" right={right}>
      <CommitmentBar fraction={fraction} />

      {steps.length === 0 && (
        <div className="empty" style={{ padding: '32px 16px' }}>
          <strong style={{ color: 'var(--text)' }}>Nothing to plan</strong>
          <span className="caption">No fixed events, and nothing flexible waiting for a slot today.</span>
        </div>
      )}

      {step === 'context' && (
        <div className="editor-box">
          <div style={{ fontWeight: 600 }}>Already on your day</div>
          <p className="help">Fixed commitments — these don't move.</p>
          {fixed.map(e => (
            <div key={e.id} className="row" style={{ gap: 10 }}>
              <Lock size={12} className="muted" />
              <span className="caption" style={{ width: 64 }}>{formatTime(parseDate(e.startDate))}</span>
              <span className="grow">{e.title}</span>
            </div>
          ))}
        </div>
      )}

      {(step === 'big' || step === 'small') && (
        <>
          <div>
            <div style={{ fontWeight: 600 }}>{step === 'big' ? 'Big things today' : 'Smaller things'}</div>
            <p className="help">
              {step === 'big'
                ? 'These need a real chunk of time. Give one a slot now, or leave it for later.'
                : 'Goals and quick tasks — place what you want to, skip the rest.'}
            </p>
          </div>
          {itemsFor(step).map(item => <ItemRow key={item.id} item={item} accent={colors.primary} />)}
          {/* Items given a time drop out of the list; say so rather than leave a gap. */}
          {itemsFor(step).length === 0 && <p className="help">All placed.</p>}
        </>
      )}

      {steps.length > 1 && (
        <p className="help" style={{ textAlign: 'center' }}>Step {index + 1} of {steps.length}</p>
      )}
    </Sheet>
  )
}

function ItemRow({ item, accent }: { item: PlanningItem; accent: string }) {
  const { setGoalDuration, setTaskDuration, scheduleGoalOnCalendar } = useData()
  const [picking, setPicking] = useState(false)
  const [time, setTime] = useState('09:00')

  const setMinutes = (m: number) => (item.kind === 'goal' ? setGoalDuration(item.id, m) : setTaskDuration(item.id, m))
  const confirm = () => {
    const [h, m] = time.split(':').map(Number)
    scheduleGoalOnCalendar(item.id, h * 60 + m, item.durationMinutes)
    setPicking(false)
  }

  return (
    <div className="editor-box" style={{ gap: 8 }}>
      <div className="row">
        {item.kind === 'goal' ? <Target size={16} color={accent} /> : <CheckCircle2 size={16} color={accent} />}
        <span className="grow">{item.title}</span>
      </div>
      <Stepper label={formatDuration(item.durationMinutes)} value={item.durationMinutes} min={5} max={480} step={15} onChange={setMinutes} />
      {item.kind === 'goal' && (picking ? (
        <div className="row">
          <input type="time" value={time} onChange={e => setTime(e.target.value)} aria-label="Start time" style={{ flex: 1 }} />
          <VButton small kind="primary" accent={accent} onClick={confirm} disabled={!time}>Confirm</VButton>
          <VButton small accent={accent} onClick={() => setPicking(false)}>Cancel</VButton>
        </div>
      ) : (
        <VButton accent={accent} onClick={() => setPicking(true)}>Give it a time</VButton>
      ))}
      {item.kind === 'task' && <p className="help">Drag it onto the day once you're placing.</p>}
    </div>
  )
}
