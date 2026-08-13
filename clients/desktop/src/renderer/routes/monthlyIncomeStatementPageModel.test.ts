import { describe, expect, it } from 'vitest'
import {
  fmtMonthlyKrw,
  isExpenseMonthlySection,
  isNegativeMonthlyAmount,
  isStrongMonthlyRow,
  monthlyAmountAt,
  rowLabel,
  sectionLabel,
} from './monthlyIncomeStatementPageModel'
import type { MonthlyIncomeStatementLine } from '../api/accounting'

const row: MonthlyIncomeStatementLine = {
  rowKind: 'ACCOUNT',
  section: 'REVENUE',
  accountCode: '4019',
  accountName: '상품매출',
  category: 'REVENUE',
  monthlyAmounts: ['1000', '-2000', 0],
  annualTotal: ' -1000',
  priorYearTotal: '500',
  difference: '-1500',
  sortOrder: 4010,
}

describe('monthlyIncomeStatementPageModel', () => {
  it('금액을 회계 표기 문자열로 변환한다', () => {
    expect(fmtMonthlyKrw('12345.00')).toBe('12,345')
    expect(fmtMonthlyKrw('-2500.00')).toBe('-2,500')
    expect(fmtMonthlyKrw(0)).toBe('—')
  })

  it('월 index 는 1월 기준으로 읽는다', () => {
    expect(monthlyAmountAt(row, 1)).toBe('1000')
    expect(monthlyAmountAt(row, 2)).toBe('-2000')
    expect(monthlyAmountAt(row, 12)).toBe(0)
  })

  it('계정 행 라벨은 계정명만 표시한다', () => {
    expect(rowLabel(row)).toBe('상품매출')
    expect(rowLabel({ ...row, accountCode: null, accountName: '매출총이익' }))
      .toBe('매출총이익')
  })

  it('소계와 합계 행을 강조 대상으로 판정한다', () => {
    expect(isStrongMonthlyRow(row)).toBe(false)
    expect(isStrongMonthlyRow({ ...row, rowKind: 'SUBTOTAL' })).toBe(true)
    expect(isStrongMonthlyRow({ ...row, rowKind: 'TOTAL' })).toBe(true)
  })

  it('음수와 섹션 라벨을 판정한다', () => {
    expect(isNegativeMonthlyAmount('-1')).toBe(true)
    expect(isExpenseMonthlySection('SGA')).toBe(true)
    expect(isExpenseMonthlySection('REVENUE')).toBe(false)
    expect(sectionLabel('NET_INCOME')).toBe('당기순이익')
    expect(sectionLabel('UNKNOWN')).toBe('UNKNOWN')
  })
})
