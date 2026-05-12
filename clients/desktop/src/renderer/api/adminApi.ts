/**
 * 관리자 통합 admin API 클라이언트 — Phase 10 P0-5 슬라이스 4.
 *
 * BE endpoint (commit e9ad461):
 * - user-service
 *   - GET    /admin/users               — q/role/dept 필터 + 페이지네이션
 *   - GET    /admin/users/roles         — 전체 ROLE 목록
 *   - PATCH  /admin/users/{id}/disable  — 사용자 비활성화 (MASTER 만)
 *   - PATCH  /admin/users/{id}/enable   — 사용자 재활성화 (MASTER 만)
 *   - PATCH  /admin/users/{id}/role     — 역할 변경 + 이력 적재 (MASTER 만)
 *   - GET    /admin/users/{id}/role-history — 역할 변경 이력 조회
 *   - GET    /users/departments         — 부서 목록 (read-only, 인증된 모든 역할)
 * - partner-service
 *   - GET    /admin/partners/search     — q + status 필터 + 페이지네이션
 *   - POST   /admin/partners            — 신규 등록
 *   - PUT    /admin/partners/{partnerCode}    — 프로필 수정
 *   - DELETE /admin/partners/{partnerCode}    — soft-delete
 * - inventory-service
 *   - GET    /inventory/warehouses/search — q + 페이지네이션
 *   - POST   /inventory/warehouses      — 신규 등록 (기존 createWarehouse 재사용 권장)
 *   - PATCH  /inventory/warehouses/{id} — 부분 수정 (MASTER/MANAGER/DEVELOPER)
 *   - DELETE /inventory/warehouses/{id} — soft-delete (MASTER/MANAGER/DEVELOPER)
 *
 * UUID 비공개 가드: 응답 DTO 의 id 는 mutation path key 전용. 사용자 노출 식별자는
 * loginId / fullName / partnerCode / warehouseCode 등 비즈니스 식별자.
 *
 * 권한 체계: MASTER 가드는 라우트 단의 RoleGuard 가 담당 (본 모듈은 horizontal HTTP 만).
 */
import { apiClient, type ApiEnvelope } from './client'

// ---------------------------------------------------------------------------
// 공통 타입
// ---------------------------------------------------------------------------

/**
 * 7-tier ROLE 풀네임 (BE Role enum 과 동일).
 *
 * memory feedback_role_naming_full — UI/PR/문서 모두 풀네임 의무 (M/M/D 약어 금지).
 */
export type AdminRole =
  | 'MASTER'
  | 'DEVELOPER'
  | 'MANAGER'
  | 'SALES'
  | 'ACCOUNTANT'
  | 'WAREHOUSE'
  | 'INVENTORY'

/** ROLE 풀네임 → 한국어 표시 라벨 (BE Role enum.displayName 과 1:1). */
export const ADMIN_ROLE_LABEL: Record<AdminRole, string> = {
  MASTER: '마스터',
  DEVELOPER: '개발자',
  MANAGER: '매니저',
  SALES: '영업원',
  ACCOUNTANT: '회계원',
  WAREHOUSE: '창고원',
  INVENTORY: '재고원',
}

/** items / total / page / size 형식 admin 페이지 응답. */
export interface AdminPage<T> {
  items: T[]
  total: number
  page: number
  size: number
}

// ---------------------------------------------------------------------------
// 사용자 (user-service)
// ---------------------------------------------------------------------------

/** BE `EmployeeResponse` 와 1:1. */
export interface AdminUser {
  /** 사용자 UUID — mutation path key 전용, 화면 미노출. */
  id: string
  loginId: string
  fullName: string
  position: string | null
  role: AdminRole
  departmentId: string
  departmentName: string
  teamLead: boolean
  hireDate: string
  /**
   * terminationDate 가 set 되어 있으면 DISABLED 상태.
   * auth-service locked 상태(LOCKED)는 추후 연동 슬라이스에서 별도 필드로 추가.
   */
  terminationDate: string | null
  email: string | null
  phone: string | null
}

