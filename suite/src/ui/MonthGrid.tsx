// The one month calendar: a month switcher, weekday labels, and a grid of
// day cells that the caller draws (dots, names, whatever that page needs).
// Weeks start on the region's first weekday.

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import { addMonths, isSameDay } from '../dates'
import { monthGridDays, startOfMonth } from '../months'

export interface GridDay {
  date: Date
  inMonth: boolean
  isToday: boolean
}

export function MonthGrid(props: {
  month: Date
  onMonthChange: (month: Date) => void
  renderDay: (day: GridDay) => ReactNode
  /** Weekday labels across the top (default on). */
  showWeekdays?: boolean
  /** Extra class on the grid, for a page's own cell styling. */
  className?: string
}) {
  const days = monthGridDays(props.month)
  const today = new Date()
  const monthLabel = props.month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  return (
    <>
      <div className="row spread month-head">
        <button className="icon-button" onClick={() => props.onMonthChange(addMonths(props.month, -1))} aria-label="Previous month"><ChevronLeft size={20} /></button>
        <button className="month-title" onClick={() => props.onMonthChange(startOfMonth(new Date()))} title="Back to this month">
          {monthLabel}
        </button>
        <button className="icon-button" onClick={() => props.onMonthChange(addMonths(props.month, 1))} aria-label="Next month"><ChevronRight size={20} /></button>
      </div>

      <div className={`month-grid ${props.className ?? ''}`} role="grid" aria-label={monthLabel}>
        {props.showWeekdays !== false && days.slice(0, 7).map(({ date }, i) => (
          <div key={i} className="weekday" role="columnheader" aria-label={date.toLocaleDateString(undefined, { weekday: 'short' })}>
            <span className="narrow">{date.toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
            <span className="wide">{date.toLocaleDateString(undefined, { weekday: 'short' })}</span>
          </div>
        ))}
        {days.map(({ date, inMonth }) => (
          <Fragment key={date.toISOString()}>{props.renderDay({ date, inMonth, isToday: isSameDay(date, today) })}</Fragment>
        ))}
      </div>
    </>
  )
}
