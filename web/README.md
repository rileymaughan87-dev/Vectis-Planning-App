# Vectis — web app

The web version of Vectis (React + TypeScript + Vite). The Swift app in
`../Vectis Planning/` is kept as-is as a fallback.

## Run it

```
npm install
npm run dev        # http://localhost:5173
npm test           # model tests (vitest)
npm run build      # type-check + production build into dist/
```

On a phone, open the hosted URL in Safari → Share → **Add to Home Screen**; it
then opens full-screen like an app.

## Layout

- `src/model/` — plain data and pure logic, ported from the Swift models.
  `types.ts` mirrors the iPhone JSON exactly; `decode.ts` reads it with a
  default for every missing field; `goals.ts`, `events.ts` and `dayBlocks.ts`
  hold the behaviour (schedule versioning, per-day overrides, what's on a day,
  buffer awareness). Tests in `model.test.ts`.
- `src/store/` — `data.ts` (all app data, saved to localStorage under the
  iPhone file names), `share.ts` (accountability sharing and partners).
- `src/sync/` — Google sign-in and Drive calls, the share-file format,
  iPhone import and backups.
- `src/screens/`, `src/ui/` — the interface.

## Google Drive sharing

Needs a one-time setup: see `../docs/GOOGLE-SETUP.md`. Put the two values in
`web/.env.local` (git-ignored) or paste them in the app under Accountability →
Google setup.
