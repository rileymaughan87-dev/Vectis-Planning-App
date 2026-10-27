// Finance's live balances (Oct 2026). The browser can't safely hold bank
// links, so these small functions do: each is called by a signed-in
// Finance (Firebase callable functions check the sign-in), keeps that
// person's links in Firestore at bankLinks/{uid} — a place the app itself
// can't read (no rule allows it) — and only ever hands back balances.
// Read-only throughout: nothing here can move money.
// Setup: docs/live-balances.md.

import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { setGlobalOptions } from 'firebase-functions/v2'
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { randomBytes } from 'node:crypto'
import * as eb from './enableBanking.js'
import * as sf from './simplefin.js'
import type { LinkedBalance } from './types.js'

initializeApp()
setGlobalOptions({ region: 'europe-west2', maxInstances: 2 })

const EB_APP_ID = defineSecret('ENABLE_BANKING_APP_ID')
const EB_KEY = defineSecret('ENABLE_BANKING_KEY')
const creds = (): eb.Credentials => ({ appID: EB_APP_ID.value(), key: EB_KEY.value() })

/** Where a bank may send you back to: Finance on the site, or a dev copy on this computer. */
const RETURN = [/^https:\/\/rileymaughan87-dev\.github\.io\/Vectis-Planning-App\/finance\/$/, /^http:\/\/localhost:\d+\/$/]

interface Links {
  /** SimpleFIN's access address (holds its password). */
  simplefin?: string
  /** Enable Banking sessions by id. */
  sessions?: Record<string, eb.Session>
  /** A link waiting for the bank to send you back. */
  pending?: { state: string; at: number }
}

const doc = (uid: string) => getFirestore().doc(`bankLinks/${uid}`)
const load = async (uid: string): Promise<Links> => ((await doc(uid).get()).data() as Links | undefined) ?? {}

function who(req: CallableRequest): string {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in (Settings → Sync) to use live balances.')
  return req.auth.uid
}

const text = (v: unknown, max = 2000) => (typeof v === 'string' && v.length <= max ? v : '')

/** Turns a problem into a message the app can show. */
function fail(e: unknown): never {
  if (e instanceof HttpsError) throw e
  throw new HttpsError('failed-precondition', e instanceof Error ? e.message : 'Something went wrong.')
}

/** The UK banks Enable Banking can link. */
export const bankList = onCall({ secrets: [EB_APP_ID, EB_KEY] }, async req => {
  who(req)
  try {
    return { banks: await eb.banks(creds()) }
  } catch (e) {
    fail(e)
  }
})

/** Starts linking a UK bank: returns the bank's approval page. */
export const bankStart = onCall({ secrets: [EB_APP_ID, EB_KEY] }, async req => {
  const uid = who(req)
  const name = text(req.data?.bank, 200)
  const redirect = text(req.data?.redirect, 300)
  if (!name) throw new HttpsError('invalid-argument', 'Choose a bank.')
  if (!RETURN.some(r => r.test(redirect))) throw new HttpsError('invalid-argument', 'Finance can only be linked from its own page.')
  try {
    const bank = (await eb.banks(creds())).find(b => b.name === name)
    if (!bank) throw new HttpsError('not-found', `${name} isn’t on Enable Banking’s list.`)
    const state = randomBytes(16).toString('hex')
    await doc(uid).set({ pending: { state, at: Date.now() } }, { merge: true })
    return { url: await eb.start(creds(), bank, redirect, state) }
  } catch (e) {
    fail(e)
  }
})

/** Finishes linking with the code the bank sent back. */
export const bankFinish = onCall({ secrets: [EB_APP_ID, EB_KEY] }, async req => {
  const uid = who(req)
  const code = text(req.data?.code, 500)
  const state = text(req.data?.state, 100)
  const links = await load(uid)
  // Only the link this account started, and only for an hour.
  if (!code || !links.pending || links.pending.state !== state || Date.now() - links.pending.at > 3_600_000) {
    throw new HttpsError('failed-precondition', 'That link has expired — start it again from Settings.')
  }
  try {
    const session = await eb.finish(creds(), code)
    await doc(uid).set({ sessions: { [session.id]: session }, pending: FieldValue.delete() }, { merge: true })
    return { bank: session.bank, accounts: session.accounts.length }
  } catch (e) {
    fail(e)
  }
})

/** Connects SimpleFIN with a one-time setup token. */
export const simplefinConnect = onCall(async req => {
  const uid = who(req)
  const token = text(req.data?.token, 2000)
  if (!token) throw new HttpsError('invalid-argument', 'Paste the setup token from SimpleFIN.')
  try {
    const access = await sf.claim(token)
    await doc(uid).set({ simplefin: access }, { merge: true })
    return { ok: true }
  } catch (e) {
    fail(e)
  }
})

/** Every linked account's balances now. */
export const bankBalances = onCall({ secrets: [EB_APP_ID, EB_KEY] }, async req => {
  const uid = who(req)
  const links = await load(uid)
  const accounts: LinkedBalance[] = []
  const problems: string[] = []
  const add = (r: { accounts: LinkedBalance[]; problems: string[] }) => {
    accounts.push(...r.accounts)
    problems.push(...r.problems)
  }
  const jobs: Promise<void>[] = []
  if (links.simplefin) jobs.push(sf.balances(links.simplefin).then(add, () => { problems.push('SimpleFIN didn’t answer.') }))
  for (const s of Object.values(links.sessions ?? {})) {
    jobs.push(eb.balances(creds(), s).then(add, () => { problems.push(`${s.bank} didn’t answer.`) }))
  }
  await Promise.all(jobs)
  return { accounts, problems }
})

/** Removes a link: "sf", or "eb:<session id>". */
export const bankUnlink = onCall({ secrets: [EB_APP_ID, EB_KEY] }, async req => {
  const uid = who(req)
  const connection = text(req.data?.connection, 200)
  if (connection === 'sf') {
    await doc(uid).set({ simplefin: FieldValue.delete() }, { merge: true })
  } else if (connection.startsWith('eb:')) {
    const id = connection.slice(3)
    await eb.end(creds(), id)
    await doc(uid).update({ [`sessions.${id}`]: FieldValue.delete() }).catch(() => undefined)
  } else {
    throw new HttpsError('invalid-argument', 'Unknown link.')
  }
  return { ok: true }
})
