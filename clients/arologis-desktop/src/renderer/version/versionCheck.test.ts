import { describe, expect, it, vi } from 'vitest'
import {
  buildVersionCheckUrl,
  fetchDesktopVersionStatus,
  resolveBuildAppVersion,
  resolveVersionPromptState,
} from './versionCheck'

describe('아로로지스 데스크톱 버전 확인', () => {
  it('아로로지스 전용 clientType과 빌드 버전을 공개 API에 보낸다', () => {
    expect(buildVersionCheckUrl('http://localhost:8080/', '2026/07/29-1')).toBe(
      'http://localhost:8080/app/version?clientType=AROLOGIS_DESKTOP&currentVersion=2026%2F07%2F29-1',
    )
  })

  it('개발 빌드는 공통 sentinel을 사용하고 릴리스 주입값은 그대로 표시한다', () => {
    expect(resolveBuildAppVersion(undefined)).toBe('0.1.0-dev')
    expect(resolveBuildAppVersion('2026/07/29-1')).toBe('2026/07/29-1')
  })

  it('공개 버전 API 실패는 앱을 막지 않고 null로 끝난다', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'))

    await expect(fetchDesktopVersionStatus({
      apiBaseUrl: 'http://localhost:8080',
      currentVersion: '0.1.0-dev',
      fetchImpl,
    })).resolves.toBeNull()
  })

  it('CRITICAL 릴리스는 사용자가 최신 버전을 확인하도록 blocking 상태를 만든다', () => {
    const state = resolveVersionPromptState({
      latestVersion: '2026/07/29-2',
      minSupportedVersion: '2026/07/29-1',
      forceLevel: 'CRITICAL',
      releaseNotes: '긴급 업데이트',
      releasedAt: '2026-07-29T00:00:00Z',
    }, new Map())

    expect(state.kind).toBe('blocking')
  })
})
