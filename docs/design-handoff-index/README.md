# Handoff: Vectis "Index" style — icons, home page and suite restyle

## Overview
Riley chose a new visual direction for the Vectis suite, called **Index**. Each app is an entry in a numbered set: a mono index number (Vectis = 00, Planner = 01, Finance = 02, Record = 03), two letters / a name in Newsreader italic, and a **pivot rule** — a dot with a line running off the right edge (the lever). This replaces the old icon recipe (blue square, black ring, escaping stroke) and restyles the web apps (`home/`, `web/` = Planner, `finance/`) to match.

**Why it is changing (for future sessions):** the old look read as "basic and flat". Riley wants the suite to feel *precise, crafted, engineered*, led by type (NASA / ESPN-style name-as-logo), while keeping the calm paper-planner character, the plain-language copy and all behaviour. Nothing about features, data, copy or behaviour changes — this is a visual pass.

## About the design files
Files in `designs/` are **design references built in HTML** (open the `.dc.html` files in a browser; `support.js` must sit beside them). They are not production code. Recreate them in the existing React + Vite apps using the current components (`suite/src/ui/components.tsx`, `AppShell.tsx`) and the shared stylesheet `suite/src/styles.css`. Most of the work is in `styles.css` and a handful of components; screens keep their structure.

## Fidelity
**High-fidelity** for colours, type, spacing, borders and the components below. Sample data in the mocks is illustrative.

## Do this first: update the docs
`docs/design-system.md` and `docs/brand-brief.md` describe the old icons and SectionBox stripe. Update them with the tokens and rules in this README (sections "Design tokens", "Components", "App icons") so CLAUDE.md-guided sessions follow the new system. Keep the existing rules that still hold: semantic colours not themed, sentence-case copy, no page title under the chrome, underline selector for fixed switchers, squared-off chrome, no pills/glass.

## Design tokens

### Colour (frame — fixed, not themed)
| Token | Hex | Use |
|---|---|---|
| `--bg` (paper) | `#F2EFE8` | Page and top bar background |
| `--surface` | `#FAF8F3` | Cards, calendar cells, text fields |
| `--surface-tab` | `#F7F5EF` | Tab bar background |
| `--separator` (rule) | `#D9D4C8` | 1px chrome borders, card borders |
| `--rule-soft` | `#E2DDD2` | Row dividers inside sections, progress track |
| `--grid-line` | `#DDD8CD` | Daily grid hour lines |
| `--text` (ink) | `#15171B` | Body text |
| `--text-2` | `#55585F` | Secondary text, metadata |
| `--text-3` | `#8C8E93` | Hour labels, weekday letters, placeholders |
| `--mark-off` | `#B9B4A8` | Unticked CompletionMark ring |
| suite blue | `#0068B5` | Wordmarks, indexes, selected tab, primary buttons, today |

Scheme colours (`--primary/--secondary/--tertiary`) **still colour content**: section pivot rules and their index number, goal/task/event blocks, progress fills, secondary buttons in that section. Semantic colours unchanged: income `#2B8A3E`, expense `#D2574A`, estimate `#D6862C`.

Dark mode: not designed yet (Riley chose light only for now). Keep the current dark variables until a dark pass is done; don't invent one.

### Typography
Load from Google Fonts (or self-host): **Newsreader** (opsz, roman + italic 400–600), **IBM Plex Sans** (400/500/600), **IBM Plex Mono** (400/500).

| Role | Font | Size / weight | Notes |
|---|---|---|---|
| Wordmark in top bar | Newsreader italic | 26px / 500, `#0068B5` | Replaces `--font-serif` stack |
| Vectis home wordmark | Newsreader italic | 56px / 500, line-height 0.95 | |
| Section title (h2/h3) | Newsreader italic | 24px / 500, ink | Replaces bold 20px sans |
| Sheet title | Newsreader italic | 20px / 500 | |
| Headline number / big title | Newsreader roman | 30–44px / 400, lh 1–1.1 | `.headline-number`, `.big-title`, stats (28px) |
| Body / rows | IBM Plex Sans | 15px / 400; row titles in cards 15–16px / 500 | Replaces system sans |
| Buttons | IBM Plex Sans | 14px / 500 | |
| Captions | IBM Plex Sans | 13px (caption) / 11–12px (caption2), `--text-2` | |
| Index, times, metadata | IBM Plex Mono | 11px / 400–500, UPPERCASE | e.g. `01`, `FRI 4:10 PM`, `2 LEFT`, `7:00 AM` |
| Tab labels | Plex Mono 11px index over Plex Sans 11px label | | |
| Amounts in rows | Plex Sans 15px / 500, `font-variant-numeric: tabular-nums` | | |

