// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InternalChatUpdateGate } from './InternalChatUpdateGate'

describe('InternalChatUpdateGate', () => {
  afterEach(() => {
    cleanup()
    delete window.internalChatUpdater
  })

  it.each([
    ['network', '업데이트 서버에 연결하지 못했습니다'],
    ['integrity', '업데이트 파일을 확인하지 못했습니다'],
    ['trust', '업데이트 파일의 인증서를 신뢰할 수 없습니다'],
  ] as const)('%s 오류를 AppUpdateNotice 계층으로 표시한다', (severity, title) => {
    const listener = vi.fn()
    window.internalChatUpdater = {
      check: vi.fn().mockResolvedValue(undefined),
      install: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue(undefined),
      onStatus: (next) => { listener.mockImplementation(next); return () => undefined },
    }
    render(<InternalChatUpdateGate><div data-testid="work">업무 화면</div></InternalChatUpdateGate>)
    act(() => listener({ kind: 'error', message: severity === 'network' ? '서버 연결 실패' : severity === 'integrity' ? '파일 검증 실패' : '인증서 신뢰 실패' }))
    expect(screen.getByRole('status')).toHaveAttribute('data-severity', severity)
    expect(screen.getByRole('heading', { name: title })).toBeTruthy()
    expect(screen.getByTestId('work')).toBeTruthy()
  })

  it('downloaded 상태의 기존 자동 설치 동작을 유지한다', () => {
    const listener = vi.fn()
    const install = vi.fn().mockResolvedValue(undefined)
    window.internalChatUpdater = { check: vi.fn().mockResolvedValue(undefined), install, quit: vi.fn().mockResolvedValue(undefined), onStatus: (next) => { listener.mockImplementation(next); return () => undefined } }
    render(<InternalChatUpdateGate><div>업무 화면</div></InternalChatUpdateGate>)
    act(() => listener({ kind: 'downloaded', version: '2026/08/15-1' }))
    expect(install).toHaveBeenCalledOnce()
  })
})
