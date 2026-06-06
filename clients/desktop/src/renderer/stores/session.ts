/**
 * 세션 상태 — 메인 프로세스 토큰 저장소를 미러링하는 렌더러 캐시.
 *
 * zustand 단일 store 로 관리하며, 앱 부팅 시 `bootstrap()` 가 IPC 로
 * 메인 프로세스에서 토큰을 가져와 초기 상태를 구성한다.
 *
 * C5-2b: canCreateSlip / canInspectInbound / canCreateTransfer 헬퍼는
 * usePermissions().canAccess() 로 이관 완료. session.ts 에서 제거됨.
 *
 * C5-2c: hasAdminRole / canTransitionSlip / canTransitionTransfer 헬퍼는
 * usePermissions().canAccess() 로 이관 완료. session.ts 에서 제거됨.
 *   - hasAdminRole     → canAccess('inventory.warehouse.admin', 'create')
 *   - canTransitionSlip  → canAccess(slipActionPageCode(action), 'update')   [SlipDetailPage]
 *   - canTransitionTransfer → canAccess(transferActionPageCode(action), 'update') [TransferDetailPage]
 *
 * P1-B revert: canQuerySales 는 BE SlipSalesAccessGuard(SALES/MANAGER/MASTER 한정)와
 * 정합을 맞추기 위해 session.ts 에 복원. canAccess('sales.slip.list') 는 seed 가
 * ACCOUNTANT/INVENTORY 에도 view 부여하여 FE 화면은 열리나 API 403 발생.
 */
import { create } from 'zustand'
import type { AuthSnapshot, AuthGroupItem } from '../types/electron'
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
 * 매출 전표 목록 조회 권한.
 *
 * BE `SlipSalesAccessGuard#canReadOutboundSales` 와 동일 허용 집합(SALES/MANAGER/MASTER).
 * seed `sales.slip.list` 는 ACCOUNTANT/INVENTORY 에도 view=TRUE 를 부여하나,
 * BE 가드가 막으므로 FE 화면도 그 역할에게 노출해선 안 됨 (P1-B: FE-shows-BE-blocks 방지).
 *
 * @param role 현재 사용자 role
 */
export function canQuerySales(role: string | undefined | null): boolean {
  if (!role) return false
  return ['SALES', 'MANAGER', 'MASTER'].includes(role)
}

// ---------------------------------------------------------------------------
// Phase C5-3: 권한 그룹 셀렉터 / 헬퍼
// ---------------------------------------------------------------------------

/**
 * 현재 세션의 groups 배열을 반환한다.
 * `null` 세션이거나 BE 미지원 버전 응답 시 빈 배열.
 *
 * @param auth 현재 AuthSnapshot
 */
export function getSessionGroups(auth: AuthSnapshot | null): AuthGroupItem[] {
  return auth?.groups ?? []
}

/**
 * 빌트인 그룹(builtin=true) 의 표시명을 반환한다.
 *
 * 용도: 헤더 칩, 프로필 뱃지 등에서 role 코드 대신 한국어 그룹명 표시.
 * UUID 는 내부 식별 전용이며 이 함수에서 반환하지 않는다 (feedback_uuid_no_user_visibility).
 *
 * 예: `getBuiltinRoleLabel(auth)` → "매니저" / "창고원" / "마스터" 등.
 * 빌트인 그룹 없거나 groups 미존재 시 `null`.
 *
 * @param auth 현재 AuthSnapshot
 */
export function getBuiltinRoleLabel(auth: AuthSnapshot | null): string | null {
  const groups = getSessionGroups(auth)
  const builtin = groups.find((g) => g.builtin)
  return builtin?.name ?? null
}

/**
 * 주어진 그룹 name 이 현재 세션 groups 에 포함되어 있는지 확인한다.
 *
 * PR-2 그룹 기반 소비 전환 시 사용하는 예정 헬퍼.
 * UUID 를 직접 비교하지 않고 name 을 사용한다 (feedback_uuid_no_user_visibility).
 *
 * @param auth 현재 AuthSnapshot
 * @param groupName 확인할 그룹명 (예: "마스터", "매니저")
 */
export function hasGroupByName(auth: AuthSnapshot | null, groupName: string): boolean {
  return getSessionGroups(auth).some((g) => g.name === groupName)
}
