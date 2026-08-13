// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StockLedgerModal } from './StockLedgerModal'
import type { StockLedgerResponse } from '../../api/inventory'
import { recentThreeMonthsRange, stockLedgerSlipDestination } from './stockLedgerNavigation'

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

  it('엑셀본 9열에 전표번호 열을 더하고 10열 전체를 담는 초대형 모달을 사용한다', () => {
    const data: StockLedgerResponse = {
      companyName: '회사', startDate: '2026-08-01', endDate: '2026-08-12',
      productName: '품목', productCode: 'P1', openingBalance: 0,
      totalInbound: 1, totalOutbound: 0, closingBalance: 1,
      rows: [{ date: '2026-08-02', productName: '품목', productCode: 'P1', warehouseName: '창고', partnerName: '거래처', description: '주소', locationTag: null, inboundQuantity: 1, outboundQuantity: 0, balance: 1, opening: false, slipNo: '2026/08/02-17', slipType: 'INBOUND' }],
    }
    render(<StockLedgerModal open data={data} onClose={() => {}} onRangeChange={() => {}} onOpenSlip={() => {}} />)

    expect(screen.getByRole('columnheader', { name: '전표번호' })).toBeTruthy()
    expect(screen.getAllByRole('columnheader')).toHaveLength(10)
    expect(screen.getByText('주소')).toBeTruthy()
    expect(screen.getByRole('button', { name: '전표 2026/08/02-17 열기' })).toBeTruthy()
    expect(screen.getByRole('dialog').className).toContain('size-xxl')
  })

  it('전일재고를 제외한 기간 내 입고·출고 합계만 맨 아래 구분된 합계행에 표시한다', () => {
    const data: StockLedgerResponse = {
      companyName: '회사', startDate: '2026-05-14', endDate: '2026-08-14',
      productName: '품목', productCode: 'P1', openingBalance: 81,
      totalInbound: 5, totalOutbound: 3, closingBalance: 83,
      rows: [{ date: '2026-08-02', productName: '품목', productCode: 'P1', warehouseName: '창고', partnerName: '', description: '거래', locationTag: null, inboundQuantity: 5, outboundQuantity: 0, balance: 86, opening: false, slipNo: null, slipType: null }],
    }
    render(<StockLedgerModal open data={data} onClose={() => {}} onRangeChange={() => {}} />)

    const totalRow = screen.getByTestId('stock-ledger-total-row')
    expect(totalRow.textContent).toContain('합계 / 누계')
    expect(totalRow.textContent).toContain('5')
    expect(totalRow.textContent).toContain('3')
    expect(totalRow.textContent).toContain('83')
    expect(totalRow.textContent).not.toContain('81')
    expect(totalRow.getAttribute('data-summary-row')).toBe('true')
    expect(screen.getAllByTestId('stock-ledger-total-row')).toHaveLength(1)
    expect(totalRow.parentElement?.lastElementChild).toBe(totalRow)
    expect((totalRow as HTMLElement).style.background).toBe('rgb(238, 246, 252)')
    expect((totalRow as HTMLElement).style.borderTop).toContain('2px')
  })

  it('전표 유형별 목적지는 전표번호만 URL에 사용하고 UUID를 포함하지 않는다', () => {
    expect(stockLedgerSlipDestination('OUTBOUND', '2026/08/02-17')).toBe('/sales/by-number?slipNo=2026%2F08%2F02-17')
    expect(stockLedgerSlipDestination('INBOUND', '2026/08/02-18')).toBe('/purchases/by-number?slipNo=2026%2F08%2F02-18')
    expect(stockLedgerSlipDestination('OUTBOUND', '2026/08/02-17')).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27}/i)
  })

  it('이동전표와 실사 조정행도 업무번호로 해당 관리 화면에 이동한다', () => {
    expect(stockLedgerSlipDestination('STOCK_TRANSFER', '2026/08/14-11'))
      .toBe('/transfers?transferNo=2026%2F08%2F14-11')
    expect(stockLedgerSlipDestination('AUDIT', '2026/08/14-3'))
      .toBe('/warehouse/audit?auditNo=2026%2F08%2F14-3')
  })

  it('기본 기간은 오늘 기준 최근 3개월이다', () => {
    expect(recentThreeMonthsRange(new Date(2026, 7, 14))).toEqual({ start: '2026-05-14', end: '2026-08-14' })
  })

  it('최근 3개월 시작일은 월말에도 유효한 달력 날짜를 유지한다', () => {
    expect(recentThreeMonthsRange(new Date(2026, 4, 31))).toEqual({ start: '2026-02-28', end: '2026-05-31' })
  })
})
