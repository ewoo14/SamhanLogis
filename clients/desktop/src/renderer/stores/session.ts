/**
 * 세션 상태 — 플랫폼별 authProvider 세션 식별정보를 미러링하는 렌더러 캐시.
 *
 * zustand 단일 store 로 관리하며, 앱 부팅 시 `bootstrap()` 이 Electron IPC 또는
 * 웹 `/auth/me` 를 통해 초기 상태를 구성한다.
 *
 * C5-2b: canCreateSlip / canInspectInbound / canCreateTransfer 헬퍼는
 * usePermissions().canAccess() 로 이관 완료. session.ts 에서 제거됨.
 *
 * C5-2c: hasAdminRole / canTransitionSlip / canTransitionTransfer 헬퍼는
 * usePermissions().canAccess() 로 이관 완료. session.ts 에서 제거됨.
 *   - hasAdminRole     → canAccess('inventory.warehouse.admin', 'create')
 *   - canTransitionSlip  → canAccessSlipAction(action, mode, canAccess)       [SlipDetailPage]
 *   - canTransitionTransfer → canAccess(transferActionPageCode(action), 'update') [TransferDetailPage]
 *
 * C5 follow-up: 전표 조회 헬퍼는 BE SlipSalesAccessGuard/
 * SlipPurchaseAccessGuard 와 같은 유형별 허용 집합을 사용한다.
 * canAccess('*.slip.list') 는 서버 조회 guard보다 넓은 seed를 가질 수 있으므로 메뉴·목록·상세
 * 진입점이 이 헬퍼를 공통으로 소비한다.
 */
import { create } from 'zustand'
import type { AuthSnapshot, AuthGroupItem } from '../types/electron'
import { MOCK_AUTH, isMockMode } from '../api/mock'
import type { LoginResponse } from '../api/auth'
import {
  getAuthProvider,
  isCapacitorPlatform,
  isElectronPlatform,
  type SessionInfo,
} from '../auth/authProvider'
import { clearSessionQueryCache } from '../queryClientRegistry'
import { sanitizeDisplayName } from '../common/userDisplayName'

interface SessionState {
  /** 세션 부팅 완료 여부 — false 이면 splash/스피너 표시. */
  bootstrapped: boolean
  /** 현재 인증 정보. 비로그인 상태는 `null`. */
  auth: AuthSnapshot | null
  /** 메인 프로세스에서 토큰을 다시 읽어와 상태에 반영. */
  bootstrap: () => Promise<void>
  /** 로그인 성공 시 호출 — provider 저장/캐시 + 렌더러 세션 갱신. */
  setAuth: (login: LoginResponse) => Promise<void>
  /** provider 세션과 렌더러 auth 캐시를 함께 비운다. 401 전역 가드에서 사용. */
  clearAuthState: () => Promise<void>
  /** 로그아웃 — provider 세션 정리 + 렌더러 캐시 비움. */
  logout: () => Promise<void>
}

/** provider 세션 식별정보를 기존 AuthSnapshot shape 로 맞춘다. 웹 토큰은 JS 에 노출하지 않는다. */
function sessionInfoToSnapshot(session: SessionInfo | null, token = ''): AuthSnapshot | null {
  if (!session) return null
  return {
    token,
    userId: session.userId,
    role: session.role,
    fullName: sanitizeDisplayName(session.fullName),
    partnerCode: session.partnerCode,
    groups: session.groups,
  }
}

/** LoginResponse 를 렌더러 캐시용 snapshot 으로 변환한다. */
function loginToSnapshot(login: LoginResponse): AuthSnapshot {
  return {
    token: isElectronPlatform ? login.token : '',
    userId: login.userId,
    role: login.role,
    fullName: sanitizeDisplayName(login.displayName),
    partnerCode: login.partnerCode,
    groups: login.groups,
  }
}

async function registerPushIfNative(): Promise<void> {
  if (!isCapacitorPlatform) return
  try {
    const { registerPush } = await import('../push/pushRegistration')
    await registerPush()
  } catch (error) {
    console.warn('[session] push 등록 실패', error)
  }
}

async function unregisterPushIfNative(): Promise<void> {
  if (!isCapacitorPlatform) return
  try {
    const { unregisterPush } = await import('../push/pushRegistration')
    await unregisterPush()
  } catch (error) {
    console.warn('[session] push 해제 실패', error)
  }
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
      const session = await getAuthProvider().bootstrap()
      set({ auth: sessionInfoToSnapshot(session), bootstrapped: true })
      if (session) void registerPushIfNative()
    } catch (err) {
      console.error('[session] 초기 세션 복원 실패', err)
      set({ auth: null, bootstrapped: true })
    }
  },
  setAuth: async (login) => {
    await getAuthProvider().establishSession(login)
    set({ auth: loginToSnapshot(login) })
    void registerPushIfNative()
  },
  clearAuthState: async () => {
    try {
      await getAuthProvider().clearSession()
    } finally {
      clearSessionQueryCache()
      set({ auth: null })
    }
  },
  logout: async () => {
    await unregisterPushIfNative()
    try {
      await getAuthProvider().clearSession()
    } finally {
      clearSessionQueryCache()
      set({ auth: null })
    }
  },
}))

