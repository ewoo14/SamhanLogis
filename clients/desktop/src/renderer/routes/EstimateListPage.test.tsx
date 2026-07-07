// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EstimateListPage } from './EstimateListPage'
import {
  listEstimates,
  restoreEstimate,
  type EstimateSummary,
} from '../api/estimateApi'
import { useCollectionRealtime } from '../realtime/useCollectionRealtime'

const navigateMock = vi.fn()
const canAccessMock = vi.fn(() => true)

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({ canAccess: canAccessMock }),
}))

vi.mock('../realtime/useCollectionRealtime', () => ({
  useCollectionRealtime: vi.fn(),
}))

vi.mock('../api/estimateApi', async () => {
  const actual = await vi.importActual<typeof import('../api/estimateApi')>('../api/estimateApi')
  return {
    ...actual,
    listEstimates: vi.fn(),
    restoreEstimate: vi.fn(),
  }
})

const listEstimatesMock = vi.mocked(listEstimates)
const restoreEstimateMock = vi.mocked(restoreEstimate)
const useCollectionRealtimeMock = vi.mocked(useCollectionRealtime)

function estimateRow(overrides: Partial<EstimateSummary> = {}): EstimateSummary {
  return {
    id: 'estimate-1',
    estimateNo: '2026/07/07-1',
    estimateDate: '2026-07-07',
    seqNo: 1,
    status: 'QUOTE_DRAFT',
    partnerId: 'partner-1',
    partnerName: '삼한공조',
    partnerBusinessNo: '123-45-67890',
    validUntil: '2026-08-07',
    totalSupply: '100000',
    totalVat: '10000',
    totalAmount: '110000',
    convertedSlipId: null,
    sentAt: null,
    acceptedAt: null,
    convertedAt: null,
    requesterId: null,
    version: 0,
    isDeleted: false,
    deletedAt: null,
    deletedByName: null,
    ...overrides,
  }
}

function pageOf(content: EstimateSummary[]) {
  return {
    content,
    totalElements: content.length,
    totalPages: 1,
    number: 0,
    size: 50,
    first: true,
    last: true,
  }
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <EstimateListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('EstimateListPage E2 list realtime and restore', () => {
  beforeEach(() => {
    navigateMock.mockReset()
    canAccessMock.mockReset()
    canAccessMock.mockReturnValue(true)
    useCollectionRealtimeMock.mockReset()
    listEstimatesMock.mockReset()
    restoreEstimateMock.mockReset()
    restoreEstimateMock.mockResolvedValue(undefined)
    listEstimatesMock.mockResolvedValue(pageOf([estimateRow()]))
  })

  it('견적 목록 coarse SSE 키로 realtime invalidate를 구독한다', async () => {
    renderPage()

    await screen.findByTestId('estimate-list-table')

    expect(useCollectionRealtimeMock).toHaveBeenCalledWith(
      expect.anything(),
      'list',
      [['estimates', 'list']],
    )
  })

  it('삭제행은 견적번호만 취소선 처리하고 삭제 배지는 취소선 span 바깥 형제로 렌더하며 행 클릭을 막는다', async () => {
    listEstimatesMock.mockResolvedValue(pageOf([
      estimateRow({
        id: 'estimate-deleted',
        estimateNo: '2026/07/07-2',
        partnerName: '삭제거래처',
        isDeleted: true,
        deletedByName: '이운영',
        deletedAt: '2026-07-07T08:10:00',
      }),
    ]))

    renderPage()

    const row = await screen.findByTestId('estimate-list-row-estimate-deleted')
    const estimateNo = within(row).getByTestId('estimate-list-row-estimate-deleted-number')
    const badge = within(row).getByTestId('estimate-list-row-estimate-deleted-deleted-badge')

    expect(estimateNo.getAttribute('style') ?? '').toContain('line-through')
    expect(badge.textContent).toContain('삭제: 이운영')
    expect(estimateNo.contains(badge)).toBe(false)
    expect(badge.parentElement).toBe(estimateNo.parentElement)

    // 공유 DataTable 은 삭제행 클릭 차단을 rowClickable(false → onClick 미부착) + onRowClick
    // isDeleted 가드로 처리하고 aria-disabled 는 설정하지 않는다(main 222ed087a dead-affordance
    // fix 병합 반영). 클릭 차단은 아래 navigate 미호출로 실증한다(#759 병합 정합).
    fireEvent.click(row)

    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('복원 버튼은 행 클릭으로 전파되지 않고 BE 한국어 에러 메시지를 danger 배너에 표시한다', async () => {
    listEstimatesMock.mockResolvedValue(pageOf([
      estimateRow({
        id: 'estimate-deleted',
        estimateNo: '2026/07/07-2',
        isDeleted: true,
        deletedByName: '이운영',
        deletedAt: '2026-07-07T08:10:00',
      }),
    ]))
    restoreEstimateMock.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: { message: '이미 사용 중인 견적번호로 활성 견적이 존재하여 복원할 수 없습니다' },
      },
    })

    renderPage()

    const button = await screen.findByTestId('estimate-list-row-estimate-deleted-restore')
    fireEvent.click(button)

    await waitFor(() => expect(restoreEstimateMock.mock.calls[0]?.[0]).toBe('estimate-deleted'))
    expect(navigateMock).not.toHaveBeenCalled()

    const alert = await screen.findByTestId('estimate-list-restore-error')
    expect(alert.textContent).toContain('이미 사용 중인 견적번호')
    expect(alert.getAttribute('style') ?? '').toContain('var(--color-danger-700)')
  })
})
