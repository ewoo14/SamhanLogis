import { describe, expect, it } from 'vitest'
import {
  bankTransactionPartnerDisplay,
  effectiveBankTransactionLabels,
  filterButtonLabel,
  filterLabelsForQuery,
  normalizeBankTransactionLabels,
  type BankTransactionFilterOption,
} from './BankTransactionFilterModalModel'
import type { BankTransactionRow } from '../api/accounting'

describe('BankTransactionFilterModalModel', () => {
  it('저장된 부분선택은 그대로 복원한다(전체로 팽창하지 않는다)', () => {
    // 회귀 가드: 과거 구현은 저장값이 있으면 options 전체를 union 해 "계좌 N개만 보기"를 무력화했다.
    expect(effectiveBankTransactionLabels(['국민 111'])).toEqual(['국민 111'])
    expect(effectiveBankTransactionLabels([' 신한 222 ', '국민 111', '신한 222'])).toEqual([
      '국민 111',
      '신한 222',
    ])
  })

  it('빈 선택은 전체 의미라 그대로 빈 배열을 복원한다', () => {
    expect(effectiveBankTransactionLabels([])).toEqual([])
    expect(effectiveBankTransactionLabels(null)).toEqual([])
    expect(filterButtonLabel('계좌', [])).toBe('계좌 전체')
  })

  it('전체 선택은 무필터([])로, 부분 선택은 선택 label 로 쿼리한다', () => {
    const options: BankTransactionFilterOption[] = [
      { label: '국민 111', source: 'registered' },
      { label: '신한 222', source: 'transaction' },
    ]
    expect(filterLabelsForQuery(['국민 111', '신한 222'], options)).toEqual([])
    expect(filterLabelsForQuery([], options)).toEqual([])
    expect(filterLabelsForQuery(['국민 111'], options)).toEqual(['국민 111'])
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
