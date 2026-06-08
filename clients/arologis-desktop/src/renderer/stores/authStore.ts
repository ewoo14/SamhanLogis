/**
 * 인증 store (zustand) — 메인 프로세스 토큰 저장소를 미러링하는 렌더러 캐시.
 *
 * 앱 부팅 시 `bootstrap()` 가 `window.arologisAuth.getToken()` IPC 호출로
 * 메인 프로세스에서 토큰을 가져와 초기 상태를 구성한다.
 *
 * 권한 (Role) 매트릭스 (BE D-AX-07 일치):
 * - AROLOGIS_MASTER  — 모든 권한
 * - AROLOGIS_MANAGER — 배차 / 기사 관리 / 조회
 * - AROLOGIS_DRIVER  — 모바일 전용 (본 desktop 에서는 노출 안 됨)
 *
 * F1 skeleton 시점에는 bootstrap / setAuth / logout 기본 동작만 제공한다.
 * F3 (LoginPage) 에서 setAuth 호출, F4 (DriverManagementPage) 에서 role 가드 활용.
 */
import { create } from 'zustand'
import type { AuthSnapshot } from '../types/electron'

interface AuthState {
  /** 세션 부팅 완료 여부 — false 이면 splash/스피너 표시. */
  bootstrapped: boolean
  /** 현재 인증 정보. 비로그인 상태는 `null`. */
  auth: AuthSnapshot | null
  /** 메인 프로세스에서 토큰을 다시 읽어와 상태에 반영. */
  bootstrap: () => Promise<void>
  /** 로그인 성공 시 호출 — 메인 프로세스 저장 + 렌더러 캐시 갱신. */
  setAuth: (auth: AuthSnapshot) => Promise<void>
  /** 로그아웃 — 메인 프로세스 클리어 + 렌더러 캐시 비움. */
  logout: () => Promise<void>
  /** 동기 토큰 조회 — axios 요청 인터셉터가 IPC 비동기 호출 회피 시 사용. */
  getAccessToken: () => string | null
}

export const useAuthStore = create<AuthState>((set, get) => ({
  bootstrapped: false,
  auth: null,
  bootstrap: async () => {
    try {
      const auth = await window.arologisAuth.getToken()
      set({ auth, bootstrapped: true })
    } catch (err) {
      console.error('[arologis-auth] 초기 토큰 조회 실패', err)
      set({ auth: null, bootstrapped: true })
    }
  },
  setAuth: async (auth) => {
    await window.arologisAuth.setToken(auth)
    set({ auth })
  },
  logout: async () => {
    await window.arologisAuth.clearToken()
    set({ auth: null })
  },
  getAccessToken: () => get().auth?.accessToken ?? null,
}))

/**
 * 마스터 데이터 변경 권한 보유 여부 — DriverManagementPage 의 CUD 노출 가드.
 */
export function canManageDrivers(role: string | undefined | null): boolean {
  if (!role) return false
  return role === 'AROLOGIS_MASTER' || role === 'AROLOGIS_MANAGER'
}

/**
 * 인사 관리 CUD 권한 보유 여부.
 */
export function canManageHr(role: string | undefined | null): boolean {
  if (!role) return false
  return role === 'AROLOGIS_MASTER' || role === 'AROLOGIS_MANAGER'
}

/**
 * 마스터 롤 부여 권한 보유 여부.
 */
export function canGrantMaster(role: string | undefined | null): boolean {
  return role === 'AROLOGIS_MASTER'
}
