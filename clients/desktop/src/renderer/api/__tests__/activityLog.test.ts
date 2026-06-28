import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../client'
import { fetchActivityLogs, recordMenuAccess } from '../activityLog'

describe('activityLog API', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('fetchActivityLogs 는 빈 필터를 제거하고 /logs/activity 를 호출한다', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: {
        success: true,
        code: 'OK',
        message: '',
        timestamp: '',
        data: { items: [], totalElements: 0, totalPages: 0, page: 0, size: 20 },
      },
    } as never)

    await fetchActivityLogs({
      action: 'MENU_ACCESS',
      resourceId: 'dev.activity-log',
      q: '',
      fromInstant: '2026-06-28T09:00:00+09:00',
      page: 1,
      size: 10,
    })

    expect(get).toHaveBeenCalledWith('/logs/activity', {
      params: {
        action: 'MENU_ACCESS',
        resourceId: 'dev.activity-log',
        fromInstant: '2026-06-28T09:00:00+09:00',
        page: 1,
        size: 10,
      },
    })
  })

  it('recordMenuAccess 는 MENU_ACCESS 이벤트만 보낸다', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { success: true, code: 'OK', message: '', timestamp: '', data: null },
    } as never)

    await recordMenuAccess({
      resourceId: 'dev.activity-log',
      userRole: 'DEVELOPER',
      description: '로그 메뉴 진입',
      occurredAt: '2026-06-28T09:00:00+09:00',
    })

    expect(post).toHaveBeenCalledWith('/logs/front', {
      action: 'MENU_ACCESS',
      resourceType: 'MENU',
      resourceId: 'dev.activity-log',
      userRole: 'DEVELOPER',
      description: '로그 메뉴 진입',
      occurredAt: '2026-06-28T09:00:00+09:00',
    })
  })
})
