import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { searchProducts, type ProductSearchResults } from './productApi'

vi.mock('./client', () => ({ apiClient: { get: vi.fn() } }))

describe('품목 검색 결과 선택 모달 API 계약', () => {
  beforeEach(() => vi.mocked(apiClient.get).mockReset())

  it('부분검색 후보를 20건에서 자르지 않는다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { data: { content: [{ id: 'p-21', modelName: 'AJ016MB1PBC2', name: '품목' }] } },
    })

    await searchProducts('AJ', { size: 10000 })

    expect(apiClient.get).toHaveBeenCalledWith('/api/products', {
      params: { q: 'AJ', size: 10000 },
    })
  })

  it('비모달 자동완성은 전역 모달 상한을 사용하지 않는다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { data: { content: [{ id: 'p-1', modelName: 'AJ001', name: '품목' }] } },
    })

    await searchProducts('AJ')

    expect(apiClient.get).toHaveBeenCalledWith('/api/products', {
      params: { q: 'AJ', size: 20 },
    })
  })

  it('검색 페이지의 전체 건수와 절단 여부를 호출자에게 보존한다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { data: { content: [{ id: 'p-1', modelName: 'A-1', name: '품목' }], totalElements: 2686 } },
    })

    const results = await searchProducts('A', { size: 50 }) as ProductSearchResults

    expect(results).toHaveLength(1)
    expect(results.totalElements).toBe(2686)
    expect(results.truncated).toBe(true)
  })
})
