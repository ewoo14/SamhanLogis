import { describe, expect, it } from 'vitest'
import {
  JOURNAL_STATUS_SOURCE_OPTIONS,
  buildJournalStatusRows,
  displayJournalStatusBizNo,
  fmtJournalStatusKrw,
  isNegativeJournalStatusAmount,
  summaryLabel,
} from './journalStatusPageModel'
import type { JournalStatusGroup } from '../api/accounting'

describe('journalStatusPageModel', () => {
  it('입금보고서 출처 라벨을 확정 용어로 표시한다', () => {
    expect(JOURNAL_STATUS_SOURCE_OPTIONS.find((option) => option.value === 'CASH_RECEIPT')?.label)
      .toBe('입금보고서')
  })

  it('전표현황 그룹 라인 뒤에 소계 행을 붙인다', () => {
    const group: JournalStatusGroup = {
      groupKey: '2026-06-03',
      groupLabel: '2026-06-03',
      lines: [
        {
          journalNo: 'STATUS-F-SLIP',
          journalDate: '2026-06-03',
          sourceType: 'SLIP',
          sourceTypeDisplayName: '전표',
          bizNo: '1111111111',
          partnerName: '주식회사 윌리',
          description: '출고전표',
          totalDebit: '5000.00',
          totalCredit: '5000.00',
        },
      ],
      subtotal: {
        totalDebit: '5000.00',
        totalCredit: '5000.00',
        journalCount: 1,
      },
    }

    const rows = buildJournalStatusRows(group)

    expect(rows).toHaveLength(2)
    expect(rows[0]?.rowKind).toBe('line')
    expect(rows[0]?.sourceTypeDisplayName).toBe('전표')
    expect(rows[1]?.rowKind).toBe('subtotal')
    expect(rows[1]?.bizNo).toBe('')
    expect(rows[1]?.journalNo).toBe('소계')
    expect(rows[1]?.description).toBe('1건')
  })

  it('금액 표시 규약을 적용한다', () => {
    expect(fmtJournalStatusKrw('0.00')).toBe('—')
    expect(fmtJournalStatusKrw('1234567.00')).toBe('1,234,567')
    expect(fmtJournalStatusKrw('-2500.00')).toBe('-2,500')
    expect(isNegativeJournalStatusAmount('-1')).toBe(true)
    expect(isNegativeJournalStatusAmount('0')).toBe(false)
  })

  it('summary label 은 건수와 차대변 합계를 함께 표시한다', () => {
    expect(summaryLabel({
      totalDebit: '7000.00',
      totalCredit: '7000.00',
      journalCount: 2,
    })).toBe('2건 · 차변 7,000 · 대변 7,000')
  })

  it('다중거래처 사업자번호 join 구분자를 보존한다', () => {
    expect(displayJournalStatusBizNo({
      rowKind: 'line',
      bizNo: '3333333333 / 1111111111',
    })).toBe('3333333333 / 1111111111')
    expect(displayJournalStatusBizNo({
      rowKind: 'line',
      bizNo: '',
    })).toBe('—')
    expect(displayJournalStatusBizNo({
      rowKind: 'subtotal',
      bizNo: '3333333333 / 1111111111',
    })).toBe('—')
  })
})
