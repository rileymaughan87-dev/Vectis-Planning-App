// A partner's Vectis, read-only, built from their share file with the
// same logic as your own screens. "Back to my Vectis" returns you to
// exactly where you were — your app stays open underneath.

import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { addDays, dayKey, isSameDay, parseDate, startOfDay } from '../model/dates'
import { allDayEvents, dayBlocks } from '../model/dayBlocks'
import { occupies } from '../model/events'
import { formatDayHeading, formatShortDate, formatTime, relativeTime } from '../model/format'
import { isDoneOn, isScheduled } from '../model/goals'
import { useShare } from '../store/share'
import type { ShareSnapshot } from '../sync/shareFile'
import { CompletionMark, SectionBox } from '../ui/components'
import { LongTermGoalCard, ShortTermGoalRow } from '../ui/goalCards'
import type { ThemeColors } from '../ui/theme'

export function PartnerView({ partnerID, colors, onBack }: { partnerID: string; colors: ThemeColors; onBack: () => void }) {
  const partner = useShare(s => s.partners.find(p => p.id === partnerID))
  const refreshPartner = useShare(s => s.refreshPartner)
  const [offset, setOffset] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!partner) return null
  const snap = partner.snapshot
  const canRefresh = !partner.id.startsWith('file:')

  const refresh = async () => {
    setRefreshing(true)
    setError(null)
    try {
      await refreshPartner(partner.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRefreshing(false)
    }
  }

  const today = startOfDay(new Date())
  const date = addDays(today, offset)

  return (
    <div className="partner-overlay">
      <header className="partner-banner">
        <button className="back" onClick={onBack}><ArrowLeft size={16} /> My Vectis</button>
        <div className="grow">
          <div className="who">Viewing</div>
          <h1 className="ellipsis">{partner.name}</h1>
        </div>
        {canRefresh && (
          <button className="icon-button" style={{ color: 'inherit' }} onClick={() => void refresh()} disabled={refreshing} aria-label="Refresh">
            <RefreshCw size={18} className={refreshing ? 'spin' : ''} />
          </button>
        )}
      </header>

      <main className="content">
        {snap && <p className="read-only-note">Read-only · published {relativeTime(parseDate(snap.publishedAt))}</p>}
        <div className="page partner-page" style={{ paddingTop: 10 }}>
          {error && <div className="notice error">{error}</div>}
          {!snap ? (
            <div className="empty">Nothing loaded yet. {canRefresh ? 'Tap refresh to load their file.' : ''}</div>
          ) : (
            <PartnerContent snap={snap} colors={colors} date={date} offset={offset} setOffset={setOffset} />
          )}
        </div>
      </main>
    </div>
  )
}

