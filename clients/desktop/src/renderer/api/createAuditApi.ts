/**
 * 도메인별 audit log + revert API factory — PR-H4c FE-A.
 *
 * <p>SlipAudit (PR-H2 FE-1) 의 path-only 부분을 일반화. 호출자는
 * {@code listPath / revertPath} 만 제공하여 모든 도메인 audit timeline 을 동일 envelope
 * 형식으로 호출한다.
 *
 * <p>UUID 비공개 가드 — 응답의 {@code actorId} 는 색상 hash 입력 전용. 화면 텍스트 노출
 * 금지. 사용자 노출은 {@code actorName} (풀네임) 만 사용한다.
 *
 * @example
 * const taxInvoiceAuditApi = createAuditApi({
 *   listPath: (id) => `/accounting/tax-invoices/${encodeURIComponent(id)}/audit-logs`,
 * })
 */
import { apiClient, type ApiEnvelope } from './client'
import { safeActorName } from '@samhan/design-system'

/** BE 표준 audit log row — 모든 도메인 동일 schema. */
export interface AuditLogEntry {
  /** revision 번호 (1, 2, 3, ... — 큰 수록 최근). */
  revisionNo: number
  /** 변경된 필드명. */
  field: string
  /** 변경 이전 값. */
  beforeValue: string | null
  /** 변경 이후 값. */
  afterValue: string | null
  /** 변경자 UUID — 색상 hash 입력 전용 (화면 텍스트 노출 금지). */
  actorId: string
  /** 변경자 풀네임 — 화면 표시. */
  actorName: string
  /** 변경 시각 ISO-8601. */
  changedAt: string
}

export interface RevertResponse {
  newRevisionNo: number
  message: string
}

export interface AuditApiConfig {
  /** entityId → list endpoint path (baseURL 제외, '/' prefix 필수). */
  listPath: (entityId: string) => string
  /** entityId+revisionNo → revert endpoint path. 미설정 시 revert 비활성. */
  revertPath?: (entityId: string, revisionNo: number) => string
}

const UNKNOWN_ACTOR_NAME = '변경자 미상'
function normalizeActorName(actorName: string | null | undefined): string {
  return safeActorName(actorName) ?? UNKNOWN_ACTOR_NAME
}

export interface AuditApi {
  listAuditLogs: (entityId: string) => Promise<AuditLogEntry[]>
  /** revertPath 미설정 시 reject. */
  revertToRevision: (entityId: string, revisionNo: number) => Promise<RevertResponse>
}

export interface RawAuditLogEntry {
  revisionNo: number
  field?: string
  fieldName?: string
  beforeValue?: string | null
  oldValue?: string | null
  afterValue?: string | null
  newValue?: string | null
  actorId: string
  actorName: string | null
  changedAt: string
}

export function normalizeAuditLogEntry(entry: RawAuditLogEntry): AuditLogEntry {
  return {
    revisionNo: entry.revisionNo,
    field: entry.field ?? entry.fieldName ?? '',
    beforeValue: entry.beforeValue ?? entry.oldValue ?? null,
    afterValue: entry.afterValue ?? entry.newValue ?? null,
    actorId: entry.actorId,
    actorName: normalizeActorName(entry.actorName),
    changedAt: entry.changedAt,
  }
}

export function createAuditApi(config: AuditApiConfig): AuditApi {
  return {
    async listAuditLogs(entityId) {
      const res = await apiClient.get<ApiEnvelope<RawAuditLogEntry[]>>(
        config.listPath(entityId),
      )
      return res.data.data.map(normalizeAuditLogEntry)
    },
    async revertToRevision(entityId, revisionNo) {
      if (!config.revertPath) {
        throw new Error('이 도메인은 revert 를 지원하지 않습니다.')
      }
      const res = await apiClient.post<ApiEnvelope<RevertResponse>>(
        config.revertPath(entityId, revisionNo),
      )
      return res.data.data
    },
  }
}

export const taxInvoiceAuditApi = createAuditApi({
  listPath: (id) => `/accounting/tax-invoices/${encodeURIComponent(id)}/audit-logs`,
  revertPath: (id, rev) =>
    `/accounting/tax-invoices/${encodeURIComponent(id)}/revert/${rev}`,
})

export const closingAuditApi = createAuditApi({
  listPath: (id) => `/accounting/closings/${encodeURIComponent(id)}/audit-logs`,
})

export const partnerLedgerAuditApi = createAuditApi({
  listPath: (id) => `/accounting/journals/${encodeURIComponent(id)}/audit-logs`,
})

export const partnerOrderAuditApi = createAuditApi({
  listPath: (id) => `/api/v1/partner-orders/${encodeURIComponent(id)}/audit-logs`,
  revertPath: (id, rev) =>
    `/api/v1/partner-orders/${encodeURIComponent(id)}/revert/${rev}`,
})

export const dcConfigAuditApi = createAuditApi({
  listPath: (partnerCode) =>
    `/api/v1/partner-dc-configs/${encodeURIComponent(partnerCode)}/audit-logs`,
})

/**
 * 재고 실사 audit timeline — PR-H4c FE-B.
 *
 * <p>BE: inventory-service `GET /inventory/audits/{id}/audit-logs` (PR-H4b BE-B 5bcb7ad).
 * COMPLETED 단계 본문 변경은 edit-request 로만 가능 → revert 미지원.
 */
export const inventoryAuditAuditApi = createAuditApi({
  listPath: (id) => `/inventory/audits/${encodeURIComponent(id)}/audit-logs`,
})

/**
 * arologis dispatch audit timeline — PR-H4c FE-B.
 *
 * <p>BE: arologis-service `GET /admin/arologis/dispatches/{id}/audit-logs` (PR-H4b BE-B 5bcb7ad).
 * DISPATCHED/DELIVERED 단계 본문 변경은 edit-request 로만 가능 → revert 미지원.
 */
export const arologisDispatchAuditApi = createAuditApi({
  listPath: (id) =>
    `/admin/arologis/dispatches/${encodeURIComponent(id)}/audit-logs`,
})
