// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SlipListPage } from './SlipListPage'
import { listSlips, type SlipSummary } from '../api/slip'

vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({ canAccess: () => true }),
}))
vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }))
vi.mock('../realtime/useCollectionRealtime', () => ({ useCollectionRealtime: vi.fn() }))
vi.mock('../api/excelExportApi', () => ({ exportSlips: vi.fn() }))
vi.mock('./components/InboundInspectionDialog', () => ({ InboundInspectionDialog: () => null }))

vi.mock('../api/slip', async () => {
  const actual = await vi.importActual<typeof import('../api/slip')>('../api/slip')
  return { ...actual, listSlips: vi.fn() }
})

const listSlipsMock = vi.mocked(listSlips)

function slip(overrides: Partial<SlipSummary> = {}): SlipSummary {
  return {
    id: 'slip-1', slipType: 'OUTBOUND', slipNo: '2026/08/07-1', slipDate: '2026-08-07',
    seqNo: 1, status: 'DRAFT', partnerId: null, partnerName: '거래처', partnerCode: 'P-1',
    sourceWarehouseId: null, destinationWarehouseId: null, deliveryTag: null,
    requesterId: null, acceptedBy: null, acceptedAt: null, completedAt: null, confirmedAt: null,
    updatedAt: '2026-08-07T00:00:00', version: 0, isDeleted: false, ...overrides,
  }
}

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><SlipListPage mode="OUTBOUND" /></MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(cleanup)

describe('SlipListPage pagination', () => {
  beforeEach(() => {
    listSlipsMock.mockReset()
    listSlipsMock.mockImplementation(async (options) => ({
      content: [slip({ id: `slip-${options.page}`, slipNo: `2026/08/07-${options.page}` })],
      totalElements: options.includeDeleted ? 41 : 1,
      totalPages: options.includeDeleted ? 3 : 1,
      number: options.page ?? 0,
      size: options.size ?? 20,
      first: (options.page ?? 0) === 0,
      last: (options.page ?? 0) === (options.includeDeleted ? 2 : 0),
    }))
  })

  it('삭제 포함 출고전표는 다음 페이지로 이동하고 토글 OFF는 첫 활성 페이지로 복귀한다', async () => {
    renderPage()
    const toggle = await screen.findByTestId('slip-list-include-deleted')
    fireEvent.click(toggle)
    fireEvent.click(await screen.findByTestId('slip-list-next-page'))

    await waitFor(() => expect(listSlipsMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, includeDeleted: true })))
    fireEvent.click(await screen.findByTestId('slip-list-next-page'))
    await waitFor(() => expect(listSlipsMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, includeDeleted: true })))
    fireEvent.click(toggle)
    await waitFor(() => expect(listSlipsMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 0, includeDeleted: false })))
  })
})
