# Vectis

A behavioural-science-based personal planner: goals, a daily time-blocked
calendar, a long-term calendar, and a Record tab (journal, notebooks, notes).
The name refers to Archimedes' lever. Since Oct 2026 the app *shows* as
"Planner" (home screen, wordmark, launch screen); the code and Xcode project
are still named Vectis. Suite-wide rules: `docs/suite-rules.md`; design
system: `docs/design-system.md` (copies shared with the Finance app).

Full history and status: `docs/HANDOFF.md` (read this at the start of any
non-trivial task). Design rationale with research: `docs/Vectis-spec.md` — the
status table in HANDOFF.md supersedes the spec where they disagree.

## Repo layout (Oct 2026)

npm workspaces — run `npm install` once at the repo root, then
`npm test`, `npm run build`, or `npm run dev -w web` / `-w finance`.

- `web/` — **Planner** web app (see below).
- `finance/` — **Finance** web app, being ported in batches from the Swift
  app at `rileymaughan87-dev/Finance-App` (cloned at `../Finance-App`).
  Live at `…/Vectis-Planning-App/finance/`. Saves under `finance:` keys in
  the iPhone app's file names.
- `suite/` — shared design and helpers both apps import as `@suite/...`
  (styles, `AppShell`, `MonthGrid`, components, dates, decode, storage,
  appearance, backups). Change shared pieces here, never in one app
  (`suite/README.md`).
- One GitHub Pages deploy builds both (`.github/workflows/deploy-web.yml`).

## Two codebases (Oct 2026)

- **`web/` — the active app.** React + TypeScript + Vite, being ported from
  Swift so it runs on Windows and any phone browser. Build/test commands are
  in `web/README.md` (`npm run dev`, `npm test`, `npm run build`). Saved data
  uses the iPhone app's JSON format and file names, so the two stay
  interchangeable. Ported so far: shell, side menu, Home, Goals, Daily,
  Long-Term, plan and review (capture, drag tray, evening review),
  Record (journal, notebooks, notes), challenges, Settings, and
  Accountability (sharing via Google Drive, partner view). People and
  Linked apps are deliberately left out of the web app (they need phone
  contacts and app-launching); their saved links are kept, not shown. Classic notes stay RTF so the iPhone can read them. Live at
  https://rileymaughan87-dev.github.io/Vectis-Planning-App/ (deploys on
  push to master). Layout must work from 360px phones to wide desktops.
- **`Vectis Planning/` — the Swift app, kept as a fallback.** Don't delete or
  restructure it. It needs a Mac to build, and Riley no longer has one
  (8 Oct 2026): treat it as read-only reference — never suggest Mac/Xcode
  steps. Same for `../Finance-App`.

## Build (Swift, Mac only)

```
xcodebuild -project "Vectis Planning/Vectis Planning.xcodeproj" \
  -scheme "Vectis Planning" -destination 'generic/platform=iOS Simulator' build
```
Run `xcodebuild -list -project "Vectis Planning/Vectis Planning.xcodeproj"`
first if the scheme name doesn't match. Source files are in
`Vectis Planning/Vectis Planning/`. Always open the `.xcodeproj` in Xcode,
never the plain folder (opening the folder gives a scheme-less window).

## Structure

- **Tabs (custom bar):** Home, Goals, Daily, Long-Term, Record.
- **Sidebar (Swift):** People, Linked apps, Settings. **Web:** Accountability
  (with partners), Settings. (Finance was removed in
  Oct 2026 — it is moving to its own app.)
- **Stores (all created in `ContentView`):** GoalsStore, CalendarStore,
  TasksStore, NotesStore, JournalStore, PlanReviewStore, AppearanceStore,
  LinkedAppsStore, PeopleStore. Challenges load from `Challenges.json`.

## Key mechanisms — don't break these

- **Goal schedule versioning.** A goal's repeat days, start time and duration
  are versioned together as `ScheduleVersion` snapshots. Resolve a date with
  `goal.schedule(on:)`: per-day override wins, then the version in force on that
  date. Editing a schedule affects future days only.
- **Per-day overrides.** Dragging one occurrence of a goal block or repeating
  event moves that day only (`scheduledTimeOverrides` / `timeOverrides`),
  permanently. Repeating-event edits never overwrite the series anchor.
- **Generated blocks.** Goal blocks and placed-task blocks are synthesised each
  render with stable IDs, never stored as events.
- **Actual-time logging is explicit.** Editing an event's times is always a
  plain edit. Only the "Log actual time" button records an actual, and only
  after the event has started (estimate-lock rule in `CalendarStore.resizeEvent`).
- **Plan and review** (opt-in in Settings): "Daily planning" and "Review"
  buttons above the Daily grid. Planning = capture popup → drag tray onto the
  grid. Review = what got done (tickable) → repeated misses → one reflection
  prompt that seeds that day's journal entry.
- **Journal entries are one per day.** The review's reflection and freeform
  journaling are the same entry.
- **Long-term vs short-term goals.** Only short-term goals are daily-trackable;
  a short-term goal can link to a long-term one via `linkedToGoalID`.

## Web-only rules

- Model logic lives in `web/src/model/` as pure functions over plain data,
  so the same code drives your screens and a partner's read-only view.
- Every saved type is read through `decode.ts` with a default for every
  missing field (same rule as the Swift hand-written Codable).
- `dayBlocks()` is the single answer to "what's on a day" — Daily, Home,
  buffer awareness and the partner view all use it.
- The share file (`sync/shareFile.ts`) carries goals and calendar only;
  journal, notes and people never leave the device.
- Notes and journal entries edit in one TipTap editor (`ui/editor/`);
  their content is `body` (`model/noteDoc.ts`). Older fields (RTF,
  `checklistItems`, `jotText`, journal `text`) are only read to convert
  old or imported content — never write formatting back into them.

## Current priorities (in order)

0. **Web port** — complete except People/Linked apps (left out). Riley's Mac
   work (Oct 2026) is now merged; port it to the web app:
   - ~~Planner name, blue theme, icon~~ — done on the web (batch 1,
     7 Oct 2026), along with no page titles (design-system.md).
   - ~~"Remove from [day]" and stats-fresh challenge restarts~~ — done on
     the web (batch 2).
   - ~~Repeating events: this day / all future days, per-day length,
     per-occurrence time logging~~ — done on the web (batch 3). The Mac
     work is fully ported.
   - Finance web app: F0 (structure, shared suite, empty app) done.
     Next F1 entries + Calendar, F2 goals, F3 Budget, F4 weekly pot and
     spending log. Plan in HANDOFF.md.

1. **Buffer awareness** (spec 2.8) — built Oct 2026, awaiting device test. Oct 2026 audit (docs/AUDIT-2026-10.md) complete. Shows "% of day committed" during planning,
   amber above 80%, never enforced. See HANDOFF.md for the design.
2. **Editor restyle** — built Oct 2026, awaiting device test. Shared editor
   components live in CalendarHelpers.swift.
3. **Rest days** (spec 2.2) — optional per-goal rest days; target denominator
   becomes days minus rest days.
4. **"Share my day"** — `ShareLink` summary of today's goals for an
   accountability partner via Messages. Free alternative to accounts/CloudKit.
