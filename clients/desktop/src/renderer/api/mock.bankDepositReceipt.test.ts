import { describe, expect, it } from 'vitest'
import type { AxiosRequestConfig } from 'axios'
import { getMockResponse } from './mock'

type MockEnvelope<T> = {
  success: boolean
  data: T
}

function mockRequest(config: AxiosRequestConfig): unknown {
  return getMockResponse(config)
}

describe('mock bank deposit receipt contract', () => {
  it('POST /accounting/cash-receipts/from-bank-transactions 는 합산 BANK_LINKED 응답과 통장거래 REFLECTED 미러를 반환한다', () => {
    const created = mockRequest({
      method: 'POST',
      url: '/accounting/cash-receipts/from-bank-transactions',
      data: {
        transactions: [
          {
            bankAccountLabel: '국민 123-456',
            transactedAt: '2026-06-23T09:10:00',
            amount: 1500000,
            externalRef: 'mock-bank-20260623-001',
          },
          {
            bankAccountLabel: '국민 123-456',
            transactedAt: '2026-06-24T10:05:00',
            amount: 2500000,
            externalRef: 'mock-bank-20260624-004',
          },
        ],
        transactionDate: '2026-06-24',
        debitAccountCode: '1039',
        creditAccountCode: '1089',
        memo: 'mock 벌크 생성',
      },
    }) as MockEnvelope<{
      id: null
      kind: string
      status: string
      slipNo: string
      journalNo: string
      amount: string
    }>

    expect(created.success).toBe(true)
    expect(created.data).toMatchObject({
      id: null,
      kind: 'BANK_LINKED',
      status: 'CONFIRMED',
      amount: '4000000',
      debitAccountCode: '1039',
      creditAccountCode: '1089',
    })
    expect(created.data.slipNo).toMatch(/^\d{4}\/\d{2}\/\d{2}-[1-9]\d*$/)
    expect(created.data.journalNo).toMatch(/^\d{4}\/\d{2}\/\d{2}-[1-9]\d*$/)

    const rows = mockRequest({
      method: 'GET',
      url: '/accounting/bank-transactions',
      params: { matchStatus: 'REFLECTED', from: '2026-06-23', to: '2026-06-24' },
    }) as MockEnvelope<Array<{ externalRef: string; matchStatus: string; cashReceiptSlipNo?: string | null }>>

    const reflectedRefs = new Set(
      rows.data
        .filter((row) => row.cashReceiptSlipNo === created.data.slipNo)
        .map((row) => row.externalRef),
    )
    expect(reflectedRefs).toEqual(new Set(['mock-bank-20260623-001', 'mock-bank-20260624-004']))
  })

  it('POST /from-bank-transactions 는 거래처 혼재를 409로 표면화한다', () => {
    const conflict = mockRequest({
      method: 'POST',
      url: '/accounting/cash-receipts/from-bank-transactions',
      data: {
        transactions: [
          {
            bankAccountLabel: '하나 555-111',
            transactedAt: '2026-06-24T12:00:00',
            amount: 900000,
            externalRef: 'mock-bank-20260624-005',
          },
          {
            bankAccountLabel: '우리 444-222',
            transactedAt: '2026-06-24T13:00:00',
            amount: 700000,
            externalRef: 'mock-bank-20260624-006',
          },
        ],
        transactionDate: '2026-06-24',
      },
    }) as { __mockStatus: number; body: { code: string; message: string } }

    expect(conflict.__mockStatus).toBe(409)
    expect(conflict.body.code).toBe('CONFLICT')
    expect(conflict.body.message).toContain('동일 거래처')
  })
  it('POST /from-bank-transactions rejects more than 100 selected transactions', () => {
    const rejected = mockRequest({
      method: 'POST',
      url: '/accounting/cash-receipts/from-bank-transactions',
      data: {
        transactions: Array.from({ length: 101 }, (_, index) => ({
          bankAccountLabel: 'bulk-limit',
          transactedAt: `2026-06-24T10:${String(index % 60).padStart(2, '0')}:00`,
          amount: 1000 + index,
          externalRef: `bulk-limit-${index}`,
        })),
        transactionDate: '2026-06-24',
      },
    }) as { __mockStatus: number; body: { code: string; message: string } }

    expect(rejected.__mockStatus).toBe(400)
    expect(rejected.body.code).toBe('INVALID_INPUT')
    expect(rejected.body.message).toContain('100')
  })
})
