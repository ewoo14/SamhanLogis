/**
 * 배차안내 SMS batch 발송 API 클라이언트 — PR-E1 FE-6 (Samhan Public 이식).
 *
 * <p>BE 출처: services/notification-service/.../controller/DispatchBatchAdminController.java
 *           + dto/DispatchBatchPreviewRequest|Response, DispatchBatchSendRequest|Response
 *           (PR-E1 BE-4, commit 0c512d5)
 *
 * <h2>Endpoint 매핑</h2>
 * <ul>
 *   <li>{@code POST /admin/notifications/dispatch-batch/preview} → {@link previewDispatchBatch}</li>
 *   <li>{@code POST /admin/notifications/dispatch-batch/send}    → {@link sendDispatchBatch}</li>
 * </ul>
 *
 * <h2>접근 제어</h2>
 * BE @PreAuthorize("hasAnyRole('DISPATCH','MANAGER','MASTER')") 와 1:1 매핑.
 * 풀네임 의무 (feedback_role_naming_full.md).
 *
 * <h2>2-step 안전 가드 (사용자 R8 명시)</h2>
 * <ol>
 *   <li>preview — 출고전표 자동 조회 + 단톡방 매핑 + blocked dryRun (저장 X)</li>
 *   <li>send    — 운영자 수정 본문 포함 entry 일괄 발송 (비가역)</li>
 * </ol>
 *
 * <h2>UUID 비공개 (feedback_uuid_no_user_visibility.md)</h2>
 * 응답에는 UUID 없음 — 사용자 노출 = partnerCode / partnerName / chatRoomName / slipNo 만.
 */
import { apiClient, type ApiEnvelope } from './client'

// ---------------------------------------------------------------------------
// Preview 응답 타입 — BE DispatchBatchPreviewResponse 와 1:1
// ---------------------------------------------------------------------------

/**
 * 거래처 1건 — 메시지 + blocked 가드 결과.
 *
 * @property partnerCode 거래처코드 (사용자 노출 식별자)
 * @property partnerName 거래처명 (사용자 노출)
 * @property slipNo 출고전표번호 (사용자 노출)
 * @property message 조립된 한국어 안내 본문 (FE textarea 에서 수정 가능)
 * @property blocked 발송금지 가드 — true 시 send 단계에서 자동 제외
 */
export interface DispatchSmsPartnerEntry {
  partnerCode: string
  partnerName: string
  slipNo: string
  message: string
  blocked: boolean
}

/**
 * 단톡방 1개 그룹 — 1 단톡방에 N 거래처가 라우팅.
 *
 * @property chatRoomName 단톡방 이름 (사용자 노출)
 * @property partners 본 단톡방에 라우팅된 거래처 N건
 */
export interface DispatchSmsChatRoomGroup {
  chatRoomName: string
  partners: DispatchSmsPartnerEntry[]
}

/**
 * 단톡방 매핑이 없는 거래처 — 운영자 후속 등록 유도 용.
 */
export interface DispatchSmsUnmappedPartner {
  partnerCode: string
  partnerName: string
  slipNo: string
  message: string
  /** 단톡방 매핑이 없을 때 사용할 인수자 전화번호. */
  recipientPhone: string | null
}

/** Preview 응답 envelope. */
export interface DispatchSmsPreviewResponse {
  /** yyyy-MM-dd. */
  date: string
  totalSlips: number
  mappedSlips: number
  unmappedSlips: number
  chatRooms: DispatchSmsChatRoomGroup[]
  unmapped: DispatchSmsUnmappedPartner[]
}

// ---------------------------------------------------------------------------
// Send 요청 / 응답 타입 — BE DispatchBatchSendRequest|Response 와 1:1
// ---------------------------------------------------------------------------

/**
 * 발송 entry 1건 — 운영자가 수정한 본문 + 수신 번호.
 *
 * @property partnerCode 거래처코드 (blocked 가드 키)
 * @property recipientPhone 수신 전화번호 (단톡방 운영자 / 거래처 담당자)
 * @property message 발송할 본문 (preview 시점 자동 조립 + FE 수정)
 * @property chatRoomName 단톡방 이름 (감사용 / 결과 그룹핑 용)
 */
export interface DispatchSmsSendEntry {
  partnerCode: string
  recipientPhone: string
  message: string
  chatRoomName?: string
}

/** 발송 결과 1건 — 감사 / 운영 대응 용. */
export interface DispatchSmsSendResultDetail {
  partnerCode: string
  recipientPhone: string
  /** SENT / FAILED / BLOCKED. */
  status: 'SENT' | 'FAILED' | 'BLOCKED'
  /** 실패 / 차단 사유 (성공 시 null). */
  reason: string | null
}

/** Send 응답 envelope. */
export interface DispatchSmsSendResponse {
  date: string
  sent: number
  failed: number
  blocked: number
  details: DispatchSmsSendResultDetail[]
}

// ---------------------------------------------------------------------------
// API 호출 함수
// ---------------------------------------------------------------------------

/**
 * 배차안내 SMS 미리보기 호출 — dryRun (저장 / 발송 X).
 *
 * BE: 출고전표 자동 조회 (slip-service) + 단톡방 매핑 + blocked 가드 + 메시지 템플릿 조립.
 *
 * @param date 배차일 (yyyy-MM-dd)
 * @return 단톡방별 그룹 + 미매핑 거래처 목록
 */
export async function previewDispatchBatch(
  date: string,
): Promise<DispatchSmsPreviewResponse> {
  const res = await apiClient.post<ApiEnvelope<DispatchSmsPreviewResponse>>(
    '/admin/notifications/dispatch-batch/preview',
    { date },
  )
  return res.data.data
}

/**
 * 배차안내 SMS 실 발송 호출 — 비가역 작업 (FE 2-step 가드 의무).
 *
 * BE 가 send 시점 blocked 재확인 (preview 와 send 사이 BLOCK 등록 가능성).
 *
 * @param date 배차일 (preview 와 동일 — 감사용 / 검증용)
 * @param entries 발송 대상 거래처별 (partnerCode + 수정된 message + 수신 번호) 목록
 * @return sent / failed / blocked 카운트 + 결과 상세
 */
export async function sendDispatchBatch(
  date: string,
  entries: DispatchSmsSendEntry[],
): Promise<DispatchSmsSendResponse> {
  const res = await apiClient.post<ApiEnvelope<DispatchSmsSendResponse>>(
    '/admin/notifications/dispatch-batch/send',
    { date, entries },
  )
  return res.data.data
}
