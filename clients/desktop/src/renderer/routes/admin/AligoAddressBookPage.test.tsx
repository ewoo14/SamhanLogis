// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({ canAccess: () => true, isLoading: false }),
}))
vi.mock('../../hooks/usePageTitle', () => ({ usePageTitle: () => {} }))

const syncAligoAddressBookMock = vi.fn()
vi.mock('../../api/aligoAddressBookApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/aligoAddressBookApi')>()
  return {
    ...actual,
    syncAligoAddressBook: (...args: unknown[]) => syncAligoAddressBookMock(...args),
  }
})

import { AligoAddressBookPage } from './AligoAddressBookPage'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AligoAddressBookPage />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  syncAligoAddressBookMock.mockReset()
})

describe('AligoAddressBookPage 외부 전달 상태 표시', () => {
  it('mock 미전달 결과에서는 신규·변경 양수를 성공 건수로 표시하지 않는다', async () => {
    syncAligoAddressBookMock.mockResolvedValue({
      added: 7,
      updated: 2,
      skipped: 0,
      failed: [],
      deliveryStatus: 'NOT_DELIVERED',
    })

    renderPage()
    fireEvent.click(screen.getByTestId('admin-aligo-sync-btn'))

    await waitFor(() => expect(screen.getByTestId('admin-aligo-delivery-status').textContent)
      .toContain('실제 알리고 전달 0건'))
    expect(screen.getByTestId('admin-aligo-result-added').textContent).toContain('신규 0')
    expect(screen.getByTestId('admin-aligo-result-updated').textContent).toContain('변경 0')
  })

  it('실제 전달 결과에서는 신규·변경 건수를 표시한다', async () => {
    syncAligoAddressBookMock.mockResolvedValue({
      added: 3,
      updated: 1,
      skipped: 2,
      failed: [],
      deliveryStatus: 'DELIVERED',
    })

    renderPage()
    fireEvent.click(screen.getByTestId('admin-aligo-sync-btn'))

    await waitFor(() => expect(screen.getByTestId('admin-aligo-delivery-status').textContent)
      .toContain('실제 전달된 결과'))
    expect(screen.getByTestId('admin-aligo-result-added').textContent).toContain('신규 3')
    expect(screen.getByTestId('admin-aligo-result-updated').textContent).toContain('변경 1')
  })

  it('chunk 혼합 결과에서는 일부 전달 상태를 사용자에게 표시한다', async () => {
    syncAligoAddressBookMock.mockResolvedValue({
      added: 2,
      updated: 0,
      skipped: 1,
      failed: ['chunk#2 HTTP 500'],
      deliveryStatus: 'PARTIALLY_DELIVERED',
    })

    renderPage()
    fireEvent.click(screen.getByTestId('admin-aligo-sync-btn'))

    await waitFor(() => expect(screen.getByTestId('admin-aligo-delivery-status').textContent)
      .toContain('일부 연락처만 실제'))
    expect(screen.getByTestId('admin-aligo-result-added').textContent).toContain('신규 2')
    expect(screen.getByTestId('admin-aligo-result-failed').textContent).toContain('실패 1')
  })
})