/** 사용자 목록 조회 옵션. */
export interface ListAdminUsersOptions {
  /** fullName / loginId / email LIKE 검색어. */
  q?: string
  role?: AdminRole
  /**
   * 상태 필터 — BE EmployeeRepository.searchAdmin 의 :status 파라미터.
   * ACTIVE: terminationDate IS NULL / LOCKED: terminationDate IS NOT NULL.
   */
  status?: 'ACTIVE' | 'LOCKED'
  /** 부서 UUID. */
  departmentId?: string
  /** 0-based 페이지 번호. */
  page?: number
  /** 페이지 크기 (기본 20). */
  size?: number
}

/** 신규 사용자 등록 요청 — BE `CreateEmployeeRequest` 와 1:1. */
export interface CreateAdminUserRequest {
  loginId: string
  fullName: string
  email: string
  role: AdminRole
  departmentId?: string
  phoneNumber?: string
}

/**
 * 신규 사용자 등록 응답 — BE `AdminUserCreateResponse` record 와 1:1 (flat).
 *
 * <p>임시 비밀번호 평문은 이 응답에서만 1회 노출. {@link AdminUser} 와 동일한 컬럼 +
 * {@code temporaryPassword} / {@code passwordChangeRequired} 추가. UUID 비공개 가드는
 * 기존과 동일 — id 는 routing key, 화면 라벨은 fullName / loginId.
 */
export interface CreateAdminUserResponse {
  /** 직원 UUID — routing key 전용. */
  id: string
  loginId: string
  fullName: string
  role: AdminRole
  departmentId: string
  departmentName: string
  email: string | null
  phoneNumber: string | null
  /** 임시 비밀번호 평문 (1회 노출). */
  temporaryPassword: string
  /** 첫 로그인 시 비밀번호 변경 강제 여부 (BE 항상 true). */
  passwordChangeRequired: boolean
}

/** 사용자 정보 수정 요청 — BE `AdminUserUpdateRequest` 와 1:1. */
export interface UpdateAdminUserRequest {
  fullName?: string
  email?: string
  phoneNumber?: string
  departmentId?: string
}

/**
 * 사용자 목록 조회 — `/admin/users`.
 *
 * @return AdminPage<AdminUser>
 */
export async function listAdminUsers(
  options: ListAdminUsersOptions = {},
): Promise<AdminPage<AdminUser>> {
  const params: Record<string, string | number> = {
    page: options.page ?? 0,
    size: options.size ?? 20,
  }
  if (options.q && options.q.trim()) params['q'] = options.q.trim()
  if (options.role) params['role'] = options.role
  if (options.status) params['status'] = options.status
  if (options.departmentId) params['departmentId'] = options.departmentId

  const res = await apiClient.get<ApiEnvelope<AdminPage<AdminUser>>>(
    '/admin/users',
    { params },
  )
  return res.data.data
}

/**
 * 전체 ROLE 목록 — `/admin/users/roles`.
 *
 * @return AdminRole[]
 */
export async function listAdminRoles(): Promise<AdminRole[]> {
  const res = await apiClient.get<ApiEnvelope<AdminRole[]>>(
    '/admin/users/roles',
  )
  return res.data.data
}

/**
 * 신규 사용자 등록 — `POST /admin/users`. MASTER 만 호출 가능.
 *
 * @return CreateAdminUserResponse (user + temporaryPassword)
 */
export async function createAdminUser(
  body: CreateAdminUserRequest,
): Promise<CreateAdminUserResponse> {
  const res = await apiClient.post<ApiEnvelope<CreateAdminUserResponse>>(
    '/admin/users',
    body,
  )
  return res.data.data
}

/**
 * 사용자 정보 수정 — `PATCH /admin/users/{id}`. MASTER 만 호출 가능.
 *
 * @return AdminUser (updated)
 */
export async function updateAdminUser(
  id: string,
  body: UpdateAdminUserRequest,
): Promise<AdminUser> {
  const res = await apiClient.patch<ApiEnvelope<AdminUser>>(
    `/admin/users/${id}`,
    body,
  )
  return res.data.data
}

