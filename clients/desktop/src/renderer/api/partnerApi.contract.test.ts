import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { searchPartners } from './partnerApi'

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}))

describe('partnerApi searchPartners 오류 계약', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset()
  })

  it('기존 소비처는 기본값에서 검색 오류를 빈 배열로 받는다', async () => {
    const error = new Error('검색 서버 오류')
    vi.mocked(apiClient.get).mockRejectedValueOnce(error)

    await expect(searchPartners('P-1')).resolves.toEqual([])
  })

  it('병합 후보 선택은 검색 오류를 재전파해 권한 오류를 결과 없음으로 숨기지 않는다', async () => {
    const error = new Error('403 Forbidden')
    vi.mocked(apiClient.get).mockRejectedValueOnce(error)

    await expect(searchPartners('P-1', { activeOnly: true, throwOnError: true })).rejects.toBe(error)
  })
})
