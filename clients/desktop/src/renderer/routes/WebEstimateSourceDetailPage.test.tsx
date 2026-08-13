// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebEstimateSourceDetailPage } from './WebEstimateSourceDetailPage'
import { listWebPartnerOrderDraftSummaries, listWebQuoteSnapshotSummaries } from '../api/estimateSourceApi'

const navigateMock = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }))

vi.mock('../api/estimateSourceApi', async () => {
  const actual = await vi.importActual<typeof import('../api/estimateSourceApi')>('../api/estimateSourceApi')
  return {
    ...actual,
    listWebPartnerOrderDraftSummaries: vi.fn(),
    listWebQuoteSnapshotSummaries: vi.fn(),
  }
})

const listWebPartnerOrderDraftSummariesMock = vi.mocked(listWebPartnerOrderDraftSummaries)
const listWebQuoteSnapshotSummariesMock = vi.mocked(listWebQuoteSnapshotSummaries)

function renderPage(kind: 'snapshot' | 'draft', initialEntry: string | { pathname: string; state?: unknown }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path={kind === 'draft' ? '/sales/partner-orders/web-drafts/:id' : '/sales/estimates/web-snapshots/:id'}
            element={<WebEstimateSourceDetailPage kind={kind} />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('웹 저장 source 상세 목록 복귀', () => {
  afterEach(() => cleanup())

  beforeEach(() => {
    navigateMock.mockReset()
    listWebPartnerOrderDraftSummariesMock.mockReset()
    listWebQuoteSnapshotSummariesMock.mockReset()
    listWebPartnerOrderDraftSummariesMock.mockResolvedValue([{
      draftKey: 'draft-1',
      documentLabel: '웹 주문서 1',
      partnerCode: 'P-1',
      createdAt: '2026-08-13T10:00:00',
      totalAmount: '100000',
    }])
    listWebQuoteSnapshotSummariesMock.mockResolvedValue([{
      snapshotKey: 'snapshot-1',
      documentLabel: '웹 견적서 1',
      custName: '거래처 1',
      created: '2026-08-13T10:00:00',
      totalAmount: '100000',
    }])
  })

  it('주문서 상세를 직접 열면 목록으로가 주문서 탭으로 간다', async () => {
    renderPage('draft', '/sales/partner-orders/web-drafts/draft-1')

    fireEvent.click(await screen.findByRole('button', { name: '목록으로' }))

    expect(navigateMock).toHaveBeenCalledWith(
      { pathname: '/sales/estimates', search: '?tab=orders' },
      { replace: true },
    )
  })

  it('종합견적서 상세를 직접 열면 목록으로가 종합견적서 탭으로 간다', async () => {
    renderPage('snapshot', '/sales/estimates/web-snapshots/snapshot-1')

    fireEvent.click(await screen.findByRole('button', { name: '목록으로' }))

    expect(navigateMock).toHaveBeenCalledWith(
      { pathname: '/sales/estimates', search: '' },
      { replace: true },
    )
  })

  it('목록에서 들어온 주문서 상세는 기존 history로 돌아가 주문서 탭을 보존한다', async () => {
    renderPage('draft', {
      pathname: '/sales/partner-orders/web-drafts/draft-1',
      state: {
        returnTo: { pathname: '/sales/estimates', search: '?tab=orders' },
        returnEntryKey: 'orders-list-entry',
      },
    })

    fireEvent.click(await screen.findByRole('button', { name: '목록으로' }))

    expect(navigateMock).toHaveBeenCalledWith(-1)
  })
})
