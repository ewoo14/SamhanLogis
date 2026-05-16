/**
 * 아로로지스 배차 저장내역 API 클라이언트.
 *
 * legacy GAS 배차 4개 화면의 저장/복원 payload 를 arologis-service DB/API 로 대체한다.
 * 화면에는 내부 UUID 를 표시하지 않고, 상세 복원 path param 전용으로만 사용한다.
 */
import { apiClient, type ApiEnvelope } from './client'

/** 아로로지스 배차 저장내역 프로그램 구분. */
export type DispatchProgramType = 'PRE_CLASSIFY' | 'REGIONAL' | 'UNASSIGNED' | 'RECONCILE'

/** 아로로지스 배차 저장 방식. */
export type DispatchSaveMode = 'AUTO_LATEST' | 'MANUAL_NAMED'

/** Spring Page 응답. */
export interface PageResponse<T> {
  content: T[]
  totalElements: number
  totalPages: number
  size: number
  number: number
}

/** 저장 요청 payload. */
export interface DispatchSaveHistoryRequest {
  programType: DispatchProgramType
  saveMode: DispatchSaveMode
  topic?: string | null
  requestParams: Record<string, unknown>
  responsePayload: unknown
}

/** 저장 생성 응답. */
export interface DispatchSaveHistorySaveResponse {
  id: string
  savedAt: string
}

/** 저장내역 목록 row. */
export interface DispatchSaveHistoryListRow {
  id: string
  programType: DispatchProgramType
  saveMode: DispatchSaveMode
  topic: string
  createdAt: string
  createdBy: string
  requestParams: Record<string, unknown>
  rowCount: number
}

/** 저장내역 상세 응답. */
export interface DispatchSaveHistoryDetailResponse extends DispatchSaveHistoryListRow {
  responsePayload: unknown
}

/** 목록 조회 옵션. */
export interface ListDispatchSaveHistoryOptions {
  programType: DispatchProgramType
  from?: string
  to?: string
  mode?: DispatchSaveMode | 'ALL'
  page?: number
  size?: number
}

/** 배차 저장내역을 저장한다. */
export async function saveDispatchHistory(
  request: DispatchSaveHistoryRequest,
): Promise<DispatchSaveHistorySaveResponse> {
  const res = await apiClient.post<ApiEnvelope<DispatchSaveHistorySaveResponse>>(
    '/admin/arologis/dispatches/history',
    request,
    { timeout: 30_000 },
  )
  return res.data.data
}

/** 배차 저장내역 목록을 조회한다. */
export async function listDispatchHistory(
  opts: ListDispatchSaveHistoryOptions,
): Promise<PageResponse<DispatchSaveHistoryListRow>> {
  const params: Record<string, string | number> = {
    programType: opts.programType,
    mode: opts.mode ?? 'MANUAL_NAMED',
    page: opts.page ?? 0,
    size: opts.size ?? 50,
  }
  if (opts.from) params['from'] = opts.from
  if (opts.to) params['to'] = opts.to
  const res = await apiClient.get<ApiEnvelope<PageResponse<DispatchSaveHistoryListRow>>>(
    '/admin/arologis/dispatches/history',
    { params },
  )
  return res.data.data
}

/** 배차 저장내역 상세를 조회한다. */
export async function getDispatchHistoryDetail(
  id: string,
): Promise<DispatchSaveHistoryDetailResponse> {
  const res = await apiClient.get<ApiEnvelope<DispatchSaveHistoryDetailResponse>>(
    `/admin/arologis/dispatches/history/${encodeURIComponent(id)}`,
  )
  return res.data.data
}

/** 현재 사용자의 최신 자동저장을 조회한다. */
export async function getLatestDispatchHistory(
  programType: DispatchProgramType,
): Promise<DispatchSaveHistoryDetailResponse | null> {
  try {
    const res = await apiClient.get<ApiEnvelope<DispatchSaveHistoryDetailResponse>>(
      '/admin/arologis/dispatches/history/latest',
      { params: { programType } },
    )
    return res.data.data
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status
    if (status === 404) return null
    throw err
  }
}