/**
 * 사용자 탈퇴(영구 퇴사 처리) — `POST /admin/users/{id}/disable`. MASTER 만 호출 가능.
 *
 * <p>BE 응답: HTTP 204 No Content (body 없음). 사유는 본 슬라이스에서 미적재 —
 * UX 검증 (사용자 사유 입력 UX) 만 frontend 측에서 강제. 추후 audit 로그 슬라이스에서
 * 사유를 별도 endpoint 로 적재 예정.
 *
 * @return Promise<void>
 */
export async function disableAdminUser(id: string): Promise<void> {
  await apiClient.post<void>(`/admin/users/${id}/disable`)
}

/**
 * 사용자 잠금 해제 — `POST /admin/users/{id}/unlock`. MASTER 만 호출 가능.
 *
 * <p>BE 응답: HTTP 204 No Content (body 없음). 호출 후 query invalidate 로 목록 재조회.
 *
 * @return Promise<void>
 */
export async function unlockAdminUser(id: string): Promise<void> {
  await apiClient.post<void>(`/admin/users/${id}/unlock`)
}

/** 역할 변경 요청 body — BE `UpdateRoleRequest` 와 1:1. */
export interface UpdateAdminUserRoleRequest {
  newRole: AdminRole
  reason?: string
}

/** 역할 변경 + 이력 적재. MASTER 만 호출 가능. */
export async function updateAdminUserRole(
  id: string,
  body: UpdateAdminUserRoleRequest,
): Promise<AdminUser> {
  const res = await apiClient.patch<ApiEnvelope<AdminUser>>(
    `/admin/users/${id}/role`,
    body,
  )
  return res.data.data
}

/** 역할 변경 이력 1행 — BE `RoleHistoryResponse` 와 1:1. */
export interface RoleHistoryEntry {
  id: string
  previousRole: AdminRole | null
  newRole: AdminRole
  reason: string | null
  changedAt: string
  changedBy: string | null
}

/** 역할 변경 이력 조회 (시간 역순). */
export async function listRoleHistory(
  id: string,
): Promise<RoleHistoryEntry[]> {
  const res = await apiClient.get<ApiEnvelope<RoleHistoryEntry[]>>(
    `/admin/users/${id}/role-history`,
  )
  return res.data.data
}

// ---------------------------------------------------------------------------
// 부서 (user-service)
// ---------------------------------------------------------------------------

/** BE `DepartmentResponse` 와 1:1. */
export interface Department {
  id: string
  code: string
  name: string
  displayOrder: number
}

/** 부서 목록 조회 — `/users/departments` (read-only). */
export async function listDepartments(): Promise<Department[]> {
  const res = await apiClient.get<ApiEnvelope<Department[]>>(
    '/users/departments',
  )
  return res.data.data
}

// ---------------------------------------------------------------------------
// 거래처 (partner-service)
// ---------------------------------------------------------------------------

/** BE `PartnerStatus` enum 과 1:1. */
export type PartnerStatus = 'ACTIVE' | 'SUSPENDED' | 'TERMINATED'

/** PartnerStatus → 한국어 표시 라벨. */
export const PARTNER_STATUS_LABEL: Record<PartnerStatus, string> = {
  ACTIVE: '거래중',
  SUSPENDED: '거래중지',
  TERMINATED: '거래종료',
}

/** BE `PartnerSummaryResponse` 와 1:1 (UUID 비공개). */
export interface PartnerSummary {
  partnerCode: string
  name: string
  bizNo: string
  phone: string | null
  status: PartnerStatus
  creditLimit: string | number
  outstandingBalance: string | number
}

/** 거래처 검색 옵션. */
export interface ListAdminPartnersOptions {
  q?: string
  /** 거래 상태 필터 (ACTIVE / SUSPENDED / TERMINATED). BE ?status= */
  status?: PartnerStatus
  /** 거래처 유형 필터 (CUSTOMER / SUPPLIER / BOTH). BE ?type= */
  type?: 'CUSTOMER' | 'SUPPLIER' | 'BOTH'
  page?: number
  size?: number
}

