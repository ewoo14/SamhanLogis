// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AxiosError } from 'axios'

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }))

const getPartnerAgingMock = vi.fn()
vi.mock('../api/accounting', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/accounting')>()
  return { ...actual, getPartnerAging: (...args: unknown[]) => getPartnerAgingMock(...args) }
})

import { PartnerAgingPage } from './PartnerAgingPage'

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
      <MemoryRouter initialEntries={['/accounting/reports/partner-aging?type=RECEIVABLE']}>
        <PartnerAgingPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  getPartnerAgingMock.mockReset()
})

describe('PartnerAgingPage — partner lookup UNAVAILABLE 안내 문구 (#831 R-2)', () => {
  it('BE 원문 메시지("거래처 조회를 일시적으로...")를 노출한다 — "백엔드 연결을 확인" 문구는 쓰지 않는다 (G2)', async () => {
    getPartnerAgingMock.mockRejectedValue(partnerLookupUnavailableError())
    renderPage()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('거래처 조회를 일시적으로 할 수 없습니다')
    expect(alert.textContent).not.toContain('백엔드 연결을 확인')
  })

  it('다시 시도 버튼을 제공하고 클릭 시 refetch 한다 (G2 — 이전엔 재시도 수단이 없었다)', async () => {
    getPartnerAgingMock.mockRejectedValue(partnerLookupUnavailableError())
    renderPage()

    await screen.findByRole('alert')
    expect(getPartnerAgingMock).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(getPartnerAgingMock).toHaveBeenCalledTimes(2))
  })

  it('정상 응답에서는 표와 합계가 그대로 나온다 (무회귀)', async () => {
    getPartnerAgingMock.mockResolvedValue({
      accountCode: '108',
      accountName: '외상매출금',
      asOfDate: '2026-06-30',
      type: 'RECEIVABLE',
      partnerCount: 1,
      totalAmount: '5000000',
      generatedAt: '2026-07-25T09:00:00+09:00',
      lines: [
        { partnerCode: 'P-001', bizNo: '123-45-67890', partnerName: '삼한공조', balance: '5000000', oldestUnpaidDate: '2026-05-01', agingDays: 60 },
      ],
    })
    renderPage()

    expect(await screen.findByText('삼한공조')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
