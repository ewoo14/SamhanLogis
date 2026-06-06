/**
 * 인증 토큰 영속 저장소 — Electron `safeStorage` 로 OS 레벨 암호화 적용.
 *
 * 저장 위치: Electron `userData` 폴더 내 `samhan-auth.json` (electron-store 표준).
 * 암호화: Windows DPAPI (현재 사용자 키) 또는 macOS Keychain.
 *   - `safeStorage.isEncryptionAvailable()` 가 false 인 환경 (Linux GUI 비로그인 등)
 *     에서는 평문 fallback + 경고 로그.
 *
 * 본 모듈은 메인 프로세스 전용. 렌더러는 IPC (`auth:get-token` 등) 로만 접근한다.
 */
import Store from 'electron-store'
import { safeStorage } from 'electron'

/**
 * 권한 그룹 항목 — 직렬화 보관용.
 * id(UUID) 는 내부 식별 전용이며 사용자 화면에 직접 노출하지 않는다.
 */
export interface AuthGroupItem {
  id: string
  name: string
  builtin: boolean
}

/**
 * electron-store 에 저장되는 스키마.
 * `encryptedToken` 은 base64 로 인코딩된 암호문 (또는 평문 fallback).
 * `groupsJson` 은 AuthGroupItem[] 의 JSON 직렬화 문자열.
 */
interface AuthSchema {
  encryptedToken?: string
  userId?: string
  role?: string
  fullName?: string
  partnerCode?: string
  groupsJson?: string
}

const store = new Store<AuthSchema>({ name: 'samhan-auth' })

/**
 * 메인 프로세스에 보관할 인증 정보 묶음.
 * 렌더러는 이 형태 그대로 IPC 응답으로 받는다.
 *
 * `groups` 는 Phase C5-3 에서 추가. 기존 저장소 호환을 위해 optional.
 */
export interface AuthSnapshot {
  token: string
  userId: string
  role: string
  fullName: string
  partnerCode?: string
  groups?: AuthGroupItem[]
}

/**
 * 로그인 성공 시 토큰 + 프로필 메타데이터를 영속 저장한다.
 *
 * `safeStorage` 가 가능한 환경에서는 토큰만 암호화하여 base64 로 저장하며,
 * 미지원 환경에서는 평문 저장 후 콘솔 경고를 남긴다 (개발 환경 가정).
 *
 * @param token JWT 액세스 토큰
 * @param userId 로그인한 사용자 UUID
 * @param role 사용자 역할 코드 (예: MANAGER, WAREHOUSE)
 * @param fullName 사용자 표시명 — 대시보드 환영 메시지 등에 사용
 * @param partnerCode 거래처 코드 (선택)
 * @param groups 권한 그룹 목록 (Phase C5-3, 선택) — JSON 직렬화 보관
 */
export function saveToken(
  token: string,
  userId: string,
  role: string,
  fullName: string,
  partnerCode?: string,
  groups?: AuthGroupItem[],
): void {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(token).toString('base64')
    store.set('encryptedToken', encrypted)
  } else {
    // 개발/테스트 환경 fallback — 운영에서는 발생하면 안 됨.
    console.warn('[auth-store] safeStorage 미지원 환경: 토큰을 평문으로 저장합니다.')
    store.set('encryptedToken', token)
  }
  store.set('userId', userId)
  store.set('role', role)
  store.set('fullName', fullName)
  if (partnerCode && partnerCode.trim()) {
    store.set('partnerCode', partnerCode.trim())
  } else {
    store.delete('partnerCode')
  }
  if (groups && groups.length > 0) {
    store.set('groupsJson', JSON.stringify(groups))
  } else {
    store.delete('groupsJson')
  }
}

/**
 * 저장된 토큰 + 프로필을 복원한다. 미저장 또는 복호화 실패 시 `null`.
 *
 * 복호화 실패는 일반적으로 키 변경(예: 다른 OS 계정) 으로 발생하며,
 * 호출자는 `null` 응답을 받으면 로그인 화면으로 이동시켜야 한다.
 *
 * @return 복원된 스냅샷 또는 `null`
 */
export function loadToken(): AuthSnapshot | null {
  const encrypted = store.get('encryptedToken')
  if (!encrypted) return null

  let token: string
  if (safeStorage.isEncryptionAvailable()) {
    try {
      token = safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    } catch {
      return null
    }
  } else {
    token = encrypted
  }

  let groups: AuthGroupItem[] | undefined
  const groupsJson = store.get('groupsJson')
  if (groupsJson) {
    try {
      const parsed: unknown = JSON.parse(groupsJson)
      // 손상/구버전 데이터 방어: 배열 + 각 요소 형태 검증 후에만 채택 (dual review P1)
      if (
        Array.isArray(parsed) &&
        parsed.every(
          (g): g is AuthGroupItem =>
            typeof g === 'object' &&
            g !== null &&
            typeof (g as AuthGroupItem).id === 'string' &&
            typeof (g as AuthGroupItem).name === 'string' &&
            typeof (g as AuthGroupItem).builtin === 'boolean',
        )
      ) {
        groups = parsed
      }
    } catch {
      groups = undefined
    }
  }

  return {
    token,
    userId: store.get('userId') ?? '',
    role: store.get('role') ?? '',
    fullName: store.get('fullName') ?? '',
    partnerCode: store.get('partnerCode'),
    groups,
  }
}

/**
 * 저장된 모든 인증 정보를 삭제한다.
 *
 * 호출 시점:
 * - 사용자가 명시적으로 로그아웃
 * - axios 응답 인터셉터가 401 을 받았을 때 (토큰 만료/무효)
 */
export function clearToken(): void {
  store.clear()
}
