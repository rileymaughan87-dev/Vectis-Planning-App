// Goal rows and cards. Used by the Goals tab and, read-only, by a
// partner's view — leave out the handlers and nothing is tappable.

import { Minus, Plus } from 'lucide-react'
import { parseDate } from '../model/dates'
import { formatShortDate, formatTimeRange } from '../model/format'
import {
  challengeDay, completionCount, isDoneOn, isMilestoneOverdue, isScheduled, isTargetOverdue, milestonePercent,
  missNudge, recentDates, recentHistory, recentRate, restAllowance, restDaysLeft, totalCompletions, weeklyCompletionCount, type GoalDayState,
} from '../model/goals'
import type { Goal } from '../model/types'
import { CompletionMark, accentStyle } from './components'

export interface GoalHandlers {
  onEdit?: (goal: Goal) => void
  onSetDone?: (goal: Goal, date: Date, done: boolean) => void
  onSetCount?: (goal: Goal, date: Date, count: number) => void
  onToggleMilestone?: (goal: Goal, milestoneID: string) => void
}

function Dot({ state }: { state: GoalDayState }) {
  const cls = state === 'notScheduled' ? 'off' : state
  return <span className={`dot ${cls}`} />
}

const stateLabel: Record<GoalDayState, string> = {
  done: 'done', rest: 'rest day', missed: 'missed', pending: 'not yet', notScheduled: 'not scheduled',
}

export function HistoryStrip({ goal, onSetDone }: { goal: Goal; onSetDone?: GoalHandlers['onSetDone'] }) {
  const states = recentHistory(goal)
  const dates = recentDates()
  return (
    <div className="dots" style={{ margin: '-8px 0' }}>
      {states.map((state, i) => {
        const label = `${dates[i].toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}: ${stateLabel[state]}`
        if (!onSetDone || state === 'notScheduled') {
          return <span key={i} className="dot-button" title={label} aria-label={label} role="img"><Dot state={state} /></span>
        }
        return (
          <button key={i} className="dot-button" title={label} aria-label={label} onClick={() => onSetDone(goal, dates[i], state !== 'done')}>
            <Dot state={state} />
          </button>
        )
      })}
    </div>
  )
}

export function ShortTermGoalRow(props: GoalHandlers & { goal: Goal; accent: string; nested?: boolean }) {
  const { goal, accent } = props
  const today = new Date()
  const doneToday = isDoneOn(goal, today)
  const scheduledToday = isScheduled(goal, today)
  const count = completionCount(goal, today)
  const rate = recentRate(goal)
  const total = totalCompletions(goal)
  const nudge = missNudge(goal)
  const restLeft = goal.frequencyType === 'specificDays' && restAllowance(goal) > 0 ? restDaysLeft(goal, today) : 0

  const meta: string[] = []
  if (goal.scheduledOnCalendar) {
    meta.push(formatTimeRange(goal.scheduledStartMinutes, goal.scheduledStartMinutes + goal.scheduledDurationMinutes))
  }
  if (goal.endDate) meta.push(`until ${formatShortDate(parseDate(goal.endDate))}`)
  if (goal.frequencyType !== 'specificDays' && total > 0) meta.push(`${total}× done`)

  return (
    <div className={`card ${props.nested ? 'nested' : ''}`} style={accentStyle(accent)}>
      <div className="row spread">
        {props.onEdit ? (
          <button className="title-link grow" onClick={() => props.onEdit!(goal)}>{goal.title}</button>
        ) : (
          <span className="grow">{goal.title}</span>
        )}

        {goal.frequencyType === 'timesPerDay' ? (
          <div className="row" style={{ gap: 10 }}>
            {props.onSetCount && (
              <button aria-label="One fewer" disabled={count === 0} onClick={() => props.onSetCount!(goal, today, count - 1)}>
                <Minus size={18} />
              </button>
            )}
            <span className="caption" style={{ fontWeight: 600, minWidth: 28, textAlign: 'center', color: doneToday ? accent : undefined }}>
              {count}/{goal.timesPerDayTarget}
            </span>
            {props.onSetCount && (
              <button aria-label="One more" style={{ color: accent }} disabled={count >= goal.timesPerDayTarget} onClick={() => props.onSetCount!(goal, today, count + 1)}>
                <Plus size={18} />
              </button>
            )}
          </div>
        ) : (
          <button
            className="row caption"
            style={{ gap: 4, color: 'var(--text)' }}
            disabled={!props.onSetDone || !scheduledToday}
            onClick={() => props.onSetDone?.(goal, today, !doneToday)}
            aria-pressed={doneToday}
          >
            <CompletionMark on={doneToday} size={16} color={accent} />
            Today
          </button>
        )}
      </div>

      {goal.frequencyType === 'specificDays' && <HistoryStrip goal={goal} onSetDone={props.onSetDone} />}
      {goal.frequencyType === 'timesPerWeek' && (
        <span className="caption" style={weeklyCompletionCount(goal) >= goal.timesPerWeekTarget ? { color: accent } : undefined}>
          {weeklyCompletionCount(goal)} of {goal.timesPerWeekTarget} this week
        </span>
      )}

      {goal.frequencyType === 'specificDays' && (rate.scheduled > 0 || total > 0) && (
        <div className="row" style={{ gap: 22, alignItems: 'baseline' }}>
          {rate.scheduled > 0 && <div className="stat"><div className="value">{rate.done}/{rate.scheduled}</div><div className="caption2">last fortnight{restAllowance(goal) > 0 ? ', rest days aside' : ''}</div></div>}
          {total > 0 && <div className="stat"><div className="value">{total}</div><div className="caption2">times done</div></div>}
        </div>
      )}

      {meta.length > 0 && <span className="caption2">{meta.join('  ·  ')}</span>}
      {restLeft > 0 && <span className="caption2">{restLeft} rest day{restLeft === 1 ? '' : 's'} left this week</span>}
      {nudge && <span className="caption2">{nudge}</span>}
    </div>
  )
}

