// The evening review, ported from EveningReviewView.swift. What got done
// comes first, repeated misses second, one written prompt last — the
// order matters (leading with shortfalls works against reflection).
// The answer goes under the day's "Daily review" heading in the journal
// (Record's, shared through the same saved entries); skipping is fine.

import { useState } from 'react'
import { isDoneOn, missNudge } from '../model/goals'
import { REVIEW_HEADING, dayDoc, sectionText, withSection } from '../model/noteDoc'
import { flaggedGoals, journalEntryFor, reviewGoals, reviewPrompt } from '../model/planning'
import { useData } from '../store/data'
import { recordJournalLink } from '@suite/links'
import { CompletionMark, SectionBox, Sheet } from '../ui/components'
import type { ThemeColors } from '../ui/theme'

export function EveningReview({ colors, onClose }: { colors: ThemeColors; onClose: () => void }) {
  const { goals, journal, planReview, setCompletion, seedReflection, setJournalDoc } = useData()
  const [today] = useState(() => new Date())
  const [text, setText] = useState(() => sectionText(dayDoc(journalEntryFor(journal, today)), REVIEW_HEADING))

  const { scheduled, done } = reviewGoals(goals, today)
  const flagged = flaggedGoals(goals, today, planReview.flagRepeatedMisses)
  const prompt = reviewPrompt(flagged)

  /** Writes the answer (if any) into the day's Daily review section. */
  const write = () => {
    const trimmed = text.trim()
    if (trimmed) {
      // Only the Daily review section changes; anything already written under Journal stays.
      const day = dayDoc(journalEntryFor(useData.getState().journal, today))
      seedReflection(today, prompt)
      setJournalDoc(today, withSection(day, REVIEW_HEADING, trimmed))
    }
  }
  const save = () => {
    write()
    onClose()
  }
  /** Saves, then opens today in Record's journal to keep writing. */
  const continueInRecord = () => {
    write()
    location.href = recordJournalLink(today)
  }

  return (
    <Sheet title="Evening review" onClose={onClose} leftLabel="Skip" right={{ label: 'Done', onClick: save }}>
      <SectionBox title="Today" accent={colors.primary} subtitle={scheduled.length ? `${done.length} of ${scheduled.length} done` : undefined}>
        {scheduled.length === 0 ? (
          <span className="muted">Nothing scheduled today.</span>
        ) : (
          <div>
            {/* Every goal, so something done but never ticked can be caught here. */}
            {scheduled.map(g => {
              const isDone = isDoneOn(g, today)
              return (
                <button key={g.id} className="row review-goal" onClick={() => setCompletion(g.id, today, !isDone)} aria-pressed={isDone}>
                  <CompletionMark on={isDone} size={18} color={colors.primary} />
                  <span className={isDone ? 'strike' : ''}>{g.title}</span>
                </button>
              )
            })}
          </div>
        )}
      </SectionBox>

      {flagged.map(g => (
        <div key={g.id} className="card nested">
          <div style={{ fontWeight: 500 }}>{g.title}</div>
          <div className="caption">{missNudge(g, today)}</div>
        </div>
      ))}

      <SectionBox title="A line or two" accent={colors.primary}>
        <label htmlFor="reflection" className="review-prompt">{prompt}</label>
        <textarea id="reflection" className="writing" rows={5} value={text} onChange={e => setText(e.target.value)} style={{ resize: 'vertical' }} />
        <p className="help">Optional — skipping is fine. Your answer goes under today's Daily review heading in your journal in Record.</p>
        <button className="link-row" onClick={continueInRecord}>
          <span className="grow">Write more in Record</span>
          <span aria-hidden="true">→</span>
        </button>
      </SectionBox>
    </Sheet>
  )
}
