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

## 3. The current visual system (keep, evolve, or deliberately break)

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

Squared-off, calm, bordered. Solid fills, thin borders, small corner radii.
No glossy gradients, no translucent "glass", no floating pill shapes.

### Wordmark

Each app's name in a **system serif, italic, medium weight**, in the suite
blue — e.g. *Vectis*, *Planner*, *Finance*.

### Today's icon recipe

All current icons share one recipe:

- a solid suite-blue square,
- a thin black ring,
- one thick, round-capped black stroke that **breaks out of the ring at the
  top right** (a little "escaping the circle" moment — momentum, leverage).

| Icon | Its stroke |
|---|---|
| Vectis | A lever resting on a small triangular fulcrum |
| Planner | A tick (the "lever tick") |
| Finance | A rising line |
| Record | A line of handwriting running off the page |

The current SVGs (1024 × 1024), for reference:

```svg
<!-- Vectis -->
<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="#0068B5"/>
  <circle cx="512" cy="512" r="378" fill="none" stroke="#000" stroke-width="34"/>
  <path d="M262 664 L832 284" fill="none" stroke="#000" stroke-width="88" stroke-linecap="round"/>
  <path d="M440 560 L372 690 L508 690 Z" fill="#000"/>
</svg>

<!-- Planner -->
<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="#0068B5"/>
  <circle cx="512" cy="512" r="378" fill="none" stroke="#000" stroke-width="34"/>
  <path d="M306 340 Q 380 570 510 762 Q 640 520 786 272" fill="none" stroke="#000" stroke-width="88" stroke-linecap="round" stroke-linejoin="round"/>
</svg>

<!-- Finance -->
<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="#0068B5"/>
  <circle cx="512" cy="512" r="378" fill="none" stroke="#000" stroke-width="34"/>
  <path d="M284 655 L444 495 L565 600 L792 266" fill="none" stroke="#000" stroke-width="88" stroke-linecap="round" stroke-linejoin="round"/>
</svg>

<!-- Record -->
<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="#0068B5"/>
  <circle cx="512" cy="512" r="378" fill="none" stroke="#000" stroke-width="34"/>
  <path d="M268 640 C 360 420, 430 760, 530 570 S 690 320, 806 268" fill="none" stroke="#000" stroke-width="88" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

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

1. Three or four **directions** for the Vectis mark, each with the same idea
   applied to Planner, Finance and Record, so the family is visible.
2. Each direction shown at **1024 px**, at **60 px** (Home Screen) and at
   **32 px** (favicon), on light and dark backgrounds.
3. A one-line rationale per direction tying it back to the lever / small
   effort, big movement premise.
