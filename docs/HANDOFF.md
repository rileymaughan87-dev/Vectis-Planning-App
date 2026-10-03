# Vectis — handoff from the claude.ai build sessions

Vectis was built over many chat sessions where Claude wrote the code and Riley
pasted it into Xcode. This document condenses everything a new session needs.
It supersedes `Vectis-spec.md` wherever the two disagree.

## What the app is for

A tool for setting goals and carrying out plans **while respecting the need for
rest and pleasure**. The planning half is well built. The rest-and-pleasure half
is mostly still on paper — that is the biggest gap, and the main reason buffer
awareness and rest days are high in the queue.

Research that shaped the design:
- **Goal-setting theory (Locke & Latham):** specific, difficult goals beat
  vague ones, but performance collapses once a goal is impossible — so a
  consistently missed goal is evidence about the goal, not the person.
- **Habit formation (Lally):** median 66 days, wide range; a single missed day
  makes no measurable difference, two or more in a row do. Drives the
  consistency model below.
- **Progress monitoring (Harkin et al. 2016, 138 studies):** monitoring
  improves attainment (d ≈ 0.40), more so when physically recorded. Logging in
  the app *is* the intervention.
- **Reflection (Di Stefano et al.):** 15 minutes of written reflection
  outperformed extra practice by ~23%, via self-efficacy. So the review has a
  written prompt, and leads with what got done.
- **Planning fallacy / segmentation:** unpacking a task into parts produces
  longer, more realistic estimates. Hence event parts.
- **Flexible vs rigid restraint:** planned breaks have far lower dropout than
  unplanned ones. Basis for rest days.
- **Fresh start effect:** temporal landmarks prompt change. Basis for the
  monthly review.
- Evidence on morning vs evening planning timing is weak — keep timing a
  neutral preference.

## Last session (3 Oct 2026, second Claude Code session)

Done:
- Deleted the unused `tab*.imageset` assets and loose `tab_*.png` files
  (tab icons are SF Symbols). Build succeeded. Committed `3aa1efd`.
- Built buffer awareness (see Open queue). `PlanningCommitment` and
  `CommitmentBar` live in `PlanningItem.swift`; the bar shows at the top of
  the capture popup and under the drag tray's header. Builds; **not yet
  tested on device or committed**.
- One change from the original design: overlapping blocks count once
  (time covered by at least one block), not summed — summing double-counts
  a goal sitting on a meeting and can exceed 100%.

- Fixed two drag-tray bugs (not yet device-tested): swiping to the end of
  the tray no longer changes day (day swipe now on the grid only), and tray
  items can be dropped anywhere on the grid (drop target was the size of one
  block at the top).
- Full app audit: `docs/AUDIT-2026-10.md`. Batch A (data safety) is the
  recommended next step, ahead of the editor restyle.

Still to verify on device (carried over plus new):
- Sidebar shows only People, Linked apps, Settings; launch screen appears;
  Linked apps still lists Wallet and Stocks.
- The commitment bar: percentage looks right on a sample day, moves when a
  tray item is dropped or a goal is given a time, turns amber with the line
  above 80%, and nothing is ever blocked.
- Tray: scrolling to the end stays on the same day; dragging a chip onto an
  empty part of the grid places it at that time.

## Status by feature

