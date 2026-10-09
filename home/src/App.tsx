// The Vectis home page: the one Home Screen icon, and a door to each app.
// Each app is its own tool for its own problem; they share a design,
// your sign-in and your data where it helps (the evening review in
// Planner writes into Record's journal, for instance).
//
// Everything opened from here stays inside the same Home Screen app, so
// on a phone they share storage and one sync sign-in.

import { decodeAppearance, useApplyTheme } from '@suite/appearance'
import { AppIcon, type AppIconName } from '@suite/ui/appIcons'
import { ChevronRight } from 'lucide-react'

interface AppEntry {
  icon: AppIconName
  name: string
  what: string
  /** Relative to this page; none while it's being built. */
  href?: string
}

const APPS: AppEntry[] = [
  { icon: 'planner', name: 'Planner', what: 'Goals, your day in time blocks, and the evening review.', href: './planner/' },
  { icon: 'finance', name: 'Finance', what: 'A calm budget, a money calendar, and goals broken into payments.', href: './finance/' },
  { icon: 'record', name: 'Record', what: 'Journal, notebooks and notes. Moving out of Planner next.' },
]

/** The look follows Planner's colour scheme (saved in this browser under "vectis:"). */
function savedAppearance() {
  try {
    return decodeAppearance(JSON.parse(localStorage.getItem('vectis:appearance.json') ?? 'null'))
  } catch {
    return decodeAppearance(null)
  }
}

const appearance = savedAppearance()

function greeting(now = new Date()) {
  const h = now.getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function App() {
  useApplyTheme(appearance)
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="home">
      <header className="home-head">
        <AppIcon name="vectis" size={44} />
        <div>
          <div className="wordmark">Vectis</div>
          <div className="caption">{greeting()} · {today}</div>
        </div>
      </header>

      <main className="home-apps" aria-label="Apps">
        {APPS.map(app => {
          const body = (
            <>
              <AppIcon name={app.icon} size={56} />
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="home-app-name">{app.name}</span>
                <span className="caption">{app.what}</span>
              </span>
              {app.href ? <ChevronRight size={18} className="muted" /> : <span className="tag">Soon</span>}
            </>
          )
          return app.href
            ? <a key={app.name} className="home-app" href={app.href}>{body}</a>
            : <div key={app.name} className="home-app is-soon" aria-disabled="true">{body}</div>
        })}
      </main>

      <footer className="home-foot caption2">
        Each app is its own tool; they share your sign-in and sync between your devices.
      </footer>
    </div>
  )
}
