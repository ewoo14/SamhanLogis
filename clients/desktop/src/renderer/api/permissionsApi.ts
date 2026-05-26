/**
 * 동적 RBAC 권한 매트릭스 API 클라이언트 — SP-D1 슬라이스.
 *
 * BE endpoint (auth-service, api-gateway prefix /auth 제거 후 routing):
 * - GET  /auth/admin/permissions          — 전체 역할 × 페이지 매트릭스 조회 (MASTER 전용)
 * - POST /auth/admin/permissions/batch    — 체크박스 다중 토글 batch update (MASTER 전용)
 * - GET  /auth/admin/permissions/my       — 현재 로그인 사용자 권한 목록 조회 (인증된 모든 역할)
 *
 * UUID 비공개 가드: 매트릭스 응답에 UUID 미포함 — roleCode / pageCode 비즈니스 식별자만 사용.
 *
 * PageCode 체계 (SP-D1 cycle 2 fix):
 * FE PageCode 타입을 BE PageCode enum 의 dot-separated code 와 완전 일치시킨다.
 * 예) 'accounting.tax-invoice.emit-nts', 'admin.permissions' 등.
 *
 * 권한 캐시: usePermissions hook 이 TanStack Query staleTime 으로 5분 캐시.
 * 동기 canAccess() 는 캐시된 데이터를 기반으로 즉시 응답.
 */
import { apiClient, type ApiEnvelope } from './client'

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------

/**
 * 동적 RBAC 매트릭스 ROLE 풀네임.
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
  | 'PARTNER'
  | 'STAFF'
  | 'DRIVER'

/** 페이지 권한 액션 종류 — view(조회) / edit(변경). */
export type PermissionAction = 'view' | 'edit'

/**
 * 페이지 코드 — BE PageCode enum dot-separated code 와 1:1 매핑.
 *
 * SP-D1 cycle 2 fix: 대문자 상수(DASHBOARD 등)에서 dot-separated 소문자 코드로 교체.
 * SP-D2: 회계 카테고리 7개 신규 추가 (accounts / journals / balances / reports /
 *         period-close / statement-batch / partner-ledger).
 * Issue 4 Slice 4: 회계 수정/삭제 요청 PageCode 추가.
 * SP-D4: 잔여 7 도메인 22개 신규 추가 (estimates / sales.partner-order.* /
 *         sales.vendor-order / inventory.* / admin.* / partners.* / products.* / arologis.*).
 * SP-D6-1: system.* / dc-config.import / dashboard.admin + 거래처 DC 설정 권한 추가.
 * SP-D6-2: messenger.* / product edit-request/import / partner-order edit-request/tutorial 추가.
 * BE {@code PageCode.java} enum 의 {@code code} 필드값과 완전 일치.
 * UUID 비공개: pageCode 만 사용자 노출.
 */
export type PageCode =
  // SP-D1 초기 12개
  | 'accounting.tax-invoice.emit-nts'
  | 'accounting.tax-invoice.list'
  | 'accounting.tax-invoice.batch-issue'
  | 'accounting.tax-invoice.inbound'
  | 'accounting.sales-slip.list'
  | 'accounting.purchase-slip.list'
  | 'accounting.deposit-match'
  | 'accounting.daily-closing'
  | 'accounting.general-ledger'
  | 'notification.dispatch-sms.send-audit'
  | 'messenger.admin'
  | 'messenger.send'
  | 'purchases.receipt-ocr'
  | 'purchases.slip.list'
  | 'sales.slip.list'
  | 'sales.partner-dc-config'
  | 'inbound.inspection'
  | 'dispatch.board'
  | 'admin.permissions'
  | 'system.permission-admin'
  | 'system.password-admin'
  | 'system.account-admin'
  | 'dc-config.import'
  | 'dashboard.admin'
  // SP-D2 회계 7개 신규
  | 'accounting.accounts'
  | 'accounting.journals'
  | 'accounting.balances'
  | 'accounting.reports'
  | 'accounting.period-close'
  | 'accounting.statement-batch'
  | 'accounting.partner-ledger'
  | 'accounting.edit-requests'
  // SP-D4 잔여 7 도메인 22개 신규
  | 'estimates.list'
  | 'sales.partner-order.list'
  | 'sales.partner-order.draft'
  | 'sales.partner-order.edit'
  | 'sales.partner-order.confirm'
  | 'sales.partner-order.history'
  | 'sales.partner-order.print'
  | 'sales.partner-order.edit-requests'
  | 'sales.partner-order.edit-requests.decide'
  | 'sales.partner-order.tutorial'
  | 'sales.vendor-order'
  | 'inventory.warehouse'
  | 'inventory.stock'
  | 'inventory.stock-transfer'
  | 'inventory.dps'
  | 'inventory.audit'
  | 'admin.employees'
  | 'admin.users'
  | 'partners.list'
  | 'partners.detail'
  | 'partners.block'
  | 'partners.edit-request'
  | 'products.list'
  | 'products.admin'
  | 'products.price'
  | 'products.edit-requests'
  | 'products.edit-requests.decide'
  | 'products.ecount-import'
  | 'arologis.admin'
  | 'arologis.region'
  // MIG-14 admin UI 4 groups
  | 'ecount.mig14.cash-list'
  | 'ecount.mig14.order-list'
  | 'ecount.mig14.aging-snapshot'
  | 'ecount.mig14.ledger'
  // MIG-21 migration ops dashboard
  | 'ecount.mig.ops-dashboard'

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
 * SP-D1: 7 역할 × 12 페이지 = 최대 84셀.
 * SP-D2: 7 역할 × 19 페이지 = 최대 133셀 (회계 7개 추가).
 * SP-D4: 7 역할 × 41 페이지 = 최대 287셀 (잔여 7 도메인 22개 추가).
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
 * 전체 권한 매트릭스 조회 — `GET /auth/admin/permissions`.
 * MASTER 전용. 다른 역할은 403.
 *
 * BE 응답: {@code Map<roleCode, Map<pageCode, PermissionDto>>}
 * FE 변환: 중첩 Map → PermissionMatrix.cells 배열로 평탄화.
 *
 * @return PermissionMatrix
 */
