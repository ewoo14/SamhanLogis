import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import {
  createAppNotice,
  deleteAppNotice,
  deleteAppNoticeImage,
  getActiveAppNotices,
  listAppNotices,
  reorderAppNoticeImages,
  updateAppNotice,
  uploadAppNoticeImage,
  type AppNoticePayload,
} from './appNotice'

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

const envelope = <T,>(data: T) => ({
  data: {
    success: true,
    code: 'OK',
    message: 'OK',
    data,
    timestamp: '2026-06-28T00:00:00+09:00',
  },
})

describe('appNotice API client', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset()
    vi.mocked(apiClient.post).mockReset()
    vi.mocked(apiClient.put).mockReset()
    vi.mocked(apiClient.delete).mockReset()
  })

  it('GET /app/notices/active는 인증 요청으로 활성 공지를 조회한다', async () => {
    const notice = {
      id: 'notice-1',
      title: '공지',
      isActive: true,
      startAt: '2026-06-28T09:00:00',
      endAt: '2026-06-30T18:00:00',
      displayOrder: 1,
      images: [],
    }
    vi.mocked(apiClient.get).mockResolvedValueOnce(envelope([notice]))

    await expect(getActiveAppNotices()).resolves.toEqual([notice])

    expect(apiClient.get).toHaveBeenCalledWith('/app/notices/active')
  })

  it('admin CRUD와 이미지 endpoint 경로를 그대로 위임한다', async () => {
    const id = '00000000-0000-4000-8000-000000000201'
    const imageId = '00000000-0000-4000-8000-000000000202'
    const payload: AppNoticePayload = {
      title: '점검 안내',
      isActive: true,
      startAt: '2026-06-28T09:00:00',
      endAt: '2026-06-29T18:00:00',
      displayOrder: 1,
    }
    const row = { id, ...payload, images: [] }
    const file = new File(['png'], 'banner.png', { type: 'image/png' })
    vi.mocked(apiClient.get).mockResolvedValueOnce(envelope([row]))
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce(envelope(row))
      .mockResolvedValueOnce(envelope({ id: imageId, imageKey: 'key', imageUrl: 'url', displayOrder: 1, caption: '배너' }))
    vi.mocked(apiClient.put)
      .mockResolvedValueOnce(envelope({ ...row, title: '수정' }))
      .mockResolvedValueOnce(envelope([{ id: imageId, imageKey: 'key', imageUrl: 'url', displayOrder: 2, caption: '배너' }]))
    vi.mocked(apiClient.delete).mockResolvedValue(envelope(null))

    await expect(listAppNotices()).resolves.toEqual([row])
    await expect(createAppNotice(payload)).resolves.toEqual(row)
    await expect(updateAppNotice(id, { ...payload, title: '수정' })).resolves.toMatchObject({ title: '수정' })
    await expect(uploadAppNoticeImage(id, { file, caption: '배너', displayOrder: 1 })).resolves.toMatchObject({ id: imageId })
    await expect(reorderAppNoticeImages(id, [{ id: imageId, displayOrder: 2 }])).resolves.toHaveLength(1)
    await expect(deleteAppNoticeImage(id, imageId)).resolves.toBeUndefined()
    await expect(deleteAppNotice(id)).resolves.toBeUndefined()

    expect(apiClient.get).toHaveBeenCalledWith('/app/notices')
    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/app/notices', payload)
    expect(apiClient.put).toHaveBeenNthCalledWith(1, `/app/notices/${id}`, { ...payload, title: '수정' })
    expect(apiClient.post).toHaveBeenNthCalledWith(2, `/app/notices/${id}/images`, expect.any(FormData), {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    expect(apiClient.put).toHaveBeenNthCalledWith(2, `/app/notices/${id}/images/order`, [{ id: imageId, displayOrder: 2 }])
    expect(apiClient.delete).toHaveBeenNthCalledWith(1, `/app/notices/${id}/images/${imageId}`)
    expect(apiClient.delete).toHaveBeenNthCalledWith(2, `/app/notices/${id}`)
  })
})