### Spacing, radius, borders
- Page padding 20px horizontal, 24px top. Gap between sections **32px**. Inside a section 12–14px.
- **Corners: 0** on cards, buttons, fields. 2px on Daily calendar blocks. Sheets keep 10px top corners.
- Borders 1px `--separator`. No shadows except the Vectis home row hover (none) — remove `segmented` and toggle shadows where possible.
- `--radius-card: 0; --radius-small: 0;` (blocks override to 2px).

## Components

### Section head (replaces `SectionBox` chrome)
`SectionBox` stops being a bordered box. It becomes an unboxed section on the paper:
```
[index mono 11px, accent]  [title Newsreader italic 24/500]           [subtitle mono 11px caps, text-2, margin-left:auto]
●────────────────────────────────────────────────────────────────────→ (runs to the screen edge)
```
- Row: flex, `align-items: baseline`, gap 10px. Then 8px gap to the pivot rule.
- Pivot rule: height 7px, `margin-right: -20px` (bleeds through page padding to the edge). Dot 7×7 circle at left:0 top:0; line 1.5px tall from left:3px to right:0 at top:3px. Both in the section's accent colour.
- Body follows 14px below. No background, no border.
- New prop: `index?: string` ("01", "02"…). Number sections in page order, starting at 01 on each page. Accent colour drives dot, line and index.
- Delete `.section-head .stripe` and the 1.5px accent border.

### Card (`.card`, goal cards)
`background:#FAF8F3; border:1px solid #D9D4C8; border-radius:0; padding:14px 16px; gap:8–12px`. Accent no longer tints the border; it only colours the progress fill / marks. `.card.nested`: no border, `border-left:1.5px solid #D9D4C8; padding-left:14px` (also used for the evening review "flagged" note).

### Rows
List rows: `padding:9px 0; border-bottom:1px solid #E2DDD2`. Time / duration on the right in mono 11px caps.

### Buttons (`VButton`)
- Primary: solid accent, white text, radius 0, padding 12px, Plex Sans 14/500.
- Secondary: transparent background, `1px solid <accent>`, accent text, radius 0, padding 10–11px.
- Destructive unchanged except radius 0.

### CompletionMark
Keep the ring + lever tick. Off ring colour `#B9B4A8`. Sizes 15–18px.

### Progress
Track 3px `#E2DDD2`, square ends, fill in accent. Comparison bars (Finance) 6px.

### Top bar (`AppShell` `.topbar`)
Height 60px, padding 0 20px, background paper, `border-bottom:1px solid #D9D4C8`, no white.
Left: **"00" home link** — Plex Mono 12px `#55585F`, `border:1px solid #C9C3B6`, padding 3px 5px (replaces the LayoutGrid icon; aria-label "All apps (Vectis)"). Then 12px gap, wordmark.
Right: menu button — three 1.5px ink lines, 20px wide, 5px gap, last line 13px (can stay the lucide Menu icon in ink if simpler).

### Tab bar (`.tabbar`)
Grid of equal columns, background `#F7F5EF`, `border-top:1px solid #D9D4C8`, bottom padding for safe area. Each tab: column, centred, gap 3px, padding 10px 0 6px — **mono index (01, 02…) over the label**, both 11px. No icons. Selected: colour suite blue, label weight 600, **2px suite-blue bar on the tab's top edge** (`border-top:2px solid`, `margin-top:-1px`). Unselected `#55585F`, transparent bar. Drop the tinted background.
Wide-screen rail: same idea — mono index before each label, selected item gets a 2px blue bar on the left instead of the tinted fill.

### Underline selector (Record tabs)
Unchanged pattern, restyled: 15px labels, gap 24px, row `border-bottom:1px solid #D9D4C8`; selected blue 600 with 2px blue underline overlapping the rule.

### Sheets
Head: grid `1fr auto 1fr`, padding 16px 20px, paper background, 1px rule below; title Newsreader italic 20/500; left/right text buttons Plex Sans 14 blue (right 600). Body uses section heads like pages. Textareas: surface `#FAF8F3`, 1px rule, radius 0; journal-type text in Newsreader 17px / 1.5.

### Month grid (Long-Term, Finance calendar)
7 equal columns, gap 3px. Weekday header: single letter Plex Mono 10px `#8C8E93`. Cells: `#FAF8F3`, `1px solid #E2DDD2`, radius 0, padding 4px, height ~58–62px on phone. Day number Plex Mono 11px. Today: border and number in suite blue, number 600. Outside days opacity 0.4. Long-Term: 5px dots. Finance: one mono 9px amount, coloured by semantic colour (+green / −red / estimate amber), plus a small legend (In / Out / Estimate) below.

