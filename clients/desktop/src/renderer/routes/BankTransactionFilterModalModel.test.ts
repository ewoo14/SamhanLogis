import { describe, expect, it } from 'vitest'
import {
  bankTransactionPartnerDisplay,
  effectiveBankTransactionLabels,
  filterButtonLabel,
  normalizeBankTransactionLabels,
  type BankTransactionFilterOption,
} from './BankTransactionFilterModalModel'
import type { BankTransactionRow } from '../api/accounting'

describe('BankTransactionFilterModalModel', () => {
  it('저장 label 복원 시 저장값에 없는 신규 label 은 기본 포함한다', () => {
    const options: BankTransactionFilterOption[] = [
      { label: '국민 111', source: 'transaction' },
      { label: '신한 222', source: 'registered' },
      { label: 'CSV 자유계좌', source: 'transaction' },
    ]

    expect(effectiveBankTransactionLabels(['국민 111'], options)).toEqual([
      '국민 111',
      '신한 222',
      'CSV 자유계좌',
    ])
  })

  it('빈 선택은 전체 의미라 API label 필터를 보내지 않는다', () => {
    expect(effectiveBankTransactionLabels([], [
      { label: '국민 111', source: 'transaction' },
    ])).toEqual([])
    expect(filterButtonLabel('계좌', [])).toBe('계좌 전체')
  })

  it('label 목록은 trim, 중복 제거, 가나다순 정렬을 적용한다', () => {
    expect(normalizeBankTransactionLabels([' 신한 222 ', '', '국민 111', '신한 222'])).toEqual([
      '국민 111',
      '신한 222',
    ])
  })

  it('거래처 셀 표시는 사업자번호와 코드를 제거하고 거래처명만 반환한다', () => {
    const row = {
      matchedPartnerCode: 'P-2026-0001',
      matchedBizNo: '1112233333',
      matchedPartnerName: '삼한테스트상사',
    } as BankTransactionRow

    expect(bankTransactionPartnerDisplay(row)).toBe('삼한테스트상사')
  })
})
