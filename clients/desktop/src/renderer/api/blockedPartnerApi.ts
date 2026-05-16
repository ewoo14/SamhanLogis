/**
 * 발송금지 거래처 (BLOCK) admin API 클라이언트 — Phase 10 PR-D Phase B FE-E.
 *
 * <p>BE-E ({@code partner-service} commit d05c0ae) 의 4 endpoint
 * ({@code /api/v1/partners/admin/blocks}) 호출 wrapper.
 *
 * <h2>Endpoint 매핑</h2>
 * <ul>
 *   <li>{@code GET    /api/v1/partners/admin/blocks} → {@link listBlockedPartners}</li>
 *   <li>{@code POST   /api/v1/partners/admin/blocks} → {@link addBlockedPartner}</li>
 *   <li>{@code POST   /api/v1/partners/admin/blocks/import} (multipart) → {@link importBlockedPartnersCsv}</li>
 *   <li>{@code DELETE /api/v1/partners/admin/blocks/{id}} → {@link unblockPartner}</li>
 * </ul>
 *
 * <h2>접근 제어</h2>
 * <ul>
 *   <li>read / single create — MASTER / MANAGER (BE {@code @PreAuthorize})</li>
 *   <li>CSV import / unblock (delete) — MASTER 만</li>
 * </ul>
 *
 * <p>FE route 는 MANAGER / MASTER 진입을 허용하고, CSV import / unblock 은 페이지 내부에서 MASTER 만 노출한다.
 *
 * <p>UUID 비공개 — 화면 노출은 partnerCode + businessName snapshot + 차단사유 만.
 * id (BLOCK row UUID) 는 unblock path variable 전용 (data-testid 에만 사용).
 */
import type { UploadResult } from '@samhan/design-system'
import {
  apiClient,
  type ApiEnvelope,
  type PageResponse,
} from './client'

// ---------------------------------------------------------------------------
// 타입 (BE record 와 1:1)
// ---------------------------------------------------------------------------

/** BE source enum 풀네임. 화면 표시용 한국어 라벨은 {@link BLOCK_SOURCE_LABEL}. */
export type BlockedPartnerSource = 'NOTION_IMPORT' | 'MANUAL' | 'LEGACY_GAS'

/** source enum → 한국어 표시 라벨. */
export const BLOCK_SOURCE_LABEL: Record<BlockedPartnerSource, string> = {
  NOTION_IMPORT: '노션 가져오기',
  MANUAL: '수기 등록',
  LEGACY_GAS: '레거시(GAS)',
}

/**
 * BE {@code BlockedPartnerResponse} 와 1:1.
 *
 * <p>id 는 unblock path variable 용 — 화면 표시 금지.
 */
export interface BlockedPartner {
  /** BLOCK row UUID — unblock 액션 path variable / data-testid 전용. */
  id: string
  /** 차단 대상 partnerCode (사용자 노출 식별자). */
  partnerCode: string
  /** 차단 시점 거래처 상호 snapshot. */
  businessNameSnapshot: string
  /** 차단 사유 (nullable). */
  blockReason: string | null
  /** 차단 시점 (ISO-8601 string). */
  blockedAt: string
  /** 등록 출처. */
  source: BlockedPartnerSource
}

/** BE {@code BlockedPartnerCreateRequest} 와 1:1. */
export interface AddBlockedPartnerRequest {
  partnerCode: string
  blockReason?: string
}

/** BE {@code BlockedPartnerImportResult.RejectedRow} 와 1:1. */
export interface BlockedPartnerRejectedRow {
  rowNumber: number
  inputBusinessName: string
  /** LOOKUP_MISS / LOOKUP_AMBIGUOUS / PARSE_ERROR / DUPLICATE 등. */
  reason: string
}

/**
 * BE {@code BlockedPartnerImportResult} record 와 1:1.
 *
 * <p>4 카테고리 (totalRows / imported / alreadyBlocked / rejected). 사용자 요구의
 * {@code inserted / updated / rejected} 형식은 {@link importBlockedPartnersCsv} 에서
 * {@link UploadResult} 로 변환 (alreadyBlocked → skipped 매핑).
 */
