// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  listeners: new Map<string, () => void>(),
  isBiometricAvailable: vi.fn(),
  authenticateBiometric: vi.fn(),
  capacitorPlatform: true,
  now: 0,
}))

vi.mock('../../auth/authProvider', () => ({
  get isCapacitorPlatform() {
    return mockState.capacitorPlatform
  },
}))

vi.mock('../../biometric/biometricAuth', () => ({
  AUTH_REASON: '앱 보안을 위해 생체 인증으로 다시 인증해 주세요.',
  isBiometricAvailable: mockState.isBiometricAvailable,
  authenticateBiometric: mockState.authenticateBiometric,
}))

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async (eventName: string, callback: () => void) => {
      mockState.listeners.set(eventName, callback)
      return {
        remove: vi.fn(async () => {
          mockState.listeners.delete(eventName)
        }),
      }
    }),
  },
}))

import { App } from '@capacitor/app'
import { BiometricLockGate } from './BiometricLockGate'

function renderGate() {
  return render(
    <BiometricLockGate bootstrapped enabled>
      <main>secured content</main>
    </BiometricLockGate>,
  )
}

function renderGateWithEnabled(enabled: boolean) {
  return render(
    <BiometricLockGate bootstrapped enabled={enabled}>
      <main>secured content</main>
    </BiometricLockGate>,
  )
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

async function resolveAttempt<T>(attempt: ReturnType<typeof deferred<T>>, value: T) {
  await act(async () => {
    attempt.resolve(value)
    await attempt.promise
  })
}

async function waitForRetryReady() {
  await screen.findByRole('alert')
  const retry = screen.getByTestId('biometric-lock-retry') as HTMLButtonElement
  await waitFor(() => {
    expect(retry.disabled).toBe(false)
  })
  return retry
}

describe('BiometricLockGate', () => {
  const dateNow = vi.spyOn(Date, 'now').mockImplementation(() => mockState.now)

  beforeEach(() => {
    mockState.capacitorPlatform = true
    mockState.now = 0
    mockState.listeners.clear()
    mockState.isBiometricAvailable.mockReset()
    mockState.authenticateBiometric.mockReset()
    mockState.isBiometricAvailable.mockResolvedValue(true)
    mockState.authenticateBiometric.mockResolvedValue(true)
    vi.mocked(App.addListener).mockClear()
    dateNow.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  it('does not attach native listeners or prompt outside Capacitor', () => {
    mockState.capacitorPlatform = false

    renderGate()

    expect(screen.getByText('secured content')).toBeTruthy()
    expect(App.addListener).not.toHaveBeenCalled()
    expect(mockState.isBiometricAvailable).not.toHaveBeenCalled()
  })

  it('passes through without native listeners when explicitly disabled', () => {
    renderGateWithEnabled(false)

    expect(screen.getByText('secured content')).toBeTruthy()
    expect(screen.queryByTestId('biometric-lock-gate')).toBeNull()
    expect(App.addListener).not.toHaveBeenCalled()
    expect(mockState.isBiometricAvailable).not.toHaveBeenCalled()
  })

  it('renders unlocked Capacitor content without an extra layout wrapper', async () => {
    const { container } = renderGate()

    await waitFor(() => {
      expect(mockState.authenticateBiometric).toHaveBeenCalledTimes(1)
    })

    expect(container.firstElementChild?.tagName).toBe('MAIN')
  })

  it('gracefully unlocks when biometry is unavailable on initial mount', async () => {
    const availabilityAttempt = deferred<boolean>()
    mockState.isBiometricAvailable.mockReturnValueOnce(availabilityAttempt.promise)

    renderGate()

    await waitFor(() => {
      expect(mockState.isBiometricAvailable).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByTestId('biometric-lock-gate')).toBeNull()

    await resolveAttempt(availabilityAttempt, false)

    await waitFor(() => {
      expect(screen.queryByTestId('biometric-lock-gate')).toBeNull()
    })
    expect(mockState.authenticateBiometric).not.toHaveBeenCalled()
  })

  it('locks again on resume only after the background timeout', async () => {
    renderGate()

    await waitFor(() => {
      expect(mockState.authenticateBiometric).toHaveBeenCalledTimes(1)
    })

    mockState.listeners.get('pause')?.()
    mockState.now = 59_000
    mockState.listeners.get('resume')?.()
    await Promise.resolve()
    expect(mockState.authenticateBiometric).toHaveBeenCalledTimes(1)

    mockState.now = 60_000
    mockState.listeners.get('pause')?.()
    mockState.now = 121_000
    mockState.listeners.get('resume')?.()

    await waitFor(() => {
      expect(mockState.authenticateBiometric).toHaveBeenCalledTimes(2)
    })
  })

  it('keeps app content covered when authentication fails', async () => {
    mockState.authenticateBiometric.mockResolvedValueOnce(false)

    renderGate()

    await waitFor(() => {
      expect(screen.getByTestId('biometric-lock-gate')).toBeTruthy()
    })
    const coveredContent = screen.getByText('secured content').closest('[aria-hidden]')
    expect(coveredContent?.getAttribute('aria-hidden')).toBe('true')
    expect(coveredContent?.hasAttribute('inert')).toBe(true)
    expect(screen.getByText('생체인증이 필요합니다')).toBeTruthy()
  })

  it('renders the lock with design-system Modal focus trap surface', async () => {
    mockState.authenticateBiometric.mockResolvedValueOnce(false)

    renderGate()

    await waitFor(() => {
      expect(screen.getByTestId('biometric-lock-gate')).toBeTruthy()
    })

    expect(screen.getByTestId('ds-modal-backdrop')).toBeTruthy()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeTruthy()
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy()
    expect(screen.getByText('생체 인증(지문·얼굴 인식) 또는 기기 잠금으로 다시 인증해 주세요.').id)
      .toBe(dialog.getAttribute('aria-describedby'))
    expect(document.querySelectorAll('#biometric-lock-title')).toHaveLength(0)
    expect(screen.getByTestId('biometric-lock-retry').className).toContain('size-lg')
  })

  it('does not authenticate from a stale resume callback after being disabled', async () => {
    const { rerender } = render(
      <BiometricLockGate bootstrapped enabled lockTimeoutMs={60_000}>
        <main>secured content</main>
      </BiometricLockGate>,
    )

    await waitFor(() => {
      expect(mockState.authenticateBiometric).toHaveBeenCalledTimes(1)
    })

    mockState.listeners.get('pause')?.()
    mockState.now = 61_000
    const staleResume = mockState.listeners.get('resume')

    rerender(
      <BiometricLockGate bootstrapped enabled={false} lockTimeoutMs={60_000}>
        <main>secured content</main>
      </BiometricLockGate>,
    )

    staleResume?.()
    await Promise.resolve()

    expect(mockState.authenticateBiometric).toHaveBeenCalledTimes(1)
  })

  it('unlocks after retry authentication succeeds', async () => {
    const initialAttempt = deferred<boolean>()
    const retryAttempt = deferred<boolean>()
    mockState.authenticateBiometric
      .mockReturnValueOnce(initialAttempt.promise)
      .mockReturnValueOnce(retryAttempt.promise)

    renderGate()

    await waitFor(() => {
      expect(mockState.authenticateBiometric).toHaveBeenCalledTimes(1)
    })
    await resolveAttempt(initialAttempt, false)

    const retry = await waitForRetryReady()
    fireEvent.click(retry)

    await waitFor(() => {
      expect(mockState.authenticateBiometric).toHaveBeenCalledTimes(2)
    })
    await resolveAttempt(retryAttempt, true)

    await waitFor(() => {
      expect(mockState.authenticateBiometric).toHaveBeenCalledTimes(2)
      expect(screen.queryByTestId('biometric-lock-gate')).toBeNull()
    })
  })

  it('keeps the lock visible when retry authentication fails again', async () => {
    const initialAttempt = deferred<boolean>()
    const retryAttempt = deferred<boolean>()
    mockState.authenticateBiometric
      .mockReturnValueOnce(initialAttempt.promise)
      .mockReturnValueOnce(retryAttempt.promise)

    renderGate()

    await waitFor(() => {
      expect(mockState.authenticateBiometric).toHaveBeenCalledTimes(1)
    })
    await resolveAttempt(initialAttempt, false)

    const retry = await waitForRetryReady()
    fireEvent.click(retry)

    await waitFor(() => {
      expect(mockState.authenticateBiometric).toHaveBeenCalledTimes(2)
    })
    await resolveAttempt(retryAttempt, false)

    await waitFor(() => {
      expect(mockState.authenticateBiometric).toHaveBeenCalledTimes(2)
      expect(screen.getByTestId('biometric-lock-gate')).toBeTruthy()
      expect(screen.getByRole('alert').textContent).toContain('인증이 완료되지 않았습니다.')
    })
  })
})
