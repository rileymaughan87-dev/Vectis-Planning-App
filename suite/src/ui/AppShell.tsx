// The frame every app in the suite uses (docs/design-system.md): wordmark
// top-left, menu top-right opening a right-side drawer, and a custom tab
// bar along the bottom. On wide screens the tabs and the menu's contents
// sit together in a permanent sidebar instead, and the top bar goes.
// A grid button beside the wordmark goes back to the Vectis home page.

import { LayoutGrid, Menu, X } from 'lucide-react'
import { useState, type CSSProperties, type ReactNode } from 'react'

export interface ShellTab<T extends string> {
  id: T
  title: string
  icon: (size: number) => ReactNode
}

export function AppShell<T extends string>(props: {
  appName: string
  tabs: ShellTab<T>[]
  tab: T
  onTab: (tab: T) => void
  /**
   * What's in the side menu — shown in the drawer on a phone and in the
   * sidebar on a wide screen. Call `close` when an item is chosen.
   */
  menu: (close: () => void) => ReactNode
  contentClassName?: string
  /** The current page. */
  children: ReactNode
  /** Sheets and overlays, drawn above everything. */
  overlays?: ReactNode
  /** The Vectis home page (all the apps), relative to this app. */
  homeHref?: string
}) {
  const home = props.homeHref && (
    <a className="icon-button home-link" href={props.homeHref} aria-label="All apps (Vectis)" title="All apps">
      <LayoutGrid size={18} />
    </a>
  )
  const [drawerOpen, setDrawerOpen] = useState(false)
  const close = () => setDrawerOpen(false)
  const title = props.tabs.find(t => t.id === props.tab)?.title ?? ''

  return (
    <div className="app">
      <aside className="rail" aria-label="Navigation">
        <div className="rail-head">{home}<span className="wordmark">{props.appName}</span></div>
        <nav aria-label="Sections">
          {props.tabs.map(t => (
            <button key={t.id} className="rail-tab" aria-current={props.tab === t.id ? 'page' : undefined} onClick={() => props.onTab(t.id)}>
              {t.icon(18)}
              {t.title}
            </button>
          ))}
        </nav>
        <hr className="divider" style={{ margin: '10px 0' }} />
        {props.menu(() => {})}
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-row">
            <span className="row" style={{ gap: 4 }}>{home}<span className="wordmark">{props.appName}</span></span>
            <button className="icon-button menu-button" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
              <Menu size={22} />
            </button>
          </div>
          {/* Read by screen readers; not shown, per the design system. */}
          <h1 className="visually-hidden">{title}</h1>
        </header>

        <main className={`content ${props.contentClassName ?? ''}`}>{props.children}</main>

        <nav className="tabbar" aria-label="Sections">
          {props.tabs.map(t => (
            <button key={t.id} className="tab" aria-current={props.tab === t.id ? 'page' : undefined} onClick={() => props.onTab(t.id)}>
              {t.icon(19)}
              {t.title}
            </button>
          ))}
        </nav>
      </div>

      {drawerOpen && (
        <>
          <div className="sidebar-backdrop" onClick={close} />
          <aside className="sidebar" aria-label="Menu">
            <div className="sidebar-head">
              <button className="icon-button" style={{ color: 'var(--text-2)' }} onClick={close} aria-label="Close menu"><X size={20} /></button>
              <span className="wordmark">{props.appName}</span>
            </div>
            {props.menu(close)}
          </aside>
        </>
      )}

      {props.overlays}
    </div>
  )
}

/** One row in the side menu: icon, title and a short description. */
export function MenuRow(props: { icon: ReactNode; title: string; subtitle: string; onClick: () => void; badge?: string; style?: CSSProperties }) {
  return (
    <button className="sidebar-row" onClick={props.onClick} style={props.style}>
      {props.icon}
      <span>
        <div className="title">{props.title}</div>
        <div className="subtitle">{props.subtitle}</div>
      </span>
      {props.badge && <span className="badge" aria-label={props.badge} />}
    </button>
  )
}
