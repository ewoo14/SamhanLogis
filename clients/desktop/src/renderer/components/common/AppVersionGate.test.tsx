// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const updater = vi.hoisted(() => {
  let listener: ((status: unknown) => void) | null = null
  return {
    check: vi.fn<() => Promise<void>>(),
    install: vi.fn<() => Promise<void>>(),
    quit: vi.fn<() => Promise<void>>(),
    onStatus: vi.fn((next: (status: unknown) => void) => {
      listener = next
      return () => {
        listener = null
      }
    }),
    emit(status: unknown) {
      listener?.(status)
    },
  }
})

const versionInfo = vi.hoisted(() => ({
  latestVersion: '0.1.0',
  minSupportedVersion: '0.1.0',
  forceLevel: 'NONE' as 'NONE' | 'CRITICAL',
  releaseNotes: '',
  releasedAt: '2026-07-23T00:00:00',
}))

vi.mock('../../auth/authProvider', () => ({
  isElectronPlatform: true,
  isCapacitorPlatform: false,
}))

vi.mock('../../api/appVersion', () => ({
  getAppVersion: vi.fn(async () => versionInfo),
}))

import { AppVersionGate } from './AppVersionGate'
import {
  DESKTOP_UPDATE_CHECK_TIMEOUT_MS,
  DESKTOP_UPDATE_DOWNLOAD_TIMEOUT_MS,
} from '../../version/desktopUpdatePolicy'

