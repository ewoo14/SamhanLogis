/**
 * arologis-desktop 인증 토큰 영속 저장소 — Electron `safeStorage` 로 OS 레벨 암호화.
 *
 * 저장 위치: Electron `userData` 폴더 내 `arologis-auth.json` (electron-store 표준).
 * 암호화: Windows DPAPI (현재 사용자 키) 또는 macOS Keychain.
 *
 * 본 모듈은 메인 프로세스 전용. 렌더러는 IPC (`auth:get-token` 등) 로만 접근한다.
 *
 * Samhan Public desktop 과 차이:
 * - electron-store name = `arologis-auth` (서로 다른 OS 사용자 토큰 영역 격리).
 * - accessToken + refreshToken 동시 보관 (rotation 의무).
 */
import Store from 'electron-store'
import { safeStorage } from 'electron'

/**
 * electron-store 에 저장되는 스키마.
 *
 * `encryptedAccessToken` / `encryptedRefreshToken` 는 base64 로 인코딩된
 * 암호문 (또는 평문 fallback).
 */
interface AuthSchema {
  encryptedAccessToken?: string
  encryptedRefreshToken?: string
  userId?: string
  role?: string
  loginId?: string
  fullName?: string
  expiresAt?: string
}

const store = new Store<AuthSchema>({ name: 'arologis-auth' })

/**
 * 메인 프로세스에 보관할 인증 정보 묶음.
 * 렌더러는 이 형태 그대로 IPC 응답으로 받는다.
 *
 * UUID 비공개 원칙 — userId 는 메인 프로세스 내부 식별에만 사용. 화면 표시 X.
 */
export interface AuthSnapshot {
  accessToken: string
  refreshToken: string
  userId: string
  role: string
  /** 사용자 노출 식별자 — loginId (admin) 또는 driverCode (driver, 모바일에서 사용). */
  loginId: string
  fullName: string
  /** ISO-8601 만료 시각 — 렌더러가 만료 임박 시점에 refresh 트리거. */
  expiresAt: string
}

/**
 * 로그인 성공 시 토큰 + 프로필 메타데이터를 영속 저장한다.
 *
 * `safeStorage` 가 가능한 환경에서는 토큰만 암호화하여 base64 로 저장하며,
 * 미지원 환경에서는 평문 저장 후 콘솔 경고를 남긴다.
 */
export function saveToken(snapshot: AuthSnapshot): void {
  const encryptOrPassthrough = (raw: string): string => {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(raw).toString('base64')
    }
    console.warn('[arologis-auth] safeStorage 미지원: 토큰을 평문으로 저장합니다.')
    return raw
  }

  store.set('encryptedAccessToken', encryptOrPassthrough(snapshot.accessToken))
  store.set('encryptedRefreshToken', encryptOrPassthrough(snapshot.refreshToken))
  store.set('userId', snapshot.userId)
  store.set('role', snapshot.role)
  store.set('loginId', snapshot.loginId)
  store.set('fullName', snapshot.fullName)
  store.set('expiresAt', snapshot.expiresAt)
}

/**
 * 저장된 토큰 + 프로필을 복원한다. 미저장 또는 복호화 실패 시 `null`.
 */
export function loadToken(): AuthSnapshot | null {
  const encryptedAccess = store.get('encryptedAccessToken')
  const encryptedRefresh = store.get('encryptedRefreshToken')
  if (!encryptedAccess || !encryptedRefresh) return null

  const decryptOrPassthrough = (b64: string): string | null => {
    if (safeStorage.isEncryptionAvailable()) {
      try {
        return safeStorage.decryptString(Buffer.from(b64, 'base64'))
      } catch {
        return null
      }
    }
    return b64
  }

  const accessToken = decryptOrPassthrough(encryptedAccess)
  const refreshToken = decryptOrPassthrough(encryptedRefresh)
  if (!accessToken || !refreshToken) return null

  return {
    accessToken,
    refreshToken,
    userId: store.get('userId') ?? '',
    role: store.get('role') ?? '',
    loginId: store.get('loginId') ?? '',
    fullName: store.get('fullName') ?? '',
    expiresAt: store.get('expiresAt') ?? '',
  }
}

/**
 * 저장된 모든 인증 정보를 삭제한다.
 *
 * 호출 시점:
 * - 사용자 명시적 로그아웃
 * - axios 응답 인터셉터가 401 을 받았을 때 (토큰 만료/무효)
 */
export function clearToken(): void {
  store.clear()
}
