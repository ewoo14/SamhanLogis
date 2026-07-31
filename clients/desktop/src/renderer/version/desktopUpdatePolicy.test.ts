import { describe, expect, it } from 'vitest'
import {
  resolveDesktopUpdatePresentation,
  type DesktopUpdateStatus,
} from './desktopUpdatePolicy'

const statuses: DesktopUpdateStatus[] = [
  { kind: 'checking' },
  { kind: 'available', version: '0.2.0' },
  { kind: 'downloading', percent: 42 },
  { kind: 'downloaded', version: '0.2.0' },
  { kind: 'not-available' },
  { kind: 'error', message: '네트워크 오류' },
]

describe('데스크톱 자동 업데이트 강제 수준 배선', () => {
  it.each([
    ['NONE', 'none'],
    ['MINOR', 'minor'],
    ['MAJOR', 'major'],
    ['CRITICAL', 'critical'],
  ] as const)('%s는 실제 UI 정책 상태 %s를 만든다', (forceLevel, expectedKind) => {
    for (const status of statuses) {
      expect(resolveDesktopUpdatePresentation(forceLevel, status)).toMatchObject({
        kind: expectedKind,
      })
    }
  })

  it('CRITICAL은 업데이트 실패·오프라인에서도 차단 정책을 유지한다', () => {
    expect(resolveDesktopUpdatePresentation('CRITICAL', {
      kind: 'error',
      message: '서버에 연결할 수 없습니다.',
    })).toEqual({
      kind: 'critical',
      canContinue: false,
      message: '서버에 연결할 수 없습니다.',
    })
  })

  it('자동 설치 계약은 사용자 설치 버튼을 제공하지 않는다', () => {
    expect(resolveDesktopUpdatePresentation('CRITICAL', {
      kind: 'downloaded',
      version: '2026/07/30-3',
    })).toEqual({
      kind: 'critical',
      canContinue: false,
      canInstall: false,
      version: '2026/07/30-3',
    })
    expect(resolveDesktopUpdatePresentation('MAJOR', {
      kind: 'available',
      version: '0.2.0',
    })).toMatchObject({ kind: 'major', canInstall: false })
  })
})
