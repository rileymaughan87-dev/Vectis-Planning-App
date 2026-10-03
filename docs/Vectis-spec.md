# Vectis — pending work and design decisions

Everything agreed but not yet in the project. Part 1 is code that exists or
needs finishing. Part 2 is design decided this session, not yet built.

---

## Part 1 — Code queue

### 1.1 Long-Term "origin" fix — INCOMPLETE, needs finishing

**Problem.** A timed event added from Long-Term automatically gets
`flowsToDaily = true` so it also appears on the Daily grid — but the Long-Term
filter reads that same flag to decide visibility, so the event vanishes from the
screen where it was created.

**Cause.** `flowsToDaily` is doing two unrelated jobs: "does this also show on
the Daily grid" and "should this show on Long-Term". They need to be independent.

**Fix.** Track where an event was created as its own property.

```swift
enum EventOrigin: String, Codable {
    case daily
    case longTerm
}
```

Done so far: the enum only. Still to do:

- Add `var origin: EventOrigin = .daily` to `CalendarEvent`
- Wire it through the hand-written `Codable` — `CodingKeys`, `init(from:)` with
  `decodeIfPresent(...) ?? .daily`, `encode(to:)`, and the manual memberwise init
- Change the Long-Term filter in `CalendarHelpers.longTermDayItems` from
  `!$0.flowsToDaily` to `$0.origin == .longTerm`
- Set `origin` at both creation sites: `.daily` from `DailyCalendarView`,
  `.longTerm` from `LongTermCalendarView`

### 1.2 Per-day goal scheduling override — written, ready to paste

Dragging one occurrence of a goal block moves only that day. Editing the time in
the goal editor still moves the whole schedule.

Four files: `CalendarModels.swift`, `GoalHelpers.swift`, `GoalsStore.swift`,
`DailyCalendarView.swift`.

### 1.3 Clear-override UI — decided against

Dragging a block back to its usual time is the way to undo an override. No
button. Note the override is **kept** rather than deleted when it happens to
match the default — a day you deliberately placed stays placed.

### 1.4 Button and control restyle — NEW

Sheets and forms still use stock iOS controls: translucent tinted capsules,
system Cancel/Save styling. Out of place against the app's squared-off look.

Add a shared button style and apply it to Add / Save / Delete / Cancel across
`GoalSheets`, `CalendarSheets`, `NoteSheets`, `FinanceSheets`, `ChallengeSheets`.

```swift
/// Squared-off, solid buttons matching the app's boxy style, rather than
/// iOS's translucent tinted capsules.
struct VectisButtonStyle: ButtonStyle {
    enum Kind { case primary, secondary, destructive }

    var kind: Kind = .secondary
    var accent: Color = .vectisTeal

    func makeBody(configuration: Configuration) -> some View {
        let fill: Color
        let fg: Color
        switch kind {
        case .primary:     fill = accent;                     fg = accent.contrastingTextColor
        case .secondary:   fill = Color(.secondarySystemBackground); fg = .primary
        case .destructive: fill = Color(.secondarySystemBackground); fg = .red
        }

        return configuration.label
            .font(.subheadline.weight(.medium))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 11)
            .foregroundStyle(fg)
            .background(
                RoundedRectangle(cornerRadius: DesignTokens.smallRadius, style: .continuous)
                    .fill(fill)
            )
            .overlay(
                RoundedRectangle(cornerRadius: DesignTokens.smallRadius, style: .continuous)
                    .strokeBorder(kind == .primary ? .clear : Color(.separator), lineWidth: 1)
            )
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}
```

Toolbar Cancel/Save stay as plain text buttons — iOS positions those and
restyling them fights the platform for no gain.

---

## Part 2 — Designed this session, not built

Ordered roughly by build cost.

### 2.1 Streak model — replace with consistency

**Why.** Missing a single day does not measurably affect the trajectory toward
automaticity; two or three consecutive misses do, and missing 2+ per week
prevents automaticity forming. Streak dots currently treat an isolated Tuesday
and the start of a collapse identically.

**Changes** (all small, mostly subtraction):

- Missed days render **grey**, not a hollow ring — a hole reads as failure
- Window goes **7 → 14 days** — a week is too short to show a pattern
- Add a **cumulative count** ("38 times total") that never decreases
- Say something only at **two consecutive** misses, phrased as resume-tomorrow

