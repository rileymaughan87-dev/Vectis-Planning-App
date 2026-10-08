// Left over per month as bars above or below zero. Direction carries the
// meaning (above = left over, below = short), with green / red as a
// second cue — those two are hard to tell apart with red-green colour
// blindness. The table underneath has every number; tapping a bar or a
// row picks that month for the rest of the page.

import { useState } from 'react'
import { monthKey, type MonthSummary } from '../model/budget'
import { formatMoneyWhole } from '../model/money'
import { EXPENSE, INCOME } from '../ui/semantic'

const W = 320
const H = 150
const PAD_L = 44
const PAD_B = 20
const PAD_T = 8
const R = 4

export function LeftOverTrend({ summaries, selected, onSelect, currency }: {
  summaries: MonthSummary[]
  selected: string
  onSelect: (month: Date) => void
  currency: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const whole = (n: number) => (n < 0 ? '−' : '') + formatMoneyWhole(Math.abs(n), currency)
  const values = summaries.map(s => s.leftOver)
  const max = Math.max(...values, 0)
  const min = Math.min(...values, 0)
  const span = max - min || 1
  const plotH = H - PAD_T - PAD_B
  const y = (v: number) => PAD_T + ((max - v) / span) * plotH
  const zero = y(0)
  const slot = (W - PAD_L) / summaries.length
  const barW = Math.min(slot * 0.55, 28)
  const monthLabel = (d: Date) => d.toLocaleDateString(undefined, { month: 'short' })
  const ticks = max === min ? [0] : [max, 0, min].filter((v, i, a) => a.indexOf(v) === i && (v === 0 || Math.abs(v) > span * 0.15))

  /** A bar with only its far end rounded, anchored flat on the zero line. */
  const bar = (x: number, v: number) => {
    const top = y(Math.max(v, 0))
    const bottom = y(Math.min(v, 0))
    const h = bottom - top
    if (h < 0.5) return `M${x},${zero - 0.5}h${barW}v1h${-barW}z`
    const r = Math.min(R, h, barW / 2)
    return v >= 0
      ? `M${x},${bottom}V${top + r}q0,${-r} ${r},${-r}H${x + barW - r}q${r},0 ${r},${r}V${bottom}z`
      : `M${x},${top}V${bottom - r}q0,${r} ${r},${r}H${x + barW - r}q${r},0 ${r},${-r}V${top}z`
  }

  const shown = hover !== null ? summaries[hover] : null

  return (
    <div className="trend">
      <div className="trend-chart">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Left over each month. The table below has the numbers." onMouseLeave={() => setHover(null)}>
          {ticks.map(t => (
            <g key={t}>
              <line x1={PAD_L} x2={W} y1={y(t)} y2={y(t)} stroke="var(--separator)" strokeWidth={t === 0 ? 1 : 0.5} strokeDasharray={t === 0 ? undefined : '2 3'} />
              <text x={PAD_L - 6} y={y(t) + 3} textAnchor="end" className="trend-axis">{whole(t)}</text>
            </g>
          ))}
          {summaries.map((s, i) => {
            const x = PAD_L + i * slot + (slot - barW) / 2
            const isSelected = monthKey(s.month) === selected
            return (
              <g key={monthKey(s.month)}>
                <path d={bar(x, s.leftOver)} fill={s.leftOver >= 0 ? INCOME : EXPENSE} opacity={isSelected || hover === i ? 1 : 0.45} />
                <text x={x + barW / 2} y={H - 5} textAnchor="middle" className={`trend-axis ${isSelected ? 'selected' : ''}`}>{monthLabel(s.month)}</text>
                {/* The whole column is the target, bigger than the bar. */}
                <rect
                  x={PAD_L + i * slot} y={0} width={slot} height={H} fill="transparent" style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHover(i)} onClick={() => onSelect(s.month)}
                >
                  <title>{`${s.month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}: ${whole(s.leftOver)}`}</title>
                </rect>
              </g>
            )
          })}
        </svg>
        {shown && hover !== null && (
          <div className="trend-tip" style={{ left: `${((PAD_L + (hover + 0.5) * slot) / W) * 100}%` }}>
            <strong>{shown.month.toLocaleDateString(undefined, { month: 'long' })}</strong>
            <span>{shown.leftOver >= 0 ? 'Left over' : 'Short by'} {formatMoneyWhole(Math.abs(shown.leftOver), currency)}</span>
          </div>
        )}
      </div>
      <span className="caption2">Above the line: left over. Below: more going out than coming in.</span>

      <table className="trend-table">
        <thead><tr><th>Month</th><th>In</th><th>Out</th><th>Left</th></tr></thead>
        <tbody>
          {summaries.map(s => (
            <tr key={monthKey(s.month)} className={monthKey(s.month) === selected ? 'selected' : ''} onClick={() => onSelect(s.month)}>
              <td>{s.month.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}</td>
              <td>{formatMoneyWhole(s.income, currency)}</td>
              <td>{formatMoneyWhole(s.spending, currency)}</td>
              <td>{whole(s.leftOver)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
