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

## Mac work brought in (7 Oct 2026)

Riley's Mac work (Planner rename, blue theme, "Remove from [day]", editor
restyle, audit batch C, items 5/8/10/12/13) was merged to master from the
Mac and pulled here cleanly; it touched only the Swift app and docs. The
Finance Swift app is at `rileymaughan87-dev/Finance-App` (private), cloned
next to this repo. Riley's decisions: the Finance **web** app lives
alongside Planner in this repo with a shared component folder; **no page
titles** under the chrome (design-system.md wins over the handoff doc).

Web port batches:
1. **Done:** Planner name everywhere people see it (`ui/brand.ts`), blue
   `#0068B5` theme (preset ids kept), new icon (`public/icon-1024.png`,
   `favicon.svg`), no page title (wide screens drop the top bar).
2. **Done:** "Remove from [day]" — tapping a goal block opens its editor
   with the tapped day (passed together with the goal), offering "Remove
   from <day>" instead of Delete; adds the day to `hiddenBlockDays`; the
   goal, its other days and its tracking stay. Challenge restarts set
   `statsStartDate` on the habits: dots, totals, weekly counts and miss
   counts start there (`statsFirstDayKey`); ticks before it stay saved.
3. **Done:** changing a repeating occurrence's times asks "This day only"
   (per-day `timeOverrides` + new `durationOverrides`) or "This and all
   future days" (`splitSeriesFrom` in `model/events.ts`: the series ends
   the day before and a new series starts; overrides, logs and deleted
   days split by date). "Log actual time" works on single occurrences
   (`occurrenceActuals` / `occurrenceEstimates`). Fixed: logging on a
   one-off then Save no longer restores the old end. Saved hours are
   clamped on load. Riley had already imported iPhone data before this;
   fields the web didn't know then may be missing — re-importing one file
   (after a backup) restores them. Web port of the Mac work is complete.

## Record tab tidy (9 Oct 2026)

Riley asked for: journal search by date; Jots and Lists & Notes merged;
each journal day to hold a Journal and a Daily review section — one entry,
not two, each section folding away with the heading arrow.

- Tabs are now **Journal · Notebooks · Notes**. Notes: every loose jot,
  list and note, newest first in groups (Today / This week / Earlier this
  month / by month), with a kind icon, an All · Notes · Lists · Jots
  filter, and search that also covers notes in notebooks (labelled with
  the notebook). "New" asks Jot / List / Note; Notebooks has "New
  notebook". A saved "jots" tab choice opens Notes.
