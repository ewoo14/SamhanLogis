import { describe, expect, it } from 'vitest'
import {
  buildVersionCheckUrl,
  fetchWebVersionStatus,
  hasUnsavedFormInput,
  resolveBuildAppVersion,
  resolveVersionPromptState,
} from './versionCheck'

describe('주문 웹 버전 확인 계약', () => {
  it('주문 웹 식별자만 포함한 공개 버전 URL을 만든다', () => {
    expect(buildVersionCheckUrl('http://localhost:8080/', '2026/07/26-928')).toBe(
      'http://localhost:8080/app/version?clientType=SAMHAN_ORDER_WEB&currentVersion=2026%2F07%2F26-928',
    )
  })

  it('릴리스 응답은 실제 사용자 안내 상태로 변환한다', () => {
    expect(resolveVersionPromptState({
      latestVersion: '2026/07/26-929',
      minSupportedVersion: '2026/07/25-1',
      forceLevel: 'MINOR',
      releaseNotes: '주문서 개선',
      releasedAt: '2026-07-26T09:00:00+09:00',
    }, new Map())).toMatchObject({ kind: 'minor', latestVersion: '2026/07/26-929' })
  })

  it('404와 네트워크 실패는 사용 가능한 상태로 fail-open 한다', async () => {
    const notFound = await fetchWebVersionStatus({
      apiBaseUrl: 'http://localhost:8080',
      currentVersion: '0.1.0-dev',
      fetchImpl: async () => new Response('', { status: 404 }),
    })
    const networkFailure = await fetchWebVersionStatus({
      apiBaseUrl: 'http://localhost:8080',
      currentVersion: '0.1.0-dev',
      fetchImpl: async () => { throw new Error('gateway down') },
    })

    expect(notFound).toBeNull()
    expect(networkFailure).toBeNull()
  })

  it('개발 sentinel을 명시 버전으로 그대로 허용한다', () => {
    expect(resolveBuildAppVersion('0.1.0-dev')).toBe('0.1.0-dev')
  })

  it('작성 중인 주문 입력이 있으면 새로고침 전 확인이 필요하다', () => {
    expect(hasUnsavedFormInput([
      { tagName: 'INPUT', type: 'text', value: '2', defaultValue: '' },
    ])).toBe(true)
    expect(hasUnsavedFormInput([
      { tagName: 'INPUT', type: 'text', value: '', defaultValue: '' },
    ])).toBe(false)
  })
})
