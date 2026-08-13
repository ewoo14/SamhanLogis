import { describe, expect, it } from 'vitest'
import {
  buildFundsStatusRows,
  fmtFundsKrw,
  fundsIncreaseDetailTitle,
  isNegativeAmount,
  summaryToLine,
} from './fundsStatusPageModel'
import type { FundsStatusAccountSection } from '../api/accounting'

describe('fundsStatusPageModel', () => {
  it('계정 섹션 라인 뒤에 소계 행을 붙인다', () => {
    const section: FundsStatusAccountSection = {
      accountCode: '1039',
      accountName: '보통예금',
      category: 'ASSET',
      lines: [
        {
          accountCode: '1039',
          accountName: '보통예금',
          bizNo: '1112233333',
          partnerName: '국민은행 운영계좌',
          openingBalance: '10000.00',
          increase: '4000.00',
          decrease: '1000.00',
          closingBalance: '13000.00',
        },
      ],
      subtotal: {
        openingBalance: '10000.00',
        increase: '4000.00',
        decrease: '1000.00',
        closingBalance: '13000.00',
      },
    }

    const rows = buildFundsStatusRows(section)

    expect(rows).toHaveLength(2)
    expect(rows[0]?.rowKind).toBe('line')
    expect(rows[0]?.bizNo).toBe('1112233333')
    expect(rows[0]?.partnerName).toBe('국민은행 운영계좌')
    expect(rows[1]?.rowKind).toBe('subtotal')
    expect(rows[1]?.bizNo).toBe('')
    expect(rows[1]?.partnerName).toBe('소계')
    expect(rows[1]?.closingBalance).toBe('13000.00')
  })

  it('금액 표시와 음수 판정을 분리한다', () => {
    expect(fmtFundsKrw('13000.00')).toBe('13,000')
    expect(fmtFundsKrw('-2500.00')).toBe('-2,500')
    expect(fmtFundsKrw('0.00')).toBe('—')
    expect(isNegativeAmount('-1.00')).toBe(true)
    expect(isNegativeAmount('0.00')).toBe(false)
  })

  it('총합 summary 를 표시 라인으로 변환한다', () => {
    expect(summaryToLine('합계', {
      openingBalance: '1',
      increase: '2',
      decrease: '3',
      closingBalance: '4',
    })).toEqual({
      accountCode: '',
      accountName: '',
      bizNo: '',
      partnerName: '합계',
      openingBalance: '1',
      increase: '2',
      decrease: '3',
      closingBalance: '4',
    })
  })

  it('drill-down modal 제목은 계정 단위 — 거래처명을 포함하지 않는다 (결정 A)', () => {
    // 결정 A: drill-down = 계정 전체. 모달 합계 = 계정 증가 소계 일치.
    // 거래처명이 응답에 포함되어도 제목에 노출하지 않는다.
    expect(fundsIncreaseDetailTitle({
      fromDate: '2026-06-01',
      toDate: '2026-06-30',
      accountCode: '1039',
      accountName: '보통예금',
      partnerName: '국민은행 운영계좌',
      lines: [],
      totalAmount: '0',
      generatedAt: '2026-06-30T00:00:00',
    })).toBe('1039 보통예금 — 증가 상세')
  })

  it('drill-down modal 제목은 partnerName null 이어도 동일 형식', () => {
    expect(fundsIncreaseDetailTitle({
      fromDate: '2026-06-01',
      toDate: '2026-06-30',
      accountCode: '1029',
      accountName: '당좌예금',
      partnerName: null,
      lines: [],
      totalAmount: '500',
      generatedAt: '2026-06-30T00:00:00',
    })).toBe('1029 당좌예금 — 증가 상세')
  })
})
