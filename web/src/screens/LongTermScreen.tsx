// The Long-Term calendar, ported from LongTermCalendarView.swift: a
// goals summary, then a month grid. Tapping a day lists what's on it and
// lets you add something that stays on this calendar (all-day by
// default, and off the Daily grid unless you give it times).

import { MonthGrid } from '@suite/ui/MonthGrid'
import { ChevronRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { parseDate } from '../model/dates'
import { formatTime } from '../model/format'
import { isTargetOverdue, milestonePercent } from '../model/goals'
import { longTermItems, startOfMonth, type LongTermItem } from '../model/longTerm'
import { useData } from '../store/data'
import { Sheet, VButton, accentStyle } from '../ui/components'
import type { ThemeColors } from '../ui/theme'
import { EventEditor, type EventEditorTarget } from './EventEditor'

const MAX_VISIBLE = 3

export function LongTermScreen({ colors }: { colors: ThemeColors }) {
  const { goals, events, categories } = useData()
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [selected, setSelected] = useState<Date | null>(null)
  const [editor, setEditor] = useState<EventEditorTarget | null>(null)

  const data = { goals, events, categories }
  const longTermGoals = goals.filter(g => g.kind === 'longTerm')
  return (
    <div className="page longterm">
      {longTermGoals.length > 0 && (
        <section className="lt-goals" aria-label="Long-term goals">
          <h2 className="lt-heading">Goals</h2>
          {longTermGoals.map(g => {
            const percent = milestonePercent(g.milestones)
            return (
              <div key={g.id} className="card" style={{ ...accentStyle(colors.secondary), gap: 6, padding: 12, border: 0, background: 'var(--surface)' }}>
                <div className="row spread">
                  <span style={{ fontWeight: 500, fontSize: 14 }}>{g.title}</span>
                  {isTargetOverdue(g) ? <span className="caption2 danger-text">Overdue</span>
                    : g.milestones.length > 0 ? <span className="caption2">{percent}%</span> : null}
                </div>
                {g.milestones.length > 0 && <div className="progress"><div style={{ width: `${percent}%` }} /></div>}
              </div>
            )
          })}
        </section>
      )}

      <section className="lt-month" aria-label="Month">
        <MonthGrid
          month={month}
          onMonthChange={setMonth}
          renderDay={({ date, inMonth, isToday }) => {
            const items = longTermItems(data, date, colors.secondary)
            const visible = items.slice(0, MAX_VISIBLE)
            const overflow = items.length - visible.length
            const label = `${date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}${items.length ? `, ${items.length} item${items.length === 1 ? '' : 's'}` : ''}`
            return (
              <button
                key={date.toISOString()}
                role="gridcell"
                className={`day-cell ${inMonth ? '' : 'outside'} ${isToday ? 'today' : ''}`}
                onClick={() => setSelected(date)}
                aria-label={label}
              >
                <span className="day-number">{date.getDate()}</span>
                {visible.map(item => (
                  <span key={item.id} className="day-item">
                    <span className="swatch" style={{ background: item.colorHex, width: 5, height: 5 }} />
                    <span className="ellipsis">{item.title}</span>
                  </span>
                ))}
                {overflow > 0 && <span className="day-more">+{overflow} more</span>}
                {items.length > 0 && <span className="day-dots" aria-hidden="true">{items.slice(0, 4).map(i => <span key={i.id} style={{ background: i.colorHex }} />)}</span>}
              </button>
            )
          }}
        />
      </section>

      {selected && !editor && (
        <DaySheet
          date={selected}
          items={longTermItems(data, selected, colors.secondary)}
          onClose={() => setSelected(null)}
          onAdd={() => setEditor({ mode: 'new', date: selected, startMinutes: 9 * 60, endMinutes: 9 * 60 + 30, allDay: true, origin: 'longTerm' })}
          onEdit={event => setEditor({ mode: 'edit', event })}
        />
      )}
      {editor && <EventEditor target={editor} onClose={() => setEditor(null)} />}
    </div>
  )
}

function DaySheet(props: {
  date: Date
  items: LongTermItem[]
  onClose: () => void
  onAdd: () => void
  onEdit: (event: Extract<LongTermItem, { kind: 'event' }>['event']) => void
}) {
  const events = props.items.filter((i): i is Extract<LongTermItem, { kind: 'event' }> => i.kind === 'event')
  const milestones = props.items.filter((i): i is Extract<LongTermItem, { kind: 'milestone' }> => i.kind === 'milestone')

  return (
    <Sheet
      title={props.date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
      onClose={props.onClose}
      leftLabel="Close"
      right={{ label: 'Add', onClick: props.onAdd }}
    >
      {props.items.length === 0 && <p className="muted" style={{ margin: 0 }}>Nothing scheduled.</p>}

      {events.length > 0 && (
        <div className="editor-box" style={{ gap: 0, padding: '4px 14px' }}>
          {events.map(({ id, title, colorHex, event }) => (
            <button key={id} className="row list-row" style={{ textAlign: 'left', padding: '10px 0' }} onClick={() => props.onEdit(event)}>
              <span className="swatch" style={{ background: colorHex }} />
              <span className="grow">
                <div>{title}</div>
                <div className="caption">
                  {event.isAllDay ? 'All day' : `${formatTime(parseDate(event.startDate))} – ${formatTime(parseDate(event.endDate))}`}
                  {event.recurrence !== 'none' ? ' · repeats' : ''}
                </div>
              </span>
              <ChevronRight size={16} className="muted" />
            </button>
          ))}
        </div>
      )}

      {milestones.length > 0 && (
        <>
          <span className="field-label" style={{ marginTop: 6 }}>Goal milestones</span>
          <div className="editor-box" style={{ gap: 0, padding: '4px 14px' }}>
            {milestones.map(({ id, title, colorHex, milestone, goal }) => (
              <div key={id} className="row list-row" style={{ padding: '10px 0' }}>
                <span className="swatch" style={{ background: colorHex }} />
                <span className="grow">
                  <div className={milestone.done ? 'strike' : ''}>{title}</div>
                  <div className="caption2">{goal.title}</div>
                </span>
              </div>
            ))}
          </div>
          <p className="help">Milestones are edited from the goal itself on the Goals page.</p>
        </>
      )}

      <VButton onClick={props.onAdd}><Plus size={16} /> Add to this day</VButton>
    </Sheet>
  )
}
