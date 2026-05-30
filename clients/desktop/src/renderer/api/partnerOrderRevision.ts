/**
 * 거래처 주문 버전이력(revision) + 복원 API 클라이언트 — Phase 2.4 Task 9 FE.
 *
 * <p>BE endpoint (partner-order-service, gateway 가 {@code /api/v1} prefix 부여):
 * <ul>
 *   <li>{@code GET  /api/v1/partner-orders/{id}/revisions}                      — 버전이력 목록 (최신 우선)</li>
 *   <li>{@code GET  /api/v1/partner-orders/{id}/revisions/{no}}                 — 단일 스냅샷 상세</li>
 *   <li>{@code POST /api/v1/partner-orders/{id}/revisions/{no}/restore}          — 특정 시점 복원</li>
 * </ul>
 *
 * <p>UUID 비공개 가드: 본 응답에는 actorId(UUID) 가 포함되지 않는다. 화면 텍스트는
 * {@code actorName} (풀네임) / {@code orderNo} 만 사용한다 ([[uuid-no-user-visibility]]).
 *
 * <p>ApiResponse 래퍼 추출 패턴은 기존 클라이언트와 동일 — {@code res.data.data}.
 * {@link ./partnerRevision} 미러 (partner-service → partner-order-service 이식).
 */
import { apiClient, type ApiEnvelope } from './client'
import { type PartnerOrderDetail } from './sales'

/**
 * 주문 버전이력 revision 한 건의 변경 요약 — BE {@code PartnerOrderRevisionResponse.ChangeSummary} 와 1:1.
 *
 * 직전 revision 대비 헤더 필드 변경 건수 + 라인 추가/삭제/수정 건수.
 */
export interface PartnerOrderChangeSummary {
  /** 값이 달라진 헤더 필드 수. */
  headerChanged: number
  /** 추가된 라인 수. */
  lineAdded: number
  /** 제거된 라인 수. */
  lineRemoved: number
  /** 수정된 라인 수. */
  lineModified: number
}

/** 주문 revision 발생 유형 — BE {@code PartnerOrderRevisionType} 과 1:1. */
export type PartnerOrderRevisionType = 'CREATE' | 'EDIT' | 'STATUS' | 'RESTORE' | 'DELETE'

/**
 * BE {@code PartnerOrderRevisionResponse} 와 1:1 (Phase 2.4 Task 7 DTO).
 *
 * <p>UUID 비공개 가드 — actorId 미포함. 화면 표시는 actorName / orderNo 만.
 */
export interface PartnerOrderRevision {
  /** revision 번호 (1, 2, 3, ... — 큰 수록 최근). */
  revisionNo: number
  /** revision 유형 — CREATE(생성) / EDIT(수정) / STATUS(상태전이) / RESTORE(복원) / DELETE(삭제). */
  revisionType: PartnerOrderRevisionType
  /** RESTORE 일 때 원본 revision 번호 (그 외 null). */
  sourceRevisionNo: number | null
  /** 해당 시점의 주문번호 스냅샷 (YYYY/MM/DD-N 표시용). */
  orderNo: string
  /** 변경자 풀네임 — 화면 표시. UUID 패턴이면 BE 에서 null 로 저장. */
  actorName: string | null
  /** FE 색상 백업 (없으면 null). */
  actorColor: string | null
  /** 버전 생성 시각 (LocalDateTime ISO 문자열). */
  createdAt: string
  /** 직전 revision 대비 변경 규모 요약. */
  changeSummary: PartnerOrderChangeSummary
}

/**
 * 복원 응답 — BE {@code PartnerOrderRestoreResponse} 와 1:1.
 *
 * <p>{@code slipResyncRequired=true}: 복원 직전 상태가 CONFIRMED(완료)였음.
 * 연결 출고전표 재발행 여부를 담당자가 확인해야 한다.
 */
export interface PartnerOrderRestoreResponse {
  /** 복원 완료 후 주문 상세 (헤더+라인). */
  order: PartnerOrderDetail
  /** 출고전표 재동기화 필요 여부. CONFIRMED 복원 시 true. */
  slipResyncRequired: boolean
}

/**
 * 거래처 주문 버전이력 목록 조회 (최신 우선).
 *
 * <p>query key: {@code ['partner-order-revisions', orderId]}
 *
 * @param orderId 주문 UUID — URL path 전용, 화면 비노출 ([[uuid-no-user-visibility]]).
 */
export async function listPartnerOrderRevisions(orderId: string): Promise<PartnerOrderRevision[]> {
  const res = await apiClient.get<ApiEnvelope<PartnerOrderRevision[]>>(
    `/api/v1/partner-orders/${encodeURIComponent(orderId)}/revisions`,
  )
  return res.data.data
}

/**
 * 거래처 주문 특정 revision 단일 스냅샷 상세 조회.
 *
 * @param orderId    주문 UUID — URL path 전용.
 * @param revisionNo 조회할 버전 번호.
 */
export async function getPartnerOrderRevisionDetail(
  orderId: string,
  revisionNo: number,
): Promise<PartnerOrderRevision> {
  const res = await apiClient.get<ApiEnvelope<PartnerOrderRevision>>(
    `/api/v1/partner-orders/${encodeURIComponent(orderId)}/revisions/${revisionNo}`,
  )
  return res.data.data
}

/**
 * 거래처 주문을 특정 revision 시점으로 복원한다.
 *
 * <p>복원 허용 상태: DRAFT / CONFIRMED. CONFIRMING / CANCELED → BE 409.
 * CONFIRMED 복원 시 응답 {@code slipResyncRequired=true}.
 *
 * @param orderId    주문 UUID — URL path 전용.
 * @param revisionNo 복원 대상 revision 번호.
 */
export async function restorePartnerOrderRevision(
  orderId: string,
  revisionNo: number,
): Promise<PartnerOrderRestoreResponse> {
  const res = await apiClient.post<ApiEnvelope<PartnerOrderRestoreResponse>>(
    `/api/v1/partner-orders/${encodeURIComponent(orderId)}/revisions/${revisionNo}/restore`,
  )
  return res.data.data
}
