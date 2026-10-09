# Record — web app

Journal, notebooks and notes: the writing app of the Vectis suite, at
`…/Vectis-Planning-App/record/`. It took the Record tab out of Planner
(Oct 2026). Planner's evening review still writes each day's
"Daily review" section into the same journal.

```
npm install            # once, from the repo root
npm run dev -w record  # http://localhost:5176
npm run build -w record
```

- The editor, maths, scans, pictures and the journal's day document are
  shared code in `../suite/src/record/` (Planner's evening review uses
  the journal parts).
- Saved data stays under Planner's `vectis:` prefix and file names
  (`journal_entries.json`, `notes.json`, `notebooks.json`), so nothing
  moved and the iPhone formats still apply. Goals are read (not written)
  from `vectis:goals.json`, to link notes to them.
- Sync uses the same Firebase records as Planner (`users/{uid}/planner`)
  for the journal, notes and notebooks, plus note pictures.
