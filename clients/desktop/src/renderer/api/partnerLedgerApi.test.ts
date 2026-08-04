import { describe, expect, it, vi } from 'vitest'
import { buildPartnerLedgerLines, mapLedgerSnapshotResponse } from './partnerLedgerApi'
import { apiClient } from './client'
import { getLedgerData } from './partnerLedgerApi'

vi.mock('./client', () => ({ apiClient: { get: vi.fn() } }))

describe('partner ledger adapter', () => {
  it('상세 응답의 거래처 사업자번호를 상세·인쇄 모델로 전달한다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: {
      partnerCode: 'P-0005', partnerName: '대구HVAC솔루션', partnerBusinessNo: '165-35-10155',
      periodFrom: '2026-07-01', periodTo: '2026-07-31', documents: [],
    } } })

    const result = await getLedgerData('P-0005', '2026-07-01', '2026-07-31')

    expect(result.partnerBusinessNo).toBe('165-35-10155')
  })

  it('keeps source order and computes a running debit-minus-credit balance', () => {
    const lines = buildPartnerLedgerLines([
      {
        type: 'SALE', documentNo: '2026/08/01-1', date: '2026-08-01', deliveryAddress: null,
        amount: '100', lines: [{ productName: 'A', modelName: null, quantity: 1,
          unitPriceWithVat: '100', lineAmount: '100' }],
      },
      {
        type: 'CASH_RECEIPT', documentNo: '2026/08/02-1', date: '2026-08-02', deliveryAddress: null,
        amount: '40', lines: [],
      },
    ])

    expect(lines.map((line) => line.balance)).toEqual(['100', '60'])
    expect(lines.map((line) => line.journalNo)).toEqual(['2026/08/01-1', '2026/08/02-1'])
  })

  it('orders same-day unpadded document numbers numerically before computing balances', () => {
    const lines = buildPartnerLedgerLines([
      {
        type: 'SALE', documentNo: '2026/08/01-10', date: '2026-08-01', deliveryAddress: null,
        amount: '100', lines: [{ productName: 'ten', modelName: null, quantity: 1,
          unitPriceWithVat: '100', lineAmount: '100' }],
      },
      {
        type: 'CASH_RECEIPT', documentNo: '2026/08/01-2', date: '2026-08-01', deliveryAddress: null,
        amount: '40', lines: [],
      },
    ])

    expect(lines.map((line) => line.journalNo)).toEqual(['2026/08/01-2', '2026/08/01-10'])
    expect(lines.map((line) => line.balance)).toEqual(['-40', '60'])
  })

  it('현재 화면과 신규 snapshot 복원의 행 수·금액을 동일하게 유지한다', () => {
    const documents = [{
      type: 'SALE' as const,
      documentNo: '2026/08/01-1',
      date: '2026-08-01',
      partnerCode: 'P-001',
      partnerName: '거래처',
      deliveryAddress: null,
      amount: '100',
      lines: [{ productName: 'A', modelName: 'M-1', quantity: 1,
        unitPriceWithVat: '100', lineAmount: '100' }],
    }]
    const currentLines = buildPartnerLedgerLines(documents)
    const restored = mapLedgerSnapshotResponse({
      partnerCode: 'P-001', partnerName: '거래처', partnerBusinessNo: '', chatRoomNames: [],
      periodFrom: '2026-08-01', periodTo: '2026-08-31', documents, lines: [],
    })

    expect(restored.lines).toEqual(currentLines)
    expect(restored.lines).toHaveLength(1)
    expect(restored.lines[0].debit).toBe('100')
  })

  it('구형 line snapshot은 documents가 없어도 행과 금액을 그대로 복원한다', () => {
    const legacyLine = {
      date: '2026-08-01', journalNo: 'J-001', accountCode: '110', accountName: '외상매출금',
      description: '구형 원장', debit: '100', credit: '0', balance: '100',
    }
    const restored = mapLedgerSnapshotResponse({
      partnerCode: 'P-001', partnerName: '구형 거래처', partnerBusinessNo: '', chatRoomNames: [],
      periodFrom: '2026-08-01', periodTo: '2026-08-31', documents: [], lines: [legacyLine],
    })

    expect(restored.lines).toEqual([legacyLine])
    expect(restored.lines[0].debit).toBe('100')
  })
})