type PermissionDtoRaw = {
  roleCode: string; pageCode: string; canView: boolean; canEdit: boolean; isOverride: boolean
}

export async function fetchPermissionMatrix(): Promise<PermissionMatrix> {
  const res = await apiClient.get<ApiEnvelope<Record<string, Record<string, PermissionDtoRaw>>>>(
    '/auth/admin/permissions',
  )
  const nestedMap = res.data.data ?? {}
  const cells: PermissionCell[] = []
  for (const roleCode of Object.keys(nestedMap)) {
    const pageMap = nestedMap[roleCode]
    if (!pageMap) continue
    for (const pageCode of Object.keys(pageMap)) {
      const dto = pageMap[pageCode]
      if (!dto) continue
      cells.push({
        roleCode: dto.roleCode as RbacRole,
        pageCode: dto.pageCode as PageCode,
        view: dto.canView,
        edit: dto.canEdit,
      })
    }
  }
  return { cells, generatedAt: new Date().toISOString() }
}

/**
 * 권한 batch 업데이트 — `POST /auth/admin/permissions/batch`.
 * MASTER 전용. 변경된 셀만 포함하여 전송.
 *
 * BE 요청 형식: {@code { permissions: [{ roleCode, pageCode, canView, canEdit }] }}
 *
 * @param updates 변경할 셀 목록
 */
export async function updatePermissionBatch(
  updates: PermissionUpdateItem[],
): Promise<void> {
  // FE PermissionUpdateItem(action/allowed) → BE PermissionUpdateRequest(canView/canEdit) 변환.
  // 여러 update 가 같은 (roleCode, pageCode) 를 참조할 수 있으므로 병합.
  const mergeMap = new Map<string, { roleCode: string; pageCode: string; canView: boolean; canEdit: boolean }>()
  for (const u of updates) {
    const key = `${u.roleCode}__${u.pageCode}`
    const existing = mergeMap.get(key) ?? { roleCode: u.roleCode, pageCode: u.pageCode, canView: false, canEdit: false }
    if (u.action === 'view') existing.canView = u.allowed
    if (u.action === 'edit') existing.canEdit = u.allowed
    mergeMap.set(key, existing)
  }
  const permissions = Array.from(mergeMap.values())
  await apiClient.post<ApiEnvelope<void>>('/auth/admin/permissions/batch', { permissions })
}

/**
 * 현재 로그인 사용자 권한 목록 조회 — `GET /auth/admin/permissions/my`.
 * 인증된 모든 역할 접근 가능. usePermissions hook 이 캐시.
 *
 * BE 응답: {@code List<PermissionDto>} (canView / canEdit 필드)
 * FE 변환: PermissionDto → MyPermission (actions 배열)
 *
 * @return MyPermission[]
 */
export async function fetchMyPermissions(): Promise<MyPermission[]> {
  const res = await apiClient.get<ApiEnvelope<Array<{
    roleCode: string; pageCode: string; canView: boolean; canEdit: boolean
  }>>>('/auth/admin/permissions/my')
  return res.data.data.map((dto) => {
    const actions: PermissionAction[] = []
    if (dto.canView) actions.push('view')
    if (dto.canEdit) actions.push('edit')
    return { pageCode: dto.pageCode as PageCode, actions }
  })
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
