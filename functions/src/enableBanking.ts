// Enable Banking (enablebanking.com) — read-only balances from UK banks
// (HSBC, Monzo) through Open Banking. You approve access on your bank's own
// site; the bank sends you back to Finance with a code, which is swapped
// here for a session. Its "restricted" free mode only reaches accounts
// you've linked in its control panel — yours.
// API: https://enablebanking.com/docs/api/reference/

import { createSign } from 'node:crypto'
import type { LinkedBalance } from './types.js'

const API = 'https://api.enablebanking.com'

export interface Credentials { appID: string; key: string }

/** The short-lived signed token every request carries (RS256, signed with the app's private key). */
export function token({ appID, key }: Credentials, now = Date.now()): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const iat = Math.floor(now / 1000)
  const head = `${b64({ typ: 'JWT', alg: 'RS256', kid: appID })}.${b64({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat, exp: iat + 3600 })}`
  const sign = createSign('RSA-SHA256')
  sign.update(head)
  return `${head}.${sign.sign(key.replace(/\\n/g, '\n'), 'base64url')}`
}

async function call<T>(creds: Credentials, path: string, init: { method?: string; body?: object } = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Bearer ${token(creds)}`, 'Content-Type': 'application/json' },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Enable Banking said no (${res.status})${text ? `: ${text.slice(0, 200)}` : ''}`)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

export interface Bank { name: string; country: string; days: number }

/** The UK banks you can link, with how long each lets access last. */
export async function banks(creds: Credentials, country = 'GB'): Promise<Bank[]> {
  const r = await call<{ aspsps: { name: string; country: string; maximum_consent_validity?: number; psu_types?: string[] }[] }>(
    creds, `/aspsps?country=${encodeURIComponent(country)}&psu_type=personal`,
  )
  return r.aspsps
    .filter(a => !a.psu_types || a.psu_types.includes('personal'))
    .map(a => ({ name: a.name, country: a.country, days: Math.max(1, Math.floor((a.maximum_consent_validity ?? 90 * 86400) / 86400)) }))
}

/** Starts linking: the address of the bank's own approval page. */
export async function start(creds: Credentials, bank: { name: string; country: string; days: number }, redirect: string, state: string): Promise<string> {
  const validUntil = new Date(Date.now() + Math.min(bank.days, 180) * 86_400_000).toISOString()
  const r = await call<{ url: string }>(creds, '/auth', {
    method: 'POST',
    body: { access: { valid_until: validUntil }, aspsp: { name: bank.name, country: bank.country }, state, redirect_url: redirect, psu_type: 'personal' },
  })
  return r.url
}

export interface EBAccount {
  uid: string
  identification_hash?: string
  name?: string | null
  details?: string | null
  product?: string | null
  currency?: string
  account_id?: { iban?: string; other?: { identification?: string } } | null
}

export interface Session {
  id: string
  bank: string
  validUntil?: string
  accounts: { uid: string; key: string; name: string; currency: string }[]
}

/** What to call an account: its own name, else its product, else "Account ••1234". */
export function accountName(a: EBAccount): string {
  const own = a.name?.trim() || a.product?.trim() || a.details?.trim()
  if (own) return own
  const number = a.account_id?.iban ?? a.account_id?.other?.identification
  return number ? `Account ••${number.replace(/\s/g, '').slice(-4)}` : 'Account'
}

/** Finishes linking with the code the bank sent back. */
export async function finish(creds: Credentials, code: string): Promise<Session> {
  const r = await call<{ session_id: string; accounts: EBAccount[]; aspsp?: { name: string }; access?: { valid_until?: string } }>(
    creds, '/sessions', { method: 'POST', body: { code } },
  )
  return {
    id: r.session_id,
    bank: r.aspsp?.name ?? 'Bank',
    validUntil: r.access?.valid_until,
    accounts: r.accounts.map(a => ({
      uid: a.uid,
      // The hash stays the same when the link is renewed (the uid doesn't).
      key: `eb:${a.identification_hash ?? a.uid}`,
      name: accountName(a),
      currency: a.currency ?? 'GBP',
    })),
  }
}

interface EBBalance {
  balance_amount?: { amount?: string | number; currency?: string }
  balance_type?: string
  credit_debit_indicator?: string
  last_change_date_time?: string
  reference_date?: string
}

/** Signed balances: debit (money owed) negative. */
export function readBalances(list: EBBalance[]): { balances: LinkedBalance['balances']; at?: string } {
  const balances: LinkedBalance['balances'] = []
  let at: string | undefined
  for (const b of list) {
    let amount = Number(b.balance_amount?.amount)
    if (!Number.isFinite(amount)) continue
    if (b.credit_debit_indicator === 'DBIT' && amount > 0) amount = -amount
    balances.push({ type: b.balance_type ?? 'unknown', amount })
    const when = b.last_change_date_time ?? b.reference_date
    if (when && (!at || when > at)) at = when
  }
  return { balances, at }
}

export async function balances(creds: Credentials, session: Session): Promise<{ accounts: LinkedBalance[]; problems: string[] }> {
  const accounts: LinkedBalance[] = []
  const problems: string[] = []
  if (session.validUntil && new Date(session.validUntil) < new Date()) {
    return { accounts, problems: [`${session.bank}: access has run out — link it again in Settings.`] }
  }
  for (const a of session.accounts) {
    try {
      const r = await call<{ balances: EBBalance[] }>(creds, `/accounts/${encodeURIComponent(a.uid)}/balances`)
      const { balances: list, at } = readBalances(r.balances ?? [])
      accounts.push({
        key: a.key, connection: `eb:${session.id}`, source: 'enableBanking', institution: session.bank, name: a.name,
        currency: a.currency, balances: list, at: at ?? new Date().toISOString(), expires: session.validUntil,
      })
    } catch (e) {
      problems.push(`${session.bank} · ${a.name}: ${e instanceof Error ? e.message : 'no answer'}`)
    }
  }
  return { accounts, problems }
}

export async function end(creds: Credentials, sessionID: string): Promise<void> {
  // Already gone at the bank's end is fine.
  await call(creds, `/sessions/${encodeURIComponent(sessionID)}`, { method: 'DELETE' }).catch(() => undefined)
}
