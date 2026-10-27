import { describe, expect, it } from 'vitest'
import type { Account, Audit, MoneyData } from './accounts'
import { bankAudit, pickBalance, renewNote, withBankAudits, type LinkedBalance } from './bankLink'

const linked = (balances: LinkedBalance['balances']): LinkedBalance => ({
  key: 'eb:1', connection: 'eb:s', source: 'enableBanking', institution: 'HSBC', name: 'Current', currency: 'GBP', balances, at: '2026-10-27T09:00:00Z',
})
const acc = (over: Partial<Account> = {}): Account => ({ id: 'a', name: 'HSBC', kind: 'current', createdDate: '2026-10-01T00:00:00Z', primary: true, ...over })
const data = (accounts: Account[]): MoneyData => ({ accounts, goals: [], events: [], spending: [], transfers: [] })

describe('live balances', () => {
  it('prefers the booked balance, and owed accounts read positive', () => {
    const b = linked([{ type: 'ITAV', amount: 2500 }, { type: 'ITBD', amount: 812.4 }])
    expect(pickBalance(b, { kind: 'current' })).toBe(812.4)
    expect(pickBalance(linked([{ type: 'current', amount: -310.25 }]), { kind: 'credit' })).toBe(310.25)
    expect(pickBalance(linked([]), { kind: 'current' })).toBeNull()
  })

  it('records a check, with the gap from what was expected', () => {
    const a = acc()
    const audits: Audit[] = [{ id: 'x', accountID: 'a', date: '2026-10-20T12:00:00Z', balance: 1000 }]
    const r = bankAudit(a, 900, audits, data([a]), new Date('2026-10-27T12:00:00Z'))
    expect(r).toEqual({ balance: 900, expected: 1000, gap: 'everyday' })
  })

  it("replaces today's bank check rather than adding another, and skips an unchanged one", () => {
    const a = acc()
    const audits: Audit[] = [
      { id: 'x', accountID: 'a', date: '2026-10-20T12:00:00Z', balance: 1000 },
      { id: 'b', accountID: 'a', date: '2026-10-27T08:00:00Z', balance: 950, source: 'bank' },
    ]
    const now = new Date('2026-10-27T12:00:00Z')
    expect(bankAudit(a, 950, audits, data([a]), now)).toBeNull()
    const r = bankAudit(a, 900, audits, data([a]), now)!
    expect(r).toMatchObject({ replaces: 'b', expected: 1000 })
    const next = withBankAudits(audits, [{ accountID: 'a', audit: r }], now, () => 'n')
    expect(next.map(x => x.id)).toEqual(['x', 'n'])
    expect(next[1]).toMatchObject({ balance: 900, source: 'bank' })
  })

  it('says when a link needs renewing', () => {
    const now = new Date('2026-10-27T12:00:00Z')
    expect(renewNote({ expires: '2027-01-20T00:00:00Z' }, now)).toBeNull()
    expect(renewNote({ expires: '2026-11-05T00:00:00Z' }, now)).toMatch(/^Renew by/)
    expect(renewNote({ expires: '2026-10-01T00:00:00Z' }, now)).toBe('Link expired')
  })
})
