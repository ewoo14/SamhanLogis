// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AxiosError } from 'axios'

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }))

const getFundsStatusMock = vi.fn()
vi.mock('../api/accounting', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/accounting')>()
  return { ...actual, getFundsStatus: (...args: unknown[]) => getFundsStatusMock(...args) }
})

import { FundsStatusPage } from './FundsStatusPage'

function partnerLookupUnavailableError(): AxiosError {
  return new AxiosError('Request failed', undefined, undefined, undefined, {
    data: {
      success: false,
      code: 'PARTNER_IDENTITY_LOOKUP_UNAVAILABLE',
      message: '거래처 조회를 일시적으로 할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    },
    status: 502,
    statusText: 'Bad Gateway',
    headers: {},
    config: {} as never,
  })
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <FundsStatusPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  getFundsStatusMock.mockReset()
})

describe('FundsStatusPage — partner lookup UNAVAILABLE 안내 문구 (#831 R-2)', () => {
  it('BE 원문 메시지를 노출하고 재시도를 제공한다 (G2)', async () => {
    getFundsStatusMock.mockRejectedValue(partnerLookupUnavailableError())
    renderPage()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('거래처 조회를 일시적으로 할 수 없습니다')
    expect(alert.textContent).not.toContain('백엔드 연결을 확인')

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(getFundsStatusMock).toHaveBeenCalledTimes(2))
  })
})
