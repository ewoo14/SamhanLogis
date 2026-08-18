/**
 * 전표정리 저장내역 API 클라이언트.
 *
 * legacy GAS 전표정리 결과의 저장/복원 payload 를 slip-service DB/API 로 대체한다.
 * 화면에는 내부 UUID 를 표시하지 않고, 상세 복원 path param 전용으로만 사용한다.
 */
import axios from 'axios'
import { apiClient, type ApiEnvelope, type PageResponse } from './client'

/** 전표정리 저장내역 프로그램 구분. */
export type SlipCleanupProgramType = 'SLIP_CLEANUP'

/** 전표정리 저장 방식. */
export type SlipCleanupSaveMode = 'AUTO_LATEST' | 'MANUAL_NAMED'

/** 저장 요청 payload. */
export interface SlipCleanupSaveHistoryRequest {
  programType: SlipCleanupProgramType
  saveMode: SlipCleanupSaveMode
  topic?: string | null
  requestParams: Record<string, unknown>
  responsePayload: unknown
}

/** 저장 생성 응답. */
export interface SlipCleanupSaveHistorySaveResponse {
  savedAt: string
}

/** 저장내역 목록 row. */
export interface SlipCleanupSaveHistoryListRow {
  id: string
  programType: SlipCleanupProgramType
  saveMode: SlipCleanupSaveMode
  topic: string
  createdAt: string
  createdBy: string
  requestParams: Record<string, unknown>
  rowCount: number
}

/** 저장내역 상세 응답. */
export interface SlipCleanupSaveHistoryDetailResponse extends SlipCleanupSaveHistoryListRow {
  responsePayload: unknown
}

/** 목록 조회 옵션. */
export interface ListSlipCleanupSaveHistoryOptions {
  programType: SlipCleanupProgramType
  from?: string
  to?: string
  mode?: SlipCleanupSaveMode | 'ALL'
  page?: number
  size?: number
}

/** 전표정리 저장내역을 저장한다. */
export async function saveSlipCleanupHistory(
  request: SlipCleanupSaveHistoryRequest,
): Promise<SlipCleanupSaveHistorySaveResponse> {
  const res = await apiClient.post<ApiEnvelope<SlipCleanupSaveHistorySaveResponse>>(
    '/slips/cleanup/history',
    request,
    { timeout: 30_000 },
  )
  return res.data.data
}

/** 전표정리 저장내역 목록을 조회한다. */
export async function listSlipCleanupHistory(
  opts: ListSlipCleanupSaveHistoryOptions,
): Promise<PageResponse<SlipCleanupSaveHistoryListRow>> {
  const params: Record<string, string | number> = {
    programType: opts.programType,
    mode: opts.mode ?? 'MANUAL_NAMED',
    page: opts.page ?? 0,
    size: opts.size ?? 50,
  }
  if (opts.from) params['from'] = opts.from
  if (opts.to) params['to'] = opts.to
  const res = await apiClient.get<ApiEnvelope<PageResponse<SlipCleanupSaveHistoryListRow>>>(
    '/slips/cleanup/history',
    { params },
  )
  return res.data.data
}

/** 전표정리 저장내역 상세를 조회한다. */
export async function getSlipCleanupHistoryDetail(
  id: string,
): Promise<SlipCleanupSaveHistoryDetailResponse> {
  const res = await apiClient.get<ApiEnvelope<SlipCleanupSaveHistoryDetailResponse>>(
    `/slips/cleanup/history/${encodeURIComponent(id)}`,
  )
  return res.data.data
}

/** 현재 사용자의 최신 자동저장을 조회한다. */
export async function getLatestSlipCleanupHistory(
  programType: SlipCleanupProgramType,
): Promise<SlipCleanupSaveHistoryDetailResponse | null> {
  try {
    const res = await apiClient.get<ApiEnvelope<SlipCleanupSaveHistoryDetailResponse>>(
      '/slips/cleanup/history/latest',
      { params: { programType } },
    )
    return res.data.data
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) return null
    throw err
  }
}
