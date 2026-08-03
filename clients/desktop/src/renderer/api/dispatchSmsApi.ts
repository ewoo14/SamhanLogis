/**
 * 배차안내문자 미리보기 API 클라이언트 — 레거시 표시·편집·복사 계승.
 *
 * <p>BE 출처: services/notification-service/.../controller/DispatchBatchAdminController.java
 *           + dto/DispatchBatchPreviewRequest|Response
 *
 * <h2>Endpoint 매핑</h2>
 * <ul>
 *   <li>{@code POST /admin/notifications/dispatch-batch/preview} → {@link previewDispatchBatch}</li>
 * </ul>
 *
 * <h2>접근 제어</h2>
 * BE @PreAuthorize("hasAnyRole('DISPATCH','MANAGER','MASTER')") 와 1:1 매핑.
 * 풀네임 의무 (feedback_role_naming_full.md).
 *
 * <h2>표시 전용 흐름</h2>
 * <ol>
 *   <li>preview — 출고전표 자동 조회 + 단톡방 매핑 + blocked 가드 + 문구 조립</li>
 *   <li>화면 — 문구 편집 및 선택 복사</li>
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
 * @property blocked 발송금지 가드 — 화면에서 상태 표시
 * @property groupMessage 레거시 하차일별 그룹 문구 (화면·복사 기준 본문)
 */
export interface DispatchSmsPartnerEntry {
  partnerCode: string
  partnerName: string
  slipNo: string
  message: string
  blocked: boolean
  groupMessage: string
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
  partnerCode: string | null
  partnerName: string
  slipNo: string
  message: string
  /** 단톡방 매핑이 없을 때 사용할 인수자 전화번호. */
  recipientPhone: string | null
  /** 레거시 하차일별 그룹 문구 (미매핑 전표도 편집·복사 가능). */
  groupMessage: string
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

/** 레거시 배송기사내역 입력의 한 행. */
export interface DispatchDriverContactInput {
  slipNo: string
  companyName: string
  driverPhone: string
  date: string
}

// ---------------------------------------------------------------------------
// API 호출 함수
// ---------------------------------------------------------------------------

/**
 * 배차안내문자 미리보기 호출 — 저장·자동 발송 없이 표시용 결과를 반환한다.
 *
 * BE: 출고전표 자동 조회 (slip-service) + 단톡방 매핑 + blocked 가드 + 메시지 템플릿 조립.
 *
 * @param date 배차일 (yyyy-MM-dd)
 * @return 단톡방별 그룹 + 미매핑 거래처 목록
 */
export async function previewDispatchBatch(
  date: string,
  driverContacts: DispatchDriverContactInput[] = [],
): Promise<DispatchSmsPreviewResponse> {
  const res = await apiClient.post<ApiEnvelope<DispatchSmsPreviewResponse>>(
    '/admin/notifications/dispatch-batch/preview',
    { date, driverContacts },
  )
  return res.data.data
}
