// Morning planning, stage 2: the drag tray above the Daily grid. Drag a
// chip onto the day to place it; tap one to type a time instead. The
// commitment bar moves as things land, and nothing is ever blocked.
//
// On touch, the tray scrolls sideways natively (touch-action: pan-x), so
// a mostly-vertical pull is what picks a chip up — no long press needed
// and no clash with scrolling the tray.

import { CheckCircle2, Target } from 'lucide-react'
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { atMinutes } from '../model/dates'
import { commitmentFraction } from '../model/dayBlocks'
import { formatDuration } from '../model/format'
import { planningItems, type PlanningItem } from '../model/planning'
import { useData } from '../store/data'
import { CommitmentBar, Field, Sheet, VButton } from '../ui/components'
import type { ThemeColors } from '../ui/theme'

export interface DropPreview {
  minutes: number
  durationMinutes: number
  title: string
}

interface Drag {
  item: PlanningItem
  pointerID: number
  startX: number
  startY: number
  active: boolean
  isMouse: boolean
}

export function PlanningTray(props: {
  date: Date
  colors: ThemeColors
  gridRef: RefObject<HTMLDivElement | null>
  scrollRef: RefObject<HTMLDivElement | null>
  /** Grid minute under a screen point, snapped, or null if off the grid. */
  minutesAt: (clientX: number, clientY: number) => number | null
  onPreview: (preview: DropPreview | null) => void
  onDone: () => void
}) {
  const { goals, events, tasks, categories, hours, scheduleGoalOnCalendar, placeTask } = useData()
  const items = planningItems(goals, tasks, props.date)
  const fraction = commitmentFraction({ goals, events, tasks, categories }, hours, props.date)
  const dragRef = useRef<Drag | null>(null)
  const [ghost, setGhost] = useState<{ x: number; y: number; item: PlanningItem } | null>(null)
  const [tapped, setTapped] = useState<PlanningItem | null>(null)

  const place = (item: PlanningItem, minutes: number) => {
    if (item.kind === 'goal') scheduleGoalOnCalendar(item.id, minutes, item.durationMinutes)
    else placeTask(item.id, atMinutes(props.date, minutes))
  }

  const onPointerDown = (e: ReactPointerEvent, item: PlanningItem) => {
    if (e.button !== 0) return
    dragRef.current = { item, pointerID: e.pointerId, startX: e.clientX, startY: e.clientY, active: false, isMouse: e.pointerType === 'mouse' }
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current
    if (!d || d.pointerID !== e.pointerId) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.active) {
      const far = Math.hypot(dx, dy) > 6
      if (!far) return
      // Sideways on touch is the tray scrolling, not a drag.
      if (!d.isMouse && Math.abs(dx) > Math.abs(dy)) {
        dragRef.current = null
        return
      }
      d.active = true
      try {
        ;(e.currentTarget as HTMLElement).setPointerCapture(d.pointerID)
      } catch {
        // Pointer already gone.
      }
    }
    setGhost({ x: e.clientX, y: e.clientY, item: d.item })
    const minutes = props.minutesAt(e.clientX, e.clientY)
    props.onPreview(minutes === null ? null : { minutes, durationMinutes: d.item.durationMinutes, title: d.item.title })
    autoScroll(e.clientY)
  }

  const onPointerUp = (e: ReactPointerEvent) => {
    const d = dragRef.current
    dragRef.current = null
    if (!d || d.pointerID !== e.pointerId) return
    setGhost(null)
    props.onPreview(null)
    if (!d.active) {
      setTapped(d.item)
      return
    }
    const minutes = props.minutesAt(e.clientX, e.clientY)
    if (minutes !== null) place(d.item, minutes)
  }

  const onPointerCancel = () => {
    dragRef.current = null
    setGhost(null)
    props.onPreview(null)
  }

  /** Nudges the grid when a chip is held near its top or bottom edge. */
  const autoScroll = (clientY: number) => {
    const el = props.scrollRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (clientY > rect.bottom - 48) el.scrollBy(0, 14)
    else if (clientY < rect.top + 48 && clientY > rect.top - 40) el.scrollBy(0, -14)
  }

  return (
    <div className="plan-tray">
      <div className="row spread">
        <span className="caption" style={{ fontWeight: 500 }}>
          {items.length ? 'Drag onto the day, or tap to pick a time' : "Everything's placed"}
        </span>
        <button className="text-button" onClick={props.onDone}>Done placing</button>
      </div>
      <CommitmentBar fraction={fraction} />
      {items.length > 0 && (
        <div className="tray-chips">
          {items.map(item => (
            <button
              key={item.id}
              className="tray-chip"
              style={{ '--accent': props.colors.tertiary } as CSSProperties}
              onPointerDown={e => onPointerDown(e, item)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setTapped(item))}
              aria-label={`${item.title}, ${formatDuration(item.durationMinutes)}. Choose a time`}
            >
              <ChipBody item={item} />
            </button>
          ))}
        </div>
      )}

      {ghost && (
        <div className="tray-chip ghost" style={{ left: ghost.x, top: ghost.y, '--accent': props.colors.tertiary } as CSSProperties} aria-hidden="true">
          <ChipBody item={ghost.item} />
        </div>
      )}

      {tapped && <PlaceAtTime item={tapped} date={props.date} onClose={() => setTapped(null)} onPlace={m => { place(tapped, m); setTapped(null) }} />}
    </div>
  )
}

function ChipBody({ item }: { item: PlanningItem }) {
  return (
    <>
      {item.kind === 'goal' ? <Target size={11} /> : <CheckCircle2 size={11} />}
      <span>
        <span className="chip-title">{item.title}</span>
        <span className="chip-duration">{formatDuration(item.durationMinutes)}</span>
      </span>
    </>
  )
}

/** The no-drag way to place something: type a start time. */
function PlaceAtTime({ item, date, onClose, onPlace }: { item: PlanningItem; date: Date; onClose: () => void; onPlace: (minutes: number) => void }) {
  const [time, setTime] = useState(() => {
    const now = new Date()
    const sameDay = now.toDateString() === date.toDateString()
    const m = sameDay ? Math.ceil((now.getHours() * 60 + now.getMinutes()) / 30) * 30 : 9 * 60
    const clamped = Math.min(m, 23 * 60 + 30)
    return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
  })
  const minutes = () => {
    const [h, m] = time.split(':').map(Number)
    return h * 60 + m
  }
  return (
    <Sheet title="Place on the day" compact onClose={onClose}>
      <div style={{ fontWeight: 600 }}>{item.title}</div>
      <span className="caption">{formatDuration(item.durationMinutes)}{item.kind === 'goal' ? ' · sets this goal\'s time from today on' : ''}</span>
      <Field label="Start time">
        <input type="time" value={time} onChange={e => setTime(e.target.value)} autoFocus />
      </Field>
      <VButton kind="primary" accent="var(--primary)" onClick={() => time && onPlace(minutes())} disabled={!time}>Place it</VButton>
    </Sheet>
  )
}
