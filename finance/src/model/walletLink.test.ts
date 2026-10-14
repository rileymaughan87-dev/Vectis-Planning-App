// Logging from Apple Wallet: the link's amount, shop and card, and which account the card is.
import { toISO } from '@suite/dates'
import { describe, expect, it } from 'vitest'
import type { Account } from './accounts'
import { accountForCard, readLogLink } from './walletLink'

const acc = (id: string, name: string, kind: Account['kind'], extra: Partial<Account> = {}): Account =>
  ({ id, name, kind, createdDate: toISO(new Date(2026, 9, 1)), primary: false, ...extra })
const monzo = acc('m', 'Monzo', 'current', { primary: true })
const chase = acc('c', 'Chase checking', 'current', { currency: 'USD' })
const amex = acc('a', 'Personal card', 'credit', { walletCard: 'Amex Gold' })
const accounts = [monzo, chase, amex]
const cur = (a: Account) => a.currency ?? 'GBP'

describe('logging from Apple Wallet', () => {
  it('reads the amount, shop, card and currency', () => {
    expect(readLogLink('?log&amount=%C2%A312.50&note=Tesco%20Express&card=Monzo')).toEqual({ amount: 12.5, note: 'Tesco Express', card: 'Monzo', currency: 'GBP' })
    expect(readLogLink('?log&amount=%244.99&note=Starbucks&card=Chase')).toMatchObject({ amount: 4.99, currency: 'USD' })
    expect(readLogLink('?log')).toEqual({ amount: undefined, note: '', card: '', currency: undefined })
    expect(readLogLink('?tab=now')).toBeNull()
  })

  it('finds the card’s account: its Wallet name, its own name, then the currency', () => {
    expect(accountForCard({ note: '', card: 'Amex Gold', amount: 5 }, accounts, cur, true)?.id).toBe('a')
    expect(accountForCard({ note: '', card: 'Chase Checking Debit', amount: 5 }, accounts, cur, true)?.id).toBe('c')
    expect(accountForCard({ note: '', card: 'Some card', amount: 5, currency: 'USD' }, accounts, cur, true)?.id).toBe('c')
    expect(accountForCard({ note: '', card: 'Some card', amount: 5, currency: 'USD' }, accounts, cur, false)?.id).toBe('m')
  })
})
