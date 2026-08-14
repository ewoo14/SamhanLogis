// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

const runtimeFlags = vi.hoisted(() => ({
  electron: true,
  capacitor: false,
}))

const versionInfo = vi.hoisted(() => ({
  latestVersion: '0.1.0',
  minSupportedVersion: '0.1.0',
  forceLevel: 'NONE' as 'NONE' | 'CRITICAL',
  releaseNotes: '',
  releasedAt: '2026-07-23T00:00:00',
}))

vi.mock('../../auth/authProvider', () => ({
  get isElectronPlatform() {
    return runtimeFlags.electron
  },
  get isCapacitorPlatform() {
    return runtimeFlags.capacitor
  },
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
    runtimeFlags.electron = true
    runtimeFlags.capacitor = false
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

  it('updater의 안전한 일반 라벨은 새 버전 문구를 한 번만 표시한다', async () => {
    render(
      <AppVersionGate bootstrapped>
        <div data-testid="login-sentinel">로그인</div>
      </AppVersionGate>,
    )

    act(() => updater.emit({ kind: 'not-available' }))
    await screen.findByTestId('login-sentinel')
    act(() => updater.emit({ kind: 'available', version: '' }))

    const status = await screen.findByTestId('app-auto-update-status')
    expect(status.textContent).toContain('다운로드가 끝나면 자동으로 설치합니다.')
    expect(status.textContent).not.toContain('새 버전 새 버전')
  })

  it('업데이트 알림은 제목과 본문에 같은 상태 문장을 반복하지 않고 보충 정보는 남긴다', async () => {
    render(
      <AppVersionGate bootstrapped>
        <div data-testid="login-sentinel">로그인</div>
      </AppVersionGate>,
    )

    act(() => updater.emit({ kind: 'not-available' }))
    await screen.findByTestId('login-sentinel')
    act(() => updater.emit({ kind: 'downloading', percent: 42 }))

    const notice = await screen.findByTestId('app-auto-update-status')
    const title = notice.querySelector('h2')?.textContent ?? ''
    const description = notice.querySelector('p')?.textContent ?? ''
    expect(title).not.toBe('')
    expect(description).not.toBe('')
    expect(description).not.toContain(title)
    expect(description).toContain('42%')
  })

  it('직전 호환 fallback 라벨이 다시 와도 새 버전 문구를 중복하지 않는다', async () => {
    render(
      <AppVersionGate bootstrapped>
        <div data-testid="login-sentinel">로그인</div>
      </AppVersionGate>,
    )

    act(() => updater.emit({ kind: 'not-available' }))
    await screen.findByTestId('login-sentinel')
    act(() => updater.emit({ kind: 'available', version: '새 버전' }))

    const status = await screen.findByTestId('app-auto-update-status')
    expect(status.textContent).toContain('다운로드가 끝나면 자동으로 설치합니다.')
    expect(status.textContent).not.toContain('새 버전 새 버전')
  })

  it('달력상 존재하지 않는 날짜는 날짜형 updater 문구로 표시하지 않는다', async () => {
    render(
      <AppVersionGate bootstrapped>
        <div data-testid="login-sentinel">로그인</div>
      </AppVersionGate>,
    )

    act(() => updater.emit({ kind: 'not-available' }))
    await screen.findByTestId('login-sentinel')
    act(() => updater.emit({ kind: 'available', version: '2026/13/40-1' }))

    const status = await screen.findByTestId('app-auto-update-status')
    expect(status.textContent).toContain('다운로드가 끝나면 자동으로 설치합니다.')
    expect(status.textContent).not.toContain('2026/13/40-1')
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

  // #909 OPUS 재수렴 도달가능 1건 — 오류 알림을 닫을 수 있어야 한다(P-2).
  it('오류 알림은 닫기 버튼으로 치울 수 있다', async () => {
    const raw = 'Cannot find channel https://intranet.example/latest.yml response-header'
    updater.check.mockRejectedValueOnce(new Error(raw))

    render(
      <AppVersionGate bootstrapped>
        <div data-testid="login-sentinel">로그인</div>
      </AppVersionGate>,
    )

    expect(await screen.findByTestId('login-sentinel')).toBeTruthy()
    expect(await screen.findByTestId('app-auto-update-status')).toBeTruthy()

    const dismissButton = screen.getByTestId('app-auto-update-dismiss')
    fireEvent.click(dismissButton)

    expect(screen.queryByTestId('app-auto-update-status')).toBeNull()
    // 닫아도 로그인 화면 자체는 그대로 조작 가능해야 한다(P-1).
    expect(screen.getByTestId('login-sentinel')).toBeTruthy()
  })

  it('다운로드 중인 업데이트 알림도 닫기 버튼을 제공한다(P-1)', async () => {
    render(
      <AppVersionGate bootstrapped>
        <div data-testid="login-sentinel">로그인</div>
      </AppVersionGate>,
    )

    act(() => updater.emit({ kind: 'error' }))
    await screen.findByTestId('app-auto-update-status')

    act(() => updater.emit({ kind: 'downloading', percent: 61 }))

    expect(screen.getByTestId('app-auto-update-status').textContent).toContain('61%')
    expect(screen.getByTestId('app-auto-update-dismiss')).toBeTruthy()
  })

  it('다운로드 진행률 갱신만으로 닫은 알림을 되살리지 않는다(P-2)', async () => {
    render(
      <AppVersionGate bootstrapped>
        <div data-testid="login-sentinel">로그인</div>
      </AppVersionGate>,
    )

    act(() => updater.emit({ kind: 'error' }))
    await screen.findByTestId('app-auto-update-status')
    fireEvent.click(screen.getByTestId('app-auto-update-dismiss'))
    expect(screen.queryByTestId('app-auto-update-status')).toBeNull()

    act(() => updater.emit({ kind: 'downloading', percent: 61 }))
    expect(screen.getByTestId('app-auto-update-status').textContent).toContain('61%')
    fireEvent.click(screen.getByTestId('app-auto-update-dismiss'))
    expect(screen.queryByTestId('app-auto-update-status')).toBeNull()

    act(() => updater.emit({ kind: 'downloading', percent: 73 }))

    expect(screen.queryByTestId('app-auto-update-status')).toBeNull()
  })

  it('오류 알림을 닫은 뒤 후속 업데이트 오류는 다시 표시한다', async () => {
    const raw = 'Cannot find channel https://intranet.example/latest.yml response-header'
    updater.check.mockRejectedValueOnce(new Error(raw))

    render(
      <AppVersionGate bootstrapped>
        <div data-testid="login-sentinel">로그인</div>
      </AppVersionGate>,
    )

    await screen.findByTestId('app-auto-update-status')
    fireEvent.click(screen.getByTestId('app-auto-update-dismiss'))
    expect(screen.queryByTestId('app-auto-update-status')).toBeNull()

    act(() => updater.emit({ kind: 'downloading', percent: 61 }))
    act(() => updater.emit({ kind: 'error' }))

    expect(screen.getByTestId('app-auto-update-status').textContent).toContain('업데이트 서버에 연결하지 못했습니다')
  })

  it('업데이트 상태 알림은 앱 흐름에 배치되어 고정 토스트와 레이어를 공유하지 않는다', async () => {
    const raw = 'Cannot find channel https://intranet.example/latest.yml response-header'
    updater.check.mockRejectedValueOnce(new Error(raw))

    render(
      <AppVersionGate bootstrapped>
        <div data-testid="permission-error-toast" style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 100 }}>
          권한 작업 오류
        </div>
      </AppVersionGate>,
    )

    const status = await screen.findByTestId('app-auto-update-status')
    expect(status.style.position).not.toBe('fixed')
    expect(status.style.zIndex).not.toBe('10000')
  })

  it.each([
    ['trust', '업데이트 파일의 인증서를 신뢰할 수 없습니다. 사내 IT 지원팀에 인증서 배포를 요청한 뒤 다시 확인해 주세요.'],
    ['integrity', '업데이트 파일이 손상되었거나 검증에 실패했습니다. 다시 확인해 주세요.'],
    ['network', '업데이트 서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 확인해 주세요.'],
  ] as const)('updater 오류 계약의 %s 문구와 심각도를 화면에 보존한다', async (severity, message) => {
    render(
      <AppVersionGate bootstrapped>
        <div data-testid="login-sentinel">로그인</div>
      </AppVersionGate>,
    )

    act(() => updater.emit({ kind: 'error', message }))

    const status = await screen.findByTestId('app-auto-update-status')
    expect(status.getAttribute('data-severity')).toBe(severity)
    expect(status.textContent).toContain(message)
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

  it('확인 IPC가 성공해도 상태 이벤트가 없으면 check-timeout으로 기동 gate를 정착한다', async () => {
    vi.useFakeTimers()
    updater.check.mockResolvedValueOnce(undefined)

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

  it('브라우저 런타임의 CRITICAL 차단은 updater 없는 상태에서도 페이지 새로고침 탈출구를 제공한다', async () => {
    runtimeFlags.electron = false
    runtimeFlags.capacitor = false
    versionInfo.forceLevel = 'CRITICAL'
    window.samhanUpdater = undefined

    render(
      <AppVersionGate bootstrapped>
        <div data-testid="login-sentinel">로그인</div>
      </AppVersionGate>,
    )

    await screen.findByTestId('app-version-blocking-modal')
    expect(screen.getByRole('button', { name: '페이지 새로고침' })).toBeTruthy()
    expect(screen.queryByTestId('app-version-blocking-quit')).toBeNull()
  })
})
