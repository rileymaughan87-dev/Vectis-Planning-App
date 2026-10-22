// The Months overview (option C): the months ahead as a strip — one
// column per pay period, as tall as what comes in, split into bills,
// living, set aside and debts, with any money not given a job hatched on
// top — and the chosen month below as a statement. Calm throughout: room
// in the plan is information, and so is a month that comes up short.

import { SectionBox, VButton } from '@suite/ui/components'
import { useState } from 'react'
import { formatAmount } from '../model/money'
import { periodLabel, type MonthsGrid, type Period, type Row } from '../model/months'
import { ALLOCATION, periodStatement, roomInPlan, type AllocationID, type PeriodStatement } from '../model/overview'
import { useMoneyTools } from '../store/money'

const STRIP = 8
const longMonth = (p: Period) => {
  const middle = new Date((p.start.getTime() + p.end.getTime()) / 2)
  return middle.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}
const shortMonth = (p: Period) => new Date((p.start.getTime() + p.end.getTime()) / 2).toLocaleDateString(undefined, { month: 'long' })
const pct = (share: number) => `${Math.round(share * 100)}%`

export function MonthsOverview({ grid, onOpen, onSheet, onRunway }: {
  grid: MonthsGrid
  onOpen: (ref: Row['ref']) => void
  onSheet: () => void
  onRunway: () => void
}) {
  const tools = useMoneyTools()
  const toHome = (n: number, c: string) => tools.convert(n, c, tools.home) ?? n
  const money = (n: number) => formatAmount(n, tools.home)
  // From now on, the periods with anything in or out (an empty one has nothing to show).
  const shown = grid.periods.map((_, i) => i).filter(i => i >= grid.current && (grid.totalIn[i].amount > 0 || grid.totalOut[i].amount > 0)).slice(0, STRIP)
  const firstWithPay = shown.find(i => grid.totalIn[i].amount > 0) ?? grid.current
  const [selected, setSelected] = useState(firstWithPay)
  const statements = shown.map(i => periodStatement(grid, i, toHome))
  const s = statements.find(x => x.index === selected) ?? statements[0]
  const scale = Math.max(1, ...statements.map(x => Math.max(x.totalIn.amount, x.groups.reduce((a, g) => a + g.total, 0))))
  const room = roomInPlan(grid)
  const startOwed = grid.owedTotal[grid.current]?.amount

  if (!grid.income.length && !grid.outgoing.length && !grid.goals.length) {
    return <p className="help" style={{ margin: 0 }}>Add your pay and bills (Entries above) and the months ahead fill in here.</p>
  }

  return (
    <>
      <SectionBox title="The months ahead" accent="var(--brand)" index="01" subtitle={grid.byPay ? 'From each payday' : undefined}>
        <div className="strip" role="group" aria-label="The months ahead">
          {statements.map(st => (
            <StripColumn key={st.index} st={st} scale={scale} money={money} selected={st.index === s.index} onSelect={() => setSelected(st.index)} />
          ))}
        </div>
        <div className="strip-legend" aria-hidden="true">
          {(Object.keys(ALLOCATION) as AllocationID[]).map(id => (
            <span key={id}><i className="swatch" style={{ background: ALLOCATION[id].colour }} />{ALLOCATION[id].title}</span>
          ))}
          <span><i className="swatch hatched" />Not planned yet</span>
        </div>
      </SectionBox>

      {s && <Statement s={s} money={money} onOpen={onOpen} />}

      {s?.owedAfter !== undefined && (
        <div className="owed-card">
          <span className="mono muted">Still owed after {shortMonth(s.period)}</span>
          <span className="owed-figure">{money(s.owedAfter)}</span>
          {s.owedChange ? <span className="caption">{s.owedChange < 0 ? '−' : '+'}{money(Math.abs(s.owedChange))} this month</span> : null}
          {startOwed ? (
            <div className="progress-track" aria-hidden="true"><div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, (1 - s.owedAfter / startOwed) * 100))}%` }} /></div>
          ) : null}
          <button className="text-button" style={{ alignSelf: 'flex-start' }} onClick={onRunway}>Debt runway ›</button>
        </div>
      )}

      {room && (
        <div className="room-card">
          <strong>Room in the plan</strong>
          <span>
            {room.ongoing
              ? `From ${shortMonth(grid.periods[room.index])}, at least ${money(room.amount)} a month isn't given a job yet.`
              : `${shortMonth(grid.periods[room.index])} has ${money(room.amount)} not given a job yet.`}
          </span>
          <span className="caption">You could set it aside, save it, or put it towards a debt — whenever you're ready.</span>
        </div>
      )}

      <VButton accent="var(--brand)" onClick={onSheet}>Open the full sheet ›</VButton>
    </>
  )
}

