// Your calendar as the screens show it: your own events and categories,
// plus the shared calendars you've ticked (store/shared.ts).

import { useMemo } from 'react'
import { useData } from './data'
import { useShared, visibleShared } from './shared'

export function useCalendarData() {
  const events = useData(s => s.events)
  const categories = useData(s => s.categories)
  const calendars = useShared(s => s.calendars)
  const eventsBy = useShared(s => s.eventsBy)
  const mine = useShared(s => s.mine)
  return useMemo(() => {
    const shared = visibleShared({ calendars, eventsBy, mine })
    return {
      events: shared.events.length ? [...events, ...shared.events] : events,
      categories: shared.categories.length ? [...categories, ...shared.categories] : categories,
    }
  }, [events, categories, calendars, eventsBy, mine])
}
