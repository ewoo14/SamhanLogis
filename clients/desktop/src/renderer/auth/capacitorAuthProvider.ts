/**
 * Capacitor(네이티브 WebView) 인증 구현 — Bearer 토큰 + Preferences 저장.
 *
 * 네이티브 WebView origin(capacitor://localhost)에서는 api-gateway 로 httpOnly 쿠키가
 * 안정적으로 전달되지 않으므로, Electron 과 동일한 Bearer 인증 경로를 사용한다.
 * 토큰 저장소는 N1 파운데이션 단계에서 @capacitor/preferences 를 사용하고,
 * N4 디바이스 기능 단계에서 secure storage 승격을 검토한다.
 */
import { Preferences } from '@capacitor/preferences'
import type { AuthProvider, SessionInfo } from './authProvider'
import type { LoginResponse } from '../api/auth'

const STORAGE_KEY = 'samhan.auth.snapshot'

interface CapacitorAuthSnapshot extends SessionInfo {
  token: string
}

/** Preferences 에 저장된 Capacitor 인증 스냅샷을 읽는다. */
async function readSnapshot(): Promise<CapacitorAuthSnapshot | null> {
  const { value } = await Preferences.get({ key: STORAGE_KEY })
  if (!value) return null
  try {
    return JSON.parse(value) as CapacitorAuthSnapshot
  } catch {
    return null
  }
}

/** 저장 스냅샷에서 원시 토큰을 제거한 세션 식별정보만 반환한다. */
function toSessionInfo(snapshot: CapacitorAuthSnapshot | null): SessionInfo | null {
  if (!snapshot) return null
  const { token: _token, ...session } = snapshot
  return session
}

/**
 * Capacitor 용 {@link AuthProvider} 를 생성한다(네이티브 플랫폼에서 선택).
 */
export function createCapacitorAuthProvider(): AuthProvider {
  return {
    async getSession(): Promise<SessionInfo | null> {
      return toSessionInfo(await readSnapshot())
    },

    async getAuthHeaders(): Promise<Record<string, string>> {
      const snapshot = await readSnapshot()
      return snapshot?.token ? { Authorization: `Bearer ${snapshot.token}` } : {}
    },

    async establishSession(login: LoginResponse): Promise<void> {
      const snapshot: CapacitorAuthSnapshot = {
        token: login.token,
        userId: login.userId,
        role: login.role,
        fullName: login.displayName,
        partnerCode: login.partnerCode,
        groups: login.groups,
      }
      await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(snapshot) })
    },

    async clearSession(): Promise<void> {
      await Preferences.remove({ key: STORAGE_KEY })
    },

    async bootstrap(): Promise<SessionInfo | null> {
      return toSessionInfo(await readSnapshot())
    },
  }
}
