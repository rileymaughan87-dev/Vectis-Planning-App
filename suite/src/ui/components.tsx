// Shared pieces, matching the iPhone app's SectionBox, EditorBox,
// CompletionMark and VectisButtonStyle so screens can't drift apart.
// Styled in the Index style (suite/src/styles.css): sections are unboxed,
// with a mono index, an italic title and a pivot rule in their accent.

import { ChevronRight, X } from 'lucide-react'
import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react'
import { ALL_DAYS, WEEKDAYS_ONLY, WEEKEND_ONLY, firstWeekday, sameSet } from '../dates'

type WithAccent = CSSProperties & { '--accent'?: string; '--chip-color'?: string; '--on-accent'?: string }

export function accentStyle(accent?: string, onAccent?: string): WithAccent {
  const style: WithAccent = {}
  if (accent) style['--accent'] = accent
  if (onAccent) style['--on-accent'] = onAccent
  return style
}

/** The section's lever: a dot and a line running off to the right edge. */
export function PivotRule({ accent }: { accent?: string }) {
  return <div className="pivot-rule" style={accentStyle(accent)} aria-hidden="true" />
}

/**
 * A page section: index, title and an optional note on the right, over a
 * pivot rule. Sections number themselves 01, 02… in page order; pass
 * `index` to choose the number instead.
 */
export function SectionBox(props: { title: string; accent: string; subtitle?: string; index?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`section-box ${props.className ?? ''}`} style={accentStyle(props.accent)}>
      <div className="section-head">
        <span className="index">{props.index}</span>
        <h2>{props.title}</h2>
        {props.subtitle && <span className="subtitle">{props.subtitle}</span>}
      </div>
      <PivotRule />
      <div className="section-body">{props.children}</div>
    </section>
  )
}

/** A section of an editor sheet: the same head as a page section, a size smaller. */
export function EditorBox(props: { title: string; accent?: string; trailing?: string; index?: string; children: ReactNode }) {
  return (
    <div className="editor-box" style={accentStyle(props.accent)}>
      <div className="editor-box-head">
        <div className="head-row">
          <span className="index">{props.index}</span>
          <span className="title">{props.title}</span>
          {props.trailing && <span className="trailing">{props.trailing}</span>}
        </div>
        <PivotRule />
      </div>
      {props.children}
    </div>
  )
}

export function SummaryRow(props: { title: string; summary: string; onClick: () => void }) {
  return (
    <button className="summary-row" onClick={props.onClick}>
      <div className="grow">
        <div>{props.title}</div>
        <div className="caption2">{props.summary}</div>
      </div>
      <ChevronRight size={16} className="muted" />
    </button>
  )
}

