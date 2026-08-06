import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { searchApprovers } from './groupwareApprovalApprover'

vi.mock('./client', () => ({ apiClient: { get: vi.fn() } }))

describe('담당자 검색 결과 선택 모달 API 계약', () => {
  beforeEach(() => vi.mocked(apiClient.get).mockReset())

  it('공용 선택 모달이 접근할 수 있도록 서버 후보 상한을 넓힌다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: [] } })

    await searchApprovers('개발')

    expect(apiClient.get).toHaveBeenCalledWith('/admin/groupware/approvals/approver-search', {
      params: { q: '개발', limit: '10000' },
    })
  })
})
