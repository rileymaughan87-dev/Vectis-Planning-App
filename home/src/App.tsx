// The Vectis home page: the one Home Screen icon, and a door to each app.
// Each app is its own tool for its own problem; they share a design,
// your sign-in and your data where it helps (the evening review in
// Planner writes into Record's journal, for instance).
//
// Everything opened from here stays inside the same Home Screen app, so
// on a phone they share storage and one sync sign-in. In the Index style:
// each app is a numbered entry with a pivot rule running off the edge.
// The page is paper and suite blue (ink in dark mode) — it follows the
// shared light/dark choice but not the colour scheme.

import { loadSharedAppearance, onSharedAppearanceChange, useApplyTheme } from '@suite/appearance'
import { SUITE_APPS } from '@suite/ui/appIcons'
import { useEffect, useState } from 'react'

interface AppEntry {
  name: string
  what: string
  /** Relative to this page; none while it's being built. */
  href?: string
}

const APPS: AppEntry[] = [
  { name: 'Planner', what: 'Goals, your day in time blocks, and the evening review.', href: './planner/' },
  { name: 'Finance', what: 'A calm budget, a money calendar, and goals broken into payments.', href: './finance/' },
  { name: 'Record', what: 'Journal, notebooks and notes.', href: './record/' },
]

const indexOf = (name: string) => SUITE_APPS.find(a => a.name === name)?.index ?? ''

function greeting(now = new Date()) {
  const h = now.getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function App() {
  const [appearance, setAppearance] = useState(loadSharedAppearance)
  useEffect(() => onSharedAppearanceChange(setAppearance), [])
  useApplyTheme(appearance)
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="home-page">
      <div className="home">
        <header className="home-head">
          <div className="home-index">00</div>
          <h1 className="home-wordmark">Vectis</h1>
          <div className="home-date">{greeting()} · {today}</div>
        </header>

        <main className="home-apps" aria-label="Apps">
          {APPS.map(app => {
            const body = (
              <>
                <div className="home-app-row">
                  <span className="home-index">{indexOf(app.name)}</span>
                  <span className="home-app-name">{app.name}</span>
                  <span className="home-app-go" aria-hidden={app.href ? true : undefined}>{app.href ? '→' : 'SOON'}</span>
                  <span className="home-app-what">{app.what}</span>
                </div>
                <div className="home-rule" aria-hidden="true" />
              </>
            )
            return app.href
              ? <a key={app.name} className="home-app" href={app.href}>{body}</a>
              : <div key={app.name} className="home-app is-soon" aria-disabled="true">{body}</div>
          })}
        </main>

        <footer className="home-foot">
          Each app is its own tool; they share your sign-in and sync between your devices.
        </footer>
      </div>
    </div>
  )
}
