// The Daily grid, ported from DailyCalendarView.swift.
//
// Tap an empty slot to add an event, tap a block to open it, press and
// hold a block to pick it up and drag it. Moving one occurrence of a
// goal or repeating event moves that day only. Swipe sideways on the
// grid to change day.

import { CheckCircle2, ChevronLeft, ChevronRight, Circle, Minus, Plus, Target } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent, type TouchEvent as ReactTouchEvent } from 'react'
import { addDays, addMinutes, dayKey, isSameDay, startOfDay } from '../model/dates'
import { dayBlocks, layoutBlocks, minutesIntoDay, type DayBlock } from '../model/dayBlocks'
import { contrastingText, darkened, formatDayHeading, formatMinutes, formatTime, withAlpha } from '../model/format'
import { isScheduled } from '../model/goals'
import type { Goal } from '../model/types'
import { useData } from '../store/data'
import { CompletionMark, Sheet, VButton } from '../ui/components'
import type { ThemeColors } from '../ui/theme'
import { EventEditor, type EventEditorTarget } from './EventEditor'
import { ShortTermGoalEditor } from './GoalEditors'
import { useNow } from './HomeScreen'

const GUTTER = 46
const SNAP = 15
const LONG_PRESS_MS = 300
const MIN_SLOT = 12
const MAX_SLOT = 64

interface DragState {
  id: string
  pointerID: number
  startY: number
  startX: number
  armed: boolean
  moved: boolean
  deltaMinutes: number
  timer: ReturnType<typeof setTimeout> | undefined
}