Keep 75 Hard strict mode exactly as is — it is that challenge's real rule. Worth
a line in its description making clear it is the challenge's rule, not the app's
general philosophy.

### 2.2 Goal allowance / rest days

Optional per-goal allowance: "gym every day, one rest day a week."

- **Denominator is the target, not the calendar.** Daily with one rest day →
  target 6. Six sessions reads **6/6**, not 6/7. Five reads 5/6.
- Rest-day dots are **outlined**, distinct from both done (filled) and missed (grey)
- Defaults to zero, so nothing changes for goals that do not use it
- Exceeding the allowance is just a miss against the target — do not also report
  "allowance overused", that is the same information twice
- Note this converges with times-per-week: "daily with one rest day" and "6 times
  a week" score identically. Shared code; they must never disagree

**Why.** Rigid all-or-nothing rules produce a switch-off effect on any
deviation. The dividing line in the research is *planned vs unplanned* — planned
breaks showed 15.7% dropout vs 36.8%, and no association with psychological
distress. Building the allowance in at creation makes the deviation planned by
design.

Use the words **"rest day"**, not "cheat day" or "allowance".

### 2.3 Fixed vs flexible blocks

A per-block flag, with defaults that reproduce today's behaviour so it needs no
settings toggle:

- Calendar events default **fixed**
- Goal blocks default **flexible**

"Fixed" means *the app never moves it automatically* — you can still drag it
yourself when a lecture genuinely gets rescheduled. Nothing hard-locks.

### 2.4 Task segmentation

Prompt to break a substantial block into parts.

- Parts **stack with real durations** inside the parent block, so you can glance
  at 7:45 and see which part you should be on. Not a checklist — no tick boxes
- Parts summing longer than the block is **the expected result**, not an error.
  Show the gap, offer to extend the block or trim scope. Never silently compress
- Segments degrade gracefully at low zoom: minute label drops first, then name

**Why.** People underestimate duration partly because they do not spontaneously
unpack tasks; prompted unpacking produces longer, less biased estimates, and
summed subtask allocations consistently exceed single-task allocations.

### 2.5 Estimate calibration

Log actual durations, learn the personal overrun factor.

- Capture is **retrospective with estimates pre-filled** — nudge sliders, do not
  type. No timers
- **Stays silent below ~5 logged blocks.** Two points is not a pattern
- **Global first**, split by category only once a category has its own 5+ blocks
- Appears passively; never a modal. Skipping a block is fine and leaves no gap
  to fill
- Better than the common "multiply by 1.5" advice because it learns *your* factor

**Honest caveat.** In passive mode (see 2.6) "no change to the block" is
ambiguous between a perfect estimate and not bothering, which biases the sample
toward large misses. Calibration genuinely needs the review ritual to be
accurate, and the app should say so rather than computing a confident number
from biased data.

### 2.6 Plan and review mode

Optional. Adds a morning planning block and an evening review block. Both are
**generated, not stored** — same technique as goal blocks, so turning the mode
off leaves no orphaned events behind.

**Why this earns its place, not just a nice-to-have:**

A meta-analysis of 138 randomised studies (Harkin et al., 2016, N ≈ 20,000)
found that prompting people to monitor their goal progress reliably improved
attainment (d = 0.40), and that the change in monitoring frequency was what
*mediated* the effect — the act of checking in is doing real work, not just
recording it. Two things made the effect larger: progress being **physically
recorded**, and outcomes being **reported or made public**. Vectis gets the
first for free — logging in the app is physical recording. It does not get
the second — no social features — which is a real, acknowledged gap in the
evidence this design captures, not a flaw to fix.

Separately, a field experiment at a business process outsourcing company
(Di Stefano, Gino, Pisano & Staats) found that employees who spent 15 minutes
a day **writing about what they'd learned** scored 22.8% higher on a final
assessment than a control group — despite having *less* practice time than
the control group. The mechanism was two-part: reflection improved task
understanding ("knowledge codification") and raised self-efficacy, which in
turn drove further motivation. Notably, adding a sharing/discussion step on
top of writing added little beyond writing alone — so a private, unshared
reflection is not leaving much of that effect on the table.

**What this means for the design, concretely:**

