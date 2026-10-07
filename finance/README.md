# Finance — web app

The web version of the Finance app (Swift source: rileymaughan87-dev/Finance-App).
Lives alongside Planner and shares its design through `../suite`.

```
npm install          # once, from the repo root
npm run dev -w finance   # http://localhost:5174
npm run build -w finance
```

Saved data uses the iPhone app's file names and formats under the
`finance:` prefix, so it never collides with Planner's `vectis:` data on
the same website.
