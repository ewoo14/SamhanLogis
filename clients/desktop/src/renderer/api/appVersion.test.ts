import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import {
  APP_CLIENT_OPTIONS,
  appClientOptionsForRelease,
  createAppRelease,
  deleteAppRelease,
  getAppVersion,
  listAppReleases,
  publishAppRelease,
  unpublishAppRelease,
  updateAppRelease,
  type AppReleasePayload,
} from './appVersion'

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
    timestamp: '2026-06-27T00:00:00+09:00',
  },
})

describe('appVersion API client', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset()
    vi.mocked(apiClient.post).mockReset()
    vi.mocked(apiClient.put).mockReset()
    vi.mocked(apiClient.delete).mockReset()
  })

  it('데스크톱 Electron·Capacitor·웹 런타임을 덮는 canonical 선택지와 legacy 복원 선택지를 제공한다', () => {
    expect(APP_CLIENT_OPTIONS.map((option) => option.value)).toEqual(expect.arrayContaining([
      'DESKTOP',
      'SAMHAN_MOBILE',
      'SAMHAN_MOBILE_STAFF',
      'AROLOGIS_MOBILE',
      'SAMHAN_ORDER_WEB',
      'SAMHAN_ESTIMATE_WEB',
      'SAMHAN_MOBILE_PUBLIC_WEB',
      'AROLOGIS_DESKTOP',
    ]))
    expect(APP_CLIENT_OPTIONS.map((option) => option.value)).not.toEqual(expect.arrayContaining(['WEB', 'MOBILE']))

    const legacyOptions = appClientOptionsForRelease('WEB')
    expect(legacyOptions[0]).toEqual({ value: 'WEB', label: '기존 웹 클라이언트(호환)' })
    expect(legacyOptions.map((option) => option.value)).toContain('DESKTOP')
  })

  it('버전 확인을 지원하지 않는 4개 앱을 관리 선택지에 표시한다', () => {
    expect(APP_CLIENT_OPTIONS.filter((option) => !option.versionCheckSupported).map((option) => option.value))
      .toEqual(expect.arrayContaining([
        'SAMHAN_ORDER_WEB',
        'SAMHAN_ESTIMATE_WEB',
        'SAMHAN_MOBILE_PUBLIC_WEB',
        'AROLOGIS_DESKTOP',
      ]))
  })

  it('GET /app/version은 skipAuth public 요청으로 currentVersion과 clientType을 보낸다', async () => {
    const data = {
      latestVersion: '0.2.0',
      minSupportedVersion: '0.1.0',
      forceLevel: 'MINOR' as const,
      releaseNotes: '권고 업데이트',
      releasedAt: '2026-06-27T09:00:00+09:00',
    }
    vi.mocked(apiClient.get).mockResolvedValueOnce(envelope(data))

    await expect(getAppVersion({
      clientType: 'DESKTOP',
      currentVersion: '0.1.0',
    })).resolves.toBe(data)

    expect(apiClient.get).toHaveBeenCalledWith('/app/version', {
      params: { clientType: 'DESKTOP', currentVersion: '0.1.0' },
      skipAuth: true,
    })
  })

  it('admin /app/releases CRUD 경로와 body를 그대로 위임한다', async () => {
    const releaseId = '00000000-0000-4000-8000-000000000101'
    const payload: AppReleasePayload = {
      clientType: 'WEB',
      version: '0.2.0',
      minSupportedVersion: '0.1.0',
      forceLevel: 'MAJOR',
      releaseNotes: '필수 업데이트',
      releasedAt: '2026-06-27T09:00:00+09:00',
    }
    const row = { id: releaseId, ...payload, isPublished: true }
    vi.mocked(apiClient.get).mockResolvedValueOnce(envelope([row]))
    vi.mocked(apiClient.post).mockResolvedValueOnce(envelope(row))
    vi.mocked(apiClient.put).mockResolvedValueOnce(envelope({ ...row, forceLevel: 'MINOR' }))
    vi.mocked(apiClient.delete).mockResolvedValueOnce(envelope(null))

    await expect(listAppReleases()).resolves.toEqual([row])
    await expect(createAppRelease(payload)).resolves.toEqual(row)
    await expect(updateAppRelease(releaseId, { ...payload, forceLevel: 'MINOR' })).resolves.toMatchObject({ forceLevel: 'MINOR' })
    await expect(deleteAppRelease(releaseId)).resolves.toBeUndefined()

    expect(apiClient.get).toHaveBeenCalledWith('/app/releases')
    expect(apiClient.post).toHaveBeenCalledWith('/app/releases', payload)
    expect(apiClient.put).toHaveBeenCalledWith(`/app/releases/${releaseId}`, { ...payload, forceLevel: 'MINOR' })
    expect(apiClient.delete).toHaveBeenCalledWith(`/app/releases/${releaseId}`)
  })

  it('admin /app/releases publish/unpublish 경로를 POST로 호출한다', async () => {
    const releaseId = '00000000-0000-4000-8000-000000000102'
    const row = {
      id: releaseId,
      clientType: 'WEB' as const,
      version: '0.2.0',
      minSupportedVersion: '0.1.0',
      forceLevel: 'MAJOR' as const,
      releaseNotes: '필수 업데이트',
      releasedAt: '2026-06-27T09:00:00+09:00',
      isPublished: true,
    }
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce(envelope(row))
      .mockResolvedValueOnce(envelope({ ...row, isPublished: false }))

    await expect(publishAppRelease(releaseId)).resolves.toMatchObject({ isPublished: true })
    await expect(unpublishAppRelease(releaseId)).resolves.toMatchObject({ isPublished: false })

    expect(apiClient.post).toHaveBeenNthCalledWith(1, `/app/releases/${releaseId}/publish`)
    expect(apiClient.post).toHaveBeenNthCalledWith(2, `/app/releases/${releaseId}/unpublish`)
  })
})
