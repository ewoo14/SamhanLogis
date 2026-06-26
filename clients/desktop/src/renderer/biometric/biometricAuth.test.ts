import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  checkBiometry: vi.fn(),
  authenticate: vi.fn(),
  capacitorPlatform: true,
}))

vi.mock('../auth/authProvider', () => ({
  get isCapacitorPlatform() {
    return mockState.capacitorPlatform
  },
}))

vi.mock('@aparajita/capacitor-biometric-auth', () => ({
  AndroidBiometryStrength: { weak: 0, strong: 1 },
  BiometricAuth: {
    checkBiometry: mockState.checkBiometry,
    authenticate: mockState.authenticate,
  },
}))

import { authenticateBiometric, isBiometricAvailable } from './biometricAuth'

describe('biometricAuth', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

  beforeEach(() => {
    mockState.capacitorPlatform = true
    mockState.checkBiometry.mockReset()
    mockState.authenticate.mockReset()
    warn.mockClear()
  })

  it('returns unavailable without loading native biometry on web or Electron', async () => {
    mockState.capacitorPlatform = false

    await expect(isBiometricAvailable()).resolves.toBe(false)

    expect(mockState.checkBiometry).not.toHaveBeenCalled()
  })

  it('returns true when native biometry is available', async () => {
    mockState.checkBiometry.mockResolvedValueOnce({ isAvailable: true })

    await expect(isBiometricAvailable()).resolves.toBe(true)
  })

  it('returns false when native biometry is unavailable', async () => {
    mockState.checkBiometry.mockResolvedValueOnce({ isAvailable: false })

    await expect(isBiometricAvailable()).resolves.toBe(false)
  })

  it('authenticates with the supplied reason and device credential fallback', async () => {
    mockState.authenticate.mockResolvedValueOnce(undefined)

    await expect(authenticateBiometric('Unlock Samhan Public')).resolves.toBe(true)

    expect(mockState.authenticate).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'Unlock Samhan Public',
      allowDeviceCredential: true,
      androidBiometryStrength: 0,
    }))
  })

  it('returns false when native authentication is rejected', async () => {
    mockState.authenticate.mockRejectedValueOnce(new Error('user cancel'))

    await expect(authenticateBiometric('Unlock Samhan Public')).resolves.toBe(false)
  })

  it('returns false for availability and authentication when the native plugin import fails', async () => {
    vi.resetModules()
    vi.doMock('@aparajita/capacitor-biometric-auth', () => {
      throw new Error('native module load failed')
    })

    const auth = await import('./biometricAuth')

    await expect(auth.isBiometricAvailable()).resolves.toBe(false)
    await expect(auth.authenticateBiometric('Unlock Samhan Public')).resolves.toBe(false)

    vi.doUnmock('@aparajita/capacitor-biometric-auth')
  })
})
