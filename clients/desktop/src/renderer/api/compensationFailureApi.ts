/**
 * 시리얼 보상 실패 복구 API 클라이언트 (D-SER-23).
 *
 * BE endpoint (slip-service):
 * - GET  /api/v1/slips/compensation-failures?resolved=false&page=0&size=20
 *         — 보상 실패 목록 (Page<CompensationFailureResponse>, createdAt DESC)
 * - PATCH /api/v1/slips/compensation-failures/{id}/resolve
 *         — 수동 정합 완료 표시 (resolved=false → true, 멱등)
 *
 * UUID 비공개 가드 (memory `feedback_uuid_no_user_visibility`):
 * - 화면에는 slipNo / slipType / phase / productCode / attemptedOperation / failureReason / resolved 만 표시.
 * - id(UUID) 는 PATCH path param 전용 — 화면 텍스트 노출 금지.
 * - slipId(UUID) 는 응답에 포함되지 않음 (BE 설계, slipNo 만 사용).
 *
 * 권한: BE @RequirePermission(page="inventory.list", action=VIEW/UPDATE)
 * 접근 허용 역할: MASTER / MANAGER / WAREHOUSE / INVENTORY (inventory.list 에 view 권한이 있는 역할)
 */
import { apiClient, type ApiEnvelope, type PageResponse } from './client'

/**
 * BE CompensationFailureResponse record 와 1:1 매칭.
 *
 * @property id               보상 실패 UUID — PATCH path param 전용, 화면 노출 금지
 * @property slipNo           전표번호 — 사용자 노출 식별자 (UUID 비공개 가드)
 * @property slipType         전표 유형 (예: OUTBOUND / INBOUND)
 * @property phase            보상 실패가 발생한 단계 (예: SERIAL_DEDUCTION)
 * @property productCode      품목 코드 — 사용자 노출 비즈니스 식별자
 * @property attemptedOperation 시도된 보상 동작 (예: RESTORE_SERIAL)
 * @property failureReason    최종 실패 사유 메시지
 * @property originalFailureReason 원본 실패 사유 (첫 번째 실패 시점)
 * @property resolved         수동 해소 완료 여부 (false=미해소, true=해소됨)
 * @property occurredAt       보상 실패 발생 시각 ISO-8601
 * @property createdAt        레코드 생성 시각 ISO-8601
 */
export interface CompensationFailureResponse {
  /** 보상 실패 UUID — PATCH path param / 내부 키 전용, 화면 노출 금지 */
  id: string
  slipNo: string
  slipType: string
  phase: string
  productCode: string
  attemptedOperation: string
  failureReason: string
  originalFailureReason: string | null
  resolved: boolean
  occurredAt: string
  createdAt: string
}

/** 보상 실패 목록 조회 파라미터 */
export interface FetchCompensationFailuresParams {
  resolved: boolean
  page: number
  size: number
}

/**
 * 보상 실패 목록 조회 — Page<CompensationFailureResponse> (createdAt DESC).
 *
 * @param params resolved 필터 + 페이지 파라미터
 * @return Page<CompensationFailureResponse> — content 배열 + 페이지 메타
 */
export async function fetchCompensationFailures(
  params: FetchCompensationFailuresParams,
): Promise<PageResponse<CompensationFailureResponse>> {
  const res = await apiClient.get<ApiEnvelope<PageResponse<CompensationFailureResponse>>>(
    '/api/v1/slips/compensation-failures',
    {
      params: {
        resolved: params.resolved,
        page: params.page,
        size: params.size,
      },
    },
  )
  return res.data.data
}

/**
 * 보상 실패 수동 해소 처리 — resolved=false → true (멱등: 이미 true 면 변경 없음 OK).
 *
 * @param id 보상 실패 UUID (PATCH path param, 화면 비표시)
 * @return 갱신된 CompensationFailureResponse
 */
export async function resolveCompensationFailure(
  id: string,
): Promise<CompensationFailureResponse> {
  const res = await apiClient.patch<ApiEnvelope<CompensationFailureResponse>>(
    `/api/v1/slips/compensation-failures/${encodeURIComponent(id)}/resolve`,
  )
  return res.data.data
}
