import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { DispatchDocument } from './DispatchDocument'
import type { SlipDetail } from '../api/slip'
import type { ApprovalLineStructure } from '../api/approvalLineConfigApi'

const roles: ApprovalLineStructure[] = [
  { sequence: 0, label: '작성자', stepType: 'CREATOR', actionKey: null },
  { sequence: 1, label: '출고담당', stepType: 'GROUP', actionKey: 'OUTBOUND_DISPATCH' },
  { sequence: 2, label: '검수담당', stepType: 'GROUP', actionKey: 'OUTBOUND_INSPECT' },
]

describe('DispatchDocument', () => {
  test('설정 구조에 따라 작성자/출고자/검수자 서명자를 매핑한다', () => {
    const html = renderDocument(roles)

    expect(html).toContain('작성자')
    expect(html).toContain('홍작성')
    expect(html).toContain('출고담당')
    expect(html).toContain('박출고')
    expect(html).toContain('검수담당')
    expect(html).toContain('김검수')
  })

  test('actionKey 없는 추가 단계는 라벨만 표시하고 서명자 이름은 비운다', () => {
    const html = renderDocument([
      ...roles,
      { sequence: 3, label: '확인자', stepType: 'GROUP', actionKey: null },
    ])

    expect(html).toContain('확인자')
    expect(html).not.toContain('추가담당')
  })

  test('roles=null 이면 기존 작성자/출고자/검수자 3역할로 폴백한다', () => {
    const html = renderDocument(null)

    expect(html).toContain('작성자')
    expect(html).toContain('출고자')
    expect(html).toContain('검수자')
  expect(html).toContain('홍작성')
  expect(html).toContain('박출고')
  expect(html).toContain('김검수')
  })

  test('사용자 UUID와 창고 UUID는 화면에 노출하지 않는다', () => {
    const html = renderDocument(roles)

    expect(html).not.toContain(sampleSlip.id)
    expect(html).not.toContain(sampleSlip.sourceWarehouseId ?? '')
    expect(html).not.toContain(sampleSlip.dispatcher?.userId ?? '')
    expect(html).not.toContain(sampleSlip.inspector?.userId ?? '')
  })
})

function renderDocument(approvalRoles: ApprovalLineStructure[] | null): string {
  return renderToStaticMarkup(createElement(DispatchDocument, {
    slip: sampleSlip,
    roles: approvalRoles,
    sourceWarehouseName: '삼한창고',
  }))
}

const sampleSlip: SlipDetail = {
  id: '11111111-1111-1111-1111-111111111111',
  slipType: 'OUTBOUND',
  slipNo: '2026/06/22-1',
  slipDate: '2026-06-22',
  seqNo: 1,
  status: 'SAVED',
  partnerId: '22222222-2222-2222-2222-222222222222',
  partnerName: '삼한거래처',
  sourceWarehouseId: '33333333-3333-3333-3333-333333333333',
  destinationWarehouseId: null,
  deliveryTag: null,
  requesterId: null,
  acceptedBy: null,
  acceptedAt: null,
  completedAt: null,
  confirmedAt: null,
  updatedAt: '2026-06-22T09:00:00+09:00',
  version: 1,
  memo: '특이사항',
  ownerDepartment: '영업팀',
  ownerFullName: '홍작성',
  dispatcherFullName: '박출고',
  inspectorFullName: '김검수',
  acceptedByFullName: null,
  dispatcher: {
    userId: '44444444-4444-4444-4444-444444444444',
    fullName: '중첩출고',
    signedAt: '2026-06-22T10:00:00+09:00',
  },
  inspector: {
    userId: '55555555-5555-5555-5555-555555555555',
    fullName: '중첩검수',
    signedAt: '2026-06-22T11:00:00+09:00',
  },
  shippingAddress: '서울시 중구',
  contactPhone: '010-1234-5678',
  paymentDueDate: '2026-06-30',
  lines: [{
    id: 'line-1',
    productId: 'product-1',
    productName: 'MX단배관',
    modelName: 'AJ040MXHNBC1',
    specification: '220V',
    quantity: 2,
    unitPrice: '0',
    lineTotal: '0',
    note: null,
  }],
}
