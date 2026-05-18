/**
 * 동적 RBAC 권한 매트릭스 API 클라이언트 — SP-D1 슬라이스.
 *
 * BE endpoint (user-service):
 * - GET  /admin/permissions          — 전체 역할 × 페이지 매트릭스 조회 (MASTER 전용)
 * - PUT  /admin/permissions          — 체크박스 다중 토글 batch update (MASTER 전용)
 * - GET  /admin/permissions/my       — 현재 로그인 사용자 권한 목록 조회 (인증된 모든 역할)
 *
 * UUID 비공개 가드: 매트릭스 응답에 UUID 미포함 — roleCode / pageCode 비즈니스 식별자만 사용.
 *
 * 권한 캐시: usePermissions hook 이 TanStack Query staleTime 으로 5분 캐시.
 * 동기 canAccess() 는 캐시된 데이터를 기반으로 즉시 응답.
 */
import { apiClient, type ApiEnvelope } from './client'

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------

/**
 * 8-role ROLE 풀네임 (BE Role enum 과 동일).
 * feedback_role_naming_full — UI/PR/문서 모두 풀네임 의무.
 */
export type RbacRole =
  | 'MASTER'
  | 'DEVELOPER'
  | 'MANAGER'
  | 'DISPATCH'
  | 'SALES'
  | 'ACCOUNTANT'
  | 'WAREHOUSE'
  | 'INVENTORY'

/** 페이지 권한 액션 종류 — view(조회) / edit(변경). */
export type PermissionAction = 'view' | 'edit'

/**
 * 페이지 코드 12개 — BE PageCode enum 과 1:1.
 * UUID 비공개: pageCode 만 사용자 노출.
 */
export type PageCode =
  | 'DASHBOARD'
  | 'WAREHOUSES'
  | 'SALES'
  | 'PURCHASES'
  | 'TRANSFERS'
  | 'ACCOUNTING'
  | 'AROLOGIS'
  | 'WAREHOUSE_OPS'
  | 'ADMIN'
  | 'DISPATCH_BOARD'
  | 'PERMISSION_MATRIX'
  | 'REPORTS'

/**
 * 개별 역할-페이지 권한 셀.
 * roleCode × pageCode 쌍으로 식별 — UUID 비공개.
 */
export interface PermissionCell {
  roleCode: RbacRole
  pageCode: PageCode
  view: boolean
  edit: boolean
}

/**
 * 전체 권한 매트릭스 — GET /admin/permissions 응답.
 * 7 역할 × 12 페이지 = 최대 84셀.
 */
export interface PermissionMatrix {
  /** 전체 셀 목록. */
  cells: PermissionCell[]
  /** 응답 시점 서버 타임스탬프. */
  generatedAt: string
}

/**
 * 배치 업데이트 요청 단위 — 변경된 셀만 전송.
 */
export interface PermissionUpdateItem {
  roleCode: RbacRole
  pageCode: PageCode
  action: PermissionAction
  allowed: boolean
}

/**
 * PUT /admin/permissions body.
 */
export interface PermissionBatchUpdateRequest {
  updates: PermissionUpdateItem[]
}

/**
 * 현재 사용자 권한 목록 — GET /admin/permissions/my 응답.
 * pageCode + 허용된 액션 배열.
 */
export interface MyPermission {
  pageCode: PageCode
  actions: PermissionAction[]
}

// ---------------------------------------------------------------------------
// API 함수
// ---------------------------------------------------------------------------

/**
 * 전체 권한 매트릭스 조회 — `GET /admin/permissions`.
 * MASTER 전용. 다른 역할은 403.
 *
 * @return PermissionMatrix
 */
export async function fetchPermissionMatrix(): Promise<PermissionMatrix> {
  const res = await apiClient.get<ApiEnvelope<PermissionMatrix>>(
    '/admin/permissions',
  )
  return res.data.data
}

/**
 * 권한 batch 업데이트 — `PUT /admin/permissions`.
 * MASTER 전용. 변경된 셀만 포함하여 전송.
 *
 * @param updates 변경할 셀 목록
 */
export async function updatePermissionBatch(
  updates: PermissionUpdateItem[],
): Promise<void> {
  const body: PermissionBatchUpdateRequest = { updates }
  await apiClient.put<ApiEnvelope<void>>('/admin/permissions', body)
}

/**
 * 현재 로그인 사용자 권한 목록 조회 — `GET /admin/permissions/my`.
 * 인증된 모든 역할 접근 가능. usePermissions hook 이 캐시.
 *
 * @return MyPermission[]
 */
export async function fetchMyPermissions(): Promise<MyPermission[]> {
  const res = await apiClient.get<ApiEnvelope<MyPermission[]>>(
    '/admin/permissions/my',
  )
  return res.data.data
}

// ---------------------------------------------------------------------------
// 권한 캐시 헬퍼 (hook 없는 동기 접근용 — zustand 기반 캐시와 연동)
// ---------------------------------------------------------------------------

/** 내부 캐시 — usePermissions hook 이 setPermissionsCache 로 갱신한다. */
let _permissionsCache: MyPermission[] | null = null

/**
 * usePermissions hook 이 fetch 완료 후 호출하여 동기 canAccess 캐시를 갱신.
 * AppLayout 사이드바 등 hook 컨텍스트 없는 헬퍼에서 사용.
 */
export function setPermissionsCache(perms: MyPermission[]): void {
  _permissionsCache = perms
}

/**
 * 현재 사용자가 특정 페이지-액션 권한을 보유하는지 동기 확인.
 *
 * <p>캐시가 없으면 (초기 로딩 중) true 를 반환하여 깜박임 방지 (보수적 허용).
 * 서버 응답 후 usePermissions hook 이 캐시를 채우면 정확히 재평가된다.
 *
 * @param pageCode  확인할 페이지 코드
 * @param action    확인할 액션 (기본값: 'view')
 * @return 권한 보유 여부
 */
export function canAccess(
  pageCode: PageCode,
  action: PermissionAction = 'view',
): boolean {
  if (_permissionsCache === null) return true // 로딩 중 — 보수적 허용
  const entry = _permissionsCache.find((p) => p.pageCode === pageCode)
  if (!entry) return false
  return entry.actions.includes(action)
}
