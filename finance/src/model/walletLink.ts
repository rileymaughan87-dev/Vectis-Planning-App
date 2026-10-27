// Logging spending from Apple Wallet (Oct 2026). An iPhone Shortcuts
// automation on "Transaction" opens Finance with the payment in the link:
//
//   …/finance/?log&amount=£12.50&note=Tesco&card=Monzo
//
// and the Log spending sheet opens filled in — you check it and tap once.
// The card picks the account: one whose "Apple Wallet card" name matches,
// else one whose name is in the card's (or the other way round), else, in
// international mode, one in the payment's currency.

import { spendableAccounts, spendingAccount, type Account } from './accounts'
import { parseAmount } from './money'

export interface WalletLog {
  amount?: number
  note: string
  card: string
  /** The currency the amount was written in, if it says ("$4.99", "12.50 USD"). */
  currency?: string
}

const SYMBOLS: Record<string, string> = { '£': 'GBP', '$': 'USD', '€': 'EUR', '¥': 'JPY' }

/** Reads a log link's details; null when the link isn't a log link. */
export function readLogLink(search: string): WalletLog | null {
  const p = new URLSearchParams(search)
  if (!p.has('log')) return null
  const rawAmount = (p.get('amount') ?? '').trim()
  const code = /\b([A-Z]{3})\b/.exec(rawAmount)?.[1] ?? Object.entries(SYMBOLS).find(([s]) => rawAmount.includes(s))?.[1]
  const amount = rawAmount ? parseAmount(rawAmount) : null
  return {
    amount: amount !== null && amount !== 0 ? Math.abs(amount) : undefined,
    note: (p.get('note') ?? p.get('merchant') ?? '').trim().slice(0, 80),
    card: (p.get('card') ?? '').trim(),
    currency: code,
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** The account a Wallet card's payment comes from. */
export function accountForCard(log: WalletLog, accounts: Account[], currencyOf: (a: Account) => string, international: boolean): Account | undefined {
  const spendable = spendableAccounts(accounts)
  const card = norm(log.card)
  if (card) {
    const named = spendable.find(a => a.walletCard && norm(a.walletCard) === card)
      ?? spendable.find(a => {
        const name = norm(a.name)
        return name.length >= 3 && (card.includes(name) || name.includes(card))
      })
    if (named) return named
  }
  if (international && log.currency) {
    const main = spendingAccount(accounts)
    if (main && currencyOf(main) === log.currency) return main
    const inCurrency = spendable.find(a => currencyOf(a) === log.currency)
    if (inCurrency) return inCurrency
  }
  return accounts.find(a => a.everyday) ?? spendingAccount(accounts)
}
