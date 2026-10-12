// Connects shared calendars while sync is live (they use the same Google
// sign-in and database), and lets go when it stops.

import { useShared } from './shared'
import { useSync } from './sync'

let stop: (() => void) | null = null
let starting = false

function follow() {
  const live = useSync.getState().phase === 'live'
  if (live && !stop && !starting) {
    starting = true
    import('../sync/sharedCalendars')
      .then(m => {
        if (useSync.getState().phase !== 'live' || stop) return
        const connection = m.connect({
          onCalendars: (calendars, complete) => {
            const { mine } = useShared.getState()
            const ids = new Set(calendars.map(c => c.id))
            const known = new Set(mine.map(m => m.id))
            // New ones (joined on another device, or just made) show; ones you've left go.
            const next = [...(complete ? mine.filter(m => ids.has(m.id)) : mine), ...calendars.filter(c => !known.has(c.id)).map(c => ({ id: c.id, shown: true }))]
            const changed = next.length !== mine.length || next.some((m, i) => m !== mine[i])
            useShared.setState({ calendars, live: true, ...(changed ? { mine: next } : {}) })
          },
          onEvents: (id, events) => useShared.setState(s => ({ eventsBy: { ...s.eventsBy, [id]: events } })),
          onError: error => useShared.setState({ error }),
        })
        stop = connection.stop
        useShared.setState({ api: connection.api, error: undefined })
      })
      .catch(error => useShared.setState({ error: error instanceof Error ? error.message : String(error) }))
      .finally(() => { starting = false })
  } else if (!live && stop) {
    stop()
    stop = null
    useShared.setState({ live: false, api: undefined, calendars: [], eventsBy: {} })
  }
}

useSync.subscribe(follow)
follow()
