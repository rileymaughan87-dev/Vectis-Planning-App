# Finance — rework brief

A brief for reworking **Finance**, the money app in the Vectis suite:
what the research says works, what people like in other money apps, an
honest review of the app as it is, and **options** to choose from — for
how the app works underneath, what its main screen is, which features it
has, and how it looks. Written to be read by Riley and handed to a design
tool alongside `docs/design-system.md` (the Index style) and
`docs/brand-brief.md`.

---

## 1. The premise

Vectis is a set of calm, behavioural-science-based tools: *small, steady
effort, applied in the right place, moves big things.* Finance should be
the calmest of them. It isn't a bank (no bank connection — everything is
entered by hand) and it isn't a scorecard. Its job is to answer, at a
glance, **"am I OK, and what can I spend?"**, and to make the few money
decisions that matter — saving, paying things off, getting ready for
irregular bills — feel easy and visible.

Rules carried from the rest of the suite: plain language, no shame, no
red "you failed", rest and pleasure are first-class (money spent on joy
is not a mistake), nothing nags.

---

## 2. What the research says

Short version: **tracking helps awareness; budgets alone don't cut
spending; automation and earmarking help saving; shame drives people
away.** The evidence is real but modest — treat these as good bets, not
laws.

| Finding | Evidence | What it means for Finance |
|---|---|---|
| **Setting a budget didn't change spending.** In a 13-week field experiment with 9,035 users of a fintech app, people given a one-number or category budget spent the same as those who only saw a weekly summary (≈$676 vs $681 vs $673); budgeters spent 1.3–1.4× what they'd budgeted. Budgeting did make people check in a bit more often. | [Irrational Labs / Duke Common Cents Lab](https://irrationallabs.com/blog/money-budgeting-experiment/) | Don't make detailed category budgets the centre of the app. A clear weekly picture is as good, and less work. |
| **Tracking builds awareness, and awareness trims discretionary spending.** Persistent expense tracking was linked to a smaller share of discretionary spending (but not to sticking to a budget). A daily spending diary worked about as well as financial education in a trial. | [Zhang, UW–Madison (expense tracking as self-monitoring)](https://asset.library.wisc.edu/1711.dl/63XZYPDLKMY638S/R/file-908a3.pdf); [J-PAL financial diaries](https://www.povertyactionlab.org/sites/default/files/research-paper/Financial%20Diaries_2021.pdf) | Make *logging* and *glancing* effortless. Manual entry has a hidden benefit: typing a spend in makes it felt ("pain of paying"). |
| **Finance apps improve habits and resilience more than outcomes.** A UK trial found app users tracked income and spending more and coped better with a financial shock; effects on wellbeing need longer to show. | [French, McKillop & Stewart (QUB)](https://pureadmin.qub.ac.uk/ws/files/175760516/French_McKillop_and_Stewart_1_.pdf) | Aim for steady habits and a buffer, not dramatic change. |
| **People avoid bad news (the "ostrich effect").** Investors log in less after markets fall (≈9.5% fewer logins in one large study). | [Karlsson, Loewenstein & Seppi](https://www.cmu.edu/dietrich/sds/docs/loewenstein/FinancialAttention.pdf); [Sicherman et al.](https://business.columbia.edu/sites/default/files-efs/pubfiles/25997/sicherman_financial_attention.pdf) | Bad weeks must feel safe to look at: neutral wording, no alarm colours, always a next step. |
| **Shame makes people quit.** Punitive red bars and "over limit" messages push people to stop opening the app. (Mostly practitioner evidence, consistent across sources.) | [Count Finance write-up](https://startupradio.substack.com/p/how-count-finance-is-quietly-fixing); [Brightfin](https://www.businesswire.com/news/home/20240718031982/en/Swipe-Right-on-Financial-Wellness-–-Brightfin-Launches-Healthy-Spending-App-to-Remove-Anxiety-Around-Money) | Keep Finance's current "going over is just information" tone everywhere. |
| **Most apps are abandoned early** (median ~70% within 100 days across lifestyle apps), and backlog — "I've missed weeks, catching up is too much" — is a classic reason people drop manual bookkeeping. | [Scoping review, JMIR](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11694054/) | Never let missed days pile up into a wall of work. Recurring entries fill themselves in; estimates are fine; catching up should take one minute. |
| **Earmarking and visible goals raise saving.** Splitting money into labelled pots and showing a visual reminder of the goal increased saving; a single clear goal tripled saving in one field study; progress you can see speeds people up near the finish (goal-gradient). | [Soman & Cheema](https://www.russellsage.org/sites/default/files/u137/jmr-C-s014-s021-online.pdf); [World Bank: fewer goals, more saving](https://blogs.worldbank.org/en/impactevaluations/marketing-saving-fewer-goals-can-lead-to-higher-savings); [Advanced Hindsight](https://case-studies.advanced-hindsight.com/case-studies/WVIDhg3T/using-goals-to-boost-savings) | Keep saving goals, make them visual, and put one at the front. |
| **Automatic beats willpower.** Committing in advance to save more (Save More Tomorrow) raised savers' rates from 3.5% to 11.6% over three years; defaults stick. (Causal strength debated.) | [Thaler & Benartzi, via CLEAR](https://clear.dol.gov/study/save-more-tomorrow%E2%84%A2-using-behavioral-economics-increase-employee-saving-thaler-benartzi-2004) | Saving and set-asides should come out *first*, as planned, before "what's left" — so what you see is already safe to spend. |
| **A derived "safe to spend" number reduces mental maths.** Simple's Safe-to-Spend showed balance minus upcoming bills and goal money; users credited it with avoiding overdrafts, and missed it when it went. | [MIT Technology Review on Simple](https://www.technologyreview.com/2011/04/05/23700/redesigning-banking-with-behavioral-economics-in-mind/amp/); [American Banker](https://americanbanker.com/news/the-fintechs-stepping-into-the-void-left-by-simple) | The strongest candidate for Finance's headline number. |
| **People think in pay cycles.** Emma added payday-to-payday budgeting after heavy user demand; it became its core feature. | [Emma](https://emma-app.com/blog/payday-sync-budgets-track-salary) | Let the period run payday to payday, not only calendar month. |

---

## 3. What people like in other money apps

| App | What people love | What they don't |
|---|---|---|
| **YNAB** | A method that changes habits: *give every pound a job*, *embrace true expenses* (spread irregular bills monthly), *roll with the punches* (move money when you overspend, no guilt), *age your money* (live on last month's income). Works fully without bank links. | Takes a week or two to "get"; lots of allocating. |
| **Monarch** | Clean modern design; one dashboard for a household; goals; weekly recaps. | Mobile app weaker than web. |
| **Copilot** | The best-loved *design*: calm, restrained palette, data carries the colour, progress rings, month-in-review insights ("you spent less on dining"), motion that feels considered. | Apple-only; pricey. |
| **Emma / Snoop (UK)** | Payday-to-payday budgets; a "true balance" of what's really left; spotting regular bills and subscriptions. | Many features behind paywalls. |
| **Goodbudget** | Envelopes: a visible limit per pot ("dining envelope is empty, so I stop"); manual entry makes you mindful. | Manual entry is tedious for some. |
| **Simple (closed)** | One number — *Safe to Spend* — and goals that quietly set money aside daily. | Gone; still missed. |

Patterns worth borrowing: **one headline number**, **pay-cycle periods**,
**true expenses spread out**, **visible pots with a clear limit**,
**a short regular recap**, **progress you can see**, **restraint in
design**. Things to avoid: dashboards crowded with charts, category
micro-budgets, red/green judgement.

---

## 4. Review of Finance today (honest)

**What works:** the weekly pot and quick "Log spending" (fast, kind
wording — "going over is just information"); recurring entries that fill
in every month; estimates you confirm later (amber, never alarming);
goals broken into payments with a Confirm button when one is due; "a
typical month" so a five-payday month doesn't mislead; the money calendar.

**Why it doesn't feel helpful or smooth:**

1. **No single answer.** The Budget tab is a long scroll of ~10 sections
   (this week, in and out, a typical month, room to save, left over each
   month, money in, fixed, flexible, debts, saving). There's no one
   number that says "you're OK — £X to spend until payday".
2. **Two clocks at once.** The pot works in weeks; everything else in
   calendar months; pay may be weekly or monthly. The page switches
   between them without saying which question each answers.
3. **It plans, but doesn't know what you have.** There's no balance —
   Finance knows what's *planned* to come in and go out, not what's in
   the account, so "left over" is a forecast, not reality.
4. **Budget and Calendar repeat each other** (totals and lists in both).
5. **Setting up is slow.** Re-entering pay, bills and goals is one
   editor at a time with several sections each — exactly the moment the
   app needs to be quickest.
6. **No ritual.** Planner has an evening review; Finance has nothing
   that brings you back for a calm two-minute check, so it's easy to
   drift and then avoid it.
7. **Little sense of progress.** Goals sit on their own tab; the main
   screen doesn't show anything moving forward.
8. **Flat, list-like look.** Next to Planner and Record it reads as
   tables of money rather than a calm instrument.

---

## 5. Options

Pick one from A and B, any from C, one from D. Mix freely.

### A. How the app works underneath (the "background")

**A1 — Safe to spend (recommended).** Finance keeps one running figure:
*money you have now − bills still to come before payday − what's going to
saving and set-asides = safe to spend until payday*, shown with "about £N
a day". You enter your balance occasionally (on payday, or whenever you
like); recurring pay and bills fill themselves in; logged spending
brings the figure down. Research fit: derived number (Simple), pay
cycles (Emma), save first (SMarT). Effort: medium (adds balances and pay
cycles to what exists).

**A2 — Every pound a job (YNAB-style).** On payday you hand the money out
to pots — bills, flexible, saving, set-asides, fun — until nothing is
left unassigned. Spending comes out of pots; overspend one and you move
money from another, no guilt. Research fit: earmarking, true expenses,
strong habit-builder. Effort: high; takes more of your time each payday.

**A3 — Calm plan (refine today's model).** Keep the forecast (planned in
and out by month) and the weekly pot, but merge them into one clear
screen, add pay cycles, and drop the repetition. Research fit: awareness
without budgeting overhead. Effort: low–medium. Doesn't fix "doesn't
know what I have".

### B. The main screen

```
B1  ONE NUMBER (pairs with A1)        B2  POTS (pairs with A2)           B3  TIMELINE (pairs with A1/A3)
01 Until payday · 12 days             01 This pay · 4 pots                01 This week
   £412 safe to spend                    Bills      ███████░  £640           £64 left of the pot
   about £34 a day                       Flexible   ████░░░░  £180         02 Coming up
●───────────────────────────→           Saving     ████████  £250            Fri  Phone bill   −£24
02 Coming up before then                 Fun        ██░░░░░░   £40            Mon  Pay          +£2,290
   Phone bill  Fri       −£24          + Log spending                        Tue  Rent         −£950
   Rent        Tue       −£950                                              03 Goals
03 Goals                                                                       Emergency fund ███░ 40%
   Emergency fund  ███░  40%
+ Log spending
```

### C. Features (choose any)

Already there and worth keeping: weekly pot · quick log · recurring
entries · estimates to confirm · goals with payments · money calendar ·
a typical month.

| Feature | What it does | Why |
|---|---|---|
| **Pay cycles** | Periods run payday to payday (weekly, fortnightly, four-weekly or monthly), not just calendar months. | How people think about money (Emma). |
| **Balances** | Enter what's in your current account (and savings, cards) now and then; Finance works forward from it. | Turns forecasts into "what I actually have". |
| **Safe to spend** | The headline figure and a per-day amount until payday. | One answer; less mental maths (Simple). |
| **Money check-in** | A two-minute weekly (or payday) review, like Planner's evening review: confirm estimates, log anything missed, glance at goals, one kind line. Gentle reminder, easy to skip. | Builds the tracking habit; stops backlog; beats the ostrich effect. |
| **Fast setup** | A guided first run: pay, then a checklist of common bills (rent, council tax, phone, energy, subscriptions…) with amounts and days, then goals — all on one screen. | Re-entering everything should take ten minutes, not an evening. |
| **True expenses** | Irregular bills (car insurance, Christmas, TV licence) become set-asides automatically, spread over the months until they're due. | YNAB's most-praised rule; no surprises. |
| **Subscriptions view** | Every repeating cost in one list, with a yearly total. | Easy wins; people forget what they pay for. |
| **Payday recap** | At the end of a pay period: in, out, saved, what changed — a few plain sentences, no judgement. | Copilot/Monarch-style insight without charts. |
| **Spending by feel** | Optional simple buckets — Essentials, Joy, Obligations, Growth — instead of many categories. | Fits Vectis' "pleasure is first-class"; low effort. |
| **Goal links to Planner** | A money goal can also be a Planner long-term goal (with its milestones), and Planner's Home can show "safe to spend". | The suite working together. |
| **Saving first** | Planned saving and set-asides are taken off *before* safe to spend, so the number you see is already guilt-free. | Automatic beats willpower (SMarT). |

### D. Visual direction (within the Index style)

All three keep paper and ink, the suite blue, numbered sections and
pivot rules; they differ in what carries the picture.

- **D1 — Ledger.** A well-made paper ledger: big serif figures, mono
  columns of dates and amounts, ruled lines, almost no colour except
  income green, expense red and estimate amber. Quietest; closest to
  Planner.
- **D2 — Gauge.** The headline figure sits on the pivot rule itself — the
  line fills from the dot as the pay period passes, and a marker shows
  what's been spent. One strong, ownable visual (the lever as a
  measuring instrument); the rest stays ledger-like.
- **D3 — Pots.** Each pot or goal is a tall, narrow vessel that fills,
  side by side like jars on a shelf; tapping one opens it. Most tangible
  and goal-led (earmarking made visible); a little more playful.

---

## Decided direction (10 Oct 2026, Riley)

Months were the wrong unit: Riley is paid monthly from this month, a small
payment early in the month and the main one on the 30th, which a
calendar month books into the wrong month. So:

- **Balances are the truth.** Accounts are all optional — current,
  savings, credit card, loans/other debt; each person adds only what they
  want to see. Balances are **audited** whenever Riley likes (no
  reminder; the app shows how long since the last audit). An audit
  compares the real balance with what was expected; a gap becomes one
  "everyday spending" (or "extra in") entry with one tap.
- **Logging is optional.** Day-to-day purchases can be logged for a
  sharper picture between audits, never required.
- **Plan forward from today, not by month.** Recurring pay and bills
  become a "coming up" list from the real balance. Headline: **safe to
  spend until the next payday** (+ per day) = current balance − bills
  due before then − planned saving/set-asides − a **cushion** (a set
  amount Riley chooses). Pay that lands on the 30th starts the next
  stretch; it never props up the current one. A warning (information,
  not alarm) if the balance would dip low before payday.
- **Months are history.** Each audit saves a snapshot; over time these
  show savings rising and debt falling, month by month — real, not
  planned.
- **Goals sit on real balances**: savings goals on savings accounts (or
  named pots within them), debts on card/loan balances, set-asides as
  earmarked money safe to spend leaves alone.
- Existing data carries over: recurring entries become "coming up";
  goals keep working; the weekly pot can stay as an optional limit.

Build in stages: (1) accounts and audits, with snapshots; (2) the
forward view and safe to spend as the new main screen; (3) progress over
time, goals on balances, fast setup, and retiring the month screens.

## 6. Questions to settle

1. **A:** Safe to spend, every pound a job, or calm plan?
2. **Balances:** happy to type in your account balance now and then (on
   payday is enough)?
3. **Pay:** how often are you paid, and is it the same day each time?
4. **Period:** payday to payday, or calendar month?
5. **Check-in:** weekly, on payday, or not at all?
6. **Look:** Ledger, Gauge or Pots?

## 7. What to ask the design tool for

Give it this brief plus `docs/design-system.md`. Ask for the main screen
(B option chosen) in the chosen visual direction (D), at phone size
(390 × 844) in light and dark, plus: the money check-in sheet, Log
spending, the fast-setup first run, and a goal's detail — each with one
line on how it applies the research above.
