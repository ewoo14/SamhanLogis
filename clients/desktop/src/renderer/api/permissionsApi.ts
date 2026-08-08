/**
 * 동적 RBAC 권한 매트릭스 API 클라이언트 — SP-D1 슬라이스.
 *
 * BE endpoint (auth-service, api-gateway prefix /auth 제거 후 routing):
 * - GET  /auth/admin/permissions          — 전체 역할 × 페이지 매트릭스 조회 (MASTER 전용)
 * - POST /auth/admin/permissions/batch    — 체크박스 다중 토글 batch update (MASTER 전용)
 * - GET  /auth/admin/permissions/account/{accountId} — 계정 × 페이지 × 7-action 매트릭스
 * - GET  /auth/admin/permissions/my      — 현재 계정 권한 캐시용 7-action map
 *
 * UUID 비공개 가드: 매트릭스 응답에 UUID 미포함 — roleCode / pageCode 비즈니스 식별자만 사용.
 *
 * PageCode 체계 (SP-D1 cycle 2 fix):
 * FE PageCode 타입을 BE PageCode enum 의 dot-separated code 와 완전 일치시킨다.
 * 예) 'accounting.tax-invoice.emit-nts', 'admin.permissions' 등.
 *
 * 권한 캐시: usePermissions hook 이 TanStack Query staleTime 으로 30초 캐시.
 * 동기 canAccess() 는 캐시된 데이터를 기반으로 즉시 응답.
 */
import { apiClient, type ApiEnvelope } from './client'
import { registerSessionCacheResetter } from '../queryClientRegistry'

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

/** 페이지 권한 액션 종류 — BE PermissionAction enum 의 소문자 표현. */
export const PERMISSION_ACTIONS = [
  'view',
  'create',
  'update',
  'delete',
  'restore',
  'download',
  'print',
] as const

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number]

/** 기존 2-action 화면의 edit 액션은 Phase 1 신규 update 와 동일하게 전송한다. */
export type PermissionLookupAction = PermissionAction | 'edit'

export interface PermissionActionMatrix {
  view: boolean
  create: boolean
  update: boolean
  delete: boolean
  restore: boolean
  download: boolean
  print: boolean
}

/**
 * 페이지 코드 — BE PageCode enum dot-separated code 와 1:1 매핑.
 *
 * SP-D1 cycle 2 fix: 대문자 상수(DASHBOARD 등)에서 dot-separated 소문자 코드로 교체.
 * SP-D2: 회계 카테고리 7개 신규 추가 (accounts / journals / balances / reports /
 *         period-close / statement-batch / partner-ledger).
 * Issue 4 Slice 4: 회계 수정/삭제 요청 PageCode 추가.
 * SP-D4: 잔여 7 도메인 신규 추가 (estimates / sales.partner-order.* /
 *         inventory.* / admin.* / partners.* / products.* / arologis.*).
 * SP-D6-1: system.* / dc-config.import / dashboard.admin + 거래처 DC 설정 권한 추가.
 * SP-D6-2: messenger.* / product edit-request/import / partner-order edit-request/tutorial 추가.
 * SP-D6-3: notification admin / aligo address-book / dispatch save-history/batch 추가.
 * SP-D7: notifications.center + SP-D7 전용 *.view PageCode 추가.
 * SP-D6-6: slip-service @RequirePermission migration 신규 PageCode 추가.
 * S4a: products.price-schedule 단가변동 관리 신규 추가.
 * BE {@code PageCode.java} enum 의 {@code code} 필드값과 완전 일치.
 * UUID 비공개: pageCode 만 사용자 노출.
 */
