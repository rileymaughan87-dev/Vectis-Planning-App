// SimpleFIN Bridge (bridge.simplefin.org) — read-only balances from US
// banks and brokers (America First, Fidelity). You connect your banks on
// SimpleFIN's own site, then give Finance a one-time setup token; that's
// swapped here for an access address, which only this server keeps.

import type { LinkedBalance } from './types.js'

/** Turns a setup token into the claim address it holds (base64 of an https address on simplefin.org). */
export function claimURL(token: string): URL {
  let text: string
  try {
    text = Buffer.from(token.trim(), 'base64').toString('utf8').trim()
  } catch {
    throw new Error('That doesn’t look like a SimpleFIN setup token.')
  }
  let url: URL
  try {
    url = new URL(text)
  } catch {
    throw new Error('That doesn’t look like a SimpleFIN setup token.')
  }
  // Only ever talk to SimpleFIN itself.
  if (url.protocol !== 'https:' || !(url.hostname === 'simplefin.org' || url.hostname.endsWith('.simplefin.org'))) {
    throw new Error('That token isn’t from SimpleFIN.')
  }
  return url
}

/** Swaps a setup token for the access address (each token works once). */
export async function claim(token: string): Promise<string> {
  const res = await fetch(claimURL(token), { method: 'POST', headers: { 'Content-Length': '0' } })
  if (res.status === 403) throw new Error('That setup token has already been used. Make a new one on SimpleFIN and paste that.')
  if (!res.ok) throw new Error(`SimpleFIN said no (${res.status}).`)
  const access = (await res.text()).trim()
  const url = new URL(access)
  if (url.protocol !== 'https:' || !url.username) throw new Error('SimpleFIN sent back something unexpected.')
  return access
}

/** The access address split into where to ask and how to sign in (fetch won't take a password in the address). */
function split(access: string): { base: string; auth: string } {
  const url = new URL(access)
  const auth = Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString('base64')
  url.username = ''
  url.password = ''
  return { base: url.toString().replace(/\/$/, ''), auth: `Basic ${auth}` }
}

interface SFAccount {
  id?: unknown
  name?: unknown
  currency?: unknown
  balance?: unknown
  'available-balance'?: unknown
  'balance-date'?: unknown
  org?: { name?: unknown; domain?: unknown }
}

/** Reads SimpleFIN's account list into the shared shape. */
export function readAccounts(body: { accounts?: SFAccount[]; errors?: unknown[] }): { accounts: LinkedBalance[]; problems: string[] } {
  const accounts: LinkedBalance[] = []
  for (const a of body.accounts ?? []) {
    if (typeof a.id !== 'string') continue
    const balances: LinkedBalance['balances'] = []
    const current = Number(a.balance)
    if (a.balance !== undefined && Number.isFinite(current)) balances.push({ type: 'current', amount: current })
    const available = Number(a['available-balance'])
    if (a['available-balance'] !== undefined && Number.isFinite(available)) balances.push({ type: 'available', amount: available })
    const at = Number(a['balance-date'])
    accounts.push({
      key: `sf:${a.id}`,
      connection: 'sf',
      source: 'simplefin',
      institution: typeof a.org?.name === 'string' ? a.org.name : typeof a.org?.domain === 'string' ? a.org.domain : 'US bank',
      name: typeof a.name === 'string' && a.name.trim() ? a.name.trim() : 'Account',
      // SimpleFIN uses an ISO code, or a URL for things that aren't money (points).
      currency: typeof a.currency === 'string' && /^[A-Z]{3}$/.test(a.currency) ? a.currency : 'USD',
      balances,
      at: Number.isFinite(at) && at > 0 ? new Date(at * 1000).toISOString() : new Date().toISOString(),
    })
  }
  const problems = (body.errors ?? []).filter((e): e is string => typeof e === 'string')
  return { accounts, problems }
}

/** Today's balances (no transactions). */
export async function balances(access: string): Promise<{ accounts: LinkedBalance[]; problems: string[] }> {
  const { base, auth } = split(access)
  const res = await fetch(`${base}/accounts?balances-only=1`, { headers: { Authorization: auth } })
  if (res.status === 403) return { accounts: [], problems: ['SimpleFIN access was turned off — connect SimpleFIN again in Settings.'] }
  if (!res.ok) return { accounts: [], problems: [`SimpleFIN didn’t answer (${res.status}).`] }
  return readAccounts(await res.json())
}
