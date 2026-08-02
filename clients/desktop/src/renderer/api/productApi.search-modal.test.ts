import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { searchProducts } from './productApi'

vi.mock('./client', () => ({ apiClient: { get: vi.fn() } }))

describe('품목 검색 결과 선택 모달 API 계약', () => {
  beforeEach(() => vi.mocked(apiClient.get).mockReset())

  it('부분검색 후보를 20건에서 자르지 않는다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { data: { content: [{ id: 'p-21', modelName: 'AJ016MB1PBC2', name: '품목' }] } },
    })

    await searchProducts('AJ')

    expect(apiClient.get).toHaveBeenCalledWith('/api/products', {
      params: { q: 'AJ', size: 10000 },
    })
  })
})
