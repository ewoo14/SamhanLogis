/**
 * Web 인증 구현 — httpOnly 쿠키(`access_token`) 기반.
 *
 * 브라우저가 쿠키를 자동 전송하므로 JS 는 토큰을 직접 다루지 않는다(XSS 토큰탈취 방지).
 * 식별정보(userId/groups 등)는 JWT 에서 읽을 수 없으므로:
 * - 로그인 직후: 로그인 응답({@link LoginResponse})에서 식별정보를 메모리 캐시.
 * - 새로고침/부팅: `GET /auth/me`(쿠키 자동 전송)로 식별정보를 복원.
 *
 * ⚠️ 순환참조 회피: 본 모듈은 `api/client`(→ authProvider 를 import)를 **정적 import 하지
 * 않는다**. me/logout 호출은 메서드 내부에서 동적 import 로 지연 로딩한다.
 */
import type { AuthProvider, SessionInfo } from './authProvider'
import type { LoginResponse } from '../api/auth'
import type { ApiEnvelope } from '../api/client'

/** `GET /auth/me` 응답 — BE {@code MeResponse}(슬1 partnerCode/groups 확장 포함). */
interface MeResponse {
  userId: string
  loginId: string
  role: string
  displayName: string
  partnerCode?: string
  groups?: { id: string; name: string; builtin: boolean }[]
}

/**
 * Web 용 {@link AuthProvider} 를 생성한다(웹 브라우저 환경에서 선택).
 */
export function createWebAuthProvider(): AuthProvider {
  /** provider 인스턴스별 식별 캐시. 실제 런타임은 getAuthProvider 싱글톤이 보장한다. */
  let cachedSession: SessionInfo | null = null

  return {
    async getSession(): Promise<SessionInfo | null> {
      return cachedSession
    },

    async getAuthHeaders(): Promise<Record<string, string>> {
      // 쿠키가 자동 전송되므로 명시 헤더 없음(axios withCredentials 가 처리).
      return {}
    },

    async establishSession(login: LoginResponse): Promise<void> {
      // 토큰은 Set-Cookie 로 브라우저가 보관 — JS 는 식별정보만 캐시.
      cachedSession = {
        userId: login.userId,
        role: login.role,
        fullName: login.displayName,
        partnerCode: login.partnerCode,
        groups: login.groups,
      }
    },

    async clearSession(): Promise<void> {
      try {
        const { apiClient } = await import('../api/client')
        await apiClient.post('/auth/logout')
      } catch {
        // 멱등 — 서버 호출 실패해도 클라이언트 캐시는 비운다.
      }
      cachedSession = null
    },

    async bootstrap(): Promise<SessionInfo | null> {
      try {
        const { apiClient } = await import('../api/client')
        const res = await apiClient.get<ApiEnvelope<MeResponse>>('/auth/me')
        const me = res.data.data
        cachedSession = {
          userId: me.userId,
          role: me.role,
          fullName: me.displayName,
          partnerCode: me.partnerCode,
          groups: me.groups,
        }
        return cachedSession
      } catch {
        cachedSession = null
        return null
      }
    },
  }
}
