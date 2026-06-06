/**
 * 전표 수정/삭제 요청 API 클라이언트 — PR-H3 FE-1.
 *
 * <p>BE endpoint (slip-service):
 * <ul>
 *   <li>{@code POST /api/v1/slips/{slipId}/edit-request}                    — 작성자가 신규 요청 (type/reason)</li>
 *   <li>{@code POST /api/v1/slips/{slipId}/edit-request/{requestId}/approve} — 창고 직원 수락 → 전표 status 가 DRAFT/SAVED 로 풀림 (EDIT) / CANCELED (DELETE)</li>
 *   <li>{@code POST /api/v1/slips/{slipId}/edit-request/{requestId}/reject}  — 창고 직원 거절 (사유 필수)</li>
 *   <li>{@code GET  /api/v1/slips/edit-requests?status=PENDING}             — 창고 직원 대시보드용 목록</li>
 * </ul>
 *
 * <h2>UUID 비공개 가드 (feedback_uuid_no_user_visibility.md)</h2>
 * <ul>
 *   <li>응답의 {@code id} (요청 UUID) / {@code slipId} / {@code requesterId} 는 path/key 전용</li>
 *   <li>화면 표시는 {@code slipNo} / {@code requesterName} / {@code type} / {@code reason} / {@code requestedAt} 만 사용</li>
 *   <li>data-testid 는 BE response 의 {@code id} 를 짧게 (slice 0-8) 사용 가능 — 사용자 시각 노출 X</li>
 * </ul>
 *
 * <h2>SSE 이벤트</h2>
 * <ul>
 *   <li>{@code slip:edit-request:created}  — 창고 직원 대시보드 자동 갱신</li>
 *   <li>{@code slip:edit-request:decided}  — 작성자에게 수락/거절 결과 toast</li>
 * </ul>
 */
import { apiClient, type ApiEnvelope } from './client'

/** BE `SlipEditRequest.type` enum 과 1:1. */
export type SlipEditRequestType = 'EDIT' | 'DELETE'

/** BE `SlipEditRequest.status` enum 과 1:1. */
export type SlipEditRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

/**
 * BE `SlipEditRequestResponse` 와 1:1.
 *
 * <p>요청 상태 정보 + 결정 시점 메타. 작성자 화면 (SlipDetailPage status badge) 과
 * 창고 직원 대시보드 (SlipEditRequestsPage) 양쪽이 공유.
 */
export interface SlipEditRequest {
  /** 요청 UUID — data-testid 키 / mutation path 전용. 화면 텍스트 노출 금지. */
  id: string
  /** 전표 UUID — path/cache key 전용. */
  slipId: string
  /** 사용자 노출 식별자 (예: "2026/05/04-1"). */
  slipNo: string
  /** 요청자 UUID — 노출 금지 (색상 hash 등 부가 용). */
  requesterId: string
  /** 요청자 풀네임 — 화면 표시 (UUID 비공개 가드의 비즈니스 식별자). */
  requesterName: string
  /** 요청 종류. */
  type: SlipEditRequestType
  /** 요청 사유 (10~500자, 작성자 입력 그대로). */
  reason: string
  /** 요청 시각 ISO-8601. */
  requestedAt: string
  /** 결정 상태. */
  status: SlipEditRequestStatus
  /** 결정 시각 ISO-8601 (PENDING 이면 null). */
  decidedAt: string | null
  /** 결정자 UUID — 화면 노출 금지. */
  decidedBy: string | null
  /** 결정자 풀네임 — 화면 표시. */
  decidedByName: string | null
  /** 거절 사유 (REJECTED 인 경우 필수, APPROVED 면 null). */
  decisionReason: string | null
}

/** POST body — BE `SlipEditRequestCreateRequest` 와 1:1. */
export interface SlipEditRequestCreateRequest {
  type: SlipEditRequestType
  reason: string
}