export type PageCode =
  // SP-D1 초기 12개
  | 'accounting.tax-invoice.emit-nts'
  | 'accounting.tax-invoice.list'
  | 'accounting.tax-invoice.batch-issue'
  | 'accounting.tax-invoice.inbound'
  | 'accounting.tax-invoice.cancel'
  | 'accounting.tax-invoice.issue-request'
  | 'accounting.tax-invoice.realtime'
  | 'accounting.tax-invoice.inbound.manage'
  | 'accounting.sales-slip.list'
  | 'accounting.sales-slip.accounting'
  | 'accounting.purchase-slip.list'
  | 'accounting.purchase-slip.accounting'
  | 'accounting.daily-closing'
  | 'accounting.daily-closing.run'
  | 'accounting.daily-closing.unlock'
  | 'accounting.general-ledger'
  | 'accounting.hometax-export'
  | 'notifications.admin'
  | 'notification.dispatch-sms.display'
  | 'notifications.center'
  | 'aligo.address-book'
  | 'groupware.approvals'
  | 'groupware.approval-templates'
  | 'messenger.admin'
  | 'messenger.send'
  | 'groupware.schedules'
  | 'purchases.slip.list'
  | 'purchases.slip.edit'
  | 'purchases.slip.delete'
  | 'sales.slip.list'
  | 'sales.slip.create'
  | 'sales.slip.edit'
  | 'sales.slip.confirm'
  | 'sales.slip.cancel'
  | 'sales.partner-dc-config'
  | 'sales.estimate-config'
  | 'slip.transfer.process'
  | 'slip.reject'
  | 'slip.print.next-day'
  | 'slip.print.export'
  | 'slip.cleanup'
  | 'slip.cleanup-history'
  | 'slip.attachments.upload'
  | 'slip.attachments.delete'
  | 'slip.delivery-attachments.upload'
  | 'slip.photo-audit'
  | 'slip.comments'
  | 'slip.audit-overlay'
  | 'slip.audit-revert'
  | 'slip.edit-requests'
  | 'slip.edit-requests.decide'
  | 'slip.signature'
  | 'slip.lookup-product'
  | 'slip.delivery-batch'
  | 'slip.mobile-sales'
  | 'slip.publish.from-estimate'
  | 'slip.publish.from-partner-order'
  // internal endpoint로 이관되어 일반 카탈로그에는 숨기되, 기존 보유 grant 회수에는 사용한다.
  | 'slip.period-lock'
  | 'slip.closed-date-exception'
  | 'slip.closed-date-admin'
  | 'inbound.inspection'
  | 'dispatch.board'
  | 'hr.carriers'
  | 'dispatch.external-carriers'
  | 'dispatch.sms-save-history'
  | 'dispatch.batch'
  | 'admin.permissions'
  | 'admin.permission-groups'
  | 'admin.app-release'
  | 'dev.popup-notice'
  | 'dev.activity-log'
  | 'admin.approval-line-config'
  | 'hr.role-management'
  | 'hr.slip-cutoff'
  | 'system.permission-admin'
  | 'system.password-admin'
  | 'system.account-admin'
  | 'dc-config.import'
  | 'dashboard.admin'
  // SP-D2 회계 7개 신규
  | 'accounting.accounts'
  | 'accounting.journals'
  | 'accounting.journals.realtime'
  | 'accounting.balances'
  | 'accounting.balances.trial-balance'
  | 'accounting.reports'
  | 'accounting.receivables'
  | 'accounting.bank-card-admin'
  | 'accounting.bank-matching'
  | 'accounting.deposit-mapping'
  | 'accounting.deposit-match'
  | 'accounting.period-close'
  | 'accounting.period-close.reverse'
  | 'accounting.statement-batch'
  | 'accounting.partner-ledger'
  | 'accounting.supplier-profiles'
  | 'accounting.cash-receipts'
  | 'accounting.edit-requests'
  | 'accounting.edit-requests.decide'
  | 'ecount.mig2.product'
  | 'ecount.mig2.account'
  | 'ecount.mig2.warehouse'
  | 'ecount.mig2.card'
  | 'ecount.mig3.purchase-slip'
  | 'ecount.mig3.sales-slip'
  | 'ecount.mig3.general-voucher'
  | 'ecount.mig3.journal-entry'
  | 'ecount.mig4.tax-invoice'
  | 'ecount.mig4.sales-slip-line'
  | 'ecount.mig4.summary'
  | 'ecount.mig4.order'
  | 'ecount.mig5.stock-transfer'
  | 'ecount.mig5.expense-voucher'
  | 'ecount.mig5.deposit-report'
  | 'ecount.mig6.bank-account'
  | 'ecount.mig6.fixed-asset-type'
  | 'ecount.mig7.cash-disbursement'
  | 'ecount.mig7.cash-receipt'
  | 'ecount.mig8.order'
  | 'ecount.mig9.cash-journal.disbursement'
  | 'ecount.mig9.cash-journal.receipt'
  | 'ecount.mig10.order-employee-backfill'
  | 'ecount.mig11.sales-ledger'
  | 'ecount.mig11.purchase-ledger'
  | 'ecount.reimport'
  // SP-D4 잔여 7 도메인 22개 신규
  | 'estimates.list'
  | 'sales.partner-order.list'
  | 'sales.partner-order.draft'
  | 'sales.partner-order.edit'
  | 'sales.partner-order.confirm'
  | 'sales.partner-order.history'
  | 'sales.partner-order.history.view'
  | 'sales.partner-order.print'
  | 'sales.partner-order.edit-requests'
  | 'sales.partner-order.edit-requests.decide'
  | 'sales.partner-order.tutorial'
  | 'sales.partner-order.convert'
  | 'sales.partner-order.revisions'
  | 'inventory.warehouse'
  | 'inventory.warehouse.admin'
  | 'inventory.stock'
  | 'inventory.stock-transfer'
  | 'inventory.dps'
  | 'inventory.audit'
  | 'inventory.list'
  | 'inventory.detail'
  | 'inventory.adjust'
  | 'inventory.transfer'
  | 'inventory.stock-balance'
  | 'inventory.stock-balance.view'
  | 'inventory.safety-stock'
  | 'inventory.edit-requests'
  | 'inventory.edit-requests.decide'
  | 'ecount.import.inventory'
  | 'admin.employees'
  | 'admin.users'
  | 'ecount.mig2.department'
  | 'ecount.mig6.employee'
  | 'ecount.mig6.employee-card'
  | 'ecount.mig6.payroll-employee'
  | 'partners.list'
  | 'partners.detail'
  | 'partners.detail.view'
  | 'partners.block'
  | 'partners.edit-request'
  | 'partners.search'
  | 'partners.edit'
  | 'partners.delete'
  | 'partners.credit-history'
  | 'partners.block.bulk'
  | 'partners.4tab'
  | 'partners.4tab.edit'
  | 'partners.edit-requests'
  | 'partners.edit-requests.decide'
  | 'products.list'
  | 'products.list.view'
  | 'products.admin'
  | 'products.price'
  | 'products.edit-requests'
  | 'products.edit-requests.decide'
  | 'products.ecount-import'
  | 'products.sync'
  | 'products.price-schedule'
  | 'arologis.admin'
  | 'arologis.region'
  | 'arologis.dispatch.admin'
  | 'arologis.dispatch.ops'
  | 'arologis.region.manage'
  | 'arologis.edit-requests'
  | 'arologis.edit-requests.decide'
  | 'arologis.driver'
  | 'arologis.hr.employees'
  | 'arologis.hr.departments'
  | 'arologis.accounting.cashbook'
  | 'arologis.accounting.summary'
  | 'arologis.admin.permissions'
  | 'arologis.accounting.accounts'
  // MIG-14 admin UI
  | 'ecount.mig14.order-list'
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
  create?: boolean
  update?: boolean
  delete?: boolean
  restore?: boolean
  download?: boolean
  print?: boolean
  /** @deprecated 기존 PermissionMatrixPage 2-action 호환. 신규 코드는 update 를 사용한다. */
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
  action: PermissionLookupAction
  allowed: boolean
}

