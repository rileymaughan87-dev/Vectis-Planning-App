// Live balances: talks to the server's bank functions (functions/src)
// through Firebase, using the sync sign-in, and turns what comes back
// into balance checks (model/bankLink.ts). Firebase is only downloaded
// when this is first used.

import { firebaseConfig } from '@suite/sync/store'
import { newID } from '@suite/ids'
import { create } from 'zustand'
import { bankAudit, pickBalance, type BankAudit, type LinkedBalance } from '../model/bankLink'
import { useAccounts } from './accounts'
import { useEntries } from './entries'
import { useGoals } from './goals'
import { useSpending } from './spending'

const REGION = 'europe-west2'
/** When balances were last fetched (this device), so opening the app doesn't ask the banks every time. */
const CHECKED_KEY = 'finance:bank:checked'
const FRESH_MS = 30 * 60_000

export interface UKBank { name: string; country: string; days: number }

async function call<T>(name: string, data?: unknown): Promise<T> {
  const config = firebaseConfig()
  if (!config) throw new Error('Live balances need sync, which isn’t set up in this copy of Finance.')
  const [{ getApps, initializeApp }, { getAuth }, { getFunctions, httpsCallable }] = await Promise.all([
    import('firebase/app'), import('firebase/auth'), import('firebase/functions'),
  ])
  const app = getApps()[0] ?? initializeApp(config)
  const auth = getAuth(app)
  await auth.authStateReady()
  if (!auth.currentUser) throw new Error('Sign in under Sync first — live balances use the same sign-in.')
  try {
    return (await httpsCallable<unknown, T>(getFunctions(app, REGION), name)(data)).data
  } catch (e) {
    const code = (e as { code?: string }).code
    // Not deployed yet: the call can't find the function (or, from a browser, fails as "internal").
    if (code === 'functions/not-found' || code === 'functions/internal') {
      throw new Error('The live-balances server didn’t answer. If it isn’t set up yet, see docs/live-balances.md.')
    }
    throw new Error(e instanceof Error && e.message ? e.message : 'Something went wrong.')
  }
}

interface BankState {
  phase: 'idle' | 'loading' | 'ready' | 'error'
  linked: LinkedBalance[]
  /** Banks that didn't answer, links that need renewing. */
  problems: string[]
  error?: string
  checkedAt?: number
  /** Asks every linked bank for today's balance and records a check on each matched account. */
  refresh(): Promise<void>
  /** Only if it's been a while (opening the app). */
  refreshIfStale(): void
  ukBanks(): Promise<UKBank[]>
  /** Goes to the bank's approval page; the bank sends you back to Finance. */
  linkUK(bank: string): Promise<void>
  /** Back from the bank: finishes the link. Returns what was linked. */
  finishUK(code: string, state: string): Promise<string>
  connectSimplefin(token: string): Promise<void>
  unlink(connection: string): Promise<void>
}

const readChecked = () => {
  try {
    return Number(localStorage.getItem(CHECKED_KEY)) || undefined
  } catch {
    return undefined
  }
}

export const useBank = create<BankState>()((set, get) => ({
  phase: 'idle',
  linked: [],
  problems: [],
  checkedAt: readChecked(),

  refresh: async () => {
    set({ phase: 'loading', error: undefined })
    try {
      const r = await call<{ accounts: LinkedBalance[]; problems: string[] }>('bankBalances')
      const now = Date.now()
      try {
        localStorage.setItem(CHECKED_KEY, String(now))
      } catch {
        // Just asks again next time.
      }
      set({ phase: 'ready', linked: r.accounts, problems: r.problems, checkedAt: now })
      applyBalances(r.accounts)
    } catch (e) {
      set({ phase: 'error', error: e instanceof Error ? e.message : String(e) })
    }
  },

  refreshIfStale: () => {
    const { phase, checkedAt } = get()
    if (phase === 'loading') return
    if (!useAccounts.getState().accounts.some(a => a.link)) return
    if (checkedAt && Date.now() - checkedAt < FRESH_MS) return
    void get().refresh()
  },

  ukBanks: async () => (await call<{ banks: UKBank[] }>('bankList')).banks,

  linkUK: async bank => {
    const { url } = await call<{ url: string }>('bankStart', { bank, redirect: location.origin + location.pathname })
    location.assign(url)
  },

  finishUK: async (code, state) => {
    const r = await call<{ bank: string; accounts: number }>('bankFinish', { code, state })
    await get().refresh()
    return `${r.bank}: ${r.accounts} account${r.accounts === 1 ? '' : 's'} linked`
  },

  connectSimplefin: async token => {
    await call('simplefinConnect', { token: token.trim() })
    await get().refresh()
  },

  unlink: async connection => {
    await call('bankUnlink', { connection })
    const gone = new Set(get().linked.filter(b => b.connection === connection).map(b => b.key))
    // Accounts that followed it go back to being checked by hand (their history stays).
    const { accounts, updateAccount } = useAccounts.getState()
    for (const a of accounts) if (a.link && gone.has(a.link)) updateAccount({ ...a, link: undefined })
    set(s => ({ linked: s.linked.filter(b => b.connection !== connection) }))
  },
}))

/** Records a balance check on each account that follows a linked bank account. */
function applyBalances(linked: LinkedBalance[]) {
  const { accounts, audits, transfers, applyBankChecks } = useAccounts.getState()
  const data = {
    accounts, transfers,
    goals: useGoals.getState().goals,
    events: useEntries.getState().events,
    spending: useSpending.getState().entries,
  }
  const checks: { accountID: string; audit: BankAudit }[] = []
  for (const a of accounts) {
    const b = a.link ? linked.find(x => x.key === a.link) : undefined
    const balance = b ? pickBalance(b, a) : null
    if (balance === null) continue
    const audit = bankAudit(a, balance, audits, data)
    if (audit) checks.push({ accountID: a.id, audit })
  }
  if (checks.length) applyBankChecks(checks, newID)
}
