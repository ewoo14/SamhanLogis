import { isCapacitorPlatform } from '../auth/authProvider'
import type * as CapacitorBiometricAuth from '@aparajita/capacitor-biometric-auth'

type BiometricAuthModule = typeof CapacitorBiometricAuth
export const AUTH_REASON = '앱 보안을 위해 생체 인증으로 다시 인증해 주세요.'

async function loadBiometricAuth(): Promise<BiometricAuthModule | null> {
  if (!isCapacitorPlatform) return null
  try {
    return await import('@aparajita/capacitor-biometric-auth')
  } catch (error) {
    console.warn('[biometric] native plugin load failed', error)
    return null
  }
}

/**
 * 생체 미설정/미가용/플러그인 로드 실패는 false 로 보고한다.
 *
 * 생체인증은 JWT 유효 세션 위의 재인증 이중 레이어이므로, 생체 부재가 기존 인증을 무효화하지 않는다.
 */
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

/**
 * 생체 재인증 성공 여부만 반환한다.
 *
 * 호출자는 false 를 잠금 유지 신호로 처리하되, 생체 미가용 환경에서는 JWT 유효 세션 통과 정책을 별도로 유지한다.
 */
export async function authenticateBiometric(reason: string): Promise<boolean> {
  const biometric = await loadBiometricAuth()
  if (!biometric) return false

  try {
    await biometric.BiometricAuth.authenticate({
      reason,
      cancelTitle: '취소',
      allowDeviceCredential: true,
      iosFallbackTitle: '암호 사용',
      androidTitle: '삼한 퍼블릭 잠금 해제',
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