export interface BlockedPartnerImportResult {
  totalRows: number
  imported: number
  alreadyBlocked: number
  rejected: BlockedPartnerRejectedRow[]
}

// ---------------------------------------------------------------------------
// 옵션
// ---------------------------------------------------------------------------

export interface ListBlockedPartnersOptions {
  /** 0-based 페이지 번호. */
  page?: number
  /** 페이지 크기 (기본 20). */
  size?: number
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * BLOCK 목록 페이지 조회 — {@code GET /api/v1/partners/admin/blocks}.
 *
 * <p>BE 가 Spring {@code Page} 직렬화 결과를 반환 → {@link PageResponse} 로 받음.
 * 정렬은 BE 가 {@code blockedAt DESC} 강제 (옵션 파라미터 노출 X).
 *
 * @param options 페이지네이션 옵션
 * @return {@link PageResponse} of {@link BlockedPartner}
 */
export async function listBlockedPartners(
  options: ListBlockedPartnersOptions = {},
): Promise<PageResponse<BlockedPartner>> {
  const params: Record<string, string | number> = {
    page: options.page ?? 0,
    size: options.size ?? 20,
  }
  const res = await apiClient.get<ApiEnvelope<PageResponse<BlockedPartner>>>(
    '/api/v1/partners/admin/blocks',
    { params },
  )
  return res.data.data
}

/**
 * 단건 BLOCK 등록 — {@code POST /api/v1/partners/admin/blocks}.
 *
 * <p>partnerCode 가 partners 마스터에 미존재 → 404, 이미 차단 → 409.
 *
 * @param req partnerCode + 차단 사유
 * @return 등록된 {@link BlockedPartner}
 */
export async function addBlockedPartner(
  req: AddBlockedPartnerRequest,
): Promise<BlockedPartner> {
  const res = await apiClient.post<ApiEnvelope<BlockedPartner>>(
    '/api/v1/partners/admin/blocks',
    req,
  )
  return res.data.data
}

/**
 * CSV multipart import (Notion 발송금지 export) — {@code POST /api/v1/partners/admin/blocks/import}.
 *
 * <p>{@code CsvUploadDialog} 의 {@code onUpload} 시그니처에 맞춰 {@link UploadResult} 로 변환:
 * <ul>
 *   <li>{@code inserted = imported}</li>
 *   <li>{@code updated = 0} (BLOCK 은 upsert 가 아니라 insert-only)</li>
 *   <li>{@code skipped = alreadyBlocked}</li>
 *   <li>{@code rejected[].inputData} 에 "이카운트 사업자명" key 로 BE 의 inputBusinessName 매핑</li>
 * </ul>
 *
 * @param file 사용자가 선택한 CSV (UTF-8 BOM 허용, 5MB 이하 권장)
 * @return CsvUploadDialog 결과 단계 표시용 통계 + 거부 보고서
 */
export async function importBlockedPartnersCsv(file: File): Promise<UploadResult> {
  const form = new FormData()
  form.append('file', file)
  const res = await apiClient.post<ApiEnvelope<BlockedPartnerImportResult>>(
    '/api/v1/partners/admin/blocks/import',
    form,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      // 대용량 CSV 대비 — apiClient 기본 10s 보다 여유.
      timeout: 60_000,
    },
  )
  const data = res.data.data
  return {
    inserted: data.imported,
    updated: 0,
    skipped: data.alreadyBlocked,
    rejected: data.rejected.map((r) => ({
      rowNumber: r.rowNumber,
      inputData: {
        '이카운트 사업자명': r.inputBusinessName,
      },
      reason: r.reason,
    })),
  }
}

/**
 * 차단 해제 (soft-delete) — {@code DELETE /api/v1/partners/admin/blocks/{id}}.
 *
 * <p>partial unique index 가 동일 partnerCode 재차단 허용. id 미존재 → 404.
 *
 * @param id BLOCK row UUID
 */
export async function unblockPartner(id: string): Promise<void> {
  await apiClient.delete<ApiEnvelope<void>>(
    `/api/v1/partners/admin/blocks/${id}`,
  )
}
