import { describe, expect, it } from 'vitest'
import {
  CASH_RECEIPT_KIND_OPTIONS,
  cashReceiptKindLabel,
  formatCashReceiptAmount,
  formatCashReceiptDate,
  listCashReceiptQueryOptions,
  truncatePartnerName,
  type CashReceiptFilterState,
} from './CashReceiptListPage.model'

describe('CashReceiptListPage model', () => {
  it('kind 라벨은 3값을 한국어로 매핑하고 미지의 값은 원값을 표시한다', () => {
    expect(CASH_RECEIPT_KIND_OPTIONS).toEqual([
      { value: '', label: '전체' },
      { value: 'DEPOSIT_REPORT', label: '입금보고서' },
      { value: 'MANUAL_RECEIPT', label: '수기 입금' },
      { value: 'BANK_LINKED', label: '통장연계' },
    ])
    expect(cashReceiptKindLabel('DEPOSIT_REPORT')).toBe('입금보고서')
    expect(cashReceiptKindLabel('MANUAL_RECEIPT')).toBe('수기 입금')
    expect(cashReceiptKindLabel('BANK_LINKED')).toBe('통장연계')
    expect(cashReceiptKindLabel('EXTRA_KIND')).toBe('EXTRA_KIND')
  })

  it('금액과 날짜는 회계 목록 표시 규약으로 포맷한다', () => {
    expect(formatCashReceiptAmount('2480000')).toBe('2,480,000')
    expect(formatCashReceiptAmount(-1200)).toBe('-1,200')
    expect(formatCashReceiptAmount(0)).toBe('—')
    expect(formatCashReceiptAmount(null)).toBe('—')
    expect(formatCashReceiptDate('2026-05-19T12:34:00+09:00')).toBe('2026-05-19')
    expect(formatCashReceiptDate('')).toBe('—')
  })

  it('필터 상태를 목록 API 파라미터로 정규화한다', () => {
    const filters: CashReceiptFilterState = {
      partnerName: '  삼한  ',
      slipNo: ' 2026/05 ',
      kind: '',
      from: '2026-05-01',
      to: '',
    }

    expect(listCashReceiptQueryOptions(filters, 2, 20)).toEqual({
      partnerName: '삼한',
      slipNo: '2026/05',
      from: '2026-05-01',
      page: 2,
      size: 20,
    })
  })

  it('거래처명은 18자 이후 말줄임한다', () => {
    expect(truncatePartnerName('삼한공조')).toBe('삼한공조')
    expect(truncatePartnerName('가나다라마바사아자차카타파하거너더러머버서어')).toBe('가나다라마바사아자차카타파하거너더러...')
  })
})
