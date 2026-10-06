// Challenges, ported from ChallengeSheets.swift: the catalog, one
// challenge in full (tasks to include, start date, strict mode), and the
// catch-up prompt for days you were away and never confirmed.

import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { dayFromKey, dayKey } from '../model/dates'
import { CHALLENGES, unresolvedDays, type ChallengeTemplate } from '../model/challenges'
import type { Goal } from '../model/types'
import { useData } from '../store/data'
import { CompletionMark, EditorBox, Field, Sheet, Toggle, VButton } from '../ui/components'
import type { ThemeColors } from '../ui/theme'

export function ChallengeBrowser({ colors, onClose }: { colors: ThemeColors; onClose: () => void }) {
  const [selected, setSelected] = useState<ChallengeTemplate | null>(null)
  if (selected) return <ChallengeDetail template={selected} colors={colors} onBack={() => setSelected(null)} onStarted={onClose} />
  return (
    <Sheet title="Challenges" onClose={onClose} leftLabel="Close">
      <div className="list-box">
        {CHALLENGES.map(t => (
          <button key={t.id} className="list-item row" style={{ flexDirection: 'row' }} onClick={() => setSelected(t)}>
            <span className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span className="row spread"><strong>{t.name}</strong><span className="caption2">{t.durationDays} days</span></span>
              <span className="caption">{t.tagline}</span>
              <span className="caption2">{t.tasks.length} daily task{t.tasks.length === 1 ? '' : 's'}</span>
            </span>
            <ChevronRight size={16} className="muted" />
          </button>
        ))}
      </div>
    </Sheet>
  )
}

function ChallengeDetail({ template, colors, onBack, onStarted }: { template: ChallengeTemplate; colors: ThemeColors; onBack: () => void; onStarted: () => void }) {
  const startChallenge = useData(s => s.startChallenge)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [start, setStart] = useState(() => dayKey(new Date()))
  const [strict, setStrict] = useState(false)
  const included = template.tasks.filter(t => !excluded.has(t.title))

  const toggle = (title: string) => setExcluded(prev => {
    const next = new Set(prev)
    if (next.has(title)) next.delete(title)
    else next.add(title)
    return next
  })

  return (
    <Sheet title={template.name} onClose={onBack} leftLabel="‹ Back">
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>{template.description}</p>

      <EditorBox title="Daily tasks" accent={colors.secondary}>
        {template.tasks.map(t => {
          const on = !excluded.has(t.title)
          return (
            <button key={t.title} className="row" style={{ textAlign: 'left' }} onClick={() => toggle(t.title)} aria-pressed={on}>
              <CompletionMark on={on} size={18} color={colors.primary} />
              <span className={on ? '' : 'strike'}>{t.title}</span>
            </button>
          )
        })}
        <p className="help">{included.length} of {template.tasks.length} will be added as daily habits. Uncheck anything you'd rather skip.</p>
      </EditorBox>

      <EditorBox title="Start date" accent={colors.secondary}>
        <Field label="Starts"><input type="date" value={start} onChange={e => e.target.value && setStart(e.target.value)} /></Field>
      </EditorBox>

      {template.supportsStrictMode && (
        <EditorBox title="Rules" accent={colors.secondary}>
          <Toggle label="Strict mode" checked={strict} onChange={setStrict} />
          {strict && template.strictModeDisclaimer && <p className="help">{template.strictModeDisclaimer}</p>}
        </EditorBox>
      )}

      <VButton
        kind="primary"
        accent={colors.secondary}
        disabled={included.length === 0}
        onClick={() => { startChallenge(template, included, dayFromKey(start), strict); onStarted() }}
      >
        Start {template.name}
      </VButton>
      <p className="help">
        {included.length === 0
          ? 'Pick at least one task to start.'
          : `Creates a long-term goal with ${included.length} linked daily habit${included.length === 1 ? '' : 's'}. You can edit or remove any of them afterwards.`}
      </p>
    </Sheet>
  )
}

/**
 * Days you were away aren't assumed to be misses — the app only knows
 * you didn't open it, not that you didn't do the thing. So it asks.
 */
export function ChallengeCatchUp({ goal, colors, onClose }: { goal: Goal; colors: ThemeColors; onClose: () => void }) {
  const { goals, resolveChallengeDay, restartChallenge } = useData()
  // Fixed on open, so answered days stay listed (as "Recorded").
  const [days] = useState(() => unresolvedDays(goals, goal))
  const [answered, setAnswered] = useState<Record<string, boolean>>({})
  const reportedMiss = goal.challengeStrictMode && Object.values(answered).includes(false)

  const answer = (day: Date, completed: boolean) => {
    resolveChallengeDay(goal.id, day, completed)
    setAnswered(a => ({ ...a, [dayKey(day)]: completed }))
  }

  return (
    <Sheet title="Catching up" onClose={onClose} leftLabel="Later" right={{ label: 'Done', onClick: onClose }}>
      <p className="muted" style={{ margin: 0 }}>
        <strong style={{ color: 'var(--text)' }}>{goal.title}:</strong> you were away for {days.length} day{days.length === 1 ? '' : 's'}. Did you complete every task each day?
      </p>
      {days.map(day => {
        const key = dayKey(day)
        return (
          <div key={key} className="editor-box" style={{ gap: 8 }}>
            <div style={{ fontWeight: 500 }}>{day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
            {key in answered ? (
              <span className="caption" style={{ color: colors.primary }}>Recorded — {answered[key] ? 'completed' : 'missed'}</span>
            ) : (
              <div className="button-row">
                <VButton kind="primary" accent={colors.primary} onClick={() => answer(day, true)}>Yes, completed</VButton>
                <VButton kind="destructive" onClick={() => answer(day, false)}>No, missed it</VButton>
              </div>
            )}
          </div>
        )
      })}
      {reportedMiss && (
        <>
          <VButton kind="destructive" onClick={() => { restartChallenge(goal.id); onClose() }}>Restart from day one</VButton>
          <p className="help">Strict mode is on, so a missed day means restarting. Your previous attempt stays in your history.</p>
        </>
      )}
    </Sheet>
  )
}
