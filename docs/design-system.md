# Suite design system

The canonical implementation lives in Vectis (`CalendarHelpers.swift`,
`AppearanceStore.swift`, `CalendarSheets.swift`, `CompletionMark.swift`,
`MonthGridView.swift`). New apps should look like siblings of Vectis.

## Character

Squared-off, calm, bordered. Feels like a well-made paper planner rather than a
stock iOS Settings screen. Solid fills, thin borders, small corner radii, no
translucent capsule buttons, no floating pill tab bar.

## Tokens

| Token | Value |
|---|---|
| `DesignTokens.cardRadius` | 6 |
| `DesignTokens.smallRadius` | 4 |
| Section box padding | 14 (nested 11–16) |
| Accent stripe | 4pt wide, beside section titles |
| Chrome separator | 0.5pt |

## Colour

Three theme colours from `AppearanceStore`: `primaryColor`, `secondaryColor`,
`tertiaryColor`, plus light / dark / system mode and a custom option.

| Preset | Primary | Secondary | Tertiary |
|---|---|---|---|
| Blue and coral (default) | `0068B5` | `D2574A` | `C9922E` |
| Indigo and amber | `3F51B5` | `F2A93B` | `6B7FD7` |
| Forest and clay | `3F6B4E` | `C97B4A` | `8FA679` |
| Plum and sage | `6B4C7A` | `7C9473` | `C99A6B` |
| Monochrome blue | `0068B5` | `66A4D3` | `004679` |

The suite blue `0068B5` (`Color.vectisBlue`) replaced the original teal
`1C8C82` in Oct 2026. Preset ids stay `tealCoral` / `monoTeal` because saved
settings refer to them.

Rules:
- **Semantic colours are not themed.** Income/expense green/red
  (`2B8A3E` / `D2574A`), unconfirmed amber `D6862C`, destructive
  red, warning orange stay fixed regardless of palette.
- Text on a coloured fill uses `Color.contrastingTextColor`.
- Event blocks: solid fill, 1pt border in a darkened shade of their own colour.
  Goal blocks use primary, placed tasks use tertiary, events use their
  category colour.

## Chrome and layout

- Custom tab bar (not native `TabView`, which renders a floating pill on iOS 26).
- Top chrome: app-name wordmark left (`AppBrand.wordmark` — "Planner",
  "Finance"), hamburger right; secondary
  destinations live in a right-side sidebar drawer.
- Chrome background: white in light mode, `secondarySystemBackground` in dark,
  0.5pt separator, no tint. Page background `systemBackground`.
- **No page-level navigation title under the chrome.** The wordmark already
  orients the user; a second big title is redundant.

## Components

- **SectionBox** — bordered box with accent stripe and bold title. Used for
  page sections (Home, Goals).
- **EditorBox / EditorSummaryRow** — the editor equivalents. Editors are a
  `ScrollView` of these, not a `Form`. Rarely used groups collapse to a summary
  row ("Repeats · Weekdays") that pushes to a detail screen, so nothing hidden is
  invisible.
- **VectisButtonStyle** — `.primary` (solid accent fill), `.secondary` (grouped
  background, accent text, thin accent border), `.destructive`. Squared corners,
  dims on press. Toolbar Cancel/Save stay as plain system text buttons.
- **CompletionMark** — the animated tick used for goals, tasks, milestones.
- **Underline selector** — fixed section switchers (e.g. Record tab) use text
  with a 2pt underline on the selected item, not filled chips. Filled chips are
  reserved for user-editable lists (e.g. categories).
- **CategoryChips + FlowRow** — colour-dot chips that wrap to new lines.
- **MonthGridView** — reusable month calendar grid with dot indicators.
- Small confirm/choice popups use a sheet with `.presentationDetents([.height(…)])`
  sized generously enough for icon, title, text and two full-width buttons.

## Typography

- Wordmark and launch screen: system serif, italic, medium weight.
- Section titles `.title3.weight(.bold)`; row titles `.subheadline`; metadata
  `.caption2` secondary, joined with " · " on one line rather than several labels.

## App icons

Solid `0068B5` background, thin black ring, one thick black round-capped
stroke that breaks out of the ring at the top right. Planner: the lever tick.
Finance: a rising line. Full-bleed 1024px square, no transparency (iOS rounds
the corners itself).

## Launch screen

Each app's wordmark in `0068B5`. Native `UILaunchScreen` in Info.plist with an `Image Name` pointing at an asset
set. Fill all three scale slots (1x, 2x, 3x) with correctly scaled images — a
single-slot image gets stretched on some devices. iOS caches launch screens
aggressively; reboot the device to see changes.

## Copy and voice

- Sentence case. Calm, short, specific.
- Editor titles: "New event" / "Edit event" pattern (settle on this everywhere).
- Encouraging framing leads; shortfalls come second and are phrased as
  "worth picking back up", never as failure.
