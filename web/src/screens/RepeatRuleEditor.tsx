// The custom repeat, set out as a sentence: "Every [2] [weeks] on Tue and
// Thu", "Every [1] [month] on the [1st] [Thursday]", "Every [1] [year] on
// [3] [March]". Shared by goals and events; a preview of the next few
// days shows what it means before you save.

import { dayFromKey, dayKey } from '../model/dates'
import { describeRule, monthName, nextDays, ordinalName, weekdayName, type RepeatRule, type RepeatUnit } from '../model/repeat'
import { RepeatDaysPicker, Segmented } from '../ui/components'

const UNITS: { value: RepeatUnit; one: string; many: string }[] = [
  { value: 'day', one: 'day', many: 'days' },
  { value: 'week', one: 'week', many: 'weeks' },
  { value: 'month', one: 'month', many: 'months' },
  { value: 'year', one: 'year', many: 'years' },
]

const short = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

export function RepeatRuleEditor({ rule, anchor, onChange, showAnchor }: {
  rule: RepeatRule
  /** The day its every-N counts from. */
  anchor: Date
  onChange: (rule: RepeatRule) => void
  /** Goals choose the day it counts from; events count from their own date. */
  showAnchor?: boolean
}) {
  const set = (p: Partial<RepeatRule>) => onChange({ ...rule, ...p })
  const plural = rule.interval !== 1
  const onWhich = (rule.unit === 'month' || rule.unit === 'year') && (
    <>
      <Segmented<'date' | 'weekday'>
        label="On"
        value={rule.monthMode}
        onChange={monthMode => set({ monthMode })}
        options={[{ value: 'date', label: 'On a date' }, { value: 'weekday', label: 'On a weekday' }]}
      />
      {rule.monthMode === 'date' ? (
        <div className="repeat-sentence">
          <span>On</span>
          {rule.unit === 'year' && (
            <select value={rule.month} onChange={e => set({ month: Number(e.target.value) })} aria-label="Month">
              {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{monthName(i + 1)}</option>)}
            </select>
          )}
          <select value={rule.monthDay} onChange={e => set({ monthDay: Number(e.target.value) })} aria-label="Date">
            {Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
          </select>
        </div>
      ) : (
        <div className="repeat-sentence">
          <span>On the</span>
          <select value={rule.ordinal} onChange={e => set({ ordinal: Number(e.target.value) })} aria-label="Which">
            {[1, 2, 3, 4, -1].map(n => <option key={n} value={n}>{ordinalName(n)}</option>)}
          </select>
          <select value={rule.weekday} onChange={e => set({ weekday: Number(e.target.value) })} aria-label="Weekday">
            {[2, 3, 4, 5, 6, 7, 1].map(d => <option key={d} value={d}>{weekdayName(d)}</option>)}
          </select>
          {rule.unit === 'year' && (
            <>
              <span>of</span>
              <select value={rule.month} onChange={e => set({ month: Number(e.target.value) })} aria-label="Month">
                {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{monthName(i + 1)}</option>)}
              </select>
            </>
          )}
        </div>
      )}
      {rule.monthMode === 'date' && rule.monthDay > 28 && <p className="help">In shorter months it falls on the last day.</p>}
    </>
  )

  const next = nextDays(rule, anchor, new Date() > anchor ? new Date() : anchor)

  return (
    <div className="repeat-rule">
      <div className="repeat-sentence">
        <span>Every</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={99}
          value={rule.interval}
          onChange={e => set({ interval: Math.min(99, Math.max(1, Math.round(Number(e.target.value) || 1))) })}
          aria-label="How many"
          className="repeat-interval"
        />
        <select value={rule.unit} onChange={e => set({ unit: e.target.value as RepeatUnit })} aria-label="Unit">
          {UNITS.map(u => <option key={u.value} value={u.value}>{plural ? u.many : u.one}</option>)}
        </select>
      </div>
      {rule.unit === 'week' && <RepeatDaysPicker days={rule.weekdays} onChange={weekdays => weekdays.length && set({ weekdays })} />}
      {onWhich}
      {showAnchor && rule.interval > 1 && (
        <label className="repeat-sentence">
          <span>Counting from</span>
          <input type="date" value={dayKey(anchor)} onChange={e => e.target.value && set({ anchor: dayKey(dayFromKey(e.target.value)) })} />
        </label>
      )}
      <p className="help">
        {describeRule(rule)}.{next.length ? ` Next: ${next.map(short).join(', ')}.` : ''}
      </p>
    </div>
  )
}
