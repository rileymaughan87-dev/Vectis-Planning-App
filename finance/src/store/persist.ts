// Finance's saved data, under its own "finance:" prefix so it never meets
// Planner's entries on the same website. File names match the iPhone app.

import { createBackups } from '@suite/backup'
import { createStorage } from '@suite/storage'

export const Filename = {
  financeEvents: 'finance_events.json',
  financeGoals: 'finance_goals.json',
  spendingEntries: 'spending_entries.json',
  spendingPot: 'spending_pot.json',
  /** Web-only: accounts and their audits (model/accounts.ts). */
  accounts: 'accounts.json',
  accountAudits: 'account_audits.json',
  /** Web-only: money moved between your accounts (international mode). */
  transfers: 'transfers.json',
  /** Web-only: currency choice. */
  preferences: 'preferences.json',
  /** Web-only, this device only: the last daily exchange rates fetched (store/rates.ts). */
  rates: 'rates.json',
} as const

export const storage = createStorage('finance:', 'Finance')
export const backups = createBackups(storage, 'finance-backup', 'finance', 'Finance')
