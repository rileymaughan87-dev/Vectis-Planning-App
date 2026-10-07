// The shared components live in the suite (suite/src/ui); this file adds
// the one that only Planner uses.

import { COMFORTABLE_LIMIT } from '../model/dayBlocks'

export * from '@suite/ui/components'

/** "Day committed N%". Information only — never blocks anything. */
export function CommitmentBar({ fraction }: { fraction: number }) {
  const over = fraction > COMFORTABLE_LIMIT
  const percent = Math.round(fraction * 100)
  return (
    <div className={`commitment ${over ? 'over' : ''}`} role="status">
      <div className="label">Day committed {percent}%</div>
      <div className="bar"><div style={{ width: `${Math.min(Math.max(fraction, 0), 1) * 100}%` }} /></div>
      {over && <p className="help" style={{ marginTop: 4 }}>Above 80% tends to unravel when anything runs long.</p>}
    </div>
  )
}
