import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { exportJournals, exportPartners, exportSlips, exportStocks } from './excelExportApi'

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}))

describe('excelExportApi gateway 경로', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset()
    vi.mocked(apiClient.get).mockResolvedValue({ data: new Blob() })
  })

  it('4개 export 는 현재 gateway 의 no-prefix controller 경로를 호출한다', async () => {
    await exportPartners({ q: 'P-2026-0001' })
    await exportSlips()
    await exportJournals({ from: '2026-01-01', to: '2026-12-31' })
    await exportStocks()

    expect(vi.mocked(apiClient.get).mock.calls.map(([path]) => path)).toEqual([
      '/admin/partners/export.xlsx',
      '/slips/export.xlsx',
      '/accounting/journals/export.xlsx',
      '/inventory/stocks/export.xlsx',
    ])
  })
})
