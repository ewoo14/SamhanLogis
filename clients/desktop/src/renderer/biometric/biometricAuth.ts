import { isCapacitorPlatform } from '../auth/authProvider'
import type * as CapacitorBiometricAuth from '@aparajita/capacitor-biometric-auth'

type BiometricAuthModule = typeof CapacitorBiometricAuth

async function loadBiometricAuth(): Promise<BiometricAuthModule | null> {
  if (!isCapacitorPlatform) return null
  try {
    return await import('@aparajita/capacitor-biometric-auth')
  } catch (error) {
    console.warn('[biometric] native plugin load failed', error)
    return null
  }
}

export async function isBiometricAvailable(): Promise<boolean> {
  const biometric = await loadBiometricAuth()
  if (!biometric) return false

  try {
    const result = await biometric.BiometricAuth.checkBiometry()
    return result.isAvailable
  } catch (error) {
    console.warn('[biometric] availability check failed', error)
    return false
  }
}

export async function authenticateBiometric(reason: string): Promise<boolean> {
  const biometric = await loadBiometricAuth()
  if (!biometric) return false

  try {
    await biometric.BiometricAuth.authenticate({
      reason,
      cancelTitle: '취소',
      allowDeviceCredential: true,
      iosFallbackTitle: '암호 사용',
      androidTitle: 'Samhan Public 잠금 해제',
      androidSubtitle: reason,
      androidConfirmationRequired: false,
      androidBiometryStrength: biometric.AndroidBiometryStrength.weak,
    })
    return true
  } catch (error) {
    console.warn('[biometric] authentication failed', error)
    return false
  }
}