### Daily grid
Hour lines `#DDD8CD`, labels Plex Mono 10px `#8C8E93` ("7 AM"). Blocks: solid fill, 1px `rgba(0,0,0,0.22)` border, **2px radius**, title Plex Sans 12/600, time Plex Mono 10px at 85% opacity. Now line: 1.5px suite blue with a 7px dot at the gutter — the pivot rule again. Goal chips above the grid: surface, 1px rule, radius 0, 13px.

## Screens
All mocks are 390×844 (phone). Reference: `designs/Vectis Suite.dc.html` (screens labelled P1–P6, F1–F3) and `designs/Vectis Home.dc.html`.

- **Vectis home** (`home/src/App.tsx`, `home.css`): fixed paper + blue — **no longer follows the colour scheme** (drop `useApplyTheme` here or force the default palette). Header: "00" mono 13px blue, wordmark 56px, then "Good afternoon · Friday 9 October" Newsreader 17px `#55585F`. Gap 56px to the list. Each app row: grid `44px 1fr auto` — index mono 13px blue, name Newsreader italic 36px, right "→" (or "SOON" mono 12px for apps without href); description Plex Sans 16px/1.45 `#55585F` spanning columns 2–3, 8px above. Below each row a pivot rule (dot 8px, line 2px, blue) running off the right edge of the viewport (`margin-right:-50vw` inside an `overflow:hidden` page). Row hover: text turns blue. Coming-soon rows opacity 0.55. Footer Newsreader 14px `#6A6D74`. Max width 560px, padding 44px 24px 32px.
- **P1 Planner Home** (revised: calmer): only two sections. 01 Right now (accent = current block colour): block title Newsreader 34px, "UNTIL 5:00 PM · 50 MIN LEFT" mono 12px, then "Next: Run at 5:30 pm" Plex Sans 15px `#55585F`. 02 Today (primary, meta "1 OF 3"): goal rows (padding 10px 0, no dividers, no times), then one link row "2 tasks →" in blue above a 1px rule; it opens the tasks list. Removed from Home: the all-day event row, times on goals, the inline tasks list and add field. Those live in Daily. The evening review entry card appears only after 6 pm (same card spec: index, Newsreader italic 20px title, caption, blue →). Content padding 40px 20px 24px, gap 48px.
- **P2 Goals**: 01 Short-term (primary), 02 Long-term (secondary). Goal cards per Card spec; history dots 14px circles (done = filled primary; rest day = tertiary outline; missed/not yet = outline `#DDD8CD` / `#B9B4A8`); stats in Newsreader 28px.
- **P3 Daily**: day header — "‹", "Today" Newsreader italic 24 + "FRI 09 OCT" mono, zoom "− +", "›" all in blue. Plan buttons secondary (secondary colour). Then goal chips, then grid.
- **P4 Long-Term**: 01 Goals (secondary) with title + mono % + 3px progress; 02 month section whose title is the month name, with ‹ › on the right.
- **P5 Record**: underline selector; journal rows grid `52px 1fr` — day number Newsreader 30px over mono weekday; heading Newsreader italic 19px; two-line clamp of the text in Plex Sans 14px. Primary "+ New entry".
- **P6 Evening review sheet**: 01 Today ("1 OF 3 DONE"), flagged note as nested card, 02 "A line or two" with the prompt in Newsreader italic 19px and the textarea.
- **F1 Budget**: 01 This week — "£64.20 left" (Newsreader 44px, "left" italic 24px `#55585F`), caption, 6px bar, primary "Log spending", logged rows. Month switcher (Newsreader italic 22px centred). 02 In and out — "DIFFERENCE" mono label, Newsreader 36px amount, comparison bars. Remaining sections (Room to save, Left over each month, Money in, Fixed costs, Flexible, Debt payments, Saving) continue as numbered section heads 03, 04… using their existing accents; "Estimated" tag stays amber `#D6862C`.
- **F2 Calendar**: 01 month grid with amounts + legend; 02 selected day list ("Friday 9 October") with semantic dot, title, mono meta, amount.
- **F3 Goals**: 01 Saving, 02 Set-asides, 03 Debts, each with its kind accent; card with mono plan line and, when due, a divider row "£80.00 planned 12 Oct … Confirm".
- **P7 Settings › Category colours** (new): back chevron + Newsreader italic 22px title in the top bar. Intro caption: colours apply to blocks, goals and tasks only; the frame (paper, ink, suite blue) never changes. 01 Presets: rows with name (15/500), note (12px `#55585F`) and a strip of 6 colour bars (12px tall, 2px radius, gap 3px); selected row white with a 1px blue border and a blue ✓. Presets:
  - Index (default): #0068B5 #6B4C7A #3F6B4E #C9922E #D2574A #7C9473
  - Studio (bold): #1F3A93 #C0392B #E0A100 #16794F #8E44AD #2C3E50
  - Garden (soft greens): #3F6B4E #7C9473 #A3B18A #C9922E #8A5A44 #5B7F95
  - Dusk (muted): #4A5A78 #7A5C78 #A86D5A #6E7F6A #B08B4F #5E6670
  - Custom: the user's own set
  02 Make it yours: one row per category (20px swatch, name, mono hex, ›). Editing any colour switches the selection to Custom; picking a preset again replaces the custom set (confirm first if Custom has changes). **Use the app's real category list**; the names in the mock (Work, Deep work, Health, Errands, Social) are placeholders.
