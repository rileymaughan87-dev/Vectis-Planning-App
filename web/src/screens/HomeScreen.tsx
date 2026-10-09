// Home keeps two things: what's on now, and today's goals (Index style,
// Oct 2026). Tasks fold into one link that opens them; times, events and
// all-day items live in Daily. The evening review card appears once it's
// evening. Built on the same dayBlocks() as the Daily grid, so a placed
// task shows here too.

import { Clock, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { dayKey, minutesFromMidnight } from '../model/dates'
import { dayBlocks } from '../model/dayBlocks'
import { formatDuration, formatTime } from '../model/format'
import { isScheduled } from '../model/goals'
import { hasReviewed } from '../model/planning'
import { sortedTasks, useData } from '../store/data'
import { CompletionMark, SectionBox, Sheet } from '../ui/components'
import type { ThemeColors } from '../ui/theme'
import { EveningReview } from './EveningReview'

/** Re-renders every 30 seconds so "42 min left" stays roughly right. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const tick = () => setNow(new Date())
    const id = setInterval(tick, intervalMs)
    // A phone pauses timers while the app is in the background, so catch
    // up the moment it comes back (otherwise "Today" can be yesterday).
    const onVisible = () => document.visibilityState === 'visible' && tick()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', tick)
    }
  }, [intervalMs])
  return now
}

export function HomeScreen({ colors }: { colors: ThemeColors }) {
  const now = useNow()
  const { goals, events, tasks, categories, journal, planReview, setCompletion } = useData()
  const [reviewing, setReviewing] = useState(false)
  const [tasksOpen, setTasksOpen] = useState(false)

  // Quiet until it's relevant and gone once done: only with Plan and
  // review on, after the evening time, until today's review is answered.
  const showReview = planReview.isEnabled && minutesFromMidnight(now) >= planReview.eveningReviewMinutes && !hasReviewed(journal, now)

  const blocks = dayBlocks({ events, goals, tasks, categories }, now)
  const current = blocks.find(b => b.start <= now && b.end > now)
  const next = blocks.find(b => b.start > now)

  const nowAccent = !current ? colors.secondary
    : current.kind === 'goal' ? colors.primary
    : current.kind === 'task' ? colors.tertiary
    : current.colorHex ?? '#999999'

  const todaysGoals = goals.filter(g => g.kind === 'shortTerm' && isScheduled(g, now))
  const key = dayKey(now)
  const done = todaysGoals.filter(g => g.completions[key] === true).length
  const openTasks = tasks.filter(t => !t.done).length
  const minutesLeft = current ? Math.max(Math.round((current.end.getTime() - now.getTime()) / 60_000), 0) : 0

  return (
    <div className="page home">
      <SectionBox title="Right now" accent={nowAccent}>
        {current ? (
          <div className="now-block">
            <div className="now-title">{current.title}</div>
            <div className="mono now-meta">Until {formatTime(current.end)} · {minutesLeft} min left</div>
          </div>
        ) : (
          <div className="now-block">
            <div className="now-title muted">Nothing scheduled</div>
            <div className="mono now-meta">{next ? `Open until ${formatTime(next.start)}` : 'Nothing else on today'}</div>
          </div>
        )}
        {current && next && <div className="now-next">Next: {next.title} at {formatTime(next.start)}</div>}
      </SectionBox>

      <SectionBox title="Today" accent={colors.primary} subtitle={todaysGoals.length ? `${done} of ${todaysGoals.length}` : undefined}>
        <div className="today-list">
          {todaysGoals.length === 0 && <span className="caption">No goals scheduled today.</span>}
          {todaysGoals.map(g => {
            const ticked = g.completions[key] === true
            return (
              <button key={g.id} className="today-goal" onClick={() => setCompletion(g.id, now, !ticked)} aria-pressed={ticked}>
                <CompletionMark on={ticked} size={18} color={colors.primary} />
                <span className={`grow ${ticked ? 'strike' : ''}`}>{g.title}</span>
              </button>
            )
          })}
          <button className="link-row" onClick={() => setTasksOpen(true)}>
            <span className="grow">{openTasks === 0 ? 'Tasks' : `${openTasks} ${openTasks === 1 ? 'task' : 'tasks'}`}</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </SectionBox>

      {showReview && (
        <button className="review-entry" onClick={() => setReviewing(true)}>
          <span className="mono index" style={{ color: colors.primary }}>03</span>
          <span className="grow">
            <span className="review-entry-title">Evening review</span>
            <span className="caption">A quick look back, and a line or two if you want.</span>
          </span>
          <span className="review-entry-go" aria-hidden="true">→</span>
        </button>
      )}
      {reviewing && <EveningReview colors={colors} onClose={() => setReviewing(false)} />}
      {tasksOpen && <TasksSheet colors={colors} onClose={() => setTasksOpen(false)} />}
    </div>
  )
}

/** Every task: tick, give a duration (so it can go on the Daily grid), delete, add. */
function TasksSheet({ colors, onClose }: { colors: ThemeColors; onClose: () => void }) {
  const { tasks, addTask, toggleTask, setTaskDuration, deleteTask } = useData()
  const [newTask, setNewTask] = useState('')
  const open = tasks.filter(t => !t.done).length

  return (
    <Sheet title="Tasks" onClose={onClose} leftLabel="Done">
      {tasks.length > 0 && <span className="mono muted">{open} left</span>}
      <div>
        {sortedTasks(tasks).map(t => (
          <div key={t.id} className="row list-row">
            <button onClick={() => toggleTask(t.id)} aria-label={t.done ? 'Mark not done' : 'Mark done'} aria-pressed={t.done}>
              <CompletionMark on={t.done} size={17} color={colors.tertiary} />
            </button>
            <span className={`grow ${t.done ? 'strike' : ''}`}>{t.text}</span>
            <label className="mono muted" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }} title="Duration">
              {t.durationMinutes ? formatDuration(t.durationMinutes) : <Clock size={13} style={{ opacity: 0.5 }} />}
              <select
                aria-label="Duration"
                value={t.durationMinutes ?? ''}
                onChange={e => setTaskDuration(t.id, e.target.value ? Number(e.target.value) : undefined)}
                style={{ position: 'absolute', inset: 0, opacity: 0, padding: 0 }}
              >
                <option value="">No duration</option>
                {[15, 30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{formatDuration(m)}</option>)}
              </select>
            </label>
            <button className="muted" onClick={() => deleteTask(t.id)} aria-label={`Delete ${t.text}`}><X size={14} /></button>
          </div>
        ))}
        <form
          className="row list-row"
          onSubmit={e => {
            e.preventDefault()
            addTask(newTask)
            setNewTask('')
          }}
        >
          <Plus size={14} className="muted" style={{ width: 17 }} />
          <input value={newTask} onChange={e => setNewTask(e.target.value)} placeholder="Add a task" aria-label="Add a task" style={{ background: 'transparent', border: 0, padding: '4px 0' }} />
        </form>
      </div>
      <p className="help">With Plan and review on, a task with a duration waits in Daily planning, ready to drop onto your day.</p>
    </Sheet>
  )
}