function PartnerContent({ snap, colors, date, offset, setOffset }: {
  snap: ShareSnapshot
  colors: ThemeColors
  date: Date
  offset: number
  setOffset: (f: (o: number) => number) => void
}) {
  const blocks = dayBlocks(snap, date)
  const allDay = allDayEvents(snap.events, date)
  const dayGoals = snap.goals.filter(g => g.kind === 'shortTerm' && isScheduled(g, date))
  const doneCount = dayGoals.filter(g => isDoneOn(g, date)).length
  const shortTerm = snap.goals.filter(g => g.kind === 'shortTerm' && !g.linkedToGoalID)
  const longTerm = snap.goals.filter(g => g.kind === 'longTerm')
  const dayLabel = offset === 0 ? 'Today' : offset === -1 ? 'Yesterday' : offset === 1 ? 'Tomorrow' : formatDayHeading(date)

  // The next two weeks: milestones, plus long-term and all-day events.
  const upcoming: { date: Date; title: string; color: string; kind: string }[] = []
  const start = startOfDay(new Date())
  for (let i = 0; i < 14; i++) {
    const d = addDays(start, i)
    for (const e of snap.events) {
      if ((e.origin === 'longTerm' || e.isAllDay) && occupies(e, d)) {
        upcoming.push({ date: d, title: e.title, color: snap.categories.find(c => c.id === e.categoryID)?.colorHex ?? '#999', kind: 'event' })
      }
    }
    for (const g of snap.goals) {
      for (const m of g.milestones) {
        if (m.addToCalendar && m.date && isSameDay(parseDate(m.date), d)) {
          upcoming.push({ date: d, title: `${m.title}${m.done ? ' ✓' : ''}`, color: colors.secondary, kind: g.title })
        }
      }
    }
  }

  return (
    <>
      <SectionBox title={dayLabel} accent={colors.primary} subtitle={dayGoals.length ? `${doneCount} of ${dayGoals.length} goals done` : undefined}>
        <div className="row spread" style={{ marginBottom: 6 }}>
          <button className="icon-button" onClick={() => setOffset(o => o - 1)} aria-label="Previous day"><ChevronLeft size={18} /></button>
          <span className="caption">{formatDayHeading(date)}</span>
          <button className="icon-button" onClick={() => setOffset(o => o + 1)} aria-label="Next day"><ChevronRight size={18} /></button>
        </div>
        {dayGoals.map(g => {
          const done = isDoneOn(g, date)
          return (
            <div key={g.id} className="row list-row">
              <CompletionMark on={done} size={17} color={colors.primary} />
              <span className={`grow ${done ? 'strike' : ''}`}>{g.title}</span>
              {g.frequencyType === 'timesPerDay' && <span className="caption2">{g.completionCounts[dayKey(date)] ?? 0}/{g.timesPerDayTarget}</span>}
            </div>
          )
        })}
        {dayGoals.length > 0 && <hr className="divider" style={{ margin: '6px 0' }} />}
        {allDay.map(e => (
          <div key={e.id} className="timeline-row">
            <span className="when">All day</span>
            <span className="bar" style={{ background: snap.categories.find(c => c.id === e.categoryID)?.colorHex ?? '#999' }} />
            <span className="grow">{e.title}</span>
          </div>
        ))}
        {blocks.length === 0 && allDay.length === 0 ? (
          <span className="caption">Nothing on the calendar.</span>
        ) : blocks.map(b => (
          <div key={b.id} className="timeline-row">
            <span className="when">{formatTime(b.start)}<br />{formatTime(b.end)}</span>
            <span className="bar" style={{ background: b.kind === 'goal' ? colors.primary : b.kind === 'task' ? colors.tertiary : b.colorHex }} />
            <span className={`grow ${b.done ? 'strike' : ''}`}>{b.title}</span>
            {b.kind !== 'event' && <CompletionMark on={b.done} size={15} color={b.kind === 'goal' ? colors.primary : colors.tertiary} />}
          </div>
        ))}
      </SectionBox>

      {shortTerm.length > 0 && (
        <SectionBox title="Short-term goals" accent={colors.primary}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {shortTerm.map(g => <ShortTermGoalRow key={g.id} goal={g} accent={colors.primary} />)}
          </div>
        </SectionBox>
      )}

      {longTerm.length > 0 && (
        <SectionBox title="Long-term goals" accent={colors.secondary}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {longTerm.map(g => <LongTermGoalCard key={g.id} goal={g} allGoals={snap.goals} accent={colors.secondary} habitAccent={colors.primary} />)}
          </div>
        </SectionBox>
      )}

      <SectionBox title="Coming up" accent={colors.tertiary} subtitle="next 2 weeks">
        {upcoming.length === 0 ? <span className="caption">Nothing dated in the next two weeks.</span> : upcoming.map((u, i) => (
          <div key={i} className="timeline-row">
            <span className="when">{formatShortDate(u.date).replace(/,? \d{4}$/, '')}</span>
            <span className="bar" style={{ background: u.color }} />
            <span className="grow">{u.title}{u.kind !== 'event' && <div className="caption2">{u.kind}</div>}</span>
          </div>
        ))}
      </SectionBox>
    </>
  )
}
