import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { PrintRendererApp, type SlipData } from '../../../print-renderer/PrintRendererApp'

describe('PrintRendererApp outbound copy contract', () => {
  test('헤드리스 사본은 출고전표 양식을 사용하고 금액형 출고전표 문구를 렌더하지 않는다', () => {
    const html = renderToStaticMarkup(createElement(PrintRendererApp, {
      slipData,
      driverSignatureBase64: 'driver-base64',
      recipientSignatureBase64: 'recipient-base64',
    }))

    expect(html).toContain('SAMSUNG')
    expect(html).toContain('판매거래처')
    expect(html).toContain('박출고')
    expect(html).toContain('용달기사 서명')
    expect(html).toContain('data:image/png;base64,driver-base64')
    expect(html).toContain('data:image/png;base64,recipient-base64')
    expect(html).not.toContain('출 고 전 표')
    expect(html).not.toContain('공급가액')
    expect(html).not.toContain('부가세')
    expect(html).not.toContain('합계</span>')
    expect(html).not.toContain('출고인:')
  })
})

const slipData: SlipData = {
  slipNo: '2026/06/22-1',
  slipDate: '2026-06-22',
  partnerName: '판매거래처',
  recipientAddress: '서울시 중구',
  contactPhone: '010-1234-5678',
  driverName: '홍기사',
  driverPhone: '010-1111-2222',
  lines: [{
    itemName: 'AJ040MXHNBC1',
    spec: '220V',
    quantity: 2,
    unitPrice: 1000,
    lineTotal: 2000,
  }],
  totalQuantity: 2,
  totalSupply: 2000,
  vat: 200,
  total: 2200,
  sourceWarehouseName: '삼한창고',
  dispatcherName: '박출고',
  recipientName: '김인수',
  memo: '특이사항',
}
