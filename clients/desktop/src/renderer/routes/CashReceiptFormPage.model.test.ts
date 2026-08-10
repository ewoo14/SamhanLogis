import { describe, expect, it, vi } from 'vitest'
import {
  buildCashReceiptRequest,
  cashReceiptInitialFormState,
  partnerOptionFromFormState,
  partnerLookupUnavailableOnHydrate,
  validateCashReceiptForm,
  type CashReceiptFormState,
} from './CashReceiptFormPage.model'

describe('CashReceiptFormPage model', () => {
  it('입금보고서 초기 상태는 마지막 빈행을 하나 가진다', () => {
    const state = cashReceiptInitialFormState() as CashReceiptFormState & { lines?: unknown[] }

    expect(state.lines).toHaveLength(1)
    expect(state.lines?.[0]).toMatchObject({
      partnerCode: '',
      partnerName: '',
      amount: '',
      memo: '',
    })
  })

  it('거래처별 행을 분할한 저장 payload를 만든다', () => {
    const state = cashReceiptInitialFormState({
      amount: '1000000',
      partnerCode: 'P-TOTAL',
      partnerName: '대표 거래처',
    }) as CashReceiptFormState & { lines?: unknown[] }
    state.lines = [
      { partnerCode: 'P-001', partnerName: '거래처A', amount: '600000', memo: 'A 분할' },
      { partnerCode: 'P-002', partnerName: '거래처B', amount: '400000', memo: 'B 분할' },
      { partnerCode: '', partnerName: '', amount: '', memo: '' },
    ]

    expect(buildCashReceiptRequest(state)).toMatchObject({
      amount: '1000000',
      lines: [
        { partnerCode: 'P-001', partnerName: '거래처A', amount: '600000', memo: 'A 분할' },
        { partnerCode: 'P-002', partnerName: '거래처B', amount: '400000', memo: 'B 분할' },
      ],
    })
  })

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

it('거래처 선택값이 없을 때 사업자번호나 거래처명이 거래처코드 슬롯으로 대체되지 않는다', () => {
  expect(partnerOptionFromFormState({
    ...cashReceiptInitialFormState(),
    partnerCode: '',
    bizNo: '113-07-10031',
    partnerName: '테스트 거래처',
  })).toEqual({
    partnerCode: '',
    bizNo: '113-07-10031',
    name: '테스트 거래처',
  })
})

describe('partnerLookupUnavailableOnHydrate (#831 R-3/R-5 — 입금보고서 편집 하이드레이트)', () => {
  it('partnerCode/partnerName 이 모두 공란이면 조회 실패로 표시만 빈 것으로 판단한다 (영속 입금보고서는 항상 거래처가 있다 — BE resolvePartner 가 생성/수정 시 강제)', () => {
    expect(partnerLookupUnavailableOnHydrate({ partnerCode: '', partnerName: '' })).toBe(true)
    expect(partnerLookupUnavailableOnHydrate({ partnerCode: null, partnerName: '' })).toBe(true)
    expect(partnerLookupUnavailableOnHydrate({ partnerCode: '   ', partnerName: '  ' })).toBe(true)
  })

  it('partnerCode 또는 partnerName 중 하나라도 있으면 정상 조회로 판단한다', () => {
    expect(partnerLookupUnavailableOnHydrate({ partnerCode: 'P-001', partnerName: '' })).toBe(false)
    expect(partnerLookupUnavailableOnHydrate({ partnerCode: '', partnerName: '삼한공조' })).toBe(false)
  })
})
