import { describe, expect, it } from 'vitest'
import type { BankTransactionRow } from '../api/accounting'
import {
  bankDepositReceiptDefaultFormState,
  bankDepositReceiptSelectionDisabledReason,
  bankDepositReceiptSelectionLimitExceeded,
  bankDepositReceiptSelectionSummary,
  bankDepositReceiptSelectedRows,
  bankDepositReceiptPrunedSelectedRowKeys,
  bankTransactionNaturalKeyFromRow,
  bankTransactionRowKey,
  buildBankDepositReceiptRequest,
  isBankDepositReceiptSelectable,
  MAX_BANK_DEPOSIT_RECEIPT_SELECTION,
} from './BankDepositReceiptModal.model'

function row(overrides: Partial<BankTransactionRow> = {}): BankTransactionRow {
  return {
    transactedAt: '2026-06-23T09:10:00',
    txnType: 'DEPOSIT',
    amount: '1500000',
    balanceAfter: '11500000',
    description: '삼한상사 입금',
    counterpartyName: '삼한상사',
    counterpartyAccount: null,
    bankAccountLabel: '국민 123-456',
    source: 'CSV_IMPORT',
    externalRef: 'mock-bank-20260623-001',
    matchStatus: 'UNREFLECTED',
    matchedPartnerCode: 'P-2026-0001',
    matchedBizNo: '1112233333',
    matchedPartnerName: '삼한상사',
    ...overrides,
  }
}

