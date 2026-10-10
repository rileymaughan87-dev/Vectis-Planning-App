# Suite design system — the "Index" style

Since Oct 2026 the Vectis suite uses the **Index** style (Riley's choice;
design handoff `design_handoff_vectis_index_style`). Each app is an entry
in a numbered set, and so is everything inside it: tabs, sections and
editor groups carry a mono index number (01, 02…), titles are in an italic
serif, and coloured boxes and accent stripes are replaced by a **pivot
rule** — a dot with a line running off the right edge (the lever).

The web implementation lives in `suite/src/styles.css`,
`suite/src/ui/components.tsx` and `AppShell.tsx`. The Swift apps keep the
older look; they are read-only reference now (no Mac).

## Character

Precise, crafted, engineered — led by type — while staying a calm paper
planner. Paper and ink, with suite blue for the frame. Square corners, 1px
rules, no shadows, no pills, no translucent glass. Rest and pleasure stay
first-class; copy stays plain.

## Tokens

### Colour — the frame (fixed, never themed)

| Token | Hex | Use |
|---|---|---|
| `--bg` (paper) | `#F2EFE8` | Page and top bar |
| `--surface` | `#FAF8F3` | Cards, calendar cells, text fields |
| `--surface-tab` | `#F7F5EF` | Tab bar |
| `--separator` (rule) | `#D9D4C8` | 1px chrome and card borders |
| `--rule-soft` | `#E2DDD2` | Row dividers, progress track |
| `--rule-strong` | `#C9C3B6` | The "00" home link's box |
| `--grid-line` | `#DDD8CD` | Daily grid hour lines |
| `--text` (ink) | `#15171B` | Body text |
| `--text-2` | `#55585F` | Secondary text, metadata |
| `--text-3` | `#8C8E93` | Hour labels, weekday letters, placeholders |
| `--mark-off` | `#B9B4A8` | Unticked completion ring |
| `--brand` (suite blue) | `#0068B5` | Wordmarks, indexes, selected tab, primary buttons, today |
| `--brand-dark` | `#004679` | Blue links on hover |

### Colour — content (themed)

**Category colours** (Planner Settings › Category colours) are a preset —
Index `#0068B5 #6B4C7A #3F6B4E #C9922E #D2574A #7C9473`, Studio, Garden,
Dusk — or the user's own Custom set; they colour event blocks by
category (`web/src/model/palette.ts`).

The scheme colours `--primary`, `--secondary`, `--tertiary` (Appearance
settings) colour **content only**: a section's pivot rule and index, goal,
task and event blocks, progress fills, and buttons inside that section.
They never change the frame.

| Preset | Primary | Secondary | Tertiary |
|---|---|---|---|
| Blue and coral (default) | `0068B5` | `D2574A` | `C9922E` |
| Indigo and amber | `3F51B5` | `F2A93B` | `6B7FD7` |
| Forest and clay | `3F6B4E` | `C97B4A` | `8FA679` |
| Plum and sage | `6B4C7A` | `7C9473` | `C99A6B` |
| Monochrome blue | `0068B5` | `66A4D3` | `004679` |

Rules:
- **Semantic colours are not themed.** Income `#2B8A3E`, expense
  `#D2574A`, "still an estimate" amber `#D6862C`, destructive red and
  warning orange stay fixed.
- Text on a coloured fill switches between white and ink for contrast.
- **Light mode is the design** (Riley's call, Oct 2026). There's no dark
  Index style planned; the earlier dark colours remain only for anyone
  choosing Dark or System in Appearance. Don't invent one.

### Typography

Bundled with each app (`suite/src/fonts.ts`, via Fontsource — works
offline): **Newsreader** (variable, with optical sizes), **IBM Plex Sans**,
**IBM Plex Mono**.

| Role | Font | Size / weight |
|---|---|---|
| Wordmark in the top bar | Newsreader italic | 26 / 500, suite blue |
| Vectis home wordmark | Newsreader italic | 56 / 500 |
| Section title | Newsreader italic | 24 / 500 (editor sections 20) |
| Sheet title | Newsreader italic | 20 / 500 |
| Headline number, big title | Newsreader roman | 30–44 / 400 (stats 28) |
| Body, rows | IBM Plex Sans | 15 / 400; row titles 15–16 / 500 |
| Buttons | IBM Plex Sans | 14 / 500 |
| Captions | IBM Plex Sans | 13 (caption), 12 (caption2), `--text-2` |
| Index, times, metadata | IBM Plex Mono | 11 / 400–500, UPPERCASE (`.mono`) |
| Amounts | IBM Plex Sans 15 / 500, tabular numbers (`.amount`) |

### Spacing, corners, borders

- Page padding 20px each side, 24px on top; **32px** between sections,
  12–14px inside one.
- **Corners 0** on cards, buttons and fields; 2px on Daily calendar
  blocks; sheets keep 10px top corners.
- Borders 1px `--separator`. No shadows.

## Chrome and layout

- **Top bar:** 60px, paper, 1px rule below. Left: the **"00" home link**
  (Plex Mono 12px in a thin box — the Vectis home page's index), then the
  wordmark. Right: the menu (three ink lines, the last shorter), opening a
  right-side drawer.
- **Tab bar:** equal columns, `--surface-tab`, 1px rule above. Each tab is
  its **mono index over its name**, no icons. Selected: suite blue, name
  600, a 2px blue bar along the tab's top edge.
- **Wide screens:** a sidebar replaces both bars — the same index before
  each name, the selected one marked by a 2px blue bar on the left.
- **No page-level title under the chrome.** The wordmark orients.

## Components

- **Section** (`SectionBox`) — unboxed on the paper: index (mono 11px, in
  the accent), italic title, optional note on the right (mono caps), then
  the **pivot rule** in the accent, running to the screen edge. Sections
  number themselves 01, 02… in page order; `index` overrides.
- **Editor section** (`EditorBox`) — the same head a size smaller, over
  its fields. Sheets number their sections from 01.
- **Summary row** — a row between 1px rules, pushing to a detail screen.
- **Card** — `--surface`, 1px rule, square, padding 14px 16px. The accent
  no longer tints the border; it colours progress fills and marks.
  Nested card: no box, a 1.5px rule on the left.
- **Rows** — 9px padding, 1px `--rule-soft` between rows; times and
  durations right-aligned in mono caps.
- **Buttons** (`VButton`) — primary: solid accent, white text, square.
  Secondary: transparent with a 1px accent border and accent text.
  Destructive: the same in red. Sheet Cancel/Save are plain blue text.
- **Completion mark** — ring plus the lever tick; off ring `--mark-off`.
- **Progress** — 3px track in `--rule-soft`, square ends, accent fill
  (Finance comparison bars 6px).
- **Underline selector** — fixed switchers (`Segmented`): text with a 2px
  blue underline on the selected item over a 1px rule. Filled chips are
  only for user-editable lists (categories).
- **Month grid** — 7 columns, 3px gaps; single-letter mono weekdays;
  square cells on `--surface` with a soft rule; mono day numbers; today
  outlined in suite blue.

## App icons

See `docs/brand-brief.md`. Each app is an index number plus two letters
(Vectis 00 Ve, Planner 01 Pl, Finance 02 Fi, Record 03 Re) over a blue
pivot rule, on paper. Finished PNGs in each app's `public/`.

## Copy and voice

- Sentence case. Calm, short, specific.
- Editor titles: "New event" / "Edit event".
- Encouraging framing leads; shortfalls come second and are phrased as
  "worth picking back up", never as failure.