- The evening review is **not just monitoring — it needs a written
  reflection component**, or it only captures half of what the evidence
  supports. See 2.15 for the actual prompt and how it's stored.
- **Self-efficacy is the mechanism, not a side effect.** A review that opens
  with shortfalls (missed estimates, flagged misses) works against its own
  purpose. **Lead with what got done**, in the same spirit as replacing
  streaks with a cumulative count — same data, reordered so the review
  builds "I did things today" before anything else.
- **No claim about morning vs. evening planning timing.** The commonly
  repeated numbers ("10–12 minutes of planning recovers 2 hours," "25% more
  productive") trace back to marketing blog posts, not verifiable research —
  they should not be repeated in the app's own copy. One real, narrower
  finding exists (writing tomorrow's list before bed helped sleep onset
  faster than journaling about the day), but it's about sleep, not output.
  **Keep timing as a plain preference, with no opinion attached either way.**

Sub-toggles (plain language, not research jargon):

- Review time estimates
- Rehearse your plans
- Flag repeated misses
- Fresh start prompts

**Name:** "Plan and review" rather than "productivity mode" — the whole app is
about productivity, so the latter is redundant.

Not everything gets a toggle. Things that are simply *more correct* — forgiving
a single missed day — should be defaults for everyone, not opt-in.

Mode off → blocks still divide the day; a duration is recorded only if a block is
changed after being set; no overrun estimate is computed from that alone.

### 2.7 Morning planning — popup for capture, grid for placement

Two stages, because they are two different kinds of thinking. The popup answers
**what and how long**; the Daily grid answers **when**. Capture and estimation
are list work, placement is spatial.

**Launched from the planning block itself**, which then marks complete — so the
ritual has a start and an end rather than being an ambient state.

**Stage 1 — popup.** Steps, each of which **skips itself if empty**:

1. Scheduled events, shown for context only
2. Big unplaced items — given a **duration, not a time** ("2 hours", not "9pm")

**Anything over an hour, placed or not, gets asked whether it should be broken
into parts** (see 2.4). One prompt, not a gate — declining just leaves it as a
plain block. Ties the two features together: segmentation exists, but nothing
was surfacing it at the one moment it is most useful to ask, which is while
looking at the whole day and noticing something big and undivided.
3. Smaller goals and tasks

**Stage 2 — Daily grid.** Drag items from a tray at the top down into the day,
resize as needed. Big items appear first in the tray.

**Tray sources:** flexible goals due today, tasks picked for today, plus a quick
add for one-offs.

**Tasks gain one optional field: duration.** A task with a duration can be
placed on the day; one without stays a plain checklist item. This is not scope
creep into goal territory — duration is not a due date, the task stays undated
and non-recurring.

**Sort the tray longest-first.** Then the big/small boundary never needs to be
precise — chunky items surface naturally whether the threshold is 45 or 90
minutes. Use ~60 minutes to decide what appears in the popup's step 2, but
nothing breaks if a 55-minute item lands in the wrong bucket.

**The useful split is not big vs small — it is by placement state:**

- **Fixed** — locked, shown for context
- **Pre-placed** — has a usual time, can be nudged
- **Unplaced** — genuinely needs a gap found

"Big first" applies only to the unplaced group. A 2-hour reading goal that always
sits at 6pm does not need the big-items step, because you are not deciding where
it goes unless you want to.

**Source does not affect ordering.** A 90-minute goal and a 90-minute task have
the same problem — they need a 90-minute gap. Sort by duration, not by kind.
Distinguish them visually (target icon vs tick) since the difference matters
afterwards: a goal tracks consistency, a task is done once and gone.

**The sequence is a suggestion, never a gate.** You can advance without placing
anything. A ritual that blocks you until everything is filed is one you will skip.

**The fast path matters most.** Everything pre-placed at usual times, normal day
is one confirm. If it takes five drags every morning it will be abandoned.

**Anything left unplaced is recorded as deliberately not today** — a planning
decision, not a miss.

### 2.8 Buffer awareness

Show how much of the day is committed on the planning grid. Warn above ~80%.
**Do not insert gaps automatically** — the app would only be guessing at how
much, and the commitment figure does the same job while leaving the judgement
with the user.

**Why.** Advice converges on keeping 15–20% unscheduled, or planning 70–80% of
available time. Back-to-back blocks with no slack are among the fastest ways to
abandon time blocking, because the first disruption makes the day feel
unrecoverable.

### 2.9 Overrun and underrun — no timing, no prompts

The app never watches the clock or interrupts. You resize a block by dragging
its bottom edge — during, after, or never. **Adjusting is the logging.** No
adjustment means no data, which is correct rather than a gap: someone who did not
adjust has said they do not care about that block's precision.

Rejected an earlier design where the app prompted after running ~20 minutes over.
Almost everything over- or underruns by a few minutes, so that prompt would fire
constantly and become noise.

If an extended block runs into the next one, the **visible overlap is the
information** — the layout code already draws overlapping blocks side by side.
No dialog needed to explain it.

**Estimate-lock rule — implement carefully, this is a likely source of bugs.**

> A block's **estimate** is its duration at the moment its start time arrived.
> Changes before then are re-planning and log nothing. Changes at or after that
> moment are the **actual**, and the difference is the data.

Handles all three cases with one rule: resizing a 6pm block during 9:30am
planning logs nothing; realising at 6:30pm that it needs another hour counts;
correcting it next morning during review also counts.

Implementation: resize is a distinct gesture from move — drag the bottom edge,
alongside the existing long-press-then-drag for moving.

**Rejected:** event-anchored scheduling ("after dinner" rather than 7pm). It
cascades — anchored items push each other back, fixed commitments cannot absorb
the push, so things end up dropped rather than moved. Also more to think about at
planning time than it is worth.

### 2.10 Goal recalibration

Surfaced in the **monthly review**, not as a mid-week interruption.

- Show the **per-weekday hit rate** — the app has this data and most habit apps
  throw it away
- Distinguish "goal too hard" from "goal badly placed". Usually it is the latter:
  fine on five days, hopeless on two
- Also flag correlation with **over-committed days** (ties to 2.8)
- **Project each option against real data** — "September would have been 12/16
  under this setting". Turns a question about self-discipline into arithmetic
- Where a change cannot be projected (moving to mornings — no morning data), say
  so rather than inventing a number
- **Never use the word "failing".** Show the chart, let the user conclude
- "Leave it" is always a stated option

**Why.** Goal difficulty correlates 0.82 with performance within the limits of
ability, collapsing to 0.11 once the goal is impossible. A consistently missed
goal is evidence about the goal.

### 2.11 Monthly review / fresh start

The home for 2.10, and the natural cadence for accumulating enough data.

- Opens with **"September is done"** — explicitly closing the period is the
  active ingredient. Temporal landmarks work by relegating past imperfections to
  a previous period
- Per-goal hit vs target, estimate calibration summary, carry-forward
- Flagged goals show **one line plus a button**; the deep dive is opt-in so the
  review stays skimmable
- **Skipping is first-class** — changes nothing, offers again next month
- A dismissed prompt **defers to the next session** rather than disappearing
  forever
- New year is the same screen with a longer look back, not a separate feature

### 2.12 Implementation intentions — mostly cut

Only the cheap parts survive.

**Keep:** optional "where" and "how" fields on a goal. Rehearsing today's plans
during the morning block (rehearsal is the one component shown to increase effect
size).

**Cut:** a dedicated if-then text field. It would restate what the calendar block
already says.

**Why cut.** Theory predicts contingent if-then plans should beat schedule-format
plans, but a 192-person, 84-day RCT comparing routine-based against time-based
cues found no between-condition differences — both worked, and repeated
enactment was the key predictor. A time-blocked planner entry is already a
time-based cue.

### 2.13 Temptation bundling — skipped

Not building. Enforced bundling produced 51% more gym visits, but mere
encouragement produced 29%, with effects declining over time, and a larger
follow-up found encouragement raised the likelihood of a weekly visit but had
negligible effect on total visits. Enforcement needs Apple's Screen Time
entitlement — not worth it here, and Riley does not expect to use the feature.

### 2.14 Limit goals — superseded

Originally designed as budget-style goals ("one soda a week") with an abstinence
variant. **Superseded by 2.2** — the rest-day allowance covers the real need
without the vice-tracking feel.

If limit goals are ever revisited: approach-framed goals were 26% more successful
than avoidance-framed ones over a year in a 1,000+ person RCT, so any such
feature should offer an approach reframe once at creation and then never mention
it again.

---

### 2.15 Journal, and the Record tab

The evening review's written reflection (2.6) and a standalone journaling
feature are **the same underlying thing, not two features** — one dated entry
per calendar day. Answering the review's reflection prompt starts that day's
entry. Opening the journal directly and writing — with no review, no prompt —
adds to or creates that same entry. Never two records for one day that could
drift apart or show up in different places.

```swift
struct JournalEntry: Identifiable, Codable {
    var id: UUID = UUID()
    var date: Date            // the day this entry is FOR
    var reflectionPrompt: String?   // set only if seeded from a review
    var text: String
}
```

**No streak, no count, no "you haven't written in 3 days."** The whole
mechanism this feature rests on is honest self-efficacy built from genuine
articulation — gamifying the act of writing would work directly against the
reason it's there. A day with no entry is not a miss; unlike a goal, there
was never a "should" attached to it.

**Entries only exist for days something was actually written.** No gap-
marking, no placeholder rows for silent days — consistent with the point
above.

**A small "review" tag** distinguishes an entry seeded by the evening
prompt from one written unprompted — informational only, not a status.

**Navigation, once there are months of entries:**

- **Month-grouped list**, newest first, by default — free, since entries are
  already date-sorted; only needs a section header whenever the month changes
- **A calendar jump view reusing the existing `MonthGridView` component**
  (already built for Long-Term and Finance) — dots mark days with an entry,
  tap a day to open it. Not a new pattern, the same one pointed at different
  data
- **Search**, extending the `.searchable` modifier already on this page for
  Notes to also match journal entry text — no new infrastructure

**The tab itself is renamed from "Notes" to "Record."** Jots, Lists,
Notebooks, and now Journal no longer fit under "Notes" as a name. "Record" is
deliberately neutral rather than overselling any one piece of content —
"Journal" specifically was considered and rejected as the tab name, since
Jots and Lists aren't journal entries.

**A fixed four-way selector replaces stacking every section on one page** —
Journal / Notebooks / Jots / Lists & Notes. Selecting one **fully swaps** the
content area below it; it does not add to a shared scroll. A shared scroll
with a selector pinned on top would still have journal entries burying
everything else underneath it, which is the exact problem this solves.

- **Underline-style indicator, not chip styling.** The category picker in
  the event editor uses filled chips because categories are a *variable*,
  user-edited list; styling this selector the same way would wrongly imply
  these four sections are also editable. A plain underline under the
  selected label reads as structural navigation instead
- **Journal is the default/leftmost section** — opening Record lands there,
  since it's the one tied to a daily ritual now, not on Notebooks
- **No per-section counts on the unselected segments** — "Journal · 4" times
  four gets noisy in one narrow row. Open question whether a count badge on
  just the *selected* segment is worth adding later; not decided either way

---

### 2.16 Segmentation-during-planning — skipped

Not building. The capability already exists through the right door: any real
event created via "New event" has full parts support today. The only thing
this would have added is letting a **task** placed via the planning tray also
carry parts — but tasks are deliberately simple (one-off, no editor of their
own), and something that genuinely needs breaking into several named pieces
with their own time allocations is arguably signalling it should have been
created as an event from the start, not a task nudged onto the calendar later.
Building parts support onto tasks would mean growing the deliberately-simple
thing to match the full one, undercutting the reason tasks are simple at all.

---

## Cross-cutting rules

**Scheduling, applying to all three block types** — goals, plan/review blocks,
and repeating calendar events:

1. Dragging a block moves **that day only**, permanently
2. Editing the source changes **future days only**; past stays as it was
3. Schedule changes are **versioned by date**, so the calendar is a record rather
   than a projection of current settings run backwards
4. No "change all including past" dialog — that means falsifying your own history

Rule 3 is not optional polish: the review features depend on the past being
truthful. Reviewing yesterday and being shown times you did not plan would
undermine the whole thing. Cheaper to build now than to retrofit over months of
wrong history.

**Model changes.** `Goal` and `CalendarEvent` have hand-written `Codable` with
`decodeIfPresent(...) ?? default` on every field. Any new field must be added to
`CodingKeys`, `init(from:)`, `encode(to:)`, and the manual memberwise init.
Skipping this silently wipes saved data on the next run. `Note` and
`FinanceEvent` still use automatic `Codable` and carry the same latent risk —
give them the same treatment next time either changes.


