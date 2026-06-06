/**
 * 세션 상태 — 메인 프로세스 토큰 저장소를 미러링하는 렌더러 캐시.
 *
 * zustand 단일 store 로 관리하며, 앱 부팅 시 `bootstrap()` 가 IPC 로
 * 메인 프로세스에서 토큰을 가져와 초기 상태를 구성한다.
 *
 * 권한 체크 헬퍼:
 * - `hasAdminRole()` — 창고 등록 등 마스터 데이터 변경 권한 확인
 *   (MASTER / MANAGER / DEVELOPER)
 *
 * C5-2b: canCreateSlip / canInspectInbound / canQuerySales / canCreateTransfer 헬퍼는
 * usePermissions().canAccess() 로 이관 완료. session.ts 에서 제거됨.
 */
import { create } from 'zustand'
import type { AuthSnapshot } from '../types/electron'
import { MOCK_AUTH, isMockMode } from '../api/mock'

interface SessionState {
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
}

export const useSessionStore = create<SessionState>((set) => ({
  bootstrapped: false,
  auth: null,
  bootstrap: async () => {
    // dev-only mock 모드 — IPC 우회하고 mock 토큰으로 자동 인증 (PR #18 자동 캡처용).
    if (isMockMode()) {
      set({ auth: MOCK_AUTH, bootstrapped: true })
      return
    }
    try {
      const auth = await window.samhanAuth.getToken()
      set({ auth, bootstrapped: true })
    } catch (err) {
      console.error('[session] 초기 토큰 조회 실패', err)
      set({ auth: null, bootstrapped: true })
    }
  },
  setAuth: async (auth) => {
    await window.samhanAuth.setToken(auth)
    set({ auth })
  },
  logout: async () => {
    await window.samhanAuth.clearToken()
    set({ auth: null })
  },
}))

/**
 * 마스터 데이터 변경 권한 보유 여부.
 * 본 슬라이스에서는 창고 신규 등록 버튼 표시 여부를 결정한다.
 */
export function hasAdminRole(role: string | undefined | null): boolean {
  if (!role) return false
  return role === 'MASTER' || role === 'MANAGER' || role === 'DEVELOPER'
}

/**
 * 전표 라이프사이클 transition 권한 — action 별 BE `@PreAuthorize` 와 동일.
 *
 * @param action transition 액션 코드
 * @param role 현재 사용자 role
 */
export function canTransitionSlip(
  action:
    | 'save'
    | 'send'
    | 'accept'
    | 'process'
    | 'inspect'
    | 'complete'
    | 'ship'
    | 'deliver'
    | 'confirm'
    | 'reject'
    | 'cancel',
  role: string | undefined | null,
): boolean {
  if (!role) return false
  switch (action) {
    case 'save':
    case 'send':
    case 'cancel':
      return ['SALES', 'MANAGER', 'MASTER'].includes(role)
    case 'accept':
    case 'process':
    case 'complete':
    case 'ship':
    case 'deliver':
      return ['WAREHOUSE', 'INVENTORY', 'MANAGER', 'MASTER'].includes(role)
    case 'inspect':
      // Slice A 신규 (Designer ux-flow.md § 3.3 권한 매트릭스).
      // 검수원/창고원/MANAGER/MASTER. INSPECTOR role 미존재 시 WAREHOUSE 가 검수도 수행.
      return ['WAREHOUSE', 'INVENTORY', 'MANAGER', 'MASTER'].includes(role)
    case 'confirm':
      return ['ACCOUNTANT', 'MANAGER', 'MASTER'].includes(role)
    case 'reject':
      return ['MANAGER', 'MASTER'].includes(role)
    default:
      return false
  }
}

/**
 * 이동전표 라이프사이클 transition 권한.
 */
export function canTransitionTransfer(
  action: 'approve' | 'reject' | 'ship' | 'receive' | 'confirm' | 'cancel',
  role: string | undefined | null,
): boolean {
  if (!role) return false
  switch (action) {
    case 'approve':
    case 'reject':
    case 'confirm':
    case 'cancel':
      return ['MASTER', 'MANAGER', 'INVENTORY'].includes(role)
    case 'ship':
    case 'receive':
      return ['MASTER', 'MANAGER', 'WAREHOUSE', 'INVENTORY'].includes(role)
    default:
      return false
  }
}
