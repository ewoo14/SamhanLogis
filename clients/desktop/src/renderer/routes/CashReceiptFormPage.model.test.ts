import { describe, expect, it, vi } from 'vitest'
import {
  buildCashReceiptRequest,
  cashReceiptInitialFormState,
  validateCashReceiptForm,
} from './CashReceiptFormPage.model'

describe('CashReceiptFormPage model', () => {
  it('오늘 날짜와 기본 계정 102/110으로 초기화한다', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-05T10:30:00+09:00'))

    expect(cashReceiptInitialFormState()).toMatchObject({
      amount: '',
      transactionDate: '2026-07-05',
      debitAccountCode: '102',
      creditAccountCode: '110',
    })

    vi.useRealTimers()
  })

  it('금액/거래일/적요 길이/계정을 검증한다', () => {
    const invalid = cashReceiptInitialFormState({
      partnerName: '',
      amount: '0',
      transactionDate: '',
      memo: 'x'.repeat(495),
      debitAccountCode: '',
      creditAccountCode: '',
    })

    expect(validateCashReceiptForm(invalid)).toEqual({
      partner: '거래처를 선택하거나 거래처명을 입력하세요.',
      amount: '금액은 0보다 커야 합니다.',
      transactionDate: '거래일을 입력하세요.',
      memo: '적요는 494자 이하로 입력하세요.',
      debitAccountCode: '차변 계정을 선택하세요.',
      creditAccountCode: '대변 계정을 선택하세요.',
    })
  })

  it('BE CashReceiptRequest와 같은 shape로 저장 payload를 만든다', () => {
    const state = cashReceiptInitialFormState({
      partnerCode: 'P-001',
      bizNo: '123-45-67890',
      partnerName: '삼한공조',
      amount: '2480000',
      transactionDate: '2026-07-05',
      memo: '수기 입금',
      debitAccountCode: '102',
      creditAccountCode: '110',
    })

    expect(buildCashReceiptRequest(state)).toEqual({
      partnerCode: 'P-001',
      bizNo: '123-45-67890',
      partnerName: '삼한공조',
      amount: '2480000',
      transactionDate: '2026-07-05',
      memo: '수기 입금',
      debitAccountCode: '102',
      creditAccountCode: '110',
    })
  })
})
