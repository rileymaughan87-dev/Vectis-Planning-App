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

## Latest session (6 Oct 2026) — hosting, Long-Term, wide screens

- Hosted on GitHub Pages: https://rileymaughan87-dev.github.io/Vectis-Planning-App/
  (repo made public; `.github/workflows/deploy-web.yml` deploys on push to
  master touching `web/`; Google keys come from repo secrets). Riley
  confirmed the partner link works phone-to-phone.
- **Long-Term tab ported** (`screens/LongTermScreen.tsx`, `model/longTerm.ts`):
  goals progress summary, month grid (events with `origin: longTerm` plus
  dated milestones, 3 per cell then "+N more"; dots on very narrow phones),
  tap a day → list, add (all-day, off the Daily grid by default), edit.
- **Wide screens:** from 900px wide a permanent left sidebar holds the tabs
  and side-menu items; Home, Goals, Long-Term and the partner view go
  two-column; Daily is capped at 960px. Mouse users drag blocks directly
  (long-press stays for touch). Hover states added.
- **Plan and review ported** (on in Settings): "Daily planning" and "Review"
  buttons above the Daily grid. Planning = 3-step capture popup (fixed
  events → big items → small items, empty steps skipped, each step's items
  fixed on open) → drag tray with the commitment bar. Tray: pull a chip
  down onto the grid (sideways swipes scroll the tray; mouse drags
  directly), dashed drop preview, auto-scroll near edges, tap a chip to
  type a time instead. Review = prompt sheet → done goals (tickable) →
  repeated misses → one prompt that seeds that day's journal entry
  (`journal_entries.json`, same format as iPhone). Home shows the review
  card after the evening time until answered. Logic in `model/planning.ts`.
- **Record tab ported** (`screens/RecordScreen.tsx`, `NoteEditors.tsx`):
  Journal (month-grouped list, search, calendar jump, one entry per day,
  delete), Notebooks (goal link; deleting keeps the notes), Jots, Lists &
  Notes (search). Classic notes stay RTF in `richTextData` (base64) so
  they open on the iPhone; `model/rtf.ts` converts RTF ↔ paragraphs
  (bold, italic, heading — the iPhone editor's three styles) and
  `ui/RichTextEditor.tsx` edits them as HTML. Tested with Cocoa-style RTF.
  The wifi-password sample jot was dropped from the web samples.
- **Challenges ported** (`model/challenges.ts`, `screens/ChallengeSheets.tsx`,
  catalog = the iPhone's Challenges.json copied to `web/src/model/`):
  browse 8 templates, choose tasks, start date, strict mode; catch-up for
  unconfirmed days (offered once per visit); strict-mode miss → restart.
  **Riley decided restarts keep habit history** (audit item 8): the
  challenge counts from the new day 1, earlier ticks stay.
- **Regional:** weeks start on the region's first day (`firstWeekday()` via
  `Intl.Locale` week info) in the month grid, weekday picker and "times per
  week" counts.

## Session 5 Oct 2026 — web port begun

Riley is on Windows now and decided to move Vectis to a web app, keeping the
Swift project untouched as a fallback. New in `web/` (React + TS + Vite):

- **Model ported** (`web/src/model/`): types that match the iPhone JSON
  exactly, defaults-tolerant decoding, goal schedule versioning, per-day
  overrides, consistency/miss-nudge logic, recurrence, estimate-lock, overlap
  layout, buffer awareness. 13 vitest tests cover the "don't break these"
  mechanisms.
- **Screens:** shell + side menu, Home, Goals (add/edit short- and long-term,
  milestones, habits), Daily (tap to create, long-press-drag to move, swipe
  days, zoom buttons, goal chips, task blocks), event editor (repeats, parts,
  goal link, log actual time, delete one/all), Settings (plan & review
  toggles, appearance, categories, hours, iPhone import, backup/restore).
- **Audit fixes folded into the port:** blocks crossing midnight (item 4),
  one shared `dayBlocks()` (item 7), times follow the device's 12/24h setting
  (item 9), icon buttons have labels (item 10).
- **Accountability (new, sidebar):** you publish a share file to your Google
  Drive (`drive.file` scope, link-readable). The share link is the app URL
  with `#partner=<file id>`; opening it offers to follow you. Partners are
  listed in the sidebar; their view is read-only, built from the same model
  code, with "‹ My Vectis" to go back. Auto-publishes ~4s after changes
  while the Google token is fresh, else shows a dot + "Publish now". Also
  works with a plain share file (no Google) for testing. Setup:
  `docs/GOOGLE-SETUP.md`.
- **Importing iPhone data:** Settings → Your data → pick the JSON files from
  an Xcode container download. Needs a Mac once.

Verified in the browser (mobile size): Home ticking/tasks, Goals, Daily
layout, event create + weekly repeat, long-press drag writing a per-day
override without touching the anchor, partner view and back. Google Cloud
set up 6 Oct (keys in git-ignored `web/.env.local`, localhost origin only):
sign-in and publishing to Drive confirmed working; the API key reads Drive.
**Not yet verified:** following a partner on a second device (needs
hosting), touch drag on an actual phone, iPhone import with real files.

Deliberate differences from Swift: drag snaps to 15 min (was 30); zoom is
+/- buttons (no pinch); the Daily planning/review buttons and Long-Term,
Record, People, Linked apps, Challenges are not ported yet.

Next: host on GitHub Pages (needed for partners on other devices; add the
Pages URL to the OAuth origins and API key referrers), then Long-Term, then
planning capture + tray, evening review, Record.

## Previous session (3 Oct 2026, second Claude Code session)

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
- Full app audit: `docs/AUDIT-2026-10.md`. Batch A (data safety) done:
  unreadable save files are set aside instead of overwritten, and every
  persisted type now has hand-written Codable. Batch B (goal fairness) done:
  goals no longer count misses before they began, the nudge clears once
  ticked today, and `dayKey` is faster. Next: Batch C (Daily grid).

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
| Web app (`web/`): model, Home, Goals, Daily, event editor, Settings | Built (Oct 2026), browser-tested |
| Accountability sharing via Google Drive + partner view (web) | Built (Oct 2026); publishing confirmed 6 Oct; cross-device needs hosting |
| Web: Long-Term tab, wide-screen layout, GitHub Pages hosting | Built (6 Oct 2026) |
| Web: plan and review (capture, drag tray, evening review → journal) | Built (6 Oct 2026), browser-tested |
| Web: Record (journal, notebooks, jots, lists & notes with RTF) | Built (6 Oct 2026), browser-tested |
| Web: challenges (restart keeps history) | Built (6 Oct 2026), browser-tested |
| Web: People, Linked apps | Not ported — need a web design (no contacts or app-launching on the web) |

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
