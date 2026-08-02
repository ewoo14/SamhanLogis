import { describe, expect, it } from 'vitest'
import { buildPartnerLedgerLines } from './partnerLedgerApi'

describe('partner ledger adapter', () => {
  it('keeps source order and computes a running debit-minus-credit balance', () => {
    const lines = buildPartnerLedgerLines([
      {
        type: 'SALE', documentNo: 'S-1', date: '2026-08-01', deliveryAddress: null,
        amount: '100', lines: [{ productName: 'A', modelName: null, quantity: 1,
          unitPriceWithVat: '100', lineAmount: '100' }],
      },
      {
        type: 'CASH_RECEIPT', documentNo: 'R-1', date: '2026-08-02', deliveryAddress: null,
        amount: '40', lines: [],
      },
    ])

    expect(lines.map((line) => line.balance)).toEqual(['100', '60'])
    expect(lines.map((line) => line.journalNo)).toEqual(['S-1', 'R-1'])
  })
})
