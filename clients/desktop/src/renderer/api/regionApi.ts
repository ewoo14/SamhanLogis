/**
 * 가배차 지역 분류 API 클라이언트 — Phase 10 W10-1 PR-D Phase B FE-B.
 *
 * <p>매뉴얼: 노션 "지역 분류 (가배차)" 데이터를 Samhan Public 에 native 이식.
 * BE 출처: services/arologis-service/.../controller/RegionAdminController.java
 *         + dto/RegionResponse.java + dto/RegionUpsertRequest.java
 *         + service/RegionImportService.java (commit 645428e)
 *
 * <p>노출 endpoint (BE @PreAuthorize 와 1:1):
 * <ul>
 *   <li>GET    /admin/arologis/regions               — 전체 조회 (MASTER/MANAGER/DISPATCH)</li>
 *   <li>POST   /admin/arologis/regions               — 단건 추가 (MASTER/MANAGER)</li>
 *   <li>POST   /admin/arologis/regions/import        — CSV 일괄 import (MASTER/MANAGER, multipart)</li>
 *   <li>PUT    /admin/arologis/regions/{id}          — 단건 수정 (MASTER/MANAGER)</li>
 *   <li>DELETE /admin/arologis/regions/{id}          — Soft Delete (MASTER/MANAGER)</li>
 * </ul>
 *
 * <p>UUID 비공개 가드 (feedback_uuid_no_user_visibility.md):
 * - 응답 id 는 admin routing (수정/삭제 path key) 용도만
 * - 사용자 노출 식별자는 groupName (분류 그룹명)
 *
 * <p>풀네임 ROLE (feedback_role_naming_full.md): MASTER / MANAGER / DISPATCH (DISPATCH 는 backlog).
 */
import { apiClient, type ApiEnvelope } from './client'

/**
 * 지역 분류 응답 DTO — BE {@code RegionResponse} 와 1:1.
 *
 * @property id UUID — admin routing 용 (사용자 미노출)
 * @property groupName 그룹명 (사용자 노출)
 * @property keywords 시군구 콤마 구분 검색어
 * @property sortOrder 정렬 순서 (낮을수록 우선)
 */
export interface RegionResponse {
  id: string
  groupName: string
  keywords: string
  sortOrder: number | null
}

/**
 * 지역 분류 단건 입력 — BE {@code RegionUpsertRequest} 와 1:1.
 *
 * @property groupName 그룹명 (POST 시 필수, PUT 시 무시)
 * @property keywords 시군구 콤마 구분 검색어 (필수)
 * @property sortOrder 정렬 순서 (옵션, null = 0)
 */
export interface RegionUpsertRequest {
  groupName?: string
  keywords: string
  sortOrder?: number | null
}

/**
 * BE {@code RegionImportService.RejectedRow} — rawData 는 콤마 join 원문.
 */
export interface BeRegionRejectedRow {
  rowNumber: number
  rawData: string
  reason: string
}

/**
 * BE {@code RegionImportService.ImportResult} — CSV import 결과.
 */
export interface RegionImportResult {
  inserted: number
  updated: number
  rejected: BeRegionRejectedRow[]
}

/**
 * `<CsvUploadDialog>` 가 기대하는 결과 형식. BE rejected[].rawData (string) →
 * inputData (Record<string,string>) 로 변환한다.
 */
export interface CsvUploadResult {
  inserted: number
  updated: number
  rejected: Array<{
    rowNumber: number
    inputData: Record<string, string>
    reason: string
  }>
}

/** 전체 활성 지역 분류 조회 (sort_order 오름차순). */
export async function listRegions(): Promise<RegionResponse[]> {
  const res = await apiClient.get<ApiEnvelope<RegionResponse[]>>(
    '/admin/arologis/regions',
  )
  return res.data.data
}

/** 단건 신규 등록 — group_name 활성 행 unique. */
export async function createRegion(
  req: RegionUpsertRequest,
): Promise<RegionResponse> {
  const res = await apiClient.post<ApiEnvelope<RegionResponse>>(
    '/admin/arologis/regions',
    req,
  )
  return res.data.data
}

/** 단건 수정 — keywords + sortOrder. group_name 불변. */
export async function updateRegion(
  id: string,
  req: RegionUpsertRequest,
): Promise<RegionResponse> {
  const res = await apiClient.put<ApiEnvelope<RegionResponse>>(
    `/admin/arologis/regions/${encodeURIComponent(id)}`,
    req,
  )
  return res.data.data
}

/** Soft Delete — admin 전용. 응답 envelope 의 data 는 {id, deleted:"true"}. */
export async function deleteRegion(id: string): Promise<void> {
  await apiClient.delete<ApiEnvelope<{ id: string; deleted: string }>>(
    `/admin/arologis/regions/${encodeURIComponent(id)}`,
  )
}

/**
 * CSV 일괄 import — multipart 업로드.
 *
 * <p>BE 응답 {@code ImportResult.rejected[].rawData} (콤마 join 원문) 를
 * {@code <CsvUploadDialog>} 가 기대하는 inputData (Record<string,string>) 로 변환한다.
 * 노션 export 표준 헤더 (분류 그룹 / 검색어) 기준 split.
 *
 * @param file UTF-8 BOM CSV (RFC4180 quoted)
 * @return 신규/갱신/거부 카운트 + 거부 보고 (다이얼로그 표시 호환 형식)
 */
export async function importRegionsCsv(file: File): Promise<CsvUploadResult> {
  const form = new FormData()
  form.append('file', file)
  const res = await apiClient.post<ApiEnvelope<RegionImportResult>>(
    '/admin/arologis/regions/import',
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  const be = res.data.data
  return {
    inserted: be.inserted,
    updated: be.updated,
    rejected: be.rejected.map((r) => ({
      rowNumber: r.rowNumber,
      inputData: parseRawCsvRow(r.rawData),
      reason: r.reason,
    })),
  }
}

/**
 * BE 가 반환하는 rawData (콤마 join) 를 노션 표준 헤더 (분류 그룹 / 검색어) 기준
 * Record 로 split. 컬럼 수가 맞지 않으면 raw key 로 fallback.
 */
function parseRawCsvRow(raw: string): Record<string, string> {
  const parts = raw.split(',')
  if (parts.length === 0) {
    return { 원본: raw }
  }
  if (parts.length === 1) {
    return { 분류_그룹: parts[0] ?? '' }
  }
  if (parts.length === 2) {
    return {
      '분류 그룹': parts[0] ?? '',
      검색어: parts[1] ?? '',
    }
  }
  // 컬럼 3개 이상 — 첫 두 개는 표준 헤더, 나머지는 추가 매핑
  const map: Record<string, string> = {
    '분류 그룹': parts[0] ?? '',
    검색어: parts.slice(1).join(','),
  }
  return map
}
