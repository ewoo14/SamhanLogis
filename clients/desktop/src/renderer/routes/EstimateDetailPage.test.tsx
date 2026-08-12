// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EstimateDetailPage } from './EstimateDetailPage'
import { changeEstimateOwner, getEstimate } from '../api/estimateApi'
import { searchApprovalLineUsers } from '../api/approvalLineConfigApi'

vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({ canAccess: () => true }),
}))
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../components/collab/EstimateCollaborationPanel', () => ({
  EstimateCollaborationPanel: () => null,
}))
vi.mock('../components/common/MobileActionSheet', () => ({ MobileActionSheet: () => null }))
vi.mock('../components/common/MobileCollapsible', () => ({ MobileCollapsible: () => null }))

vi.mock('@samhan/design-system', async () => {
  const actual = await vi.importActual<typeof import('@samhan/design-system')>('@samhan/design-system')
  return {
    ...actual,
    AsyncAutocomplete: ({ value, search, onChange, inputTestId }: any) => (
      <div>
        <span>{value?.displayName ?? ''}</span>
        <input data-testid={inputTestId} onChange={(event) => void search(event.target.value)} />
        <button type="button" onClick={() => onChange({ id: 'owner-2', displayName: '이담당' })}>
          이담당
        </button>
      </div>
    ),
  }
})

vi.mock('../api/estimateApi', async () => {
  const actual = await vi.importActual<typeof import('../api/estimateApi')>('../api/estimateApi')
  return { ...actual, getEstimate: vi.fn(), changeEstimateOwner: vi.fn() }
})
vi.mock('../api/approvalLineConfigApi', async () => {
  const actual = await vi.importActual<typeof import('../api/approvalLineConfigApi')>('../api/approvalLineConfigApi')
  return { ...actual, searchApprovalLineUsers: vi.fn() }
})

const getEstimateMock = vi.mocked(getEstimate)
const changeEstimateOwnerMock = vi.mocked(changeEstimateOwner)
const searchApprovalLineUsersMock = vi.mocked(searchApprovalLineUsers)

const estimate = {
  id: 'estimate-1',
  estimateNo: '2026/08/08-1',
  estimateDate: '2026-08-08',
  seqNo: 1,
  status: 'QUOTE_DRAFT' as const,
  partnerId: 'partner-1',
  partnerName: '삼한공조',
  partnerBusinessNo: null,
  validUntil: null,
  totalSupply: '100',
  totalVat: '10',
  totalAmount: '110',
  convertedSlipId: null,
  sentAt: null,
  acceptedAt: null,
  convertedAt: null,
  rejectedAt: null,
  memo: null,
  requesterId: 'owner-1',
  requesterName: '홍길동',
  createdByName: '원작성자',
  version: 0,
  isDeleted: false,
  deletedAt: null,
  deletedByName: null,
  restoreAvailable: true,
  partnerAddress: null,
  lines: [],
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/sales/estimates/estimate-1']}>
        <Routes>
          <Route path="/sales/estimates/:id" element={<EstimateDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('EstimateDetailPage 담당 변경', () => {
  beforeEach(() => {
    getEstimateMock.mockResolvedValue(estimate)
    searchApprovalLineUsersMock.mockResolvedValue([
      { id: 'owner-1', displayName: '홍길동' },
      { id: 'owner-2', displayName: '이담당' },
    ])
    changeEstimateOwnerMock.mockResolvedValue({ ...estimate, requesterId: 'owner-2', requesterName: '이담당' })
  })

  afterEach(() => vi.clearAllMocks())

  it('담당자 이름을 표시하고 선택한 UUID를 owner endpoint에만 전달한다', async () => {
    renderPage()

    expect(await screen.findByText('홍길동')).toBeTruthy()
    expect(screen.queryByText('owner-1')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '이담당' }))

    await waitFor(() => expect(changeEstimateOwnerMock).toHaveBeenCalledWith(
      'estimate-1',
      { requesterId: 'owner-2', documentType: 'ESTIMATE' },
    ))
  })

  it('DS 상세에 목록으로 돌아가는 액션이 있다', async () => {
    renderPage()

    await screen.findByTestId('estimate-detail-no')
    expect(screen.getByRole('button', { name: /목록/ })).toBeTruthy()
  })

  it('계열 교차 변경 거부 사유를 화면에 표시한다', async () => {
    changeEstimateOwnerMock.mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: '주문서 계열은 견적서 담당 변경 대상이 아닙니다' } },
    })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: '이담당' }))

    expect((await screen.findByRole('alert')).textContent).toContain('주문서 계열은 견적서 담당 변경 대상이 아닙니다')
  })
})