/** The asymmetric lever tick from the app icon, in a ring. */
export function CompletionMark({ on, size = 20, color = 'var(--primary)' }: { on: boolean; size?: number; color?: string }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="9.25" fill="none" strokeWidth="1.5" stroke={on ? color : 'var(--mark-off)'} />
      {on && (
        <path
          d="M5.8 8.5 L8.8 13.3 L14.6 5.2"
          fill="none"
          stroke={color}
          strokeWidth={3.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}

export function VButton(props: {
  kind?: 'primary' | 'secondary' | 'destructive'
  accent?: string
  small?: boolean
  onClick?: () => void
  disabled?: boolean
  children: ReactNode
  type?: 'button' | 'submit'
}) {
  const kind = props.kind ?? 'secondary'
  return (
    <button
      type={props.type ?? 'button'}
      className={`vbutton ${kind === 'secondary' ? '' : kind} ${props.small ? 'small' : ''}`}
      style={accentStyle(props.accent)}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  )
}

export function Toggle(props: { label: ReactNode; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="toggle">
      <span>{props.label}</span>
      <input type="checkbox" role="switch" checked={props.checked} onChange={e => props.onChange(e.target.checked)} />
      <span className="track" />
    </label>
  )
}

export function Segmented<T extends string>(props: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={props.label}>
      {props.options.map(o => (
        <button key={o.value} aria-pressed={props.value === o.value} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Stepper(props: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  const step = props.step ?? 1
  return (
    <div className="stepper">
      <span>{props.label}</span>
      <div className="controls">
        <button aria-label="Decrease" disabled={props.value <= props.min} onClick={() => props.onChange(Math.max(props.min, props.value - step))}>−</button>
        <button aria-label="Increase" disabled={props.value >= props.max} onClick={() => props.onChange(Math.min(props.max, props.value + step))}>+</button>
      </div>
    </div>
  )
}

const weekdayNames = (() => {
  const base = new Date(2026, 0, 4) // a Sunday
  return Array.from({ length: 7 }, (_, i) =>
    new Date(base.getFullYear(), base.getMonth(), base.getDate() + i).toLocaleDateString(undefined, { weekday: 'short' }),
  )
})()

/** Sunday-first in the US, Monday-first in most other places. */
function daysInLocalOrder(): number[] {
  const first = firstWeekday()
  return ALL_DAYS.map(i => ((first - 1 + i - 1) % 7) + 1)
}

export function RepeatDaysPicker({ days, onChange }: { days: number[]; onChange: (days: number[]) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="day-picker">
        {daysInLocalOrder().map(d => {
          const on = days.includes(d)
          return (
            <button
              key={d}
              aria-pressed={on}
              aria-label={weekdayNames[d - 1]}
              onClick={() => onChange(on ? days.filter(x => x !== d) : [...days, d].sort())}
            >
              {weekdayNames[d - 1].slice(0, 3)}
            </button>
          )
        })}
      </div>
      <div className="presets">
        <button onClick={() => onChange([...ALL_DAYS])}>Every day</button>
        <button onClick={() => onChange([...WEEKDAYS_ONLY])}>Weekdays</button>
        <button onClick={() => onChange([...WEEKEND_ONLY])}>Weekends</button>
      </div>
    </div>
  )
}

export function repeatSummary(days: number[]): string {
  if (days.length === 7) return 'Every day'
  if (sameSet(days, WEEKDAYS_ONLY)) return 'Weekdays'
  if (sameSet(days, WEEKEND_ONLY)) return 'Weekends'
  return `${days.length} days a week`
}

/**
 * A modal sheet: slides up on a phone, centred on a wide screen. Escape
 * and the backdrop close it, as does the left button.
 */
export function Sheet(props: {
  title: string
  onClose: () => void
  leftLabel?: string
  right?: { label: string; onClick: () => void; disabled?: boolean }
  compact?: boolean
  /** Fills the screen on a phone — for writing, where every line counts. */
  fullscreen?: boolean
  children: ReactNode
}) {
  const titleID = useId()
  const ref = useRef<HTMLDivElement>(null)
  const { onClose } = props
  // Read through a ref so the effect below runs once, on opening. Callers
  // often pass a fresh `() => ...` each render; re-running on that pulled
  // focus out of whatever box you were typing in after every keystroke.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Only the sheet on top closes, when one opens over another.
      const sheets = document.querySelectorAll('.sheet')
      if (sheets[sheets.length - 1] === ref.current) onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    // Move focus into the sheet, unless a box in it already took it with autoFocus.
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="sheet-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={`sheet ${props.compact ? 'compact' : ''} ${props.fullscreen ? 'fullscreen' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleID} ref={ref} tabIndex={-1}>
        <div className="sheet-head">
          <button className="left text-button" onClick={onClose}>
            {props.leftLabel ?? (props.right ? 'Cancel' : <X size={18} aria-label="Close" />)}
          </button>
          <h2 id={titleID}>{props.title}</h2>
          {props.right ? (
            <button className="right text-button" onClick={props.right.onClick} disabled={props.right.disabled}>
              {props.right.label}
            </button>
          ) : <span />}
        </div>
        <div className="sheet-body">{props.children}</div>
      </div>
    </div>
  )
}

export function Field(props: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span className="field-label">{props.label}</span>
      {props.children}
    </label>
  )
}
