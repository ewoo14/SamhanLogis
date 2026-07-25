import { describe, expect, it } from 'vitest'
import {
  appVersionDismissKey,
  resolveBuildAppVersion,
  resolveAppClientType,
  resolveVersionPromptState,
} from './versionCheck'
import type { AppVersionInfo } from '../api/appVersion'

const baseVersionInfo: AppVersionInfo = {
  latestVersion: '0.2.0',
  minSupportedVersion: '0.1.0',
  forceLevel: 'NONE',
  releaseNotes: '안정화 릴리스',
  releasedAt: '2026-06-27T09:00:00+09:00',
}

describe('version-check model', () => {
  it('빌드 주입 개발 버전을 패키지 semver 대체값보다 우선 사용한다', () => {
    expect(resolveBuildAppVersion('2026/07/25-1')).toBe('2026/07/25-1')
    expect(resolveBuildAppVersion(undefined)).toBe('0.0.0')
  })

  it('Electron·Capacitor·웹 빌드는 모두 삼한 데스크톱 clientType으로 판정한다', () => {
    expect(resolveAppClientType({ electron: true, capacitor: false })).toBe('DESKTOP')
    expect(resolveAppClientType({ electron: false, capacitor: true })).toBe('DESKTOP')
    expect(resolveAppClientType({ electron: false, capacitor: false })).toBe('DESKTOP')
  })

  it('CRITICAL 응답만 닫을 수 없는 차단 상태로 변환한다', () => {
    const critical = resolveVersionPromptState({
      versionInfo: { ...baseVersionInfo, forceLevel: 'CRITICAL' },
      clientType: 'DESKTOP',
      storage: new Map<string, string>(),
    })

    expect(critical.kind).toBe('blocking')
  })

  it('MAJOR 응답은 세션에서만 닫을 수 있는 권고 상태로 변환한다', () => {
    const state = resolveVersionPromptState({
      versionInfo: { ...baseVersionInfo, forceLevel: 'MAJOR' },
      clientType: 'WEB',
      storage: new Map<string, string>(),
    })

    expect(state.kind).toBe('recommend')
  })

  it('MINOR 응답은 버전별 dismiss 기록이 없을 때만 권고 상태를 만든다', () => {
    const storage = new Map<string, string>()
    const visible = resolveVersionPromptState({
      versionInfo: { ...baseVersionInfo, forceLevel: 'MINOR' },
      clientType: 'WEB',
      storage,
    })

    expect(visible.kind).toBe('minor')

    storage.set(appVersionDismissKey('WEB', baseVersionInfo.latestVersion), 'true')

    const dismissed = resolveVersionPromptState({
      versionInfo: { ...baseVersionInfo, forceLevel: 'MINOR' },
      clientType: 'WEB',
      storage,
    })

    expect(dismissed.kind).toBe('none')
  })

  it('NONE 응답은 표시 상태를 만들지 않는다', () => {
    const state = resolveVersionPromptState({
      versionInfo: baseVersionInfo,
      clientType: 'DESKTOP',
      storage: new Map<string, string>(),
    })

    expect(state).toEqual({ kind: 'none' })
  })
})
