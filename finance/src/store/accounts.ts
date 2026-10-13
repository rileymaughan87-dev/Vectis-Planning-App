// Accounts and their audits (model/accounts.ts). Saved to accounts.json and
// account_audits.json whenever they change.

import { toISO } from '@suite/dates'
import { newID } from '@suite/ids'
import { create } from 'zustand'
import { decodeAccounts, decodeAudits, decodeTransfers, type Account, type AccountKind, type Audit, type GapNote, type Transfer } from '../model/accounts'
import { Filename, storage } from './persist'

interface AccountsState {
  accounts: Account[]
  audits: Audit[]
  transfers: Transfer[]
  /** A new account, starting from what's in it (or owed) today; `currency` only in international mode. */
  addAccount(name: string, kind: AccountKind, balance: number, currency?: string): void
  /** Money moved from one account to another, each side in its own currency. */
  addTransfer(transfer: Omit<Transfer, 'id'>): void
  deleteTransfer(id: string): void
  updateAccount(account: Account): void
  /** Makes this the current account pay and bills go through. */
  makePrimary(id: string): void
  /** Removes the account and its audit history. */
  deleteAccount(id: string): void
  /** Records what the bank says now, with what was expected and what any gap was put down to. */
  audit(accountID: string, balance: number, expected: number | undefined, gap: GapNote | undefined): void
  deleteAudit(id: string): void
}

export const useAccounts = create<AccountsState>()(set => ({
  accounts: decodeAccounts(storage.loadRaw(Filename.accounts)),
  audits: decodeAudits(storage.loadRaw(Filename.accountAudits)),
  transfers: decodeTransfers(storage.loadRaw(Filename.transfers)),
  addTransfer: t => set(s => ({ transfers: [...s.transfers, { ...t, id: newID() }] })),
  deleteTransfer: id => set(s => ({ transfers: s.transfers.filter(t => t.id !== id) })),
  addAccount: (name, kind, balance, currency) => {
    const id = newID()
    const now = toISO(new Date())
    set(s => ({
      accounts: [...s.accounts, { id, name: name.trim(), kind, createdDate: now, primary: false, ...(currency ? { currency } : {}) }],
      audits: [...s.audits, { id: newID(), accountID: id, date: now, balance }],
    }))
  },
  updateAccount: account => set(s => ({ accounts: s.accounts.map(a => (a.id === account.id ? account : a)) })),
  makePrimary: id => set(s => ({ accounts: s.accounts.map(a => ({ ...a, primary: a.id === id })) })),
  deleteAccount: id => set(s => ({
    accounts: s.accounts.filter(a => a.id !== id),
    audits: s.audits.filter(a => a.accountID !== id),
    transfers: s.transfers.filter(t => t.fromAccountID !== id && t.toAccountID !== id),
  })),
  audit: (accountID, balance, expected, gap) =>
    set(s => ({ audits: [...s.audits, { id: newID(), accountID, date: toISO(new Date()), balance, expected, gap }] })),
  deleteAudit: id => set(s => ({ audits: s.audits.filter(a => a.id !== id) })),
}))

useAccounts.subscribe((state, prev) => {
  if (state.accounts !== prev.accounts) storage.saveRaw(Filename.accounts, state.accounts)
  if (state.audits !== prev.audits) storage.saveRaw(Filename.accountAudits, state.audits)
  if (state.transfers !== prev.transfers) storage.saveRaw(Filename.transfers, state.transfers)
})
