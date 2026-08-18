/**
 * DPS 저장내역 API 클라이언트.
 *
 * legacy GAS DPS 저장내역 탭의 Notion CRUD 를 Samhan Public DB/API 로 대체한다.
 * 화면에는 내부 UUID 를 표시하지 않고, 상세 복원 path param 전용으로만 사용한다.
 */
import { apiClient, type ApiEnvelope, type PageResponse } from './client'

/** DPS 저장내역 프로그램 구분. */
export type DpsProgramType = 'DPS_COMPARE' | 'DPS_BY_PRODUCT'

/** DPS 저장내역 저장 방식. */
export type DpsSaveMode = 'AUTO_LATEST' | 'MANUAL_NAMED'

/** DPS 저장 요청 payload. */
export interface DpsSaveHistoryRequest {
  programType: DpsProgramType
  saveMode: DpsSaveMode
  topic?: string | null
  requestParams: Record<string, unknown>
  responsePayload: unknown
}

/** DPS 저장 생성 응답. */
export interface DpsSaveHistorySaveResponse {
  savedAt: string
}

/** DPS 저장내역 목록 row. */
export interface DpsSaveHistoryListRow {
  id: string
  programType: DpsProgramType
  saveMode: DpsSaveMode
  topic: string
  createdAt: string
  createdBy: string
  requestParams: Record<string, unknown>
  mismatchCount: number
}

/** DPS 저장내역 상세 응답. */
export interface DpsSaveHistoryDetailResponse extends DpsSaveHistoryListRow {
  responsePayload: unknown
}

/** 목록 조회 옵션. */
export interface ListDpsSaveHistoryOptions {
  programType: DpsProgramType
  from?: string
  to?: string
  mode?: DpsSaveMode | 'ALL'
  page?: number
  size?: number
}

/** DPS 저장내역을 저장한다. */
export async function saveDpsHistory(
  request: DpsSaveHistoryRequest,
): Promise<DpsSaveHistorySaveResponse> {
  const res = await apiClient.post<ApiEnvelope<DpsSaveHistorySaveResponse>>(
    '/warehouse/audit/dps-history',
    request,
    { timeout: 30_000 },
  )
  return res.data.data
}

/** DPS 저장내역 목록을 조회한다. */
export async function listDpsHistory(
  opts: ListDpsSaveHistoryOptions,
): Promise<PageResponse<DpsSaveHistoryListRow>> {
  const params: Record<string, string | number> = {
    programType: opts.programType,
    mode: opts.mode ?? 'MANUAL_NAMED',
    page: opts.page ?? 0,
    size: opts.size ?? 50,
  }
  if (opts.from) params['from'] = opts.from
  if (opts.to) params['to'] = opts.to
  const res = await apiClient.get<ApiEnvelope<PageResponse<DpsSaveHistoryListRow>>>(
    '/warehouse/audit/dps-history',
    { params },
  )
  return res.data.data
}

/** DPS 저장내역 상세를 조회한다. */
export async function getDpsHistoryDetail(
  id: string,
): Promise<DpsSaveHistoryDetailResponse> {
  const res = await apiClient.get<ApiEnvelope<DpsSaveHistoryDetailResponse>>(
    `/warehouse/audit/dps-history/${encodeURIComponent(id)}`,
  )
  return res.data.data
}

/** 현재 사용자의 최신 자동저장을 조회한다. */
export async function getLatestDpsHistory(
  programType: DpsProgramType,
): Promise<DpsSaveHistoryDetailResponse | null> {
  try {
    const res = await apiClient.get<ApiEnvelope<DpsSaveHistoryDetailResponse>>(
      '/warehouse/audit/dps-history/latest',
      { params: { programType } },
    )
    return res.data.data
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status
    if (status === 404) return null
    throw err
  }
}
