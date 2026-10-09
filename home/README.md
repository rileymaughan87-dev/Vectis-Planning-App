# Vectis home page

The suite's front door: the one Home Screen icon, **Vectis**, with a tile
for each app — Planner, Finance and (next) Record. It lives at the site
root; the apps sit in folders beside it (`planner/`, `finance/`).

```
npm install           # once, from the repo root (npm workspaces)
npm run dev -w home   # http://localhost:5173 (or the next free port)
npm run build -w home # into home/dist/
```

- Adding an app: a tile in `src/App.tsx`, an icon in
  `suite/src/ui/appIcons.tsx`, a folder in the deploy
  (`.github/workflows/deploy-web.yml`), and `homeHref="../"` on its
  `AppShell`.
- The look follows Planner's saved colour scheme.
- Old partner links (`…/#partner=…`) are forwarded to Planner.