- **Journal search** (`model/journalSearch.ts`, 3 tests): every word must
  match the day's date ("12 oct", "october 2026", "monday", "12th",
  "2026-10-12", "12/10", "yesterday") or what was written in either part
  (not the review's prompt). The calendar view's days are all tappable now,
  so past days can be filled in.
- **One entry, two foldable sections**: no new fields. `dayDoc(entry)`
  (model/noteDoc.ts, 3 tests) gives every day the level-2 headings
  "Journal" and "Daily review" (the editor's foldable sections, so each
  has its arrow and folding is saved). New days start with both; older
  days get them on opening — their writing under Journal, except days
  that only ever held the review's answer (prompt set, no body), which go
  under Daily review. The evening review now writes the whole document
  via `withSection(day, 'Daily review', answer)`, so formatting and
  pictures under Journal are never lost (ends the old "review rewrites
  text" edge). The list shows each section's text (`sectionText`); search
  ignores the two heading lines.

## Sync between devices (8–9 Oct 2026) — Stages 1–3 done (Planner and pictures confirmed on phone and laptop)

Riley chose Firebase (over a Drive sync file, whose hourly GIS token
would mean re-signing in on the phone). Project `planner-sync`,
Firestore in London (europe-west2), Google sign-in on, rules restrict
`users/{uid}/**` to that signed-in user. Config: one JSON line
`VITE_FIREBASE_CONFIG` in `web/.env.local` and the same GitHub secret
(passed to the web build). `rileymaughan87-dev.github.io` must be in
Authentication → Settings → Authorized domains for the live site.

- **Stage 1 (built): Planner data.** `sync/records.ts` (pure, 8 tests):
  every goal/event/category/task/journal entry/note/notebook is one
  record `users/{uid}/planner/{file__id}` `{file, id, index, json,
  deleted, device, updatedAt}`; hours/appearance/plan-review are one
  record each. JSON-as-text so any shape fits; tombstones for deletes;
  `index` keeps list order. `sync/engine.ts` (lazy chunk, ~190 KB gz,
  only loaded once signed in): `initializeAuth` with IndexedDB
  persistence (stays signed in), `signInWithPopup` → redirect fallback;
  Firestore persistent cache (offline writes queue). On a device's
  first sync: cloud empty → upload; this device empty → take cloud;
  both have data → Settings asks which to keep and sets the other aside
  in localStorage (`vectis:before-sync` / `vectis:cloud-before-sync`).
  Then live: local changes push 600 ms after they stop (diff against
  what the cloud is known to hold), remote changes pull via onSnapshot
  and go through the normal decoders into `useData.replace`. A device
  already syncing (`vectis:sync:user`) reconnects on open; slices edited
  before the engine attached (`vectis:sync:pending`) win over the cloud.
  UI: "Sync between devices" at the top of Settings (status, sign-in,
  first-time choice, stop syncing). Same item edited on two devices at
  once: last save wins. 9 Oct: Riley signed in on phone then laptop; works both ways. (Untested by me with a real sign-in — no
  Java here for the Firebase emulators, and the first sign-in should be
  on the device with Riley's real data.
- **Stage 2 (built, 9 Oct): Finance + shared machinery.** The sync code
  moved to `suite/src/sync/` — `records.ts` (pure), `store.ts`
  (`createSyncStore(app: SyncApp)`: status store, pending-edit tracking,
  reconnect on open; keys under the app's prefix, so Planner's
  `vectis:sync:*` carried over), `engine.ts` (lazy; `createEngine`),
  and `suite/src/ui/SyncBox.tsx`. Each app lists its `SyncSlice`s
  (file, list/single, get/set/decode/subscribe): `web/src/store/sync.ts`
  (collection `planner`), `finance/src/store/sync.ts` (collection
  `finance`: entries, goals, logged spending, pot, appearance, currency).
  Finance reads `VITE_FIREBASE_CONFIG` from `web/.env.local` via
  `finance/vite.config.ts` (one copy); the deploy passes the secret to
  both builds. On the laptop both apps share the browser's sign-in (same
  site); each Home Screen app on a phone signs in on its own.
- **Stage 3 (built, 9 Oct): note pictures.** Kept in Firestore, not
  Firebase Storage (which may need a card): `users/{uid}/pictureParts/
  {id}_{n}` hold the picture's base64 in 700k-character parts (Firestore
  docs max 1 MiB), and `users/{uid}/pictureIndex/{id}` `{parts, type, size,
  createdAt}` is written last in the same batch, so an index entry means
  the picture is complete. `web/src/sync/pictures.ts` runs while live via
  the engine's new `SyncApp.onLive` hook (lazy, ~1 KB): watches the small
  index only; uploads local pictures the cloud lacks; downloads pictures a
  note here uses that this device lacks (then `ATTACHMENT_READY` makes an
  open note show it); removes cloud pictures no note uses once they're
  over a week old, and only when the index came from the server.
  `model`-style plan in `sync/picturePlan.ts` (2 tests). Re-runs on a new
  local picture (`ATTACHMENT_SAVED`) or a notes/journal change. Spark plan:
  1 GiB stored, plenty for a few thousand ~400 KB photos.
- **Accountability (9 Oct, confirmed on both devices):** share settings (name, Drive file, auto-publish
  — not last-published time) and the partners list sync as Planner slices.
  A Drive partner's fetched snapshot doesn't sync (each device keeps its
  own and fetches a missing one from Drive); a `file:` partner's does
  (nothing to refresh from). Both devices then publish to the same Drive
  file. Because both devices were already syncing, these were added via
  `SyncApp.addedLater`: on a device that synced before, a slice it has
  never synced merges in (`newToCloud`: only items the cloud has never
  seen go up) instead of being replaced by the cloud. The engine now keeps
  `{prefix}sync:files`. 1 test.

## Finance web app (7 Oct 2026) — F0 done

Riley approved: Finance lives alongside Planner in this repo (npm
workspaces: `web/`, `finance/`, `suite/`), served at `/finance/`; shared
design in `suite/`; Apple Pay logging skipped for now in favour of a quick
two-tap "Log spending" (a Shortcuts link would open Safari, whose storage
is separate from a home-screen web app).

- **F0 (done):** workspaces; `suite/` holds the shared styles (split from
  Planner's index.css — every rule kept, Planner-only rules stay in
  `web/src/index.css`, loaded after), `AppShell`, `MonthGrid` (now used by
  Long-Term and the journal calendar), `AppearanceEditor`, components,
  dates, months, format, ids, decode helpers, storage (per-app prefix),
  appearance and backups. Planner's old module paths are one-line
  re-exports. Verified Planner unchanged by comparing computed styles of
  every element on 8 screens at 375px and 1366px before/after (identical
  apart from sub-pixel rounding). Finance: shell with Budget / Calendar /
  Goals (honest "not built yet"), Settings with appearance and backups,
  its own icon and manifest, data under `finance:`.
- **8 Oct 2026:** Riley no longer has a Mac and will **re-enter** their
  finances by hand (no iPhone import). Riley wasn't fully happy with the
  iPhone app and asked for improvements, not a strict port — add things
  that help, and list them in the PR.
- **F1 (done, 8 Oct):** entries (`model/entries.ts`, saved as
  `finance_events.json` in the iPhone shape) and the Calendar tab. Month
  grid (green in / red out / amber estimate), day sheet, month totals
  (In / Out / Left over) and the month's full list, "N amounts to confirm"
  notice, quick confirm sheet (and "back to the estimate"). New vs the
  iPhone app: **every 2 weeks** (`frequency: 'fortnightly'`); weekly
  entries repeat on the first date's weekday (no separate picker);
  **change from a date on** (`splitFrom`: old entry ends, a copy starts,
  confirmations after the date move across) so past months keep old
  amounts; **stop from a date** instead of only delete-everything;
  currency setting (defaults to the region; `preferences.json`);
  forgiving amount entry ("1,234.50", "12,5"). 12 Finance model tests.
- **F2 (done, 8 Oct):** goals (`model/goals.ts`, `finance_goals.json` in
  the iPhone shape): saving / set-aside / debt, a payment plan worked out
  by `schedule()` (skips push it out, extras pull it in), Goals tab with
  progress and a Confirm button when a payment is due, goal editor,
  payment pop-up (confirm / skip / extra). Goal payments also show on the
  Calendar tab (theme colour, amber when due) and in its totals: debt
  payments count as Out; saving and set-asides show as "to saving" and
  "Still free" (MonthSummary's rule — that money stays in the account).
  New vs the iPhone app: every 2 weeks; weekly lands on the first
  payment's weekday; correct or remove a recorded payment; "a little
  behind your date — X would get there" (suggestion counts only payments
  still to come); "Needed by" wording for set-asides. 10 more tests.
- **F3 (done, 8 Oct):** `model/budget.ts` (`monthSummary`, `monthBudget`
  — MonthSummary.swift's rules — plus new `typicalMonth`); the Budget tab
  (opens first): month switcher, In and out (difference, bars, breakdown,
  estimates noted), A typical month (new — weekly ×52÷12, fortnightly
  ×26÷12, one-offs and saving left out, says how this month compares),
  Room to save, Left over each month (SVG bars ±zero, hover tip, tap to
  pick a month, table of numbers; colours validated, direction is the
  main cue), and sections Money in / Fixed / Flexible / Debt payments /
  Saving and set-asides, each line opening its editor and each section
  able to add (the entry editor takes a starting type/category). The
  Calendar tab's totals now come from `monthSummary` too. 4 more tests.
- **F4 (done, 8 Oct):** `model/spending.ts` (`spending_entries.json`,
  `spending_pot.json`): logged spending is the record; the pot adds a
  plan of weekly ÷ 7 per day from tomorrow (`flexibleForMonth`), which
  `monthSummary` / `monthBudget` (a "Weekly pot" / "Logged spending"
  line) / `typicalMonth` now include. WeeklyPotBox at the top of Budget
  (left this week, bar, Log spending, the week's list, set up / change
  pot); Log spending sheet; pot setup that ends running repeating
  flexible entries from today (`endRepeatingFlexible`) so nothing counts
  twice. New vs the iPhone app: "about X a day for the rest of the
  week"; step back through earlier weeks (weeks before the pot started
  say so); recent notes as one-tap chips; the day can't be in the
  future; `?log` opens the app straight on Log spending (manifest
  shortcut on Android). Apple Pay / Shortcuts logging isn't possible
  from a home-screen web app (Safari storage is separate) — `?log` is
  the quick route. 7 more tests (33 Finance).
- **The Finance port is complete (F0–F4).** Riley re-enters data by hand.

## Note editor upgrade (7–8 Oct 2026) — all three stages done

Brief: an Apple Notes / Math Notes–style editor in Vectis's own style, as
one component for notes and journal entries, built in stages with Riley
testing on their phone between each. Built on the **web** (Riley will
retire the Swift app once their data is off it, so web-only formats are
fine; iPhone *import* must keep working). Riley chose TipTap
(ProseMirror). `docs/design-system.md` from the brief isn't on this
machine — styling follows `web/src/index.css`.

- **Stage 1 (done): formatting.** `ui/editor/RichEditor.tsx` (lazy-loaded
  via `LazyRichEditor.tsx`, ~128 KB gz on first open), `ui/editor/extensions.ts`.
  Title / Heading / Subheading / Body / Monospaced; bold, italic,
  underline, strikethrough, highlight; bulleted, dashed ("- ") and
  numbered lists with indent/outdent (Tab / Shift-Tab or toolbar);
  checklists with inline checkboxes ("[ ] "); divider; headings fold
  their section (state saved as a `collapsed` heading attr, kept out of
  undo). Adaptive toolbar: selection → text styles first, list → list
  tools, heading → styles + fold; undo/redo pinned left; on touch it
  docks above the keyboard (visualViewport) with a hide-keyboard button,
  on wide screens it sits at the top of the editor.
- **Storage:** `body` (`model/noteDoc.ts`: `{format:'vectis-doc', version,
  doc}`) on notes and journal entries, read through `decode.ts`. Old
  content converts on open (RTF → headings/bold/italic, lists →
  checklist, jots/journal text → paragraphs) and is only replaced on
  save. Journal keeps plain `text` in step; if the evening review later
  rewrites `text`, the stale `body` is ignored (formatting lost for that
  entry — acceptable edge). The old `ui/RichTextEditor.tsx` is gone;
  `model/rtf.ts` stays for importing iPhone notes.
- **Stage 2 (done, 8 Oct): maths.** `model/math.ts` — a hand-written
  tokenizer + recursive-descent evaluator (never throws, never runs user
  text; caps: 300 chars, 120 tokens, depth 30, finite results). A line
  ending in "=" shows its answer (the longest maths at the end of the
  line, so "Total: rent * 12 =" works; a bare number doesn't count);
  "name = expr" sets a variable (case-insensitive) for the lines below;
  `+ − × ÷ ^ %` ("80 + 10%", "20% of 50"), brackets, sqrt/abs/round/
  floor/ceil, pi; units with "in/to/as" (length, mass, volume incl. US
  and "uk" pints/gallons, time, speed, temperature, data, area; no bare
  "k"/"b" so "5k" isn't kelvin); £ $ € kept on answers but never
  converted (live rates — ask Riley first). Shown by the editor's
  `MathResults` extension as a **node decoration + CSS ::after**
  (`data-math-result`) — a widget element next to the cursor made Chrome
  insert a real hardBreak into the doc. Answers are never saved; code
  blocks are skipped. Per-note `mathResults` (default true, decoded with a
  default) toggled under "Links and options" (jots get "Options"); journal
  entries always have maths on. 10 tests.
- **Stage 3 (done, 8 Oct): pictures.** Toolbar insert group: Photo from
  library, Take a photo (`capture="environment"`), Scan a page, Drawing.
  `ui/editor/attachment.ts`: an atom block node `attachment {id, kind:
  photo|scan|drawing, width, height}`; the blob lives in IndexedDB
  (`store/attachments.ts`, db `vectis-attachments`), shown via cached
  object URLs; selected → "Mark up" / "Remove". Photos are decoded the
  right way up (`imageOrientation: 'from-image'`), shrunk to 2000px and
  saved as JPEG 0.85 (`ui/editor/images.ts`). **Scan** (Riley chose
  "photo + clean-up"): drag four corners, `model/scan.ts` solves the
  homography and flattens with bilinear sampling; looks: black & white
  (Bradley adaptive threshold — copes with shadows), greyscale
  (auto-levels), colour; turn 90°. **Drawing** pad (`DrawingSheet`):
  pens (black, blue, red, highlighter) × three sizes, undo stroke,
  clear; on a white page (PNG) or over a picture for markup (JPEG,
  replaces the picture's id). Backups now include pictures as base64
  (`attachments` key; restore puts them back; older backups still
  restore). `tidyAttachments()` (8s after start) deletes blobs no note or
  journal entry references, keeping anything under a day old so undo
  still works. Asks the browser for persistent storage on first save.
  Known edge: if the evening review rewrites a journal entry's text, its
  stale body (and pictures) is ignored, and the pictures are tidied a day
  later. 5 scan tests.
- **The brief's three stages are done.** Ask Riley before graphs,
  currency, tables, audio.

## Session 6 Oct 2026 — hosting, Long-Term, wide screens

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
  an Xcode container download. Needs a Mac once. (Riley no longer has a
  Mac as of 8 Oct 2026 — Finance's iPhone data, not yet imported, needs a
  Windows route such as iMazing reading an iPhone backup, or re-entry.)

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
  ticked today, and `dayKey` is faster. Batch C (Daily grid) built: shared
  `DayBlocks`, midnight-crossing blocks, Home shows placed tasks, 12/24-hour
  labels. Not yet checked on screen. Items 5 and 8 also done (Riley's
  calls: changing a repeating event's time asks "this day only" or "this and
  all future days" (future splits the series, past untouched); a challenge
  restart keeps history but statistics start fresh). Items 10, 12, 13
  also done (VoiceOver labels, stale comment, time logging for repeating
  events), plus two bugs found on the way (see the audit). Audit complete;
  back to the priority list.
- **Editor restyle built** (checked on the iPhone 17 simulator, not yet on
  device). Goal editors (new/edit short-term, long-term), Settings, note
  editor, note type picker and notebook editor are now ScrollViews of
  `EditorBox`es. Shared pieces moved to CalendarHelpers.swift so every
  editor uses one copy: `EditorBox`, `EditorSummaryRow`, `CategoryChips`,
  `FlowRow`, plus new `EditorTitleBox`, `EditorTimeField` and
  `UnderlineSelector` (the Record tab now uses it too). Swipe-to-delete
  became small × buttons with VoiceOver labels; deleting a category asks
  first, and the last category can't be deleted. `RepeatDaysPicker` and
  `GoalDatePicker` take an explicit `accent` (Color.accentColor flipped to
  system blue on screen). Settings gained a Done button.
- Fixed on the way: Settings let "To" be earlier than "From", which crashes
  the Daily grid (negative row count). The picker now only offers later
  hours, and saved hours are clamped on load.

Follow-ups noticed (not done):
- The challenge "Catching up" sheet reappears every time Goals appears,
  even after Done — conflicts with "nothing reappears after dismissal".
- Every tab shows a big page title ("Home", "Daily") under the wordmark;
  the design system says no page-level title under the chrome.
- `MonthGridView` still uses `Color.accentColor` for today's date.
- `ChallengeSheets` and the linked-app picker (`LinkedAppsViews`) still use
  `Form`.
- Note: the iPhone 17 simulator's `calendar_events.json` and `tasks.json`
  were overwritten with test data during this session.

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
| Actual-time logging | Built as an explicit "Log actual time" button after start; repeating events log per occurrence (Oct 2026). The drag-to-resize handle was tried and removed (fought the move gesture). |
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
| Editor restyle for goals / settings / notes | Built (Oct 2026), awaiting device test |
| Share my day | Not built |
| Estimate calibration (2.5) | Waiting — needs 5+ logged actuals |
| Monthly review / recalibration (2.10, 2.11) | Waiting — needs a month of data |
| Web app (`web/`): model, Home, Goals, Daily, event editor, Settings | Built (Oct 2026), browser-tested |
| Accountability sharing via Google Drive + partner view (web) | Built (Oct 2026); publishing confirmed 6 Oct; cross-device needs hosting |
| Web: Long-Term tab, wide-screen layout, GitHub Pages hosting | Built (6 Oct 2026) |
| Web: plan and review (capture, drag tray, evening review → journal) | Built (6 Oct 2026), browser-tested |
| Web: Record (journal, notebooks, jots, lists & notes with RTF) | Built (6 Oct 2026), browser-tested |
| Web: challenges (restart keeps history) | Built (6 Oct 2026), browser-tested |
| Web: People, Linked apps | Left out of the web app by Riley's decision (6 Oct 2026). Saved person/app links on goals and events are kept untouched, just not shown. |

## Decided against (don't reopen without a reason)

- **People and Linked apps on the web** — left out (6 Oct 2026). They rely
  on phone contacts and launching other apps. The Swift app keeps them.

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
- **Wiping history on challenge restart** — history is kept; statistics
  restart instead (`Goal.statsStartDate`). Oct 2026.
- **Rewriting past occurrences when a series' time changes** — "this and
  all future days" splits the series instead. Oct 2026.

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
