// Finance's saved data, under its own "finance:" prefix so it never meets
// Planner's entries on the same website. File names match the iPhone app.

import { createBackups } from '@suite/backup'
import { createStorage } from '@suite/storage'

export const Filename = {
  appearance: 'appearance.json',
  financeEvents: 'finance_events.json',
  financeGoals: 'finance_goals.json',
  spendingEntries: 'spending_entries.json',
  spendingPot: 'spending_pot.json',
} as const

export const storage = createStorage('finance:', 'Finance')
export const backups = createBackups(storage, 'finance-backup', 'finance', 'Finance')
