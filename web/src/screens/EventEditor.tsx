// The event editor, ported from CalendarSheets.swift: title, when,
// category, then collapsed Repeats / Parts / Links rows that open their
// own pages inside the sheet.

import { ChevronLeft, Trash2 } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { addMonths, atMinutes, dayFromKey, dayKey, daysBetween, minutesFromMidnight, parseDate, startOfDay, toISO } from '../model/dates'
import { makeEvent } from '../model/events'
import { formatDuration } from '../model/format'
import { newID } from '../model/ids'
import type { CalendarEvent, EventOrigin, EventPart, EventRecurrence } from '../model/types'
import { useData } from '../store/data'
import {
  EditorBox, Field, RepeatDaysPicker, Sheet, Stepper, SummaryRow, Toggle, VButton, accentStyle, repeatSummary,
} from '../ui/components'

type Page = 'main' | 'repeats' | 'parts' | 'links'

export type EventEditorTarget =
  | { mode: 'new'; date: Date; startMinutes: number; endMinutes: number; allDay?: boolean; origin?: EventOrigin }
  /** `event` is the occurrence as shown — for a repeat, shifted onto that day. */
  | { mode: 'edit'; event: CalendarEvent }

const timeValue = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
const withTime = (d: Date, value: string) => {
  const [h, m] = value.split(':').map(Number)
  return atMinutes(d, h * 60 + m)
}
const minutesBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 60_000)

