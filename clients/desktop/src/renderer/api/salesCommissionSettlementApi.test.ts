import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import {
  confirmSalesCommissionSettlement,
  createSalesCommissionSettlement,
  getSalesCommissionSettlement,
  listSalesCommissionSettlements,
} from './accounting'

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

describe('영업수수료 정산 API 계약', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset()
    vi.mocked(apiClient.post).mockReset()
  })

  it('목록은 page/size와 ApiResponse.data.content를 사용한다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { data: { content: [], totalElements: 0, totalPages: 0, number: 0, size: 20, first: true, last: true } },
    })

    await expect(listSalesCommissionSettlements({ page: 0, size: 20 })).resolves.toMatchObject({
      content: [],
      totalElements: 0,
    })
    expect(apiClient.get).toHaveBeenCalledWith('/accounting/sales-commission-settlements', {
      params: { page: 0, size: 20 },
    })
  })

  it('생성은 기준일만 보내고 DRAFT 응답을 돌려준다', async () => {
    const draft = { id: 'internal-id', documentNo: null, settlementDate: '2026-08-11', status: 'DRAFT' }
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: draft } })

    await expect(createSalesCommissionSettlement({ settlementDate: '2026-08-11' })).resolves.toEqual(draft)
    expect(apiClient.post).toHaveBeenCalledWith(
      '/accounting/sales-commission-settlements',
      { settlementDate: '2026-08-11' },
    )
  })

  it('상세·확정 endpoint는 내부 id path만 사용하고 번호를 화면 식별자로 보존한다', async () => {
    const confirmed = { id: 'internal-id', documentNo: '2026/08/11-1', settlementDate: '2026-08-11', status: 'CONFIRMED' }
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: confirmed } })
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: confirmed } })

    await expect(getSalesCommissionSettlement('internal-id')).resolves.toEqual(confirmed)
    await expect(confirmSalesCommissionSettlement('internal-id')).resolves.toEqual(confirmed)
    expect(apiClient.get).toHaveBeenCalledWith('/accounting/sales-commission-settlements/internal-id')
    expect(apiClient.post).toHaveBeenCalledWith('/accounting/sales-commission-settlements/internal-id/confirm', {})
  })
})
