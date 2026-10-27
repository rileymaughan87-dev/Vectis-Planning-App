import { createVerify, generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { accountName, readBalances, token } from './enableBanking.js'
import { claimURL, readAccounts } from './simplefin.js'

describe('SimpleFIN', () => {
  it('reads a setup token, and only from simplefin.org', () => {
    const ok = Buffer.from('https://beta-bridge.simplefin.org/simplefin/claim/abc').toString('base64')
    expect(claimURL(ok).pathname).toBe('/simplefin/claim/abc')
    expect(() => claimURL(Buffer.from('https://evil.example/claim').toString('base64'))).toThrow()
    expect(() => claimURL(Buffer.from('http://bridge.simplefin.org/claim').toString('base64'))).toThrow()
    expect(() => claimURL('not a token')).toThrow()
  })

  it('reads balances, owed as negative', () => {
    const r = readAccounts({
      errors: ['Fidelity needs you to sign in again'],
      accounts: [
        { id: 'a1', name: 'Checking', currency: 'USD', balance: '1234.50', 'available-balance': '1200.00', 'balance-date': 1793000000, org: { name: 'America First Credit Union' } },
        { id: 'a2', name: 'Visa', currency: 'USD', balance: '-310.25', 'balance-date': 1793000000, org: { domain: 'americafirst.com' } },
      ],
    })
    expect(r.problems).toEqual(['Fidelity needs you to sign in again'])
    expect(r.accounts[0]).toMatchObject({ key: 'sf:a1', institution: 'America First Credit Union', balances: [{ type: 'current', amount: 1234.5 }, { type: 'available', amount: 1200 }] })
    expect(r.accounts[1].balances).toEqual([{ type: 'current', amount: -310.25 }])
  })
})

describe('Enable Banking', () => {
  it('signs its token with the app key', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const jwt = token({ appID: 'app-1', key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() }, 1_700_000_000_000)
    const [h, p, s] = jwt.split('.')
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ typ: 'JWT', alg: 'RS256', kid: 'app-1' })
    expect(JSON.parse(Buffer.from(p, 'base64url').toString())).toMatchObject({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: 1_700_000_000 })
    const v = createVerify('RSA-SHA256')
    v.update(`${h}.${p}`)
    expect(v.verify(publicKey, s, 'base64url')).toBe(true)
  })

  it('signs debits negative and keeps every balance', () => {
    const r = readBalances([
      { balance_amount: { amount: '812.40', currency: 'GBP' }, balance_type: 'ITBD', last_change_date_time: '2026-10-27T09:00:00Z' },
      { balance_amount: { amount: '120', currency: 'GBP' }, balance_type: 'CLBD', credit_debit_indicator: 'DBIT' },
      { balance_amount: { amount: 'x' }, balance_type: 'ITAV' },
    ])
    expect(r.balances).toEqual([{ type: 'ITBD', amount: 812.4 }, { type: 'CLBD', amount: -120 }])
    expect(r.at).toBe('2026-10-27T09:00:00Z')
  })

  it('names an account', () => {
    expect(accountName({ uid: '1', name: 'Advance Account' })).toBe('Advance Account')
    expect(accountName({ uid: '1', account_id: { iban: 'GB29 NWBK 6016 1331 9268 19' } })).toBe('Account ••6819')
    expect(accountName({ uid: '1' })).toBe('Account')
  })
})
