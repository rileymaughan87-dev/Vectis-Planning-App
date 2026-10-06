# Google Drive setup for accountability sharing

One-time, free, about 15 minutes. You need it so Vectis can keep your share
file in Google Drive, and so the app can read a partner's file.

Only the person **sharing** signs in to Google. A partner reading your file
doesn't sign in; the app reads it with an API key.

## 1. Create a project

1. Go to <https://console.cloud.google.com/> and sign in.
2. Project picker (top left) → **New project** → name it `Vectis` → Create.

## 2. Turn on the Drive API

**APIs & Services → Library** → search "Google Drive API" → **Enable**.

## 3. Consent screen

**Google Auth Platform** (or **APIs & Services → OAuth consent screen**):

- **Branding:** app name `Vectis`, your email as support and developer contact.
- **Audience:** User type **External**. Leave it in **Testing**, and under
  **Test users** add every Google account that will *share* (you, and any
  partner who wants to share back). Up to 100 test users.
- **Data access:** add the scope `https://www.googleapis.com/auth/drive.file`.
  This scope only lets Vectis see files it created itself, nothing else in
  your Drive.

## 4. OAuth client ID (for signing in)

**Credentials → Create credentials → OAuth client ID**:

- Application type: **Web application**
- Authorized JavaScript origins:
  - `http://localhost:5173` (development — this is all you need until the
    app is hosted)
  - later, once hosted: `https://rileymaughan87-dev.github.io`
- No redirect URIs needed.

Copy the **Client ID** (ends in `.apps.googleusercontent.com`).

## 5. API key (for reading partners' files)

**Credentials → Create credentials → API key**, then **Edit API key**:

- API restrictions: **Restrict key** → only **Google Drive API**.
- Application restrictions: **Websites** → `http://localhost:5173/*` for
  now; add `https://rileymaughan87-dev.github.io/*` once hosted.

Copy the key (starts with `AIza`).

## 6. Give them to the app

Either:

- **Build it in** (recommended, so partners don't have to do anything): create
  `web/.env.local` containing

  ```
  VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
  VITE_GOOGLE_API_KEY=AIza...
  ```

  then restart `npm run dev`. `.env.local` is git-ignored.
- **Or paste them in the app:** Side menu → Accountability → Google setup.
  This only applies on that one browser.

Both values are designed to be public (they end up in the web page either
way). The restrictions in steps 4 and 5 are what keep them safe.

## Hosting (GitHub Pages)

The app is published to <https://rileymaughan87-dev.github.io/Vectis-Planning-App/>
by `.github/workflows/deploy-web.yml` on every push to `master` that touches
`web/`. The build reads the two values from repository secrets named
`VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_API_KEY` (Settings → Secrets and
variables → Actions). Google only needs the origin
(`https://rileymaughan87-dev.github.io`), not the path.

## How sharing works once set up

1. Side menu → **Accountability** → enter your name → **Share through Google
   Drive**. Google asks once for permission.
2. Vectis creates `Vectis share — <name>.json` in your Drive, readable by
   anyone with the link, and shows a link to send your partner.
3. Your partner taps the link, their Vectis opens and offers to **Follow**
   you. You then appear in their side menu; tapping your name shows your
   goals and calendar read-only, and **‹ My Vectis** takes them back.
4. Changes publish automatically a few seconds later while your Google sign-in
   is fresh (about an hour). Otherwise the menu shows a dot, and **Publish
   now** catches up.
5. To stop sharing, delete the file in Google Drive.