/**
 * PUT /admin/permissions body.
 */
export interface PermissionBatchUpdateRequest {
  updates: PermissionUpdateItem[]
}

/**
 * 현재 사용자 권한 목록 — account bulk-load 응답.
 * pageCode + 허용된 액션 배열.
 */
export interface MyPermission {
  pageCode: PageCode
  actions: PermissionAction[]
}

export interface PermissionAccount {
  id: string
  displayName: string
  role: RbacRole
  enabled: boolean
}

export interface AccountPermissionCell extends PermissionActionMatrix {
  pageCode: PageCode
}

export interface AccountPermissionMatrix {
  cells: AccountPermissionCell[]
  generatedAt: string
}

export interface AccountPermissionUpdate {
  pageCode: PageCode
  actions: PermissionActionMatrix
}

export interface ChangedCountResponse {
  changedCount: number
}

export interface BulkPermissionRequest {
  accountIds: string[]
  mode: 'template' | 'grants'
  roleCode?: RbacRole
  grants?: AccountPermissionUpdate[]
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

function emptyActionMatrix(): PermissionActionMatrix {
  return {
    view: false,
    create: false,
    update: false,
    delete: false,
    restore: false,
    download: false,
    print: false,
  }
}

export function normalizePermissionAction(action: PermissionLookupAction): PermissionAction {
  return action === 'edit' ? 'update' : action
}

function permissionCellFromLegacyDto(dto: PermissionDtoRaw): PermissionCell {
  return {
    roleCode: dto.roleCode as RbacRole,
    pageCode: dto.pageCode as PageCode,
    view: dto.canView,
    create: false,
    update: dto.canEdit,
    delete: false,
    restore: false,
    download: false,
    print: false,
    edit: dto.canEdit,
  }
}

function actionMatrixFromRaw(raw: Partial<PermissionActionMatrix> | undefined): PermissionActionMatrix {
  return {
    ...emptyActionMatrix(),
    ...(raw ?? {}),
  }
}

function actionsFromRaw(value: unknown): PermissionAction[] {
  if (Array.isArray(value)) {
    return value
      .map((raw) => String(raw).toLowerCase())
      .map((raw) => (raw === 'edit' ? 'update' : raw))
      .filter((raw): raw is PermissionAction =>
        (PERMISSION_ACTIONS as readonly string[]).includes(raw),
      )
  }

  if (typeof value === 'object' && value !== null) {
    const matrix = actionMatrixFromRaw(value as Partial<PermissionActionMatrix>)
    return PERMISSION_ACTIONS.filter((action) => matrix[action])
  }

  return []
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
      cells.push(permissionCellFromLegacyDto(dto))
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
    const action = normalizePermissionAction(u.action)
    if (action === 'view') existing.canView = u.allowed
    if (action === 'update') existing.canEdit = u.allowed
    mergeMap.set(key, existing)
  }
  const permissions = Array.from(mergeMap.values())
  await apiClient.post<ApiEnvelope<void>>('/auth/admin/permissions/batch', { permissions })
}

