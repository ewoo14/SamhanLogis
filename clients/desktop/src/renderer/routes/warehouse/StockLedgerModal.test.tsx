// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'
import { StockLedgerModal } from './StockLedgerModal'
import type { StockLedgerResponse } from '../../api/inventory'

describe('재고수불부 모달', () => {
  it('기본 월초부터 오늘까지 열리고 누적 잔량과 지방 태그를 표시한다', () => {
    const data: StockLedgerResponse = {
      companyName: '(주)삼한공조시스템', startDate: '2026-08-01', endDate: '2026-08-12',
      productName: '테스트 품목', productCode: 'AP145BNPPHH1', openingBalance: 10,
      totalInbound: 5, totalOutbound: 3, closingBalance: 12,
      rows: [
        { date: '2026-08-02', productName: '테스트 품목', productCode: 'AP145BNPPHH1', warehouseName: '삼성창고', partnerName: '', description: '울산광역시 주소', locationTag: '지방', inboundQuantity: 5, outboundQuantity: 0, balance: 15, opening: false },
        { date: '2026-08-03', productName: '테스트 품목', productCode: 'AP145BNPPHH1', warehouseName: '삼성창고', partnerName: '', description: '경기도 주소', locationTag: null, inboundQuantity: 0, outboundQuantity: 3, balance: 12, opening: false },
      ],
    }
    render(<StockLedgerModal open data={data} onClose={() => {}} onRangeChange={() => {}} />)

    expect(screen.getByDisplayValue('2026-08-01')).toBeTruthy()
    expect(screen.getByDisplayValue('2026-08-12')).toBeTruthy()
    expect(screen.getByText('전일재고')).toBeTruthy()
    expect(screen.getByText('15')).toBeTruthy()
    expect(screen.getAllByText('12').length).toBeGreaterThan(0)
    expect(screen.getByText('지방')).toBeTruthy()
    expect(screen.getByText('울산광역시 주소')).toBeTruthy()
  })
})
