import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppVersionGate } from './AppVersionGate'
import type { DesktopUpdateStatus } from '../../types/electron'

describe('아로로지스 데스크톱 버전 게이트', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    window.arologisUpdater = {
      check: vi.fn(async () => undefined),
      install: vi.fn(async () => undefined),
      quit: vi.fn(async () => undefined),
      onStatus: vi.fn(() => () => undefined),
    }
  })

  it('서버의 새 버전을 사용자 화면에 표시한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: {
        latestVersion: '2026/07/29-2',
        minSupportedVersion: '2026/07/29-1',
        forceLevel: 'MINOR',
        releaseNotes: '배차 안정화',
        releasedAt: '2026-07-29T00:00:00Z',
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    render(
      <AppVersionGate bootstrapped>
        <div>아로로지스 본문</div>
      </AppVersionGate>,
    )

    expect((await screen.findByTestId('app-version-minor-banner')).textContent).toContain('2026/07/29-2')
    expect(screen.getByText('아로로지스 본문')).toBeTruthy()
  })

  it('버전 확인이 실패해도 본문을 계속 표시한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))

    render(
      <AppVersionGate bootstrapped>
        <div>오프라인에서도 유지되는 화면</div>
      </AppVersionGate>,
    )

    await waitFor(() => expect(screen.getByText('오프라인에서도 유지되는 화면')).toBeTruthy())
    expect(screen.queryByTestId('app-version-blocking-modal')).toBeNull()
  })

  it('updater의 안전한 일반 라벨은 새 버전 문구를 한 번만 표시한다', async () => {
    let emitStatus: ((status: DesktopUpdateStatus) => void) | undefined
    let resolveListenerRegistered: (() => void) | undefined
    const listenerRegistered = new Promise<void>((resolve) => { resolveListenerRegistered = resolve })
    window.arologisUpdater = {
      check: vi.fn(async () => undefined),
      install: vi.fn(async () => undefined),
      quit: vi.fn(async () => undefined),
      onStatus: vi.fn((listener: (status: DesktopUpdateStatus) => void) => {
        emitStatus = listener
        resolveListenerRegistered?.()
        return () => undefined
      }),
    }

    render(
      <AppVersionGate bootstrapped>
        <div>아로로지스 본문</div>
      </AppVersionGate>,
    )

    await listenerRegistered
    expect(emitStatus).toBeDefined()
    emitStatus!({ kind: 'available', version: '' })

    await waitFor(() => {
      const status = screen.getByTestId('app-auto-update-status')
      expect(status.textContent).toContain('새 버전을 다운로드하는 중입니다.')
      expect(status.textContent).not.toContain('새 버전 새 버전')
    })
  })

  it('직전 호환 fallback 라벨이 다시 와도 새 버전 문구를 중복하지 않는다', async () => {
    let emitStatus: ((status: DesktopUpdateStatus) => void) | undefined
    let resolveListenerRegistered: (() => void) | undefined
    const listenerRegistered = new Promise<void>((resolve) => { resolveListenerRegistered = resolve })
    window.arologisUpdater = {
      check: vi.fn(async () => undefined),
      install: vi.fn(async () => undefined),
      quit: vi.fn(async () => undefined),
      onStatus: vi.fn((listener: (status: DesktopUpdateStatus) => void) => {
        emitStatus = listener
        resolveListenerRegistered?.()
        return () => undefined
      }),
    }

    render(
      <AppVersionGate bootstrapped>
        <div>아로로지스 본문</div>
      </AppVersionGate>,
    )

    await listenerRegistered
    expect(emitStatus).toBeDefined()
    emitStatus!({ kind: 'available', version: '새 버전' })

    await waitFor(() => {
      const status = screen.getByTestId('app-auto-update-status')
      expect(status.textContent).toContain('새 버전을 다운로드하는 중입니다.')
      expect(status.textContent).not.toContain('새 버전 새 버전')
    })
  })

  it('달력상 존재하지 않는 날짜는 날짜형 updater 문구로 표시하지 않는다', async () => {
    let emitStatus: ((status: DesktopUpdateStatus) => void) | undefined
    let resolveListenerRegistered: (() => void) | undefined
    const listenerRegistered = new Promise<void>((resolve) => { resolveListenerRegistered = resolve })
    window.arologisUpdater = {
      check: vi.fn(async () => undefined),
      install: vi.fn(async () => undefined),
      quit: vi.fn(async () => undefined),
      onStatus: vi.fn((listener: (status: DesktopUpdateStatus) => void) => {
        emitStatus = listener
        resolveListenerRegistered?.()
        return () => undefined
      }),
    }

    render(
      <AppVersionGate bootstrapped>
        <div>아로로지스 본문</div>
      </AppVersionGate>,
    )

    await listenerRegistered
    expect(emitStatus).toBeDefined()
    emitStatus!({ kind: 'available', version: '2026/13/40-1' })

    await waitFor(() => {
      const status = screen.getByTestId('app-auto-update-status')
      expect(status.textContent).toContain('새 버전을 다운로드하는 중입니다.')
      expect(status.textContent).not.toContain('2026/13/40-1')
    })
  })

  it('알림을 닫은 뒤 새 updater 상태가 도착하면 알림을 다시 표시한다', async () => {
    let emitStatus: ((status: DesktopUpdateStatus) => void) | undefined
    let resolveListenerRegistered: (() => void) | undefined
    const listenerRegistered = new Promise<void>((resolve) => { resolveListenerRegistered = resolve })
    window.arologisUpdater = {
      check: vi.fn(async () => undefined),
      install: vi.fn(async () => undefined),
      quit: vi.fn(async () => undefined),
      onStatus: vi.fn((listener: (status: DesktopUpdateStatus) => void) => {
        emitStatus = listener
        resolveListenerRegistered?.()
        return () => undefined
      }),
    }

    render(
      <AppVersionGate bootstrapped>
        <div>아로로지스 본문</div>
      </AppVersionGate>,
    )

    await listenerRegistered
    expect(emitStatus).toBeDefined()
    emitStatus!({ kind: 'checking' })
    await waitFor(() => {
      expect(screen.getByTestId('app-auto-update-status').textContent).toContain('업데이트를 확인하는 중입니다.')
    })
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(screen.queryByTestId('app-auto-update-status')).toBeNull()

    emitStatus!({ kind: 'available', version: '' })
    expect(await screen.findByTestId('app-auto-update-status')).toBeTruthy()
  })
})
