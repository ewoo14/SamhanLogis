/**
 * 배차문자 저장내역 API 클라이언트.
 *
 * preview 결과는 AUTO_LATEST/MANUAL_NAMED 로 저장하고, send 결과는 SEND_AUDIT 로 append-only 저장한다.
 * 화면에는 내부 UUID 를 표시하지 않고, 상세 복원 path param 전용으로만 사용한다.
 *
 * SP-09-2: SEND_AUDIT payload 타입 추가 — 실 발송 감사 이력 상세 화면 지원.
 */
import axios from 'axios'
import { apiClient, type ApiEnvelope, type PageResponse } from './client'

/** 배차문자 저장내역 프로그램 구분. */
export type DispatchSmsProgramType = 'DISPATCH_SMS'

/** 배차문자 저장 방식. */
export type DispatchSmsSaveMode = 'AUTO_LATEST' | 'MANUAL_NAMED' | 'SEND_AUDIT'

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

// ---------------------------------------------------------------------------
// SP-09-2: SEND_AUDIT responsePayload 타입 — 실 발송 감사 이력 상세 화면 지원.
// ---------------------------------------------------------------------------

/**
 * SEND_AUDIT responsePayload 내 수신자 1건 — Aligo 실 발송 결과.
 *
 * @property partnerCode 거래처코드 (사용자 노출 식별자)
 * @property recipientPhone 수신 전화번호 — UI 에서 가운데 4자리 **** 마스킹 후 표시
 * @property status SENT | FAILED | BLOCKED
 * @property reason 실패/차단 사유 (성공 시 null)
 * @property msgId Aligo 발급 메시지 ID (성공 시, SP-09-2 운영 추적용 — 사용자 노출 OK)
 * @property gatewayRaw Aligo 게이트웨이 raw 응답 JSON (디버깅/감사용, null 가능)
 */
export interface SendAuditDetailEntry {
  partnerCode: string
  recipientPhone: string
  status: 'SENT' | 'FAILED' | 'BLOCKED'
  reason: string | null
  msgId?: string | null
  gatewayRaw?: string | null
}

/**
 * SEND_AUDIT responsePayload 전체 — dispatch-sms 발송 결과.
 *
 * @property date 배차일 (yyyy-MM-dd)
 * @property sent 성공 건수
 * @property failed 실패 건수
 * @property blocked 발송금지 제외 건수
 * @property details 수신자별 상세 (Aligo 결과 + msgId/gatewayRaw per-entry)
 * @property msgId batch-level Aligo msg_id (단건 발송 시, 대부분 null — per-entry msgId 는 details 참조)
 * @property gatewayRaw batch-level raw 응답 (디버깅용, null 가능)
 */
export interface SendAuditResponsePayload {
  date: string
  sent: number
  failed: number
  blocked: number
  details: SendAuditDetailEntry[]
  msgId?: string | null
  gatewayRaw?: string | null
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

/** 현재 사용자의 최신 preview 자동저장을 조회한다. SEND_AUDIT 는 대상이 아니다. */
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
