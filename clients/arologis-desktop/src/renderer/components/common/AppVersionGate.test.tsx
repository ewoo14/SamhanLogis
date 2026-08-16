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
    window.arologisTrustRoot = {
      status: vi.fn(async () => ({ installed: true, declined: false, shouldAskNextRun: false, updateDisabled: false })),
      install: vi.fn(async () => ({ installed: true, declined: false, shouldAskNextRun: false, updateDisabled: false })),
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

  it('다운로드 완료 후 저장되지 않은 입력을 보호하도록 사용자 승인 전에는 설치하지 않는다', async () => {
    let emitStatus: ((status: DesktopUpdateStatus) => void) | undefined
    window.arologisUpdater = {
      check: vi.fn(async () => undefined),
      install: vi.fn(async () => undefined),
      quit: vi.fn(async () => undefined),
      onStatus: vi.fn((listener: (status: DesktopUpdateStatus) => void) => {
        emitStatus = listener
        return () => undefined
      }),
    }

    render(
      <AppVersionGate bootstrapped>
        <div>아로로지스 본문</div>
      </AppVersionGate>,
    )

    await waitFor(() => expect(emitStatus).toBeDefined())
    emitStatus!({ kind: 'downloaded', version: '2026/07/29-2' })
    await waitFor(() => expect(screen.getByRole('button', { name: '앱을 다시 시작하여 설치' })).toBeTruthy())
    expect(window.arologisUpdater?.install).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '앱을 다시 시작하여 설치' }))
    await waitFor(() => expect(window.arologisUpdater?.install).toHaveBeenCalledTimes(1))
  })

  it('updater 오류의 원인별 계약 문구를 renderer에 그대로 표시한다', async () => {
    let emitStatus: ((status: DesktopUpdateStatus) => void) | undefined
    window.arologisUpdater = {
      check: vi.fn(async () => undefined),
      install: vi.fn(async () => undefined),
      quit: vi.fn(async () => undefined),
      onStatus: vi.fn((listener: (status: DesktopUpdateStatus) => void) => {
        emitStatus = listener
        return () => undefined
      }),
    }

    render(<AppVersionGate bootstrapped><div>본문</div></AppVersionGate>)
    await waitFor(() => expect(emitStatus).toBeDefined())
    emitStatus!({ kind: 'error', message: '업데이트 파일이 손상되었거나 검증에 실패했습니다. 다시 확인해 주세요.' })

    expect(await screen.findByText('업데이트 파일이 손상되었거나 검증에 실패했습니다. 다시 확인해 주세요.')).toBeTruthy()
  })

  it('신뢰·무결성·네트워크 오류가 실제 화면에서 서로 다른 문구로 보인다', async () => {
    let emitStatus: ((status: DesktopUpdateStatus) => void) | undefined
    window.arologisUpdater = {
      check: vi.fn(async () => undefined),
      install: vi.fn(async () => undefined),
      quit: vi.fn(async () => undefined),
      onStatus: vi.fn((listener: (status: DesktopUpdateStatus) => void) => {
        emitStatus = listener
        return () => undefined
      }),
    }
    render(<AppVersionGate bootstrapped><div>본문</div></AppVersionGate>)
    await waitFor(() => expect(emitStatus).toBeDefined())

    const messages = [
      '업데이트 파일의 인증서를 신뢰할 수 없습니다. 사내 IT 지원팀에 인증서 배포를 요청한 뒤 다시 확인해 주세요.',
      '업데이트 파일이 손상되었거나 검증에 실패했습니다. 다시 확인해 주세요.',
      '업데이트 서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 확인해 주세요.',
    ]
    for (const message of messages) {
      emitStatus!({ kind: 'error', message })
      expect(await screen.findByText(message)).toBeTruthy()
    }
  })

  it('자동 설치가 계속되는 안내의 닫기 버튼은 나중에가 아니라 안내 닫기라고 표시한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: {
        latestVersion: '2026/07/29-2',
        minSupportedVersion: '2026/07/29-1',
        forceLevel: 'MINOR',
        releaseNotes: '',
        releasedAt: '2026-07-29T00:00:00Z',
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    render(
      <AppVersionGate bootstrapped>
        <div>아로로지스 본문</div>
      </AppVersionGate>,
    )

    expect((await screen.findByTestId('app-version-minor-banner')).textContent).toContain('다운로드가 끝나면 자동으로 설치')
    expect(screen.getByRole('button', { name: '안내 닫기' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '나중에' })).toBeNull()
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

  it('거부된 신뢰 루트 상태를 화면에 남기고 다음 실행에 다시 설치할 수 있다', async () => {
    const install = vi.fn(async () => ({ installed: false, declined: true, shouldAskNextRun: true, updateDisabled: true }))
    window.arologisTrustRoot = {
      status: vi.fn(async () => ({ installed: false, declined: true, shouldAskNextRun: true, updateDisabled: true })),
      install,
    }

    render(<AppVersionGate bootstrapped><div>아로로지스 본문</div></AppVersionGate>)

    expect(await screen.findByTestId('app-trust-root-disabled')).toBeTruthy()
    expect(screen.getByTestId('app-trust-root-disabled').textContent).toContain('자동 업데이트가 꺼져 있습니다')
    fireEvent.click(screen.getByRole('button', { name: '보안인증서 설치' }))
    await waitFor(() => expect(install).toHaveBeenCalledOnce())
  })

  it('보안인증서 안내에는 사용자에게 신뢰 루트라는 용어를 노출하지 않는다', async () => {
    window.arologisTrustRoot = {
      status: vi.fn(async () => ({ installed: false, declined: true, shouldAskNextRun: true, updateDisabled: true })),
      install: vi.fn(async () => ({ installed: false, declined: true, shouldAskNextRun: true, updateDisabled: true })),
    }

    render(<AppVersionGate bootstrapped><div>아로로지스 본문</div></AppVersionGate>)

    const notice = await screen.findByTestId('app-trust-root-disabled')
    expect(notice.textContent).toContain('보안인증서')
    expect(notice.textContent).not.toContain('신뢰 루트')
  })

  it('실제 신뢰 루트 설치가 확인되면 승인 직후 자동 업데이트 꺼짐 배너를 제거한다', async () => {
    const status = vi.fn()
      .mockResolvedValueOnce({ installed: false, declined: true, shouldAskNextRun: true, updateDisabled: true })
      .mockResolvedValueOnce({ installed: true, declined: false, shouldAskNextRun: false, updateDisabled: false })
    const install = vi.fn(async () => ({ installed: true, declined: false, shouldAskNextRun: false, updateDisabled: false }))
    window.arologisTrustRoot = { status, install }

    render(<AppVersionGate bootstrapped><div>아로로지스 본문</div></AppVersionGate>)
    await screen.findByTestId('app-trust-root-disabled')

    fireEvent.click(screen.getByRole('button', { name: '보안인증서 설치' }))

    await waitFor(() => expect(screen.queryByTestId('app-trust-root-disabled')).toBeNull())
    expect(status).toHaveBeenCalledTimes(2)
  })

  it('승인 버튼 결과와 실제 조회가 다르면 자동 업데이트 꺼짐 배너를 유지한다', async () => {
    const status = vi.fn()
      .mockResolvedValueOnce({ installed: false, declined: true, shouldAskNextRun: true, updateDisabled: true })
      .mockResolvedValueOnce({ installed: false, declined: true, shouldAskNextRun: true, updateDisabled: true })
    const install = vi.fn(async () => ({ installed: false, declined: true, shouldAskNextRun: true, updateDisabled: true }))
    window.arologisTrustRoot = { status, install }

    render(<AppVersionGate bootstrapped><div>아로로지스 본문</div></AppVersionGate>)
    await screen.findByTestId('app-trust-root-disabled')
    fireEvent.click(screen.getByRole('button', { name: '보안인증서 설치' }))

    await waitFor(() => expect(install).toHaveBeenCalledOnce())
    expect(screen.getByTestId('app-trust-root-disabled')).toBeTruthy()
  })
})
