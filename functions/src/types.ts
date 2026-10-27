/** One linked bank account and what the bank says is in it — the same shape Finance reads (finance/src/model/bankLink.ts). */
export interface LinkedBalance {
  /** Stays the same when the link is renewed: "eb:<hash>" or "sf:<id>". Finance matches its accounts by this. */
  key: string
  /** Which link it came through, for unlinking: "sf", or "eb:<session id>". */
  connection: string
  source: 'enableBanking' | 'simplefin'
  institution: string
  name: string
  currency: string
  /** Every balance the bank gave (booked, available…), signed: negative is money owed. Finance picks one. */
  balances: { type: string; amount: number }[]
  /** When the bank last worked it out. */
  at: string
  /** When the link needs renewing (UK banks ask every 90 days or so). */
  expires?: string
}