export function EventEditor({ target, onClose }: { target: EventEditorTarget; onClose: () => void }) {
  const { categories, goals, events, addEvent, updateEvent, deleteEvent, deleteOccurrence, setOccurrenceTime, resizeEvent } = useData()
  const original = target.mode === 'edit' ? target.event : null

  const [page, setPage] = useState<Page>('main')
  const [title, setTitle] = useState(original?.title ?? '')
  const [categoryID, setCategoryID] = useState(original?.categoryID ?? categories[0]?.id)
  const [start, setStart] = useState(() => original ? parseDate(original.startDate) : atMinutes(target.mode === 'new' ? target.date : new Date(), target.mode === 'new' ? target.startMinutes : 540))
  const [end, setEnd] = useState(() => original ? parseDate(original.endDate) : atMinutes(target.mode === 'new' ? target.date : new Date(), target.mode === 'new' ? target.endMinutes : 570))
  const [isAllDay, setIsAllDay] = useState(original?.isAllDay ?? (target.mode === 'new' && Boolean(target.allDay)))
  const [flowsToDaily, setFlowsToDaily] = useState(original?.flowsToDaily ?? !(target.mode === 'new' && target.allDay))
  const [userSetDaily, setUserSetDaily] = useState(Boolean(original))
  const [isFlexible, setIsFlexible] = useState(original?.isFlexible ?? false)
  const [recurrence, setRecurrence] = useState<EventRecurrence>(original?.recurrence ?? 'none')
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(original?.recurrenceEndDate)
  const [repeatDays, setRepeatDays] = useState(original?.repeatDays ?? [1, 2, 3, 4, 5, 6, 7])
  const [parts, setParts] = useState<EventPart[]>(original?.parts ?? [])
  const [linkedGoalID, setLinkedGoalID] = useState(original?.linkedGoalID)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [logging, setLogging] = useState(false)
  const [loggedMinutes, setLoggedMinutes] = useState(original?.actualMinutes ?? Math.max(minutesBetween(start, end), 5))

  const origin: EventOrigin = original?.origin ?? (target.mode === 'new' ? target.origin ?? 'daily' : 'daily')
  const accent = categories.find(c => c.id === categoryID)?.colorHex ?? 'var(--primary)'
  const spanDays = daysBetween(start, end) + 1
  // Repeating events have no per-occurrence duration yet, so nothing to log against.
  const canLogActual = original !== null && !isAllDay && original.recurrence === 'none' && new Date() >= parseDate(original.startDate)
  const partsTotal = parts.reduce((a, p) => a + p.estimatedMinutes, 0)
  const blockMinutes = Math.max(minutesBetween(start, end), 0)

  const repeatsText = recurrence === 'none' ? 'Never' : recurrence === 'weekly' ? 'Every week' : recurrence === 'monthly' ? 'Every month' : repeatSummary(repeatDays)
  const partsText = parts.length === 0 ? 'None' : `${parts.length} part${parts.length === 1 ? '' : 's'} · ${formatDuration(partsTotal)}`
  const linksText = goals.find(g => g.id === linkedGoalID)?.title ?? 'None'

  /** Moves both start and end by whole days, keeping times and span. */
  const setSharedDate = (key: string) => {
    if (!key) return
    const delta = daysBetween(start, dayFromKey(key))
    if (delta === 0) return
    setStart(new Date(start.getFullYear(), start.getMonth(), start.getDate() + delta, start.getHours(), start.getMinutes()))
    setEnd(new Date(end.getFullYear(), end.getMonth(), end.getDate() + delta, end.getHours(), end.getMinutes()))
  }

  const save = () => {
    if (!categoryID) return
    const resolvedTitle = title.trim() || 'New event'
    let resolvedStart = start
    let resolvedEnd = end
    if (isAllDay) {
      resolvedStart = startOfDay(start)
      resolvedEnd = atMinutes(end, 23 * 60 + 59)
    }
    if (resolvedEnd < resolvedStart) resolvedEnd = new Date(resolvedStart.getTime() + 30 * 60_000)

    const fields = {
      title: resolvedTitle, categoryID, isAllDay, flowsToDaily: isAllDay ? false : flowsToDaily,
      recurrence, recurrenceEndDate, repeatDays, parts, linkedGoalID, origin, isFlexible,
    }

    if (original && original.recurrence !== 'none') {
      // The editor holds the occurrence's shifted times, not the series
      // anchor. Edit the stored series, never its dates; a new start time
      // becomes an override for this day only.
      const series = events.find(e => e.id === original.id)
      if (!series) return
      updateEvent({ ...series, ...fields })
      if (resolvedStart.getTime() !== parseDate(original.startDate).getTime()) {
        setOccurrenceTime(original.id, parseDate(original.startDate), minutesFromMidnight(resolvedStart))
      }
    } else if (original) {
      // Always a plain edit. Only "Log actual time" records an actual.
      updateEvent({ ...original, ...events.find(e => e.id === original.id), ...fields, startDate: toISO(resolvedStart), endDate: toISO(resolvedEnd) })
    } else {
      addEvent(makeEvent({ ...fields, startDate: toISO(resolvedStart), endDate: toISO(resolvedEnd) }))
    }
    onClose()
  }

  if (page !== 'main') {
    const back = () => setPage('main')
    const titles = { repeats: 'Repeats', parts: 'Parts', links: 'Links' }
    return (
      <Sheet title={titles[page]} onClose={back} leftLabel="‹ Back">
        {page === 'repeats' && (
          <>
            <EditorBox title="Repeats" accent={accent}>
              <select value={recurrence} onChange={e => setRecurrence(e.target.value as EventRecurrence)} aria-label="Repeats">
                <option value="none">Never</option>
                <option value="daily">Every day</option>
                <option value="weekly">Every week</option>
                <option value="monthly">Every month</option>
              </select>
            </EditorBox>
            {recurrence === 'daily' && (
              <EditorBox title="On these days" accent={accent}>
                <RepeatDaysPicker days={repeatDays} onChange={setRepeatDays} />
              </EditorBox>
            )}
            {recurrence !== 'none' && (
              <EditorBox title="Ends" accent={accent}>
                <Toggle
                  label="Stops repeating"
                  checked={Boolean(recurrenceEndDate)}
                  onChange={on => setRecurrenceEndDate(on ? toISO(addMonths(end, 3)) : undefined)}
                />
                {recurrenceEndDate && (
                  <Field label="Until">
                    <input type="date" value={dayKey(parseDate(recurrenceEndDate))} onChange={e => e.target.value && setRecurrenceEndDate(toISO(dayFromKey(e.target.value)))} />
                  </Field>
                )}
                <p className="help">Changing the start time of a repeating event moves only the occurrence you opened. Changing just the end time isn't tracked per occurrence yet.</p>
              </EditorBox>
            )}
          </>
        )}

        {page === 'parts' && (
          <>
            <EditorBox title="Parts" accent={accent}>
              {parts.map(p => (
                <div key={p.id} className="row">
                  <input value={p.title} placeholder="e.g. Read textbook" aria-label="Part name" onChange={e => setParts(parts.map(x => (x.id === p.id ? { ...x, title: e.target.value } : x)))} />
                  <input
                    type="number" min={0} inputMode="numeric" aria-label="Minutes" style={{ width: 70, textAlign: 'right' }}
                    value={p.estimatedMinutes}
                    onChange={e => setParts(parts.map(x => (x.id === p.id ? { ...x, estimatedMinutes: Math.max(0, Number(e.target.value) || 0) } : x)))}
                  />
                  <span className="caption">min</span>
                  <button className="icon-button" aria-label="Remove part" style={{ color: 'var(--danger)' }} onClick={() => setParts(parts.filter(x => x.id !== p.id))}><Trash2 size={16} /></button>
                </div>
              ))}
              <button className="text-button" style={{ textAlign: 'left' }} onClick={() => setParts([...parts, { id: newID(), title: '', estimatedMinutes: 30 }])}>+ Add a part</button>
              <p className="help">Splitting a task into named pieces tends to produce a more accurate estimate than guessing at the whole thing.</p>
            </EditorBox>
            {parts.length > 0 && (
              <EditorBox title="Parts total" accent={accent} trailing={formatDuration(partsTotal)}>
                {partsTotal > blockMinutes ? (
                  <>
                    <p className="help">The parts add up to more than you set aside. That's normal once a task is unpacked — extend the block, or trim the scope.</p>
                    <VButton accent={accent} onClick={() => setEnd(new Date(start.getTime() + partsTotal * 60_000))}>Extend block to {formatDuration(partsTotal)}</VButton>
                  </>
                ) : <p className="help">Fits inside the {formatDuration(blockMinutes)} block.</p>}
              </EditorBox>
            )}
          </>
        )}

        {page === 'links' && (
          <EditorBox title="Goal" accent={accent}>
            <select value={linkedGoalID ?? ''} onChange={e => setLinkedGoalID(e.target.value || undefined)} aria-label="Linked goal">
              <option value="">None</option>
              {goals.map(g => {
                const parent = goals.find(p => p.id === g.linkedToGoalID)
                return <option key={g.id} value={g.id}>{parent ? `${g.title} (${parent.title})` : g.title}</option>
              })}
            </select>
          </EditorBox>
        )}
      </Sheet>
    )
  }

  return (
    <Sheet title={original ? 'Edit event' : 'New event'} onClose={onClose} right={{ label: original ? 'Save' : 'Add', onClick: save }}>
      <div className="editor-box" style={{ borderLeft: `4px solid ${accent}` }}>
        <span className="field-label">Title</span>
        <input autoFocus={!original} value={title} onChange={e => setTitle(e.target.value)} placeholder="New event" aria-label="Title" style={{ fontSize: 19 }} />
      </div>

      <EditorBox title="When" accent={accent} trailing={isAllDay ? undefined : formatDuration(blockMinutes)}>
        {isAllDay ? (
          <div className="inline-fields">
            <Field label="Starts"><input type="date" value={dayKey(start)} onChange={e => e.target.value && setStart(dayFromKey(e.target.value))} /></Field>
            <Field label="Ends"><input type="date" value={dayKey(end)} onChange={e => e.target.value && setEnd(dayFromKey(e.target.value))} /></Field>
          </div>
        ) : (
          <>
            <Field label="Date"><input type="date" value={dayKey(start)} onChange={e => setSharedDate(e.target.value)} /></Field>
            <div className="inline-fields">
              <Field label="Starts"><input type="time" value={timeValue(start)} onChange={e => e.target.value && setStart(withTime(start, e.target.value))} /></Field>
              <Field label="Ends"><input type="time" value={timeValue(end)} onChange={e => e.target.value && setEnd(withTime(end, e.target.value))} /></Field>
            </div>
          </>
        )}
        {spanDays > 1 && <span className="caption2">Spans {spanDays} days</span>}
        <Toggle label="All day" checked={isAllDay} onChange={on => { setIsAllDay(on); if (!userSetDaily) setFlowsToDaily(!on) }} />
        {!isAllDay && (
          <>
            <Toggle label="Show on Daily planner" checked={flowsToDaily} onChange={on => { setFlowsToDaily(on); setUserSetDaily(true) }} />
            <Toggle label="Flexible" checked={isFlexible} onChange={setIsFlexible} />
            <p className="help">Off means this is a real commitment — planning builds the day around it rather than moving it.</p>
          </>
        )}
      </EditorBox>

      <EditorBox title="Category" accent={accent}>
        <div className="chips">
          {categories.map(c => (
            <button key={c.id} className="chip" aria-pressed={categoryID === c.id} style={{ '--chip-color': c.colorHex } as CSSProperties} onClick={() => setCategoryID(c.id)}>
              <span className="swatch" style={{ background: c.colorHex }} />{c.name}
            </button>
          ))}
        </div>
      </EditorBox>

      <SummaryRow title="Repeats" summary={repeatsText} onClick={() => setPage('repeats')} />
      <SummaryRow title="Break into parts" summary={partsText} onClick={() => setPage('parts')} />
      <SummaryRow title="Links" summary={linksText} onClick={() => setPage('links')} />

      {canLogActual && original && (
        <EditorBox title="Time taken" accent={accent}>
          {logging ? (
            <>
              <Stepper label={formatDuration(loggedMinutes)} value={loggedMinutes} min={5} max={600} step={5} onChange={setLoggedMinutes} />
              <div className="button-row">
                <VButton kind="primary" accent={accent} onClick={() => { resizeEvent(original.id, new Date(parseDate(original.startDate).getTime() + loggedMinutes * 60_000)); setLogging(false) }}>Log it</VButton>
                <VButton accent={accent} onClick={() => setLogging(false)}>Cancel</VButton>
              </div>
            </>
          ) : (
            <>
              <VButton accent={accent} onClick={() => setLogging(true)}>{original.actualMinutes !== undefined ? 'Update logged time' : 'Log actual time'}</VButton>
              {events.find(e => e.id === original.id)?.actualMinutes !== undefined && (
                <span className="caption2">Logged: {events.find(e => e.id === original.id)?.actualMinutes} min</span>
              )}
            </>
          )}
        </EditorBox>
      )}

      {original && !confirmDelete && (
        <VButton kind="destructive" onClick={() => {
          if (original.recurrence !== 'none') setConfirmDelete(true)
          else { deleteEvent(original.id); onClose() }
        }}>Delete event</VButton>
      )}
      {original && confirmDelete && (
        <div className="editor-box" style={accentStyle(accent)}>
          <strong>This is a repeating event</strong>
          <p className="help">Delete just this one, or the whole series?</p>
          <VButton onClick={() => { deleteOccurrence(original.id, parseDate(original.startDate)); onClose() }}>Delete just this occurrence</VButton>
          <VButton kind="destructive" onClick={() => { deleteEvent(original.id); onClose() }}>Delete all occurrences</VButton>
          <button className="text-button" onClick={() => setConfirmDelete(false)}><ChevronLeft size={14} style={{ verticalAlign: -2 }} />Keep it</button>
        </div>
      )}
    </Sheet>
  )
}
