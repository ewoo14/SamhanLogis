import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { collabHeaders } from '../auth/collabHeaders'
import { addEstimateCollabComment, getEstimateCollabComments } from './estimateCollab'

vi.mock('./client', () => ({
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
    timestamp: '2026-07-05T00:00:00+09:00',
  },
})

describe('estimateCollab API paths', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset()
    vi.mocked(apiClient.post).mockReset()
    vi.mocked(collabHeaders).mockReset()
    vi.mocked(collabHeaders).mockResolvedValue({ 'X-User-Id': 'actor-1' })
  })

  it('댓글 조회는 gateway 표준 /api/v1/slips/estimates 경로를 사용한다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(envelope([]))

    await expect(getEstimateCollabComments('estimate/1', 10)).resolves.toEqual([])

    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/v1/slips/estimates/estimate-1/collab/comments',
      { params: { limit: 10 }, headers: { 'X-User-Id': 'actor-1' } },
    )
  })

  it('댓글 작성은 gateway 표준 /api/v1/slips/estimates 경로를 사용한다', async () => {
    const comment = {
      id: 'comment-1',
      anchor: 'memo',
      authorName: '작성자',
      body: '본문',
      parentId: null,
      status: 'OPEN' as const,
      createdAt: '2026-07-05T00:00:00+09:00',
    }
    vi.mocked(apiClient.post).mockResolvedValueOnce(envelope(comment))

    await expect(addEstimateCollabComment('estimate/1', {
      body: '본문',
      anchor: 'memo',
    })).resolves.toEqual(comment)

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/v1/slips/estimates/estimate-1/collab/comments',
      { body: '본문', anchor: 'memo' },
      { headers: { 'X-User-Id': 'actor-1' } },
    )
  })
})