export function DailyScreen({ colors }: { colors: ThemeColors }) {
  const data = useData()
  const { goals, events, tasks, categories, hours } = data
  const now = useNow(60_000)
  const [dayOffset, setDayOffset] = useState(0)
  const [slot, setSlot] = useState(() => Number(localStorage.getItem('vectis:ui:slot')) || 24)
  const [editor, setEditor] = useState<EventEditorTarget | null>(null)
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null)
  const [taskActionID, setTaskActionID] = useState<string | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const swipeRef = useRef<{ x: number; y: number } | null>(null)

  const date = useMemo(() => addDays(startOfDay(new Date()), dayOffset), [dayOffset])
  const startMin = hours.startHour * 60
  const endMin = hours.endHour * 60
  const totalSlots = Math.max((hours.endHour - hours.startHour) * 2, 1)
  const gridHeight = totalSlots * slot
  const y = (minutes: number) => ((minutes - startMin) / 30) * slot

  useEffect(() => {
    try {
      localStorage.setItem('vectis:ui:slot', String(slot))
    } catch {
      // Zoom just won't be remembered.
    }
  }, [slot])

  // While a block is picked up, stop the page from scrolling under it.
  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const block = (e: TouchEvent) => {
      if (dragRef.current?.armed) e.preventDefault()
    }
    el.addEventListener('touchmove', block, { passive: false })
    return () => el.removeEventListener('touchmove', block)
  }, [])

  const blocks = dayBlocks({ events, goals, tasks, categories }, date)
  const laidOut = layoutBlocks(blocks)
  const stripGoals = goals.filter(g => g.kind === 'shortTerm' && !g.linkedToGoalID && isScheduled(g, date))
  const key = dayKey(date)

  const minutesFromY = (clientY: number) => {
    const rect = gridRef.current!.getBoundingClientRect()
    const raw = ((clientY - rect.top) / slot) * 30
    return Math.max(startMin, startMin + Math.floor(raw / 30) * 30)
  }

  // MARK: - Block pointer handling

  const updateDrag = (next: DragState | null) => {
    dragRef.current = next
    setDrag(next ? { ...next } : null)
  }

  const onBlockPointerDown = (e: ReactPointerEvent, block: DayBlock) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const state: DragState = {
      id: block.id, pointerID: e.pointerId, startY: e.clientY, startX: e.clientX,
      armed: false, moved: false, deltaMinutes: 0, timer: undefined,
    }
    const target = e.currentTarget as HTMLElement
    state.timer = setTimeout(() => {
      if (dragRef.current?.id !== block.id || dragRef.current.moved) return
      try {
        target.setPointerCapture(state.pointerID)
      } catch {
        // Pointer already gone.
      }
      updateDrag({ ...dragRef.current, armed: true })
      navigator.vibrate?.(10)
    }, LONG_PRESS_MS)
    updateDrag(state)
  }

  const onBlockPointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current
    if (!d || d.pointerID !== e.pointerId) return
    const dy = e.clientY - d.startY
    if (!d.armed) {
      // Moving before the long press lands means this is a scroll.
      if (Math.abs(dy) > 8 || Math.abs(e.clientX - d.startX) > 8) {
        clearTimeout(d.timer)
        dragRef.current = { ...d, moved: true }
      }
      return
    }
    const delta = Math.round(((dy / slot) * 30) / SNAP) * SNAP
    if (delta !== d.deltaMinutes) updateDrag({ ...d, deltaMinutes: delta, moved: true })
  }

  const onBlockPointerUp = (e: ReactPointerEvent, block: DayBlock) => {
    const d = dragRef.current
    if (!d || d.pointerID !== e.pointerId) return
    clearTimeout(d.timer)
    updateDrag(null)
    if (d.armed) {
      if (d.deltaMinutes !== 0) commitMove(block, d.deltaMinutes)
    } else if (!d.moved) {
      openBlock(block)
    }
  }

  const onBlockPointerCancel = () => {
    if (dragRef.current) clearTimeout(dragRef.current.timer)
    updateDrag(null)
  }

  const commitMove = (block: DayBlock, delta: number) => {
    const newStartMinutes = minutesIntoDay(block.start, date) + delta
    if (block.kind === 'goal' && block.goalID) {
      // This day only; editing the goal's time is what moves the series.
      data.setGoalTimeOverride(block.goalID, date, newStartMinutes)
    } else if (block.kind === 'task' && block.taskID) {
      data.placeTask(block.taskID, addMinutes(block.start, delta))
    } else if (block.event && block.event.recurrence !== 'none') {
      data.setOccurrenceTime(block.event.id, date, newStartMinutes)
    } else if (block.event) {
      data.moveEvent(block.event.id, addMinutes(block.start, delta))
    }
  }

  const openBlock = (block: DayBlock) => {
    // Opening rather than ticking: a stray tap while scrolling shouldn't
    // silently complete something. The chips above handle ticking.
    if (block.kind === 'goal') setEditingGoal(goals.find(g => g.id === block.goalID) ?? null)
    else if (block.kind === 'task') setTaskActionID(block.taskID ?? null)
    else if (block.event) setEditor({ mode: 'edit', event: block.event })
  }

  // MARK: - Grid taps and swipes

  const onGridClick = (e: MouseEvent) => {
    if (e.target !== e.currentTarget) return
    const start = minutesFromY(e.clientY)
    setEditor({ mode: 'new', date, startMinutes: start, endMinutes: start + 30 })
  }

  const onTouchStart = (e: ReactTouchEvent) => {
    swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const onTouchEnd = (e: ReactTouchEvent) => {
    const s = swipeRef.current
    swipeRef.current = null
    if (!s || dragRef.current?.armed) return
    const dx = e.changedTouches[0].clientX - s.x
    const dy = e.changedTouches[0].clientY - s.y
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) setDayOffset(o => o + (dx < 0 ? 1 : -1))
  }

  // MARK: - Drawing

  const nowMinutes = minutesIntoDay(now, date)
  const showNow = isSameDay(now, date) && nowMinutes >= startMin && nowMinutes <= endMin
  const taskForAction = tasks.find(t => t.id === taskActionID)

  return (
    <div className="daily">
      <div className="day-header">
        <button className="icon-button" onClick={() => setDayOffset(o => o - 1)} aria-label="Previous day"><ChevronLeft size={20} /></button>
        <button className="label" onClick={() => setDayOffset(0)} title="Back to today">
          {dayOffset === 0 ? 'Today' : formatDayHeading(date)}
        </button>
        <div className="row" style={{ gap: 0 }}>
          <button className="icon-button" aria-label="Zoom out" disabled={slot <= MIN_SLOT} onClick={() => setSlot(s => Math.max(MIN_SLOT, s - 6))}><Minus size={16} /></button>
          <button className="icon-button" aria-label="Zoom in" disabled={slot >= MAX_SLOT} onClick={() => setSlot(s => Math.min(MAX_SLOT, s + 6))}><Plus size={16} /></button>
          <button className="icon-button" onClick={() => setDayOffset(o => o + 1)} aria-label="Next day"><ChevronRight size={20} /></button>
        </div>
      </div>

      {stripGoals.length > 0 && (
        <div className="goal-strip">
          {stripGoals.map(g => {
            const done = g.completions[key] === true
            return (
              // Writes to the day on screen, not to today.
              <button key={g.id} className={`goal-chip ${done ? 'done' : ''}`} onClick={() => data.setCompletion(g.id, date, !done)} aria-pressed={done}>
                <CompletionMark on={done} size={15} color={colors.primary} />
                <span className={done ? 'strike' : ''}>{g.title}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="grid-scroll" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div
          ref={gridRef}
          className="grid"
          style={{ height: gridHeight, marginTop: 8 }}
          onClick={onGridClick}
          onContextMenu={e => e.preventDefault()}
        >
          {Array.from({ length: totalSlots + 1 }, (_, i) => {
            const minutes = startMin + i * 30
            const isHour = minutes % 60 === 0
            return (
              <div key={i}>
                <div className={`hour-line ${isHour ? '' : 'half'}`} style={{ top: i * slot }} />
                {isHour && <div className="hour-label" style={{ top: i * slot }}>{formatMinutes(minutes % (24 * 60))}</div>}
              </div>
            )
          })}

          {laidOut.map(({ item: block, column, columnCount }) => {
            const dragging = drag?.id === block.id
            const delta = dragging ? drag.deltaMinutes : 0
            const s = Math.max(minutesIntoDay(block.start, date) + delta, startMin)
            const en = Math.min(minutesIntoDay(block.end, date) + delta, endMin)
            if (en <= startMin || s >= endMin) return null
            const top = y(s)
            const height = Math.max(y(en) - top, 16)
            const base = block.kind === 'goal' ? colors.primary : block.kind === 'task' ? colors.tertiary : block.colorHex ?? '#999999'
            const text = contrastingText(base)
            const widthPct = 100 / columnCount
            const parts = block.kind === 'event' ? block.event?.parts ?? [] : []
            const partsTotal = Math.max(parts.reduce((a, p) => a + p.estimatedMinutes, 0), 1)
            const label = `${block.title}, ${formatTime(addMinutes(block.start, delta))} to ${formatTime(addMinutes(block.end, delta))}${block.done ? ', done' : ''}`

            return (
              <button
                key={block.id}
                className={`block ${dragging && drag.armed ? 'armed' : ''} ${block.done ? 'done' : ''}`}
                aria-label={label}
                style={{
                  top,
                  height,
                  left: `calc(${GUTTER}px + (100% - ${GUTTER + 8}px) * ${(column * widthPct) / 100})`,
                  width: `calc((100% - ${GUTTER + 8}px) * ${widthPct / 100} - 3px)`,
                  background: block.done ? withAlpha(base, 0.45) : base,
                  borderColor: withAlpha(darkened(base, 0.3), block.done ? 0.4 : 1),
                  color: text,
                  WebkitTouchCallout: 'none',
                }}
                onPointerDown={e => onBlockPointerDown(e, block)}
                onPointerMove={onBlockPointerMove}
                onPointerUp={e => onBlockPointerUp(e, block)}
                onPointerCancel={onBlockPointerCancel}
                onClick={e => e.stopPropagation()}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openBlock(block))}
              >
                {parts.length > 0 ? (
                  parts.map(p => {
                    const h = Math.max((height - 6) * (p.estimatedMinutes / partsTotal), 3)
                    return (
                      <div key={p.id} className="part-row" style={{ height: h, borderColor: withAlpha(text, 0.25) }}>
                        {h > 10 && <span className="ellipsis">{p.title || 'Untitled'}</span>}
                        {h > 22 && <span style={{ fontSize: 8, opacity: 0.75 }}>{p.estimatedMinutes}m</span>}
                      </div>
                    )
                  })
                ) : (
                  <>
                    <div className="title">
                      {block.kind === 'goal' && (block.done ? <CheckCircle2 size={10} /> : <Target size={10} />)}
                      {block.kind === 'task' && (block.done ? <CheckCircle2 size={10} /> : <Circle size={10} />)}
                      <span className="ellipsis">{block.title}</span>
                    </div>
                    {height > 34 && (
                      <div className="time">{formatTime(addMinutes(block.start, delta))} – {formatTime(addMinutes(block.end, delta))}</div>
                    )}
                  </>
                )}
              </button>
            )
          })}

          {showNow && <div className="now-line" style={{ top: y(nowMinutes), left: GUTTER, right: 0 }} />}
        </div>
      </div>

      {editor && <EventEditor target={editor} onClose={() => setEditor(null)} />}
      {editingGoal && <ShortTermGoalEditor goal={editingGoal} onClose={() => setEditingGoal(null)} />}
      {taskForAction && (
        <Sheet title="Task" compact onClose={() => setTaskActionID(null)}>
          <div style={{ textAlign: 'center', fontWeight: 600, fontSize: 17 }}>{taskForAction.text}</div>
          <VButton kind="primary" accent={colors.tertiary} onClick={() => { data.toggleTask(taskForAction.id); setTaskActionID(null) }}>
            {taskForAction.done ? 'Mark not done' : 'Mark done'}
          </VButton>
          <VButton accent={colors.tertiary} onClick={() => { data.placeTask(taskForAction.id, undefined); setTaskActionID(null) }}>
            Take off the calendar
          </VButton>
        </Sheet>
      )}
    </div>
  )
}

