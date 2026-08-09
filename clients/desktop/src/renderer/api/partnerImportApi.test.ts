import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { importPartnerFile, listPartnerImportRejections } from './partnerImportApi'

vi.mock('./client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}))

describe('partnerImportApi', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset()
    vi.mocked(apiClient.post).mockReset()
  })

  it('적재 결과도 표준 ApiResponse의 data payload를 반환한다', async () => {
    const result = { totalRows: 1, imported: 1, updated: 0, sourceFileHash: 'hash-1' }
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: result } })

    await expect(importPartnerFile(new File(['csv'], 'partners.csv'))).resolves.toMatchObject(result)
    expect(apiClient.post).toHaveBeenCalledWith('/admin/partners/imports/ecount', expect.any(FormData), {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  })

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
