# Suite — shared by Planner and Finance

Design tokens and styles, components, and small helpers both web apps use,
so they can't drift apart (docs/suite-rules.md). Apps import it as
`@suite/...` (a path alias set in each app's `vite.config.ts` and
`tsconfig.app.json`).

- `styles.css` — tokens, light/dark, shell, boxes, buttons, sheets, grids.
- `ui/` — `components.tsx`, `AppShell.tsx`, `MonthGrid.tsx`,
  `AppearanceEditor.tsx`.
- `dates.ts`, `months.ts`, `format.ts`, `ids.ts` — day keys and dates.
- `decode.ts` — read saved JSON with a default for every field.
- `storage.ts` — browser storage under an app's own prefix.
- `appearance.ts` — palettes, saved appearance, applying the theme.

Change a shared piece here, never in one app only.