- **P7b Colour picker sheet** (new): Cancel / category name / Done head. A live preview block, a 6×3 grid of curated swatches (selected has a 2px ink outline, offset 2px), then an "Any colour" row with a hex field. Block text automatically switches between white and ink `#15171B` for contrast (pick whichever gives the higher WCAG ratio).
- **Data model for colours:** store `categoryPalette: { presetId: 'index'|'studio'|'garden'|'dusk'|'custom', custom?: Record<categoryId, hex> }` with the user's settings and sync it like the other settings. Resolve a block's colour as preset[category] or custom[category]. This is separate from the existing app colour scheme, which no longer changes the frame. Any existing per-category colour a user has set should migrate into Custom.
- **Not mocked** (apply the same components): Settings, Accountability, partner view, editors (EventEditor, GoalEditors, EntryEditor, GoalSheets, SpendingSheets, PlanningCapture/Tray, ChallengeSheets, NoteEditors). Editors: `EditorBox` becomes a section head (index + italic title + pivot rule) over its fields; `SummaryRow` becomes a row with 1px rules.

## Interactions & behaviour
No behaviour changes apart from the new category-colour setting (P7/P7b) and the slimmer Planner Home (P1). Keep every handler, sheet, drag, swipe and keyboard path as is. Hover: text/link colour to blue (`#004679` for blue links); buttons dim on press as now.

## App icons
Ready-made PNGs are in `icons/png/`. They were drawn with the real fonts, so no font install is needed. Opaque, full-bleed squares with no drawn corners; iOS and the browser add the rounding.

**Full icon** (`<app>-1024.png`): use for the iOS App Store / AppIcon (1024), `public/icon-1024.png`, PWA `icon-512` and `apple-touch-icon` (downscale from 1024). Recipe: paper `#F2EFE8`; index Plex Mono 500 92px blue at x150 y228; two letters Newsreader italic 500 520px ink, centred x500, baseline y700; blue rule 22px at y790 from x150 to the right edge with a 26px-radius dot at x150. Vectis 00 Ve, Planner 01 Pl, Finance 02 Fi, Record 03 Re.

**Small-size version** (`<app>-small-16.png`, `-32.png`, `-512.png`): use at 48px and below: favicons, browser tabs, the in-app suite switcher. One letter (Newsreader italic 600, 700px, centred x512 baseline y700) over a heavier rule (76px at y850 from x170, dot r76). The index and second letter are dropped because they turn to mush at that size. Build `favicon.ico` from the 16 and 32 PNGs, or use the 32 as `favicon.png`.

**Tasks**
1. iOS: replace the AppIcon images in `Vectis Planning/…/Assets.xcassets` with the 1024 PNGs (one per app target).
2. Web: in each app's `public/` (`home` = Vectis, `web` = Planner, `finance`) replace `icon-1024.png`, the PWA icons, `apple-touch-icon` and the favicon; update `manifest` `background_color`/`theme_color` to `#F2EFE8`.
3. `suite/src/ui/appIcons.tsx`: use `<img>` of the small PNG at 32px and below and the full PNG above that, or ask Riley for outlined SVGs. Don't render the letters as live text, because the fonts may not be loaded yet.
4. `docs/brand-brief.md`: replace the old icon recipe with the one above. New apps take the next number and their first two letters (small version: first letter).
5. `icons/*.svg` are reference sources only; they contain live text. For scalable SVGs, outline the text in Figma/Illustrator/Inkscape with both fonts installed.

`icons/contact-sheet.png` shows every icon at a glance.

## Files
- `designs/Vectis Suite.dc.html` — Planner (P1–P7b) and Finance (F1–F3) screens + system sheet
- `designs/Vectis Home.dc.html` — Vectis home page
- `designs/Vectis Icons - Index.dc.html` — icon family at all sizes
- `designs/support.js` — runtime needed to open the `.dc.html` files
- `icons/png/` — final icon PNGs (full 1024 + small 16/32/512)
- `icons/*.svg` — reference sources (live text)

## Suggested order
1. Docs update (above). 2. Fonts + tokens in `suite/src/styles.css`. 3. `SectionBox`, `VButton`, `.card`, AppShell top bar + tab bar. 4. Vectis home. 5. Check each Planner and Finance screen against the mocks. 6. Icons.
