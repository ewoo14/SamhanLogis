/**
 * 구글 시트 → DB 동기화 admin API 클라이언트 — PR-D Phase B FE-A.
 *
 * BE endpoint (commit 8b6ac60, product-service ProductAdminController):
 * - POST /api/v1/products/admin/sync       — 캐시 invalidate + sync 실행 후 SyncSummary 반환
 * - GET  /api/v1/products/admin/sync/last  — 마지막 sync 시각 + 직전 SyncSummary 조회
 *
 * <p><b>옵션 C-2 + C-3 결합</b>: cron 5분 주기 자동 sync (옵션 C-2) 와 별개로
 * admin trigger (옵션 C-3) 호출. 두 endpoint 공히 메모리 보관된 마지막 sync
 * 메타 데이터 (LastSyncSnapshot) 를 갱신/조회한다.
 *
 * <p><b>가드</b>: 라우트 단의 PermissionGuard(products.sync, VIEW) 와
 * product-service @RequirePermission(products.sync, CREATE/VIEW) 가 담당한다.
 *
 * <p><b>UUID 비공개</b>: 본 도메인은 시트 → DB sync 결과 집계만 다루며 UUID 노출이 없다.
 */
import { apiClient, type ApiEnvelope } from './client'

/**
 * tab 1개 sync 결과 — BE `ProductSheetSyncService.TabSyncResult` 와 1:1.
 *
 * <p>error 가 set 되어 있으면 해당 tab 처리 중 예외 발생. 그 외 카운터 5종은
 * 누적 처리 결과.
 */
export interface TabSyncResult {
  insertedRows: number
  updatedRows: number
  unchangedRows: number
  softDeletedRows: number
  skippedOccurrences: number
  nameDriftOccurrences?: number
  priceHistoryExposureSpecChangedRows?: number
  preservedManualProductOccurrences?: number
  preservedByRuleProductOccurrences?: number
  deferredByEcountReservationProductOccurrences?: number
  specsLinkedRows?: number
  error?: string | null
}

export interface ComponentSyncResult {
  preservedManualComponentOccurrences?: number
  linkedOccurrences?: number
  bundlesMarkedProducts?: number
  softDeletedComponentRows?: number
  skippedOccurrences?: number
  blockedByRuleOccurrences?: number
  error?: string | null
}

/**
 * 전체 sync 집계 — BE `ProductSheetSyncService.SyncSummary` 와 1:1.
 *
 * <p>byTab 의 key 는 시트 tab 이름 (예: "주방소도구", "음식점주방기구").
 * total* 4종은 byTab 합산 + skipped 누계.
 */
export interface SyncSummary {
  byTab: Record<string, TabSyncResult>
  byComponentTab?: Record<string, ComponentSyncResult>
  totalInsertedRows: number
  totalUpdatedRows: number
  totalSoftDeletedRows: number
  totalSoftDeletedComponentRows: number
  totalSkippedOccurrences: number
  totalPreservedManualProductOccurrences: number
  totalPreservedManualComponentOccurrences: number
  totalPreservedByRuleProductOccurrences: number
  totalComponentLinkOccurrences: number
  totalBundlesMarkedProducts: number
  totalBlockedByRuleOccurrences: number
  totalSpecsLinkedRows: number
  totalTabs: number
  successfulTabs: number
  failedTabs: number
  durationMs: number
  error?: string | null
}

/**
 * 마지막 sync 메타 데이터 — BE `ProductAdminController.LastSyncSnapshot` 와 1:1.
 *
 * <p>service 부팅 후 1번도 trigger 가 없으면 lastSyncAt = null, summary = null.
 * 영속화 X (메모리 보관) — service 재기동 시 초기화.
 */
export interface LastSyncSnapshot {
  lastSyncAt: string | null
  summary: SyncSummary | null
}

/**
 * 시트 → DB 수동 sync trigger.
 *
 * <p>POST `/api/v1/products/admin/sync`. 시트 read 1회 + DB upsert 발생.
 * 응답으로 본 trigger 실행 결과 SyncSummary 반환.
 */
export async function triggerSync(): Promise<SyncSummary> {
  const res = await apiClient.post<ApiEnvelope<SyncSummary>>(
    '/api/v1/products/admin/sync',
  )
  return res.data.data
}

/**
 * 마지막 시트 sync 메타 데이터 조회.
 *
 * <p>GET `/api/v1/products/admin/sync/last`. 직전 trigger 또는 cron 자동 sync 의
 * 시각 + summary 반환. 1번도 없으면 lastSyncAt/summary 모두 null.
 */
export async function getLastSync(): Promise<LastSyncSnapshot> {
  const res = await apiClient.get<ApiEnvelope<LastSyncSnapshot>>(
    '/api/v1/products/admin/sync/last',
  )
  return res.data.data
}
