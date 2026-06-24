import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { ExternalDispatchRequestDocument } from './ExternalDispatchRequestDocument'
import type { ExternalDispatchPrintDataResponse } from '../api/externalDispatch'

describe('ExternalDispatchRequestDocument', () => {
  test('배송사명과 전표별 배송지/수령자/품목요약을 렌더한다', () => {
    const html = renderToStaticMarkup(createElement(ExternalDispatchRequestDocument, {
      data: samplePrintData,
    }))

    expect(html).toContain('배차의뢰서')
    expect(html).toContain('한빛퀵')
    expect(html).toContain('010-7000-0104')
    expect(html).toContain('2026년 06월 24일')
    expect(html).toContain('2026/06/24-EDP-001')
    expect(html).toContain('서울시 강남구 테스트로 101')
    expect(html).toContain('삼한거래처')
    expect(html).toContain('010-1000-0101')
    expect(html).toContain('AJ040 2대')
  })

  test('내부 UUID를 인쇄 HTML에 노출하지 않는다', () => {
    const html = renderToStaticMarkup(createElement(ExternalDispatchRequestDocument, {
      data: samplePrintData,
    }))

    expect(html).not.toContain('11111111-1111-1111-1111-111111111111')
    expect(html).not.toContain('22222222-2222-2222-2222-222222222222')
    // DTO 에 UUID 필드가 없어 sentinel 부재는 자명 → UUID 패턴 자체가 렌더 마크업에 없음을
    // 단언해 향후 DTO 에 slipId 등이 추가되어 노출되는 회귀를 탐지한다(공허 가드 방지).
    expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  })

  test('전표가 비어 있어도 빈 양식 안내를 렌더한다', () => {
    const html = renderToStaticMarkup(createElement(ExternalDispatchRequestDocument, {
      data: { ...samplePrintData, items: [] },
    }))

    expect(html).toContain('인쇄할 전표가 없습니다.')
  })
})

const samplePrintData: ExternalDispatchPrintDataResponse = {
  carrierName: '한빛퀵',
  carrierPhone: '010-7000-0104',
  dispatchDate: '2026-06-24',
  channel: 'PRINT',
  items: [
    {
      slipNo: '2026/06/24-EDP-001',
      deliveryAddress: '서울시 강남구 테스트로 101',
      recipientName: '삼한거래처',
      recipientPhone: '010-1000-0101',
      itemSummary: 'AJ040 2대',
      sequence: 1,
    },
    {
      slipNo: '2026/06/24-EDP-002',
      deliveryAddress: '서울시 서초구 테스트로 102',
      recipientName: '아로현장',
      recipientPhone: '010-1000-0102',
      itemSummary: 'AJ060 1대',
      sequence: 2,
    },
  ],
}
