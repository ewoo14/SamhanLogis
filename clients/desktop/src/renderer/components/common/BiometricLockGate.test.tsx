// @vitest-environment jsdom
import React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
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

  it('gracefully unlocks when biometry is unavailable on initial mount', async () => {
    mockState.isBiometricAvailable.mockResolvedValueOnce(false)

    renderGate()

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
    expect(screen.getByText('secured content').closest('[aria-hidden]')?.getAttribute('aria-hidden')).toBe('true')
    expect(screen.getByText('생체인증이 필요합니다')).toBeTruthy()
  })
})
