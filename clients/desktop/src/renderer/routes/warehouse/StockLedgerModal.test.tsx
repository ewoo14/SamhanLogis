// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StockLedgerModal } from './StockLedgerModal'
import type { StockLedgerResponse } from '../../api/inventory'

describe('재고수불부 모달', () => {
  afterEach(cleanup)
  it('기본 월초부터 오늘까지 열리고 누적 잔량과 지방 태그를 표시한다', () => {
    const data: StockLedgerResponse = {
      companyName: '(주)삼한공조시스템', startDate: '2026-08-01', endDate: '2026-08-12',
      productName: '테스트 품목', productCode: 'AP145BNPPHH1', openingBalance: 10,
      totalInbound: 5, totalOutbound: 3, closingBalance: 12,
      rows: [
        { date: '2026-08-02', productName: '테스트 품목', productCode: 'AP145BNPPHH1', warehouseName: '삼성창고', partnerName: '', description: '울산광역시 주소', locationTag: '지방', inboundQuantity: 5, outboundQuantity: 0, balance: 15, opening: false, slipNo: null, slipType: null },
        { date: '2026-08-03', productName: '테스트 품목', productCode: 'AP145BNPPHH1', warehouseName: '삼성창고', partnerName: '', description: '경기도 주소', locationTag: null, inboundQuantity: 0, outboundQuantity: 3, balance: 12, opening: false, slipNo: null, slipType: null },
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

  it('전표번호를 클릭하면 같은 실제 전표번호를 전표 모달 콜백에 전달한다', () => {
    const onOpenSlip = vi.fn()
    const data = { companyName: '회사', startDate: '2026-08-01', endDate: '2026-08-12', productName: '품목', productCode: 'P1', openingBalance: 0, totalInbound: 1, totalOutbound: 0, closingBalance: 1,
      rows: [{ date: '2026-08-02', productName: '품목', productCode: 'P1', warehouseName: '창고', partnerName: '거래처', description: '2026/08/02-17', locationTag: null, inboundQuantity: 1, outboundQuantity: 0, balance: 1, opening: false, slipNo: '2026/08/02-17', slipType: 'INBOUND' as const }] }
    render(<StockLedgerModal open data={data} onClose={() => {}} onRangeChange={() => {}} onOpenSlip={onOpenSlip} />)
    fireEvent.click(screen.getByRole('button', { name: '전표 2026/08/02-17 열기' }))
    expect(onOpenSlip).toHaveBeenCalledWith('2026/08/02-17', 'INBOUND')
  })

  it('수불부 응답·DOM·링크에 UUID를 포함하지 않는다', () => {
    const data = { companyName: '회사', startDate: '2026-08-01', endDate: '2026-08-12', productName: '품목', productCode: 'P1', openingBalance: 0, totalInbound: 1, totalOutbound: 0, closingBalance: 1,
      rows: [{ date: '2026-08-02', productName: '품목', productCode: 'P1', warehouseName: '창고', partnerName: '', description: '2026/08/02-17', locationTag: null, inboundQuantity: 1, outboundQuantity: 0, balance: 1, opening: false, slipNo: '2026/08/02-17', slipType: 'INBOUND' as const }] }
    const { container } = render(<StockLedgerModal open data={data} onClose={() => {}} onRangeChange={() => {}} onOpenSlip={() => {}} />)
    expect(container.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27}/i)
    expect([...container.querySelectorAll('a')]).toHaveLength(0)
  })

  it('배송주소 행은 링크가 아니며 클릭해도 전표 모달을 열지 않는다', () => {
    const onOpenSlip = vi.fn()
    const data = { companyName: '회사', startDate: '2026-08-01', endDate: '2026-08-12', productName: '품목', productCode: 'P1', openingBalance: 0, totalInbound: 0, totalOutbound: 1, closingBalance: -1,
      rows: [{ date: '2026-08-02', productName: '품목', productCode: 'P1', warehouseName: '창고', partnerName: '', description: '경기도 광주시 배송주소', locationTag: null, inboundQuantity: 0, outboundQuantity: 1, balance: -1, opening: false, slipNo: null, slipType: null }] }
    render(<StockLedgerModal open data={data} onClose={() => {}} onRangeChange={() => {}} onOpenSlip={onOpenSlip} />)
    expect(screen.queryByRole('button', { name: /전표/ })).toBeNull()
    expect(onOpenSlip).not.toHaveBeenCalled()
  })
})