/** POST body — BE `SlipEditRequestRejectRequest` 와 1:1. */
export interface SlipEditRequestRejectRequest {
  reason: string
}

/** GET 옵션 — BE `?status=PENDING` (기본 PENDING). */
export interface ListSlipEditRequestsOptions {
  status?: SlipEditRequestStatus
}

/**
 * 전표 수정/삭제 요청 신규 등록 — 작성자 (SALES/MANAGER/MASTER) 가 호출.
 *
 * <p>CONFIRMED 단계에서만 가능 (BE 가드와 동일). 200 OK 시 신규 요청 응답.
 *
 * @param slipId 전표 UUID — path 전용 (화면 노출 X)
 * @param body   요청 종류 + 사유 (10~500자)
 */
export async function createSlipEditRequest(
  slipId: string,
  body: SlipEditRequestCreateRequest,
): Promise<SlipEditRequest> {
  const res = await apiClient.post<ApiEnvelope<SlipEditRequest>>(
    `/api/v1/slips/${encodeURIComponent(slipId)}/edit-request`,
    body,
  )
  return res.data.data
}

/**
 * 전표 수정/삭제 요청 수락 — 창고 직원 (WAREHOUSE/MANAGER/MASTER) 이 호출.
 *
 * <p>EDIT 수락 시 BE 가 전표 status 를 DRAFT/SAVED 로 풀어 작성자 재편집 가능.
 * DELETE 수락 시 BE 가 전표를 CANCELED 로 soft-delete.
 *
 * @param slipId    전표 UUID
 * @param requestId 요청 UUID
 */
export async function approveSlipEditRequest(
  slipId: string,
  requestId: string,
): Promise<SlipEditRequest> {
  const res = await apiClient.post<ApiEnvelope<SlipEditRequest>>(
    `/api/v1/slips/${encodeURIComponent(slipId)}/edit-request/${encodeURIComponent(
      requestId,
    )}/approve`,
  )
  return res.data.data
}

/**
 * 전표 수정/삭제 요청 거절 — 창고 직원이 호출.
 *
 * <p>거절 사유 필수 (BE 가드, ≥ 5자 권장). 200 OK 시 status=REJECTED 응답.
 *
 * @param slipId    전표 UUID
 * @param requestId 요청 UUID
 * @param body      거절 사유
 */
export async function rejectSlipEditRequest(
  slipId: string,
  requestId: string,
  body: SlipEditRequestRejectRequest,
): Promise<SlipEditRequest> {
  const res = await apiClient.post<ApiEnvelope<SlipEditRequest>>(
    `/api/v1/slips/${encodeURIComponent(slipId)}/edit-request/${encodeURIComponent(
      requestId,
    )}/reject`,
    body,
  )
  return res.data.data
}

/**
 * 처리 대기 (PENDING) 요청 목록 조회 — 창고 직원 대시보드.
 *
 * <p>요청 시각 오름차순 (오래된 요청부터). status 미지정 시 PENDING 기본.
 *
 * @param options status 필터 (기본 PENDING)
 */
export async function listSlipEditRequests(
  options: ListSlipEditRequestsOptions = {},
): Promise<SlipEditRequest[]> {
  const params: Record<string, string> = {
    status: options.status ?? 'PENDING',
  }
  const res = await apiClient.get<ApiEnvelope<SlipEditRequest[]>>(
    '/api/v1/slips/edit-requests',
    { params },
  )
  return res.data.data
}

/** SlipEditRequestType → 한국어 라벨. */
export const SLIP_EDIT_REQUEST_TYPE_LABEL: Record<
  SlipEditRequestType,
  string
> = {
  EDIT: '수정',
  DELETE: '삭제',
}

/** SlipEditRequestStatus → 한국어 라벨. */
export const SLIP_EDIT_REQUEST_STATUS_LABEL: Record<
  SlipEditRequestStatus,
  string
> = {
  PENDING: '처리 대기',
  APPROVED: '수락됨',
  REJECTED: '거절됨',
}
