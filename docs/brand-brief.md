# Vectis — brand brief for new logos

A one-page brief for designing a new **Vectis** mark and a matching family
of app icons. Everything a designer (or design tool) needs to know about
what the apps are, how they feel, and the rules the icons must follow.

---

## 1. The premise

**"Vectis" is Latin for *lever*** — after Archimedes: *give me a lever long
enough and a place to stand, and I'll move the world.* The idea behind the
whole suite: **small, steady effort, applied in the right place, moves big
things.**

It's a set of personal tools grounded in behavioural science, built for one
person's real life (goals, money, writing) rather than for "productivity" as
a performance. Three ideas shape everything:

- **Rest and pleasure are first-class.** Planning includes leaving room. A
  rest day or an unfilled afternoon is never framed as failure.
- **A pocket planner, not a phone.** Intentional, calm, quietly helpful.
  Nothing nags, scolds, buzzes or reappears after being dismissed.
- **Evidence over hype, plain language.** "Rest day", not "cheat day". Never
  the word "failing". Honest numbers ("6 of 6 this week"), no streak guilt.

**Feel:** a well-made paper planner or a good fountain pen — calm,
considered, slightly classical (Latin name, serif italic wordmark), but
clean and modern rather than antique.

---

## 2. The suite

**Vectis** is the umbrella — one Home Screen icon that opens a home page
with a door to each app. Each app is its own tool for its own problem; they
share a design, a sign-in and, where it helps, data.

| App | What it's for |
|---|---|
| **Vectis** | The home / folder for all the apps. The "brand" mark. |
| **Planner** | Goals, the day in time blocks, and an evening review. |
| **Finance** | A calm budget, a money calendar, savings goals and a weekly spending pot. |
| **Record** | Journal, notebooks and notes — growing into a proper word processor. |
| *(future)* | More apps will join, so the system needs room to grow. |

**What's wanted:** a **Vectis mark** plus **app icons that clearly belong
together** — a family with one shared idea, where each app is recognisable
on its own and at a glance.

---

## 3. The visual system: Index (Oct 2026)

### Colour

Suite blue **`#0068B5`** is the brand colour. Users can pick a colour scheme
inside the apps (these don't change the icons, but the icons should sit
well beside them):

| Scheme | Primary | Secondary | Tertiary |
|---|---|---|---|
| Blue and coral (default) | `#0068B5` | `#D2574A` | `#C9922E` |
| Indigo and amber | `#3F51B5` | `#F2A93B` | `#6B7FD7` |
| Forest and clay | `#3F6B4E` | `#C97B4A` | `#8FA679` |
| Plum and sage | `#6B4C7A` | `#7C9473` | `#C99A6B` |
| Monochrome blue | `#0068B5` | `#66A4D3` | `#004679` |

Fixed meaning colours (never themed): income green `#2B8A3E`, expense red
`#D2574A`, "still an estimate" amber `#D6862C`.

### Character

**The "Index" style (chosen Oct 2026).** Precise, crafted, engineered and
led by type, while staying calm. Paper `#F2EFE8` and ink `#15171B`, with
suite blue for the frame. Square corners, 1px rules, no shadows, no
pills, no glass. Full detail: `docs/design-system.md`.

### Wordmark

Each app's name in **Newsreader italic, weight 500**, in suite blue —
*Vectis*, *Planner*, *Finance*, *Record*. Indexes and metadata are in
**IBM Plex Mono**; text in **IBM Plex Sans**.

### The icon recipe (Index)

Each app is an entry in a numbered set:

| App | Index | Letters |
|---|---|---|
| Vectis | 00 | Ve |
| Planner | 01 | Pl |
| Finance | 02 | Fi |
| Record | 03 | Re |

A **new app takes the next number and its first two letters** (its
small version: the first letter).

- **Full icon** (1024, for the Home Screen): paper `#F2EFE8`; the index
  in IBM Plex Mono 500, 92px, suite blue at x150 y228; the two letters in
  Newsreader italic 500, 520px, ink, centred at x500 on a baseline at
  y700; a 22px blue **pivot rule** at y790 from x150 to the right edge,
  with a 26px-radius dot at x150 — the lever.
- **Small version** (48px and below — favicons, tabs): one letter
  (Newsreader italic 600, 700px, centred x512, baseline y700) over a
  heavier rule (76px at y850 from x170, dot radius 76). The index and
  second letter are dropped; they turn to mush that small.
- Opaque, full-bleed squares with no drawn corners; iOS and browsers
  round them.

The finished PNGs (drawn with the real fonts) are in each app's
`public/`: `icon-1024.png`, `favicon-32.png`, `favicon-16.png`. For a
scalable SVG, outline the text first with both fonts installed — the
handoff's SVGs hold live text and are reference only.

*(Before Oct 2026 the icons were a blue square with a thin black ring and
one thick stroke breaking out of it at the top right.)*

---

## 4. Constraints (must hold)

- **Home Screen icon:** a full **1024 × 1024 square, no transparency**. The
  phone rounds the corners itself — don't draw rounded corners in.
- **Small sizes:** must still read at about **60 px** (a Home Screen icon)
  and as a **favicon** (16–32 px). Simple, bold shapes.
- **Family:** every app icon shares one system; each must still be
  distinguishable from the others at a glance.
- **Light and dark:** looks right on light and dark Home Screens.
- **Room to grow:** the system has to make sensible icons for apps that
  don't exist yet.
- **Plain, not literal clutter:** one idea per icon. No text inside icons
  (except possibly a monogram for Vectis).
- **Wordmark:** works beside a serif italic wordmark.

---

## 5. My taste *(fill this in before using the brief)*

- What I like about the current icons:
- What I don't like / want to change:
- Logos or icons I admire (and why):
- Words the new look should feel like:
- Things to avoid:

---

## 6. What to ask the design tool for

The Index direction is chosen. For a new app: its icon in the recipe
above at **1024 px**, **60 px** and **32 px** (small version), on light
and dark backgrounds, with the next index number.