export function LongTermGoalCard(props: GoalHandlers & { goal: Goal; allGoals: Goal[]; accent: string; habitAccent: string }) {
  const { goal, accent } = props
  const linked = props.allGoals.filter(g => g.linkedToGoalID === goal.id)
  const day = goal.challengeTemplateID ? challengeDay(goal) : null
  const doneCount = goal.milestones.filter(m => m.done).length
  const percent = milestonePercent(goal.milestones)

  return (
    <div className="card" style={{ ...accentStyle(accent), gap: 8 }}>
      <div className="row spread">
        {props.onEdit ? (
          <button className="title-link grow" style={{ fontWeight: 500 }} onClick={() => props.onEdit!(goal)}>{goal.title}</button>
        ) : (
          <span className="grow" style={{ fontWeight: 500 }}>{goal.title}</span>
        )}
        {day !== null ? (
          <span className="caption2" style={{ color: accent, fontWeight: 500 }}>
            Day {day}{goal.challengeAttempt > 1 ? ` · attempt ${goal.challengeAttempt}` : ''}
          </span>
        ) : isTargetOverdue(goal) ? (
          <span className="caption2 danger-text">Overdue</span>
        ) : goal.targetDate ? (
          <span className="caption2">by {formatShortDate(parseDate(goal.targetDate))}</span>
        ) : null}
      </div>

      {goal.milestones.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {[...goal.notes].sort((a, b) => b.date.localeCompare(a.date)).map(n => (
            <span key={n.id} className="caption">{formatShortDate(parseDate(n.date))} — {n.text}</span>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <div style={{ width: `${percent}%` }} />
          </div>
          {goal.milestones.map(m => (
            <div key={m.id} className="row">
              <button
                disabled={!props.onToggleMilestone}
                style={{ opacity: 1 }}
                onClick={() => props.onToggleMilestone?.(goal, m.id)}
                aria-label={`${m.title}: ${m.done ? 'done' : 'not done'}`}
                aria-pressed={m.done}
              >
                <CompletionMark on={m.done} size={15} color={accent} />
              </button>
              <span className={`caption grow ${m.done ? 'strike' : ''}`} style={m.done ? undefined : { color: 'var(--text)' }}>{m.title}</span>
              {isMilestoneOverdue(m) ? (
                <span className="caption2 danger-text">Overdue</span>
              ) : m.addToCalendar && m.date ? (
                <span className="caption2">{formatShortDate(parseDate(m.date))}</span>
              ) : null}
            </div>
          ))}
          <span className="caption2">{doneCount} of {goal.milestones.length} milestones · {percent}%</span>
        </div>
      )}

      {linked.length > 0 && (
        <>
          <hr className="divider" />
          <span className="caption2">Daily habits for this goal</span>
          {linked.map(h => (
            <ShortTermGoalRow
              key={h.id}
              goal={h}
              accent={props.habitAccent}
              nested
              onEdit={props.onEdit}
              onSetDone={props.onSetDone}
              onSetCount={props.onSetCount}
            />
          ))}
        </>
      )}
    </div>
  )
}