| Area | Status |
|---|---|
| Event origin fix, weekday repeats, per-day overrides for goals and repeating events | Built |
| Goal schedule versioning (`ScheduleVersion`, future-only edits) | Built |
| Streaks → consistency (14-day dots, grey misses, "N times done", nudge at 2 consecutive misses, tappable dots for retro logging) | Built |
| Squared-off `VectisButtonStyle` across the app | Built |
| Fixed vs flexible flag on events (default fixed) and goals (default flexible) | Built (used by planning) |
| Event parts / segmentation in the event editor, stacked on the grid | Built |
| Actual-time logging | Built as an explicit "Log actual time" button after start. The drag-to-resize handle was tried and removed (fought the move gesture). |
| Event editor redesign (`EditorBox`, paired times, category chips, collapsed rows) | Built |
| Record tab (renamed from Notes): Journal / Notebooks / Jots / Lists & Notes underline selector | Built |
| Journal (one entry per day, month-grouped list, calendar jump, search) | Built |
| Plan and review toggle + sub-toggles in Settings | Built (only "flag repeated misses" changes behaviour yet) |
| Evening review (tickable goals, repeated misses, adaptive reflection prompt → journal) | Built |
| Morning planning stage 1: capture popup (fixed context → big items → small items, empty steps skipped, "give it a time" for goals) | Built |
| Morning planning stage 2: drag tray, tasks placeable on the grid, task action popup | Built |
| Task durations (`VectisTask.durationMinutes`, `scheduledDate`) | Built |
| Native launch screen (wordmark image, all 3 scales) | Built |
| Finance removed (moving to its own app); orphaned `SplashView` deleted | Done (Oct 2026). Old `finance_events.json` stays on the phone, unread. |
| Repo hygiene: `.gitignore` for `.DS_Store` and `xcuserdata/`; those files untracked | Done (Oct 2026) |
| Buffer awareness (2.8) | Built (Oct 2026), awaiting device test |
| Unused `tab*` image assets | Removed (Oct 2026) |
| Rest days (2.2) | Not built |
| Editor restyle for goals / settings / notes | Not built |
| Share my day | Not built |
| Estimate calibration (2.5) | Waiting — needs 5+ logged actuals |
| Monthly review / recalibration (2.10, 2.11) | Waiting — needs a month of data |

## Decided against (don't reopen without a reason)

- **Temptation bundling** — weak effect without enforcement; Riley won't use it.
- **Limit goals** ("one soda a week") — superseded by rest days.
- **If-then implementation-intention field** — time blocks already provide the
  cue; only optional where/how notes and plan rehearsal survive.
- **Event-anchored scheduling** ("after dinner") — cascades badly.
- **App-side overrun prompting / timers** — nagging; logging stays opt-in.
- **Clear-override button** — dragging back is the undo; overrides persist.
- **Review/plan blocks on the calendar** — immovable clutter; replaced by two
  buttons above the grid.
- **Segmentation prompt during planning** — real events already support parts;
  tasks stay deliberately simple.
- **Finance inside Vectis** — removed Oct 2026; moving to its own app.

## Open queue — detail

**Buffer awareness.** One shared calculation used by the capture popup and the
drag tray, so they never disagree:
committed = timed events on the Daily grid + calendar-scheduled short-term goals
due that day + placed undone tasks that day; total = calendar start→end hours.
Show a thin bar "Day committed N%", amber with the line "Above 80% tends to
unravel when anything runs long." Never block, never insert gaps. A draft
(`PlanningCommitment` + `CommitmentBar`) was written into `PlanningItem.swift`
in a chat session but never pasted in; rebuilt there in Oct 2026. Window is
the Daily grid's start→end hours; overlaps count once; done tasks don't count.

**Rest days.** Optional per-goal count. Denominator is the target, not the
calendar (daily with 1 rest day → 6/6 when hit). Rest-day dots outlined,
distinct from done (filled) and missed (grey). Exceeding is just a miss — don't
also say "rest day overused".

**Editor restyle.** Apply the event editor's pattern to `GoalSheets` (3 forms),
`SettingsView`, `NoteSheets`. Settle editor titles on "New X / Edit X".

**Share my day.** A `ShareLink` (Home and/or end of evening review) producing a
short summary — goals done / scheduled, optionally a rendered image card. Sent
via Messages or any app. Accounts/CloudKit/partner-in-sidebar were costed and
deferred: they need a paid Apple Developer account. If revisited, keep Journal,
Notes, People private; share Goals and Calendar read-only.

**Sidebar.** People and Linked apps are low-visibility; decide whether they earn
their place now that Finance is gone.

## Gotchas met so far

- Sample data's "Study 1 hour" is weekdays-only, so it vanishes on weekends.
  That is correct behaviour, not a bug.
- `isScheduled(on:)` checks frequency only; filter `kind == .shortTerm` when you
  mean daily-trackable goals.
- A Finder "Keep Both" conflict once renamed files with timestamps and Xcode
  lost track of them. Recovery: `git status`, restore deleted files with
  `git ls-files -d -z | xargs -0 git checkout --`, diff duplicates, delete.
- Launch screen changes may not appear until the iPhone is rebooted.
- `.dropDestination` competes with the custom long-press-drag; only attach it
  while the planning tray is visible.
