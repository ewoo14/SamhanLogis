import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../api/client'
import { collabHeaders } from '../auth/collabHeaders'
import { makeCoeditApi } from './coeditApi'

vi.mock('../api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

vi.mock('../auth/collabHeaders', () => ({
  collabHeaders: vi.fn(),
}))

const envelope = <T,>(data: T) => ({
  data: {
    success: true,
    code: 'OK',
    message: 'OK',
    data,
    timestamp: '2026-06-30T00:00:00+09:00',
  },
})

describe('makeCoeditApi', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset()
    vi.mocked(apiClient.post).mockReset()
    vi.mocked(collabHeaders).mockReset()
    vi.mocked(collabHeaders).mockResolvedValue({ 'X-User-Id': 'actor-1' })
  })

  it('basePath로 coedit snapshot URL을 만들고 updates 배열을 반환한다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(envelope({ updates: ['AQID'] }))

    await expect(makeCoeditApi('/slips/abc').getUpdates()).resolves.toEqual(['AQID'])

    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/v1/slips/abc/collab/coedit',
      { headers: { 'X-User-Id': 'actor-1' } },
    )
  })

  it('basePath로 update relay URL과 요청 body를 만든다', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(envelope(null))

    await expect(makeCoeditApi('/slips/abc').postUpdate('AQID')).resolves.toBeUndefined()

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/v1/slips/abc/collab/coedit/update',
      { update: 'AQID' },
      { headers: { 'X-User-Id': 'actor-1' } },
    )
  })

  it('basePath로 awareness relay URL과 요청 body를 만든다', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(envelope(null))

    await expect(makeCoeditApi('/slips/abc').postAwareness('BQYH')).resolves.toBeUndefined()

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/v1/slips/abc/collab/coedit/awareness',
      { awareness: 'BQYH' },
      { headers: { 'X-User-Id': 'actor-1' } },
    )
  })
})
