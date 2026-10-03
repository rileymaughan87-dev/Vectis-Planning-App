# Vectis

A behavioural-science-based personal planner: goals, a daily time-blocked
calendar, a long-term calendar, and a Record tab (journal, notebooks, notes).
The name refers to Archimedes' lever. Suite-wide rules live in `../CLAUDE.md`.

Full history and status: `docs/HANDOFF.md` (read this at the start of any
non-trivial task). Design rationale with research: `docs/Vectis-spec.md` — the
status table in HANDOFF.md supersedes the spec where they disagree.

## Build

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
- **Sidebar:** People, Linked apps, Settings. (Finance was removed in
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

## Current priorities (in order)

1. **Buffer awareness** (spec 2.8) — built Oct 2026, awaiting device test. Shows "% of day committed" during planning,
   amber above 80%, never enforced. See HANDOFF.md for the design.
2. **Editor restyle** — `GoalSheets`, `SettingsView`, `NoteSheets` still use
   `Form`; restyle to match the event editor (`EditorBox` pattern).
3. **Rest days** (spec 2.2) — optional per-goal rest days; target denominator
   becomes days minus rest days.
4. **"Share my day"** — `ShareLink` summary of today's goals for an
   accountability partner via Messages. Free alternative to accounts/CloudKit.
