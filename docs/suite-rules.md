# App suite — shared rules

This folder holds a family of personal iOS apps built by Riley in Swift/SwiftUI.
Each app lives in its own subfolder with its own git repo and its own CLAUDE.md.
This file applies to all of them. The full design system is in
`docs/design-system.md` — read it before any UI work.

## Working with Riley

- Riley is learning Swift as we go. Explain *why* a change works, briefly and in
  plain language. Don't assume Xcode or git knowledge beyond the basics.
- Riley tests on a physical iPhone 14 and the simulator. After a working batch,
  suggest a commit and push.
- Prefer small, testable batches over large drops. Say what to test afterwards.
- Be honest about scope. If something is partial, stubbed, or not built, say so
  plainly. Never ship a placeholder that pretends to be a finished feature.
- When Riley pushes back on a design, take it seriously. Several of the best
  decisions in this suite came from Riley overruling the first proposal.

## Shared product values

1. **A pocket planner, not a phone.** Intentional, calm, productivity-focused.
2. **Rest and pleasure are first-class.** Planning includes leaving room. Never
   frame an unfilled day, a rest day, or a skipped item as failure.
3. **No nagging.** Nothing interrupts, scolds, or reappears after dismissal.
   Prompts appear at a moment the user chose (e.g. a review they opened).
4. **Sensible defaults over settings.** A feature should work well for someone
   who never opens Settings. Only add a toggle for things that add ritual.
5. **The record is truthful.** Past data is never rewritten by later edits.
6. **Evidence over hype.** Features grounded in behavioural research get the
   research named. Never repeat unverifiable productivity-blog statistics.
7. **Plain language.** "Rest day", not "cheat day". Never the word "failing".

## Engineering rules (each learned from a real bug)

- **Hand-write `Codable` for every persisted model.** Use
  `decodeIfPresent(...) ?? default` for every field. Adding a field means
  updating four places: the property, `CodingKeys`, `init(from:)`,
  `encode(to:)`, plus the memberwise `init` if there is one. Swift's automatic
  Codable fails the whole object on a missing key and silently wipes saved data.
- **Extract subviews early.** SwiftUI type-checker timeouts are common here.
  If a `body` grows complex, split it into named `struct`s. Misleading errors
  (e.g. "requires wrapper ObservedObject<…>.Wrapper") often just mean a closure
  is too complex — move its logic into a named method.
- **Generated/transient items need stable IDs.** Anything rebuilt each render
  (goal blocks, placed-task blocks) must derive its `id` from its source, or
  drag gestures break mid-drag.
- **Don't extend Foundation types globally.** Use small wrappers instead
  (e.g. `IdentifiableDate` for `.sheet(item:)` with a date).
- **One store per domain.** `ObservableObject` with `@Published` arrays, saved
  to JSON in Documents via `PersistenceManager` using a Combine `sink`.
- **When changing an initializer, grep every call site** and update them in
  the same batch.
- **Build after editing.** Use the build command in the app's CLAUDE.md and fix
  errors before handing back to Riley.
- **Check whether new files need adding to the Xcode target.** If the project
  uses folder-synchronised groups they appear automatically; otherwise add them.

## Shared code

The design components are currently duplicated per app. The plan is a local
Swift package (working name `SuiteKit`) in `Riley's Apps/SuiteKit/` holding the design
tokens, colour helpers, shared components, `PersistenceManager`, and date-key
helpers. Until it exists, copy components faithfully from Vectis and keep them
identical. Don't restyle a shared component in one app only.
