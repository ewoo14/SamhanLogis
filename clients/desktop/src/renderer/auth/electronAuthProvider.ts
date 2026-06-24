/**
 * Electron 인증 구현 — 기존 `window.samhanAuth` IPC(electron-store 암호화)를 래핑한다.
 *
 * 본 구현은 기존 동작과 **1:1 동일**해야 한다(슬1 무회귀 최우선). 토큰은 메인
 * 프로세스에 저장되고, 매 요청에 `Authorization: Bearer` 헤더로 주입된다.
 */
import type { AuthProvider, SessionInfo } from './authProvider'
import type { LoginResponse } from '../api/auth'
import type { AuthSnapshot } from '../types/electron'

/** 저장 스냅샷 → 토큰 제외 식별정보. */
function toSessionInfo(snap: AuthSnapshot | null): SessionInfo | null {
  if (!snap) return null
  return {
    userId: snap.userId,
    role: snap.role,
    fullName: snap.fullName,
    partnerCode: snap.partnerCode,
    groups: snap.groups,
  }
}

/**
 * Electron 용 {@link AuthProvider} 를 생성한다.
 *
 * `window.samhanAuth` 가 반드시 존재하는 환경에서만 선택된다
 * ({@link isElectronPlatform} 가드).
 */
export function createElectronAuthProvider(): AuthProvider {
  return {
    async getSession(): Promise<SessionInfo | null> {
      return toSessionInfo(await window.samhanAuth.getToken())
    },

    async getAuthHeaders(): Promise<Record<string, string>> {
      const snap = await window.samhanAuth.getToken()
      return snap?.token ? { Authorization: `Bearer ${snap.token}` } : {}
    },

    async establishSession(login: LoginResponse): Promise<void> {
      await window.samhanAuth.setToken({
        token: login.token,
        userId: login.userId,
        role: login.role,
        fullName: login.displayName,
        partnerCode: login.partnerCode,
        groups: login.groups,
      })
    },

    async clearSession(): Promise<void> {
      await window.samhanAuth.clearToken()
    },

    async bootstrap(): Promise<SessionInfo | null> {
      return toSessionInfo(await window.samhanAuth.getToken())
    },
  }
}