function StripColumn({ st, scale, money, selected, onSelect }: { st: PeriodStatement; scale: number; money: (n: number) => string; selected: boolean; onSelect: () => void }) {
  const out = st.groups.reduce((a, g) => a + g.total, 0)
  const height = Math.max(st.totalIn.amount, out)
  const label = periodLabel(st.period, true).month
  const leftText = st.short > 0 ? `−${money(st.short)}` : money(st.unplanned)
  return (
    <button
      className={`strip-col${selected ? ' is-selected' : ''}`}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${shortMonth(st.period)}: ${money(st.totalIn.amount)} in, ${st.short > 0 ? `${money(st.short)} short` : `${money(st.unplanned)} left over`}`}
    >
      <span className="strip-stack" style={{ height: `${(height / scale) * 100}%` }}>
        {/* Bottom up: bills, living, set aside, debts, then what's not planned yet. */}
        {st.groups.map(g => <span key={g.id} className="strip-seg" style={{ background: g.colour, flexGrow: g.total }} />)}
        {st.unplanned > 0 && <span className="strip-seg hatched" style={{ flexGrow: st.unplanned }} />}
      </span>
      <span className="strip-month">{label}</span>
      <span className={`strip-left${st.unplanned > 0 ? ' room' : st.short > 0 ? ' short' : ''}`}>{leftText}</span>
    </button>
  )
}

function Statement({ s, money, onOpen }: { s: PeriodStatement; money: (n: number) => string; onOpen: (ref: Row['ref']) => void }) {
  const out = s.groups.reduce((a, g) => a + g.total, 0)
  const sentence = s.totalIn.amount <= 0
    ? (out > 0 ? `Nothing comes in this month; ${money(out)} goes out.` : 'Nothing comes in or goes out this month.')
    : s.short > 0
      ? `${money(s.totalIn.amount)} comes in and ${money(out)} goes out — ${money(s.short)} more than comes in.`
      : s.unplanned > 0
        ? `${money(s.totalIn.amount)} comes in; ${money(s.unplanned)} isn't given a job yet.`
        : `${money(s.totalIn.amount)} comes in and every pound has a job.`
  const base = Math.max(s.totalIn.amount, out, 1)
  return (
    <SectionBox title={longMonth(s.period)} accent="var(--brand)" index="02">
      <div className="statement-hero">
        <span className={`hero-figure${s.short > 0 ? ' short' : s.unplanned > 0 ? ' room' : ''}`}>
          {s.short > 0 ? `−${money(s.short)}` : money(s.unplanned)}
        </span>
        <i>{s.short > 0 ? 'short' : 'left over'}</i>
      </div>
      <p className="statement-sentence">{sentence}</p>

      <div className="allocation-bar" aria-hidden="true">
        {s.groups.map(g => <span key={g.id} style={{ background: g.colour, flexGrow: g.total }} />)}
        {s.unplanned > 0 && <span className="hatched" style={{ flexGrow: s.unplanned }} />}
      </div>

      {s.groups.map(g => (
        <div key={g.id} className="allocation-group">
          <div className="allocation-head">
            <i className="swatch" style={{ background: g.colour }} />
            <span className="allocation-title">{g.title}</span>
            <span className="mono muted">{pct(g.total / base)}</span>
            <span className={`amount${g.estimate ? ' est' : ''}`}>{money(g.total)}</span>
          </div>
          {g.lines.map(l => (
            <button key={l.key} className="allocation-line" onClick={() => onOpen(l.ref)} disabled={!l.ref}>
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="ellipsis">{l.title}</span>
                {(l.note || l.estimate) && <span className="caption2">{[l.note, l.estimate ? 'estimate' : ''].filter(Boolean).join(' · ')}</span>}
              </span>
              <span className={`amount${l.estimate ? ' est' : ''}`}>{formatAmount(l.amount, l.currency)}</span>
            </button>
          ))}
        </div>
      ))}
    </SectionBox>
  )
}
