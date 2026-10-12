// Shared calendars in Firebase (loaded only once sync is on). A calendar
// is calendars/{id} — its name, colour and members — with its events in
// calendars/{id}/events/{eventID} and invitations in
// calendars/{id}/invites/{code}. The database rules let only members read
// or change a calendar and its events; knowing an invitation's code lets
// a signed-in person add themselves (docs/shared-calendars.md has the rules).
//
// It uses the Firebase app, sign-in and database the sync engine set up
// (suite/sync/engine.ts), so it's started only while sync is live.

import { getApps } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import {
  arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getFirestore, onSnapshot, query, serverTimestamp, setDoc,
  updateDoc, where, writeBatch,
} from 'firebase/firestore'
import { decodeEvent } from '../model/decode'
import type { CalendarEvent } from '../model/types'
import { sharedCategoryID, type SharedApi, type SharedCalendar } from '../store/shared'

const firstName = (s: string | null | undefined) => (s ?? '').trim().split(/\s+/)[0] || 'Someone'

/** What goes into the calendar: the event without anything that only means something to one person. */
function stored(e: CalendarEvent) {
  const { sharedCalendarID: _c, addedByName: _a, linkedGoalID: _g, linkedTaskID: _t, linkedPersonID: _p, ...rest } = e
  void _c
  void _a
  void _g
  void _t
  void _p
  return JSON.stringify(rest)
}

const newCode = () => (crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)

export function connect(handlers: {
  /** `complete`: from the server, not just this device's cache (so a missing calendar really was left). */
  onCalendars(calendars: SharedCalendar[], complete: boolean): void
  onEvents(calendarID: string, events: CalendarEvent[]): void
  onError(message: string): void
}): { api: SharedApi; stop: () => void } {
  const app = getApps()[0]
  const auth = getAuth(app)
  const db = getFirestore(app)
  const user = auth.currentUser
  if (!user) throw new Error('Not signed in')
  const uid = user.uid
  const name = firstName(user.displayName)
  const eventListeners = new Map<string, () => void>()

  const fail = (error: unknown) => {
    const code = (error as { code?: string })?.code ?? ''
    handlers.onError(code.includes('permission-denied')
      ? 'The database refused access to shared calendars. Its rules need the shared-calendars part added (see Settings help).'
      : error instanceof Error ? error.message : String(error))
  }

  const stopCalendars = onSnapshot(query(collection(db, 'calendars'), where('members', 'array-contains', uid)), snap => {
    const calendars: SharedCalendar[] = snap.docs.map(d => {
      const data = d.data()
      return {
        id: d.id,
        name: typeof data.name === 'string' ? data.name : 'Shared',
        colorHex: typeof data.colorHex === 'string' ? data.colorHex : '#5B8DEF',
        members: Array.isArray(data.members) ? data.members.filter((m: unknown): m is string => typeof m === 'string') : [],
        names: data.names && typeof data.names === 'object' ? (data.names as Record<string, string>) : {},
      }
    })
    handlers.onCalendars(calendars, !snap.metadata.fromCache)
    // Follow each calendar's events; stop following ones you've left.
    const ids = new Set(calendars.map(c => c.id))
    for (const [id, stop] of eventListeners) {
      if (!ids.has(id)) {
        stop()
        eventListeners.delete(id)
        handlers.onEvents(id, [])
      }
    }
    for (const id of ids) {
      if (eventListeners.has(id)) continue
      eventListeners.set(id, onSnapshot(collection(db, 'calendars', id, 'events'), evSnap => {
        const events: CalendarEvent[] = []
        for (const d of evSnap.docs) {
          const data = d.data()
          let raw: unknown
          try {
            raw = JSON.parse(String(data.json ?? 'null'))
          } catch {
            continue
          }
          const e = raw && typeof raw === 'object' ? decodeEvent({ ...(raw as Record<string, unknown>), id: d.id, categoryID: sharedCategoryID(id) }) : null
          if (e) events.push({ ...e, sharedCalendarID: id, addedByName: typeof data.addedByName === 'string' ? data.addedByName : undefined })
        }
        handlers.onEvents(id, events)
      }, fail))
    }
  }, fail)

  const api: SharedApi = {
    uid,
    name,
    async create(calendarName, colorHex) {
      const ref = doc(collection(db, 'calendars'))
      await setDoc(ref, { name: calendarName, colorHex, members: [uid], names: { [uid]: name }, createdBy: uid, createdAt: serverTimestamp() })
      return ref.id
    },
    async update(id, patch) {
      await updateDoc(doc(db, 'calendars', id), patch)
    },
    async invite(id, calendarName, colorHex) {
      const code = newCode()
      await setDoc(doc(db, 'calendars', id, 'invites', code), { name: calendarName, colorHex, by: name, createdAt: serverTimestamp() })
      return code
    },
    async inviteInfo(id, code) {
      const snap = await getDoc(doc(db, 'calendars', id, 'invites', code))
      if (!snap.exists()) return null
      const data = snap.data()
      return { name: String(data.name ?? 'Shared calendar'), colorHex: String(data.colorHex ?? '#5B8DEF'), by: String(data.by ?? 'Someone') }
    },
    async join(id, code) {
      await updateDoc(doc(db, 'calendars', id), { members: arrayUnion(uid), [`names.${uid}`]: name, joinedWith: code })
    },
    async leave(id) {
      await updateDoc(doc(db, 'calendars', id), { members: arrayRemove(uid) })
    },
    write(events, added) {
      const batch = writeBatch(db)
      for (const e of events) {
        if (!e.sharedCalendarID) continue
        const isNew = added.has(e.id)
        batch.set(doc(db, 'calendars', e.sharedCalendarID, 'events', e.id), {
          json: stored(e),
          updatedAt: serverTimestamp(),
          updatedByName: name,
          ...(isNew ? { addedBy: uid, addedByName: name } : {}),
        }, { merge: true })
      }
      batch.commit().catch(fail)
    },
    remove(events) {
      for (const e of events) if (e.sharedCalendarID) deleteDoc(doc(db, 'calendars', e.sharedCalendarID, 'events', e.id)).catch(fail)
    },
  }

  return {
    api,
    stop: () => {
      stopCalendars()
      for (const stop of eventListeners.values()) stop()
      eventListeners.clear()
    },
  }
}