/**
 * 거래처 admin 검색 — `/admin/partners/search` (q + status + type 필터).
 */
export async function listAdminPartners(
  options: ListAdminPartnersOptions = {},
): Promise<AdminPage<PartnerSummary>> {
  const params: Record<string, string | number> = {
    page: options.page ?? 0,
    size: options.size ?? 20,
  }
  if (options.q && options.q.trim()) params['q'] = options.q.trim()
  if (options.status) params['status'] = options.status
  if (options.type) params['type'] = options.type

  const res = await apiClient.get<ApiEnvelope<AdminPage<PartnerSummary>>>(
    '/admin/partners/search',
    { params },
  )
  return res.data.data
}

// ---------------------------------------------------------------------------
// 창고 (inventory-service)
// ---------------------------------------------------------------------------

/** BE `WarehouseResponse` 와 1:1 (admin 화면용 요약). */
export interface AdminWarehouse {
  id: string
  code: string
  name: string
  type: 'HEADQUARTERS' | 'VEHICLE' | 'CONSIGNMENT' | 'VIRTUAL'
  address: string | null
  displayOrder: number
  description: string | null
  createdAt: string
  modifiedAt: string
}

/** 창고 검색 옵션. */
export interface ListAdminWarehousesOptions {
  q?: string
  page?: number
  size?: number
}

/**
 * 창고 admin 검색 — `/inventory/warehouses/search` (q LIKE code/name/address).
 */
export async function listAdminWarehouses(
  options: ListAdminWarehousesOptions = {},
): Promise<AdminPage<AdminWarehouse>> {
  const params: Record<string, string | number> = {
    page: options.page ?? 0,
    size: options.size ?? 20,
  }
  if (options.q && options.q.trim()) params['q'] = options.q.trim()

  const res = await apiClient.get<ApiEnvelope<AdminPage<AdminWarehouse>>>(
    '/inventory/warehouses/search',
    { params },
  )
  return res.data.data
}

/** 창고 부분 수정 payload. null/undefined 필드는 변경하지 않음. */
export interface UpdateAdminWarehousePayload {
  name?: string
  type?: AdminWarehouse['type']
  address?: string | null
  displayOrder?: number
  description?: string | null
}

/**
 * 창고 PATCH — `/inventory/warehouses/{id}` (MASTER/MANAGER/DEVELOPER).
 * null 이 아닌 필드만 적용.
 */
export async function updateAdminWarehouse(
  id: string,
  payload: UpdateAdminWarehousePayload,
): Promise<AdminWarehouse> {
  const res = await apiClient.patch<ApiEnvelope<AdminWarehouse>>(
    `/inventory/warehouses/${encodeURIComponent(id)}`,
    payload,
  )
  return res.data.data
}

/**
 * 창고 soft-delete — `DELETE /inventory/warehouses/{id}` (MASTER/MANAGER/DEVELOPER).
 *
 * <p>backend `WarehouseService.delete` 가 `is_deleted=true` 마킹 + audit (callerId).
 * 실제 row 는 보존되며 `@SQLRestriction` 가드로 활성 목록에서 자동 제외된다.
 *
 * <p>204 No Content 응답 — 응답 body 없음.
 */
export async function deleteAdminWarehouse(id: string): Promise<void> {
  await apiClient.delete(`/inventory/warehouses/${encodeURIComponent(id)}`)
}

/**
 * 창고 변경 이력 — backend `InventoryAuditLog` (PR-H4b 인프라) 의 timeline 응답.
 *
 * <p>모든 필드 nullable — actor 미식별 시 actorId 는 `00000000-0000-0000-0000-000000000000`.
 */
export interface WarehouseAuditLog {
  id: string
  entityId: string
  revisionNo: number
  actorId: string
  actorName: string | null
  actorColor: string | null
  fieldName: string | null
  oldValue: string | null
  newValue: string | null
  changedAt: string
}

