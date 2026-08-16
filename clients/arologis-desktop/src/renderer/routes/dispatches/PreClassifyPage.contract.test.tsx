import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPreClassify, getRegional } from '../../api/arologisDispatch'
import { ArologisPreClassifyPage } from './PreClassifyPage'

vi.mock('../../api/arologisDispatch', () => ({
  getPreClassify: vi.fn(),
  getRegional: vi.fn(),
}))

const mockedGetPreClassify = vi.mocked(getPreClassify)
const mockedGetRegional = vi.mocked(getRegional)

describe('아로로지스 가배차 분류 라우트', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('가배차 분류 화면을 렌더링하고 수신 배차 그룹 화면을 렌더링하지 않는다', async () => {
    mockedGetPreClassify.mockResolvedValue({ regionGroups: {}, unclassified: [], unknownWarehouseCount: 0 })
    mockedGetRegional.mockResolvedValue({ date: '2026-08-16', sidoGroups: {}, unmatched: [] })

    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/dispatches/pre-classify']}>
          <ArologisPreClassifyPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByTestId('arologis-preclassify-tab-region')).toBeTruthy()
    await waitFor(() => expect(screen.queryByTestId('arologis-received-groups-page')).toBeNull())
  })
})
