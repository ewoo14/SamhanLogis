import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import {
  DispatchSlipSummaryCells,
  formatInspectorSignedAtKst,
} from './UnDispatchedSlipList'
import type { SlipBoardResponse } from '../../../api/dispatchBoard'

describe('UnDispatchedSlipList summary cells', () => {
  test('검수자/검수일시/배송지/수령자 정보를 렌더한다', () => {
    const html = renderToStaticMarkup(
      createElement(DispatchSlipSummaryCells, {
        slip: makeSlip({
          inspectorName: '검수담당자',
          inspectorSignedAt: '2026-06-24T09:30:00',
          deliveryAddress: '서울시 강남구 테스트로 1',
          recipientPhone: '010-1111-2222',
        }),
      }),
    )

    expect(html).toContain('검수자')
    expect(html).toContain('검수담당자')
    expect(html).toContain('검수일시')
    expect(html).toContain('2026. 06. 24. 09:30')
    expect(html).toContain('배송지')
    expect(html).toContain('서울시 강남구 테스트로 1')
    expect(html).toContain('수령자')
    expect(html).toContain('010-1111-2222')
  })

  test('nullable 필드는 대시로 렌더한다', () => {
    const html = renderToStaticMarkup(
      createElement(DispatchSlipSummaryCells, {
        slip: makeSlip({
          inspectorName: null,
          inspectorSignedAt: null,
          deliveryAddress: null,
          recipientPhone: null,
        }),
      }),
    )

    expect(html.match(/—/g)).toHaveLength(4)
  })

  test('검수일시는 KST 기준 분 단위로 포맷한다', () => {
    expect(formatInspectorSignedAtKst('2026-06-24T00:30:00Z')).toBe('2026. 06. 24. 09:30')
    expect(formatInspectorSignedAtKst(null)).toBe('—')
  })
})

function makeSlip(overrides: Partial<SlipBoardResponse>): SlipBoardResponse {
  return {
    id: '77777777-d333-4d33-8d33-000000000001',
    slipNo: '2026/06/24-1',
    slipDate: '2026-06-24',
    partnerCode: 'P-INSPECT-001',
    partnerName: '검수완료 거래처',
    deliveryAddress: null,
    recipientPhone: null,
    inspectorName: null,
    inspectorSignedAt: null,
    dispatchStatus: 'UNDISPATCHED',
    ...overrides,
  }
}