describe('AppVersionGate 기동 updater 경로', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.useRealTimers()
    updater.check.mockReset().mockResolvedValue(undefined)
    updater.install.mockReset().mockResolvedValue(undefined)
    updater.quit.mockReset().mockResolvedValue(undefined)
    updater.onStatus.mockClear()
    versionInfo.forceLevel = 'NONE'
    window.samhanUpdater = updater
  })

  it('updater 확인이 끝나기 전에는 로그인 children을 렌더링하지 않는다', async () => {
    render(
      <AppVersionGate bootstrapped>
        <div data-testid="login-sentinel">로그인</div>
      </AppVersionGate>,
    )

    expect(screen.queryByTestId('login-sentinel')).toBeNull()
    expect(screen.getByText('업데이트를 확인하는 중입니다.')).toBeTruthy()

    act(() => updater.emit({ kind: 'not-available' }))

    expect(await screen.findByTestId('login-sentinel')).toBeTruthy()
  })

  it('기동 중 다운로드 완료는 사용자 조작 없이 자동 설치를 호출한다', async () => {
    render(
      <AppVersionGate bootstrapped>
        <div data-testid="login-sentinel">로그인</div>
      </AppVersionGate>,
    )

    act(() => updater.emit({ kind: 'available', version: '0.2.0' }))
    act(() => updater.emit({ kind: 'downloading', percent: 42 }))
    expect(screen.getByText(/42%/)).toBeTruthy()

    act(() => updater.emit({ kind: 'downloaded', version: '0.2.0' }))

    await waitFor(() => expect(updater.install).toHaveBeenCalledOnce())
    expect(screen.queryByTestId('login-sentinel')).toBeNull()
  })

  it('확인 실패는 원문 없이 한국어 안내를 남기고 로그인으로 진행한다', async () => {
    const raw = 'Cannot find channel https://intranet.example/latest.yml response-header'
    updater.check.mockRejectedValueOnce(new Error(raw))

    render(
      <AppVersionGate bootstrapped>
        <div data-testid="login-sentinel">로그인</div>
      </AppVersionGate>,
    )

    expect(await screen.findByTestId('login-sentinel')).toBeTruthy()
    const status = screen.getByTestId('app-auto-update-status')
    expect(status.textContent).toContain('업데이트')
    expect(status.textContent).not.toContain(raw)
    expect(status.textContent).toContain('인터넷 연결')
  })

  it('확인 상한을 넘으면 일반 수준은 로그인으로 진행한다', async () => {
    vi.useFakeTimers()
    updater.check.mockImplementationOnce(() => new Promise<void>(() => undefined))

    render(
      <AppVersionGate bootstrapped>
        <div data-testid="login-sentinel">로그인</div>
      </AppVersionGate>,
    )

    await act(async () => {
      await Promise.resolve()
      vi.advanceTimersByTime(DESKTOP_UPDATE_CHECK_TIMEOUT_MS + 1)
      await Promise.resolve()
    })

    expect(screen.getByTestId('login-sentinel')).toBeTruthy()
    expect(screen.getByTestId('app-auto-update-status').textContent).toContain('제한')
  })

  it('다운로드 상한을 넘으면 일반 수준은 로그인으로 진행한다', async () => {
    vi.useFakeTimers()

    render(
      <AppVersionGate bootstrapped>
        <div data-testid="login-sentinel">로그인</div>
      </AppVersionGate>,
    )
    await act(async () => Promise.resolve())
    act(() => updater.emit({ kind: 'available', version: '0.2.0' }))

    await act(async () => {
      vi.advanceTimersByTime(DESKTOP_UPDATE_DOWNLOAD_TIMEOUT_MS + 1)
      await Promise.resolve()
    })

    expect(screen.getByTestId('login-sentinel')).toBeTruthy()
    expect(screen.getByTestId('app-auto-update-status').textContent).toContain('제한')
  })

  it('일반 다운로드 상한 후에도 백그라운드 다운로드 이벤트를 유지하고 자동 설치하지 않는다', async () => {
    vi.useFakeTimers()

    render(
      <AppVersionGate bootstrapped>
        <div data-testid="login-sentinel">로그인</div>
      </AppVersionGate>,
    )
    await act(async () => Promise.resolve())
    act(() => updater.emit({ kind: 'available', version: '0.2.0' }))

    await act(async () => {
      vi.advanceTimersByTime(DESKTOP_UPDATE_DOWNLOAD_TIMEOUT_MS + 1)
      await Promise.resolve()
    })
    expect(screen.getByTestId('login-sentinel')).toBeTruthy()

    act(() => updater.emit({ kind: 'downloading', percent: 88 }))
    act(() => updater.emit({ kind: 'downloaded', version: '0.2.0' }))

    expect(screen.getByTestId('app-auto-update-status').textContent).toContain('다음 기동 때 자동 설치합니다')
    expect(updater.install).not.toHaveBeenCalled()
  })

  it('진행 이벤트가 계속 와도 다운로드 상한은 최초 시작부터 180초 후 로그인으로 진행한다', async () => {
    vi.useFakeTimers()

    render(
      <AppVersionGate bootstrapped>
        <div data-testid="login-sentinel">로그인</div>
      </AppVersionGate>,
    )
    await act(async () => Promise.resolve())
    act(() => updater.emit({ kind: 'available', version: '0.2.0' }))

    act(() => updater.emit({ kind: 'downloading', percent: 1 }))
    for (const percent of [11, 21, 31, 41, 51, 61, 71]) {
      await act(async () => {
        vi.advanceTimersByTime(25_000)
        await Promise.resolve()
      })
      act(() => updater.emit({ kind: 'downloading', percent }))
    }

    await act(async () => {
      vi.advanceTimersByTime(5_001)
      await Promise.resolve()
    })

    expect(screen.getByTestId('login-sentinel')).toBeTruthy()
    expect(screen.getByTestId('app-auto-update-status').textContent).toContain('제한')
  })

  it('기동 gate가 열린 뒤 도착한 다운로드 완료에는 자동 재시작하지 않는다', async () => {
    render(
      <AppVersionGate bootstrapped>
        <div data-testid="login-sentinel">로그인</div>
      </AppVersionGate>,
    )

    act(() => updater.emit({ kind: 'not-available' }))
    await screen.findByTestId('login-sentinel')

    act(() => updater.emit({ kind: 'downloaded', version: '0.2.0' }))

    expect(updater.install).not.toHaveBeenCalled()
  })

  it('CRITICAL 확인 실패는 차단을 유지하고 재시도·앱 종료 조치를 제공한다', async () => {
    versionInfo.forceLevel = 'CRITICAL'
    const raw = 'Cannot find channel https://intranet.example/latest.yml response-header'
    updater.check.mockRejectedValueOnce(new Error(raw))

    render(
      <AppVersionGate bootstrapped>
        <div data-testid="login-sentinel">로그인</div>
      </AppVersionGate>,
    )

    const modal = await screen.findByTestId('app-version-blocking-modal')
    expect(screen.queryByTestId('login-sentinel')).toBeNull()
    expect(modal.textContent).not.toContain(raw)
    expect(screen.getByTestId('app-version-blocking-reload')).toBeTruthy()
    expect(screen.getByTestId('app-version-blocking-quit')).toBeTruthy()
    expect(screen.getByTestId('app-auto-update-status').textContent).toContain('인터넷 연결')
  })
})