describe('BankDepositReceiptModal.model', () => {
  it('입금보고서 생성 가능한 통장 거래만 선택 가능하다', () => {
    expect(isBankDepositReceiptSelectable(row())).toBe(true)
    expect(isBankDepositReceiptSelectable(row({ matchStatus: 'REFLECTED', cashReceiptSlipNo: '2026/06/23-1' }))).toBe(false)
    expect(isBankDepositReceiptSelectable(row({ txnType: 'WITHDRAWAL' }))).toBe(false)
    expect(isBankDepositReceiptSelectable(row({ source: 'CODEF_LOAN' }))).toBe(false)
    expect(isBankDepositReceiptSelectable(row({ matchedPartnerName: null }))).toBe(false)
    expect(isBankDepositReceiptSelectable(row({ amount: '0' }))).toBe(false)
  })

  it('선택행에서 합산·동일 거래처·최신 거래일 기본값을 계산한다', () => {
    const rows = [
      row({ amount: '1500000', transactedAt: '2026-06-23T09:10:00' }),
      row({ amount: '2500000', transactedAt: '2026-06-25T08:05:00', externalRef: 'mock-bank-20260625-002' }),
    ]

    const summary = bankDepositReceiptSelectionSummary(rows)
    const form = bankDepositReceiptDefaultFormState(rows)

    expect(summary).toMatchObject({
      count: 2,
      totalAmount: 4000000,
      partnerName: '삼한상사',
      mixedPartner: false,
    })
    expect(form.transactionDate).toBe('2026-06-25')
    expect(form.debitAccountCode).toBe('1039')
    expect(form.creditAccountCode).toBe('1089')
  })

  it('refetch 후 선택 행이 REFLECTED로 바뀌면 선택 집합과 요약에서 제외한다', () => {
    const reflectedAfterRefetch = row({ matchStatus: 'REFLECTED', cashReceiptSlipNo: '2026/06/23-1' })
    const stillSelectable = row({
      amount: '2500000',
      transactedAt: '2026-06-25T08:05:00',
      externalRef: 'mock-bank-20260625-002',
    })
    const staleSelectedKeys = new Set([
      bankTransactionRowKey(reflectedAfterRefetch),
      bankTransactionRowKey(stillSelectable),
    ])

    const prunedKeys = bankDepositReceiptPrunedSelectedRowKeys(
      [reflectedAfterRefetch, stillSelectable],
      staleSelectedKeys,
    )
    const selectedRows = bankDepositReceiptSelectedRows(
      [reflectedAfterRefetch, stillSelectable],
      staleSelectedKeys,
    )
    const summary = bankDepositReceiptSelectionSummary(selectedRows)
    const payload = buildBankDepositReceiptRequest([reflectedAfterRefetch, stillSelectable], {
      transactionDate: '2026-06-30',
      debitAccountCode: '1029',
      creditAccountCode: '1089',
      memo: '',
    })

    expect(Array.from(prunedKeys)).toEqual([bankTransactionRowKey(stillSelectable)])
    expect(selectedRows).toEqual([stillSelectable])
    expect(summary).toMatchObject({
      count: 1,
      totalAmount: 2500000,
      mixedPartner: false,
    })
    expect(payload.transactions).toEqual([
      {
        bankAccountLabel: '국민 123-456',
        transactedAt: '2026-06-25T08:05:00',
        amount: 2500000,
        externalRef: 'mock-bank-20260625-002',
      },
    ])
  })

  it('BE DTO 자연키와 계정 override를 정확히 만든다', () => {
    const rows = [
      row({ amount: '1500000' }),
      row({ amount: '2500000', transactedAt: '2026-06-25T08:05:00', externalRef: 'mock-bank-20260625-002' }),
    ]

    const payload = buildBankDepositReceiptRequest(rows, {
      transactionDate: '2026-06-30',
      debitAccountCode: '1029',
      creditAccountCode: '1089',
      memo: '6월 운임 입금 일괄 반영',
    })

    expect(payload).toEqual({
      transactions: [
        {
          bankAccountLabel: '국민 123-456',
          transactedAt: '2026-06-23T09:10:00',
          amount: 1500000,
          externalRef: 'mock-bank-20260623-001',
        },
        {
          bankAccountLabel: '국민 123-456',
          transactedAt: '2026-06-25T08:05:00',
          amount: 2500000,
          externalRef: 'mock-bank-20260625-002',
        },
      ],
      transactionDate: '2026-06-30',
      debitAccountCode: '1029',
      creditAccountCode: '1089',
      memo: '6월 운임 입금 일괄 반영',
    })
  })

  it('거래처가 혼재되면 생성 불가 사유를 반환한다', () => {
    const summary = bankDepositReceiptSelectionSummary([
      row({ matchedPartnerCode: 'P-2026-0001', matchedPartnerName: '삼한상사' }),
      row({ matchedPartnerCode: 'P-2026-0002', matchedPartnerName: '아로물류 B', externalRef: 'mock-bank-20260625-002' }),
    ])

    expect(summary.mixedPartner).toBe(true)
    expect(summary.blockingMessage).toContain('동일 거래처')
  })

  it('rowKey 자연키와 BE 자연키는 source를 분리해 사용한다', () => {
    const sourceRow = row({ source: 'CODEF_BANK' })

    expect(bankTransactionNaturalKeyFromRow(sourceRow)).toEqual({
      bankAccountLabel: '국민 123-456',
      transactedAt: '2026-06-23T09:10:00',
      amount: 1500000,
      externalRef: 'mock-bank-20260623-001',
    })
  })
  it('selection preflight blocks more than the BE max size', () => {
    const withinLimit = Array.from({ length: MAX_BANK_DEPOSIT_RECEIPT_SELECTION }, (_, index) =>
      row({ externalRef: `mock-bank-within-${index}` }))
    const overLimit = Array.from({ length: MAX_BANK_DEPOSIT_RECEIPT_SELECTION + 1 }, (_, index) =>
      row({ externalRef: `mock-bank-over-${index}` }))

    expect(bankDepositReceiptSelectionLimitExceeded(withinLimit)).toBe(false)
    expect(bankDepositReceiptSelectionLimitExceeded(overLimit)).toBe(true)
  })

  it('selection disabled reason mirrors non-selectable row causes', () => {
    expect(bankDepositReceiptSelectionDisabledReason(row({ txnType: 'WITHDRAWAL' }))).toContain('출금')
    expect(bankDepositReceiptSelectionDisabledReason(row({ matchStatus: 'REFLECTED' }))).toContain('반영')
    expect(bankDepositReceiptSelectionDisabledReason(row({ source: 'CODEF_LOAN' }))).toContain('대출')
    expect(bankDepositReceiptSelectionDisabledReason(row({ matchedPartnerName: null }))).toContain('미매칭')
    expect(bankDepositReceiptSelectionDisabledReason(row())).toBe('')
  })
})