/**
 * 창고 변경 이력 조회 — `GET /inventory/warehouses/{id}/audit-logs`.
 *
 * <p>최신 revision 우선. PR-H4b 인프라 `InventoryAuditLogRecorder.listByEntity` 위임.
 * 미존재 창고는 404.
 */
export async function listWarehouseAuditLogs(
  id: string,
): Promise<WarehouseAuditLog[]> {
  const res = await apiClient.get<ApiEnvelope<WarehouseAuditLog[]>>(
    `/inventory/warehouses/${encodeURIComponent(id)}/audit-logs`,
  )
  return res.data.data
}

/**
 * 비활성화된 (soft-deleted) 창고 목록 — `GET /inventory/warehouses/deleted`.
 *
 * <p>복구 admin 화면 source. modified_at desc 정렬. native query 로 SQLRestriction 우회.
 * 권한 MASTER/MANAGER/DEVELOPER.
 */
export async function listDeletedAdminWarehouses(): Promise<AdminWarehouse[]> {
  const res = await apiClient.get<ApiEnvelope<AdminWarehouse[]>>(
    '/inventory/warehouses/deleted',
  )
  return res.data.data
}

/**
 * 창고 복구 (soft-delete undo) — `POST /inventory/warehouses/{id}/restore`.
 *
 * <p>backend `WarehouseService.restore` 가 `is_deleted=false` 마킹 + audit. 동일 code
 * 의 활성 창고가 이미 존재하면 409 CONFLICT.
 */
export async function restoreAdminWarehouse(id: string): Promise<AdminWarehouse> {
  const res = await apiClient.post<ApiEnvelope<AdminWarehouse>>(
    `/inventory/warehouses/${encodeURIComponent(id)}/restore`,
  )
  return res.data.data
}

/**
 * audit revision 으로 되돌림 (undo) — `POST /inventory/warehouses/{id}/audit/revert/{revisionNo}`.
 *
 * <p>해당 revision 의 oldValue 를 entity 에 다시 적용 + revert 자체도 신규 audit row.
 * isDeleted revert 는 미지원 (`POST /restore` / `DELETE` 사용).
 */
export async function revertAdminWarehouseRevision(
  id: string,
  revisionNo: number,
): Promise<AdminWarehouse> {
  const res = await apiClient.post<ApiEnvelope<AdminWarehouse>>(
    `/inventory/warehouses/${encodeURIComponent(id)}/audit/revert/${revisionNo}`,
  )
  return res.data.data
}

// ---------------------------------------------------------------------------
// 권한 헬퍼
// ---------------------------------------------------------------------------

/** admin 메뉴 (사용자/거래처/창고/부서/권한 통합) 접근 가능 — MASTER 만. */
export function canAccessAdmin(role: string | undefined | null): boolean {
  return role === 'MASTER'
}

// ---------------------------------------------------------------------------
// 인사 카테고리 — 대표실 부서 + MASTER 전용 진입 가드
// ---------------------------------------------------------------------------

/**
 * BE `IsExecutiveOfficeResponse` 와 1:1.
 *
 * <p>user-service `GET /api/v1/users/me/is-executive-office` 응답.
 * 대표실 부서 소속 여부 + 부서명 반환. MASTER 가드는 RoleGuard 가 처리하고,
 * 본 endpoint 는 대표실 부서 소속 여부만 판정한다.
 */
export interface IsExecutiveOfficeResponse {
  /** 대표실 부서 소속 + MASTER 조합인지 여부. */
  isExecutiveOffice: boolean
  /** 현재 사용자 부서명 (null 이면 부서 미배정). */
  departmentName: string | null
}

/**
 * 현재 로그인 사용자가 대표실 부서 + MASTER 인지 조회.
 *
 * BE endpoint: `GET /api/v1/users/me/is-executive-office`
 *
 * @return IsExecutiveOfficeResponse
 */
export async function fetchIsExecutiveOffice(): Promise<IsExecutiveOfficeResponse> {
  const res = await apiClient.get<ApiEnvelope<IsExecutiveOfficeResponse>>(
    '/users/me/is-executive-office',
  )
  return res.data.data
}
