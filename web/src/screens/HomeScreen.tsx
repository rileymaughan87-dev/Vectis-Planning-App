// What's happening right now, today's goals, and tasks. Built on the
// same dayBlocks() as the Daily grid, so a placed task shows here too.

import { ArrowRight, Clock, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { dayKey } from '../model/dates'
import { allDayEvents, dayBlocks } from '../model/dayBlocks'
import { formatDuration, formatTime, formatTimeRange } from '../model/format'
import { isScheduled } from '../model/goals'
import { sortedTasks, useData } from '../store/data'
import { CompletionMark, SectionBox } from '../ui/components'
import type { ThemeColors } from '../ui/theme'

/** Re-renders every 30 seconds so "42 min left" stays roughly right. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export function HomeScreen({ colors }: { colors: ThemeColors }) {
  const now = useNow()
  const { goals, events, tasks, categories, setCompletion, addTask, toggleTask, setTaskDuration, deleteTask } = useData()
  const [newTask, setNewTask] = useState('')

  const blocks = dayBlocks({ events, goals, tasks, categories }, now)
  const current = blocks.find(b => b.start <= now && b.end > now)
  const next = blocks.find(b => b.start > now)
  const allDay = allDayEvents(events, now)

  const nowAccent = !current ? colors.secondary
    : current.kind === 'goal' ? colors.primary
    : current.kind === 'task' ? colors.tertiary
    : current.colorHex ?? '#999999'

  const todaysGoals = goals.filter(g => g.kind === 'shortTerm' && isScheduled(g, now))
  const key = dayKey(now)
  const left = todaysGoals.filter(g => g.completions[key] !== true).length
  const incomplete = tasks.filter(t => !t.done).length

  return (
    <div className="page">
      <SectionBox
        title="Right now"
        accent={nowAccent}
        subtitle={now.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {current ? (
            <div>
              <div className="big-title">{current.title}</div>
              <div className="caption">
                {formatTime(current.start)} – {formatTime(current.end)} · {Math.max(Math.round((current.end.getTime() - now.getTime()) / 60_000), 0)} min left
              </div>
            </div>
          ) : (
            <div>
              <div className="muted" style={{ fontSize: 20, fontWeight: 600 }}>Nothing scheduled</div>
              <div className="caption">{next ? `Open until ${formatTime(next.start)}.` : 'Nothing else on today.'}</div>
            </div>
          )}

          {current && next && (
            <>
              <hr className="divider" />
              <div className="row caption">
                <ArrowRight size={12} />
                <span className="ellipsis">{next.title} at {formatTime(next.start)}</span>
              </div>
            </>
          )}

          {allDay.length > 0 && (
            <>
              <hr className="divider" />
              {allDay.map(e => (
                <div key={e.id} className="row caption" style={{ color: 'var(--text)' }}>
                  <span className="swatch" style={{ background: categories.find(c => c.id === e.categoryID)?.colorHex ?? '#999' }} />
                  <span className="grow ellipsis">{e.title}</span>
                  <span className="caption2">All day</span>
                </div>
              ))}
            </>
          )}
        </div>
      </SectionBox>

      <SectionBox title="Today's goals" accent={colors.primary} subtitle={todaysGoals.length ? `${left} left` : undefined}>
        {todaysGoals.length === 0 ? (
          <span className="caption">No goals scheduled today.</span>
        ) : (
          <div className="scroll-list">
            {todaysGoals.map(g => {
              const done = g.completions[key] === true
              return (
                <button key={g.id} className="row list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setCompletion(g.id, now, !done)} aria-pressed={done}>
                  <CompletionMark on={done} size={17} color={colors.primary} />
                  <span className={`grow ${done ? 'strike' : ''}`}>{g.title}</span>
                  {g.scheduledOnCalendar && (
                    <span className="caption2">{formatTimeRange(g.scheduledStartMinutes, g.scheduledStartMinutes + g.scheduledDurationMinutes)}</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </SectionBox>

      <SectionBox title="Tasks" accent={colors.tertiary} subtitle={tasks.length ? `${incomplete} left` : undefined}>
        {sortedTasks(tasks).map(t => (
          <div key={t.id} className="row list-row">
            <button onClick={() => toggleTask(t.id)} aria-label={t.done ? 'Mark not done' : 'Mark done'} aria-pressed={t.done}>
              <CompletionMark on={t.done} size={17} color={colors.tertiary} />
            </button>
            <span className={`grow ${t.done ? 'strike' : ''}`}>{t.text}</span>
            <label className="caption2" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }} title="Duration">
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
          <input value={newTask} onChange={e => setNewTask(e.target.value)} placeholder="Add a task" aria-label="Add a task" style={{ background: 'transparent', padding: '4px 0' }} />
        </form>
      </SectionBox>
    </div>
  )
}
