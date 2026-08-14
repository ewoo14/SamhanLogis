// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { SlipDetail } from '../../../api/slip'
import type { ApprovalLineStructure } from '../../../api/approvalLineConfigApi'

vi.mock('@samhan/design-system', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  Modal: ({
    children,
    footer,
    title,
    description,
  }: {
    children: React.ReactNode
    footer?: React.ReactNode
    title?: React.ReactNode
    description?: React.ReactNode
  }) => (
    <section>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {children}
      {footer}
    </section>
  ),
}))

const getDispatchBoardSlipDetailMock = vi.fn()
vi.mock('../../../api/dispatchBoard', () => ({
  getDispatchBoardSlipDetail: (id: string) => getDispatchBoardSlipDetailMock(id),
}))

const listWarehousesMock = vi.fn()
vi.mock('../../../api/inventory', () => ({
  listWarehouses: () => listWarehousesMock(),
}))

const fetchApprovalLineStructureMock = vi.fn()
vi.mock('../../../api/approvalLineConfigApi', () => ({
  fetchApprovalLineStructure: (documentType: string) => fetchApprovalLineStructureMock(documentType),
}))

const dispatchDocumentMock = vi.fn()
vi.mock('../../../print/DispatchDocument', () => ({
  DispatchDocument: (props: {
    slip: SlipDetail
    roles: ApprovalLineStructure[] | null
    sourceWarehouseName: string
  }) => {
    dispatchDocumentMock(props)
    return (
      <article data-testid="dispatch-document-preview">
        <span>{props.slip.slipNo}</span>
        <span>{props.sourceWarehouseName}</span>
        <span>{props.roles?.map((role) => role.label).join(',') ?? 'fallback'}</span>
      </article>
    )
  },
}))

import { SlipDetailModal } from './SlipDetailModal'

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SlipDetailModal slipId={sampleSlip.id} onClose={vi.fn()} />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SlipDetailModal 출고전표 미리보기', () => {
  it('전표 상세 조회를 유지하고 창고명/결재라인을 출고전표 문서에 주입한다', async () => {
    getDispatchBoardSlipDetailMock.mockResolvedValue(sampleSlip)
    listWarehousesMock.mockResolvedValue([
      {
        id: sampleSlip.sourceWarehouseId,
        code: 'WH-001',
        name: '삼한 본사창고',
        type: 'HEADQUARTERS',
        address: null,
        displayOrder: 1,
        description: null,
        createdAt: '2026-07-03T00:00:00+09:00',
        modifiedAt: '2026-07-03T00:00:00+09:00',
        active: true,
      },
    ])
    const roles: ApprovalLineStructure[] = [
      { sequence: 0, label: '작성자', stepType: 'CREATOR', actionKey: null },
      { sequence: 1, label: '출고자', stepType: 'GROUP', actionKey: 'OUTBOUND_DISPATCH' },
    ]
    fetchApprovalLineStructureMock.mockResolvedValue(roles)

    renderModal()

    await waitFor(() => expect(screen.getByTestId('dispatch-document-preview')).toBeTruthy())
    expect(getDispatchBoardSlipDetailMock).toHaveBeenCalledWith(sampleSlip.id)
    expect(listWarehousesMock).toHaveBeenCalled()
    expect(fetchApprovalLineStructureMock).toHaveBeenCalledWith('SLIP_OUTBOUND')
    await waitFor(() => {
      expect(dispatchDocumentMock).toHaveBeenLastCalledWith({
        slip: sampleSlip,
        roles,
        sourceWarehouseName: '삼한 본사창고',
      })
    })
    expect(screen.getByText('기사: 김기사')).toBeTruthy()
    expect(screen.getByText('기사 연락처: 010-1111-2222')).toBeTruthy()
  })

  it('창고/결재라인 조회 실패 시 문서 내부 폴백값을 쓰도록 null 역할과 - 창고명을 넘긴다', async () => {
    getDispatchBoardSlipDetailMock.mockResolvedValue(sampleSlip)
    listWarehousesMock.mockRejectedValue(new Error('warehouses failed'))
    fetchApprovalLineStructureMock.mockRejectedValue(new Error('roles failed'))

    renderModal()

    await waitFor(() => expect(screen.getByTestId('dispatch-document-preview')).toBeTruthy())
    expect(dispatchDocumentMock).toHaveBeenLastCalledWith({
      slip: sampleSlip,
      roles: null,
      sourceWarehouseName: '-',
    })
  })
})

const sampleSlip: SlipDetail = {
  id: '11111111-1111-1111-1111-111111111111',
  slipType: 'OUTBOUND',
  slipNo: '2026/07/03-1',
  slipDate: '2026-07-03',
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
  updatedAt: '2026-07-03T09:00:00+09:00',
  version: 1,
  memo: '특이사항',
  driverName: '김기사',
  driverPhone: '010-1111-2222',
  ownerDepartment: '영업팀',
  ownerFullName: '홍작성',
  dispatcherFullName: '박출고',
  inspectorFullName: '김검수',
  acceptedByFullName: null,
  shippingAddress: '서울시 중구',
  contactPhone: '02-123-4567',
  paymentDueDate: '2026-07-31',
  lines: [{
    id: 'line-1',
    productId: 'product-1',
    productName: 'MX단배관',
    modelName: 'AJ040MXHNBC1',
    specification: '220V',
    quantity: 2,
    unitPrice: '1000',
    lineTotal: '2000',
    note: null,
  }],
}
