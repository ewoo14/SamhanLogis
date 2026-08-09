import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { listPartnerImportRejections } from './partnerImportApi'

vi.mock('./client', () => ({
  apiClient: { get: vi.fn() },
}))

describe('partnerImportApi', () => {
  beforeEach(() => vi.mocked(apiClient.get).mockReset())

  it('보류 목록을 sourceFileHash 기준 페이지 API로 조회한다', async () => {
    const page = {
      sourceFileHash: 'hash-1', page: 0, size: 100,
      items: [{ rowNumber: 3, reason: 'CSV_ENCODING', rawPartnerCode: '읽을 수 없음', rawName: '읽을 수 없음' }],
      totalElements: 1000,
      totalPages: 10,
    }
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: page } })

    await expect(listPartnerImportRejections('hash-1', 0, 100)).resolves.toMatchObject({
      content: page.items, totalElements: 1000, totalPages: 10, number: 0, size: 100,
    })
    expect(apiClient.get).toHaveBeenCalledWith('/admin/partners/imports/ecount/rejections', {
      params: { sourceFileHash: 'hash-1', page: 0, size: 100 },
    })
  })
})