/**
 * 매출 전표 목록 조회 권한.
 *
 * BE `SlipSalesAccessGuard#canReadOutboundSales` 와 동일 허용 집합(SALES/MANAGER/MASTER).
 * seed `sales.slip.list` 는 ACCOUNTANT/INVENTORY 에도 view=TRUE 를 부여하나,
 * BE 가드가 막으므로 FE 화면도 그 역할에게 노출해선 안 됨 (P1-B: FE-shows-BE-blocks 방지).
 * 현재 FE 세션 snapshot 에 별도 `isSystemMaster` 필드는 없으므로 MASTER 시스템 전권은
 * V43 MASTER 빌트인 role-group UUID 배속으로 판정한다.
 * (사이클1 BE P2-2) isSystemMaster 미반영 사유: auth-service 는 is_system_master 계정을
 * 항상 MASTER 빌트인 그룹(…0100)에 배속하므로(C3a syncBuiltinRoleGroup 불변식)
 * 그룹 배속 판정이 BE 의 isSystemMaster bypass 와 실효 동일하다.
 *
 * @param auth 현재 인증 snapshot
 */
export function canQuerySales(auth: AuthSnapshot | null): boolean {
  return (
    auth?.role === 'SALES'
    || auth?.role === 'MANAGER'
    || auth?.role === 'MASTER'
    || hasBuiltinRoleGroup(auth, 'SALES')
    || hasBuiltinRoleGroup(auth, 'MANAGER')
    || hasBuiltinRoleGroup(auth, 'MASTER')
  )
}

/**
 * 매입(INBOUND) 전표 목록·상세 조회 권한.
 *
 * BE `SlipPurchaseAccessGuard` 와 동일하게 WAREHOUSE / MANAGER / MASTER 만 허용한다.
 * PageCode seed가 ACCOUNTANT 등에도 VIEW를 줄 수 있어 유형별 서버 guard를 함께 반영해야 한다.
 */
export function canQueryPurchases(auth: AuthSnapshot | null): boolean {
  return (
    auth?.role === 'WAREHOUSE'
    || auth?.role === 'MANAGER'
    || auth?.role === 'MASTER'
    || hasBuiltinRoleGroup(auth, 'WAREHOUSE')
    || hasBuiltinRoleGroup(auth, 'MANAGER')
    || hasBuiltinRoleGroup(auth, 'MASTER')
  )
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
 * V43 빌트인 role-group UUID 카탈로그 (BE `BuiltinRoleGroupIds` 와 1:1).
 *
 * UUID 는 **내부 비교 전용**이며 화면 렌더 금지(feedback_uuid_no_user_visibility —
 * 내부 식별자 비교는 규칙 위반 아님). 표시는 항상 서버가 내려준 그룹 `name` 사용.
 * is_builtin 플래그는 V43 에서 MASTER(…100)만 TRUE 라 "빌트인 role-group 여부" 판정에
 * 쓸 수 없음 — UUID 카탈로그 매칭이 유일하게 안전한 기준 (PR #414 dual review).
 */
export const BUILTIN_ROLE_GROUP_IDS: Readonly<Record<string, string>> = {
  MASTER: '00000000-0000-0000-0000-000000000100',
  MANAGER: '00000000-0000-0000-0000-000000000101',
  SALES: '00000000-0000-0000-0000-000000000102',
  WAREHOUSE: '00000000-0000-0000-0000-000000000103',
  ACCOUNTANT: '00000000-0000-0000-0000-000000000104',
  INVENTORY: '00000000-0000-0000-0000-000000000105',
  DISPATCH: '00000000-0000-0000-0000-000000000106',
  DRIVER: '00000000-0000-0000-0000-000000000107',
  STAFF: '00000000-0000-0000-0000-000000000108',
  DEVELOPER: '00000000-0000-0000-0000-000000000109',
}

/** 카탈로그 역인덱스 (UUID → role 코드). */
const BUILTIN_GROUP_ID_TO_ROLE: ReadonlyMap<string, string> = new Map(
  Object.entries(BUILTIN_ROLE_GROUP_IDS).map(([role, id]) => [id, role]),
)

/**
 * 세션 groups 중 빌트인 role-group 의 표시명을 반환한다.
 *
 * 용도: 헤더 칩, 프로필 뱃지 등에서 role 코드 대신 한국어 그룹명 표시.
 * V43 UUID 카탈로그 매칭으로 판정하고, 표시값은 서버 그룹 `name`(관리자 rename 반영).
 * 빌트인 role-group 미배속 또는 groups 미존재 시 `null`.
 *
 * @param auth 현재 AuthSnapshot
 */
export function getBuiltinRoleLabel(auth: AuthSnapshot | null): string | null {
  const match = getSessionGroups(auth).find((g) => BUILTIN_GROUP_ID_TO_ROLE.has(g.id))
  return match?.name ?? null
}

/**
 * 현재 세션이 주어진 role 코드의 빌트인 role-group 에 배속되어 있는지 확인한다.
 *
 * PR-2 그룹 기반 소비 전환용 헬퍼. 그룹 name 은 관리자가 rename 가능해 비교 기준으로
 * 사용 불가 — V43 UUID 카탈로그로 비교한다 (dual review P2 반영, 화면 비노출 무관 내부 비교).
 *
 * @param auth 현재 AuthSnapshot
 * @param roleName 빌트인 role 코드 (예: "MASTER", "MANAGER")
 */
export function hasBuiltinRoleGroup(auth: AuthSnapshot | null, roleName: string): boolean {
  const id = BUILTIN_ROLE_GROUP_IDS[roleName]
  if (!id) return false
  return getSessionGroups(auth).some((g) => g.id === id)
}
