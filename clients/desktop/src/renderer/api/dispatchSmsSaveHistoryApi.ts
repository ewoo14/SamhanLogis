/**
 * 배차문자 저장내역 API 클라이언트.
 *
 * preview 결과는 AUTO_LATEST/MANUAL_NAMED 로 저장한다.
 * 화면에는 내부 UUID 를 표시하지 않고, 상세 복원 path param 전용으로만 사용한다.
 */
import axios from 'axios'
import { apiClient, type ApiEnvelope, type PageResponse } from './client'

/** 배차문자 저장내역 프로그램 구분. */
export type DispatchSmsProgramType = 'DISPATCH_SMS'

/** 배차문자 저장 방식. */
export type DispatchSmsSaveMode = 'AUTO_LATEST' | 'MANUAL_NAMED'

/** 저장 요청 payload. */
export interface DispatchSmsSaveHistoryRequest {
  programType: DispatchSmsProgramType
  saveMode: DispatchSmsSaveMode
  topic?: string | null
  requestParams: Record<string, unknown>
  responsePayload: unknown
}

/** 저장 생성 응답. */
export interface DispatchSmsSaveHistorySaveResponse {
  id: string
  savedAt: string
}

/** 저장내역 목록 row. */
export interface DispatchSmsSaveHistoryListRow {
  id: string
  programType: DispatchSmsProgramType
  saveMode: DispatchSmsSaveMode
  topic: string
  createdAt: string
  createdBy: string
  requestParams: Record<string, unknown>
  rowCount: number
}

/** 저장내역 상세 응답. */
export interface DispatchSmsSaveHistoryDetailResponse extends DispatchSmsSaveHistoryListRow {
  responsePayload: unknown
}

/** 목록 조회 옵션. */
export interface ListDispatchSmsSaveHistoryOptions {
  programType: DispatchSmsProgramType
  from?: string
  to?: string
  mode?: DispatchSmsSaveMode | 'ALL'
  page?: number
  size?: number
}

/** 배차문자 저장내역을 저장한다. */
export async function saveDispatchSmsHistory(
  request: DispatchSmsSaveHistoryRequest,
): Promise<DispatchSmsSaveHistorySaveResponse> {
  const res = await apiClient.post<ApiEnvelope<DispatchSmsSaveHistorySaveResponse>>(
    '/admin/notifications/dispatch-sms/history',
    request,
    { timeout: 30_000 },
  )
  return res.data.data
}

/** 배차문자 저장내역 목록을 조회한다. */
export async function listDispatchSmsHistory(
  opts: ListDispatchSmsSaveHistoryOptions,
): Promise<PageResponse<DispatchSmsSaveHistoryListRow>> {
  const params: Record<string, string | number> = {
    programType: opts.programType,
    mode: opts.mode ?? 'MANUAL_NAMED',
    page: opts.page ?? 0,
    size: opts.size ?? 50,
  }
  if (opts.from) params['from'] = opts.from
  if (opts.to) params['to'] = opts.to
  const res = await apiClient.get<ApiEnvelope<PageResponse<DispatchSmsSaveHistoryListRow>>>(
    '/admin/notifications/dispatch-sms/history',
    { params },
  )
  return res.data.data
}

/** 배차문자 저장내역 상세를 조회한다. */
export async function getDispatchSmsHistoryDetail(
  id: string,
): Promise<DispatchSmsSaveHistoryDetailResponse> {
  const res = await apiClient.get<ApiEnvelope<DispatchSmsSaveHistoryDetailResponse>>(
    `/admin/notifications/dispatch-sms/history/${encodeURIComponent(id)}`,
  )
  return res.data.data
}

/** 현재 사용자의 최신 preview 자동저장을 조회한다. */
export async function getLatestDispatchSmsHistory(
  programType: DispatchSmsProgramType,
): Promise<DispatchSmsSaveHistoryDetailResponse | null> {
  try {
    const res = await apiClient.get<ApiEnvelope<DispatchSmsSaveHistoryDetailResponse>>(
      '/admin/notifications/dispatch-sms/history/latest',
      { params: { programType } },
    )
    return res.data.data
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) return null
    throw err
  }
}
