import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import {
  deletePartner,
  listAdminPartners,
  restorePartner,
} from './adminApi'

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

const envelope = <T,>(data: T) => ({ data: { data } })

describe('adminApi 거래처', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset()
    vi.mocked(apiClient.post).mockReset()
    vi.mocked(apiClient.delete).mockReset()
  })

  it('listAdminPartners 는 기본 호출에서 includeDeleted 를 전송하지 않는다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(envelope({ items: [], total: 0, page: 0, size: 20 }))

    await listAdminPartners({ q: '테스트', page: 0, size: 20 })

    expect(apiClient.get).toHaveBeenCalledWith('/admin/partners/search', {
      params: { page: 0, size: 20, q: '테스트' },
    })
  })

  it('listAdminPartners 는 관리자 목록에서만 includeDeleted=true 를 전송한다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(envelope({ items: [], total: 0, page: 0, size: 20 }))

    await listAdminPartners({ includeDeleted: true })

    expect(apiClient.get).toHaveBeenCalledWith('/admin/partners/search', {
      params: { page: 0, size: 20, includeDeleted: true },
    })
  })

  it('deletePartner 와 restorePartner 는 partnerCode path 를 인코딩한다', async () => {
    vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined)
    vi.mocked(apiClient.post).mockResolvedValueOnce(envelope(null))

    await deletePartner('P/삭제 1')
    await restorePartner('P/삭제 1')

    expect(apiClient.delete).toHaveBeenCalledWith('/admin/partners/P%2F%EC%82%AD%EC%A0%9C%201')
    expect(apiClient.post).toHaveBeenCalledWith('/admin/partners/P%2F%EC%82%AD%EC%A0%9C%201/restore')
  })
})
