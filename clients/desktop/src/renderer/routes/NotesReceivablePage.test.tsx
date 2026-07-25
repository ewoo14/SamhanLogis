// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AxiosError } from 'axios'

vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({ canAccess: () => true, isLoading: false }),
}))
vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }))

const listNotesReceivableMock = vi.fn()
vi.mock('../api/accounting', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/accounting')>()
  return {
    ...actual,
    listNotesReceivable: (...args: unknown[]) => listNotesReceivableMock(...args),
  }
})

import { NotesReceivablePage } from './NotesReceivablePage'

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
        <NotesReceivablePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const sampleRow = {
  noteNo: 'N-2026-0001',
  partnerCode: 'P-001',
  bizNo: '123-45-67890',
  partnerName: '삼한공조',
  issueDate: '2026-07-01',
  maturityDate: '2026-10-01',
  amount: '5000000',
  noteType: 'PROMISSORY' as const,
  status: 'BOARDING' as const,
}

afterEach(() => {
  cleanup()
  listNotesReceivableMock.mockReset()
})

describe('NotesReceivablePage — partner lookup UNAVAILABLE (#831 R-1)', () => {
  it('502 응답 시 빈 표(등록된 받을어음이 없습니다) 대신 장애 안내를 렌더한다 (G1)', async () => {
    listNotesReceivableMock.mockRejectedValue(partnerLookupUnavailableError())
    renderPage()

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByRole('alert').textContent).toContain('거래처 조회를 일시적으로 할 수 없습니다')
    expect(screen.queryByText('등록된 받을어음이 없습니다')).toBeNull()
  })

  it('502 응답 시 합계가 0원으로 표시되지 않는다 (G1 — 합계 회귀 가드)', async () => {
    listNotesReceivableMock.mockRejectedValue(partnerLookupUnavailableError())
    renderPage()

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.queryByText(/^합계/)).toBeNull()
  })

  it('다시 시도 버튼 클릭 시 refetch 한다 (G2 — 재시도 경로)', async () => {
    listNotesReceivableMock.mockRejectedValue(partnerLookupUnavailableError())
    renderPage()

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(listNotesReceivableMock).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(listNotesReceivableMock).toHaveBeenCalledTimes(2))
  })

  it('정상 응답에서는 표와 합계가 그대로 나온다 (무회귀)', async () => {
    listNotesReceivableMock.mockResolvedValue([sampleRow])
    renderPage()

    expect(await screen.findByText('삼한공조')).toBeTruthy()
    expect(screen.getByText(/합계 5,000,000/)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