export async function fetchAccounts(): Promise<PermissionAccount[]> {
  const res = await apiClient.get<ApiEnvelope<PermissionAccount[]>>(
    '/auth/admin/permissions/accounts',
  )
  return res.data.data
}

export async function fetchAccountMatrix(accountId: string): Promise<AccountPermissionMatrix> {
  const res = await apiClient.get<ApiEnvelope<Record<string, PermissionActionMatrix>>>(
    `/auth/admin/permissions/account/${encodeURIComponent(accountId)}`,
  )
  const cells = Object.entries(res.data.data ?? {}).map(([pageCode, actions]) => ({
    pageCode: pageCode as PageCode,
    ...actionMatrixFromRaw(actions),
  }))
  return { cells, generatedAt: new Date().toISOString() }
}

export async function updateAccountMatrix(
  accountId: string,
  updates: AccountPermissionUpdate[],
): Promise<ChangedCountResponse> {
  const res = await apiClient.put<ApiEnvelope<ChangedCountResponse>>(
    `/auth/admin/permissions/account/${encodeURIComponent(accountId)}`,
    updates,
  )
  return res.data.data
}

export async function applyTemplate(
  accountId: string,
  roleCode: RbacRole,
): Promise<ChangedCountResponse> {
  const res = await apiClient.post<ApiEnvelope<ChangedCountResponse>>(
    `/auth/admin/permissions/account/${encodeURIComponent(accountId)}/apply-template`,
    null,
    { params: { roleCode } },
  )
  return res.data.data
}

export async function copyFromAccount(
  accountId: string,
  sourceAccountId: string,
): Promise<ChangedCountResponse> {
  const res = await apiClient.post<ApiEnvelope<ChangedCountResponse>>(
    `/auth/admin/permissions/account/${encodeURIComponent(accountId)}/copy-from`,
    null,
    { params: { sourceAccountId } },
  )
  return res.data.data
}

export async function bulkApply(payload: BulkPermissionRequest): Promise<ChangedCountResponse> {
  const res = await apiClient.post<ApiEnvelope<ChangedCountResponse>>(
    '/auth/admin/permissions/bulk',
    payload,
  )
  return res.data.data
}

/**
 * 현재 로그인 사용자 권한 목록 조회.
 *
 * BE 응답: {@code Map<pageCode, EnumSet<PermissionAction>>}
 * FE 변환: 대문자 enum 배열 → 소문자 7-action 배열.
 *
 * @return MyPermission[]
 */
export async function fetchMyPermissions(): Promise<MyPermission[]> {
  const res = await apiClient.get<ApiEnvelope<Record<string, unknown>>>(
    '/auth/admin/permissions/my',
  )
  return Object.entries(res.data.data ?? {}).map(([pageCode, rawActions]) => {
    return { pageCode: pageCode as PageCode, actions: actionsFromRaw(rawActions) }
  })
}

// ---------------------------------------------------------------------------
// 권한 캐시 헬퍼 (hook 없는 동기 접근용 — zustand 기반 캐시와 연동)
// ---------------------------------------------------------------------------

/** 내부 캐시 — usePermissions hook 이 setPermissionsCache 로 갱신한다. */
let _permissionsCache: MyPermission[] | null = null

registerSessionCacheResetter(() => {
  _permissionsCache = null
})

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
 * <p>캐시가 없으면 false 를 반환한다. 권한 캐시 미로드/미부여 시 fail-closed.
 *
 * @param pageCode  확인할 페이지 코드
 * @param action    확인할 액션 (기본값: 'view')
 * @return 권한 보유 여부
 */
export function canAccess(
  pageCode: PageCode,
  action: PermissionLookupAction = 'view',
): boolean {
  if (_permissionsCache === null) return false
  const entry = _permissionsCache.find((p) => p.pageCode === pageCode)
  if (!entry) return false
  return entry.actions.includes(normalizePermissionAction(action))
}
