/**
 * 거래처 버전이력(revision) + 복원 API 클라이언트 — Phase 2.3 Task 6 FE.
 *
 * <p>BE endpoint (partner-service, gateway 가 {@code /api/v1} prefix 부여 — partnerApi.ts 풀패스 패턴 동일):
 * <ul>
 *   <li>{@code GET  /api/v1/partners/{partnerCode}/revisions}                       — 버전이력 목록 (최신 우선)</li>
 *   <li>{@code POST /api/v1/partners/{partnerCode}/revisions/{revisionNo}/restore}  — 특정 시점으로 복원</li>
 * </ul>
 *
 * <p>UUID 비공개 가드: 본 응답에는 actorId(UUID) 가 포함되지 않는다. 화면 텍스트는
 * {@code actorName} (풀네임) / {@code partnerCode} 만 사용한다 ([[uuid-no-user-visibility]]).
 *
 * <p>ApiResponse 래퍼 추출 패턴은 {@link ./partnerApi} 와 동일 — {@code res.data.data}.
 * estimate 동형 — {@link ./estimateRevision} 미러.
 */
import { apiClient, type ApiEnvelope } from './client'
import { type PartnerFullResponse } from './partnerApi'

/**
 * revision 한 건의 변경 요약 — BE {@code PartnerRevisionResponse.changeSummary} 와 1:1.
 *
 * 직전 revision 대비 헤더(기본정보) 필드 변경 여부 + 자식(배송지/담당자/단가) 추가/삭제/수정 건수.
 */
export interface ChangeSummary {
  /** 헤더(기본정보 본문) 필드 변경 건수. */
  headerChanged: number
  /** 추가된 자식 행 수. */
  childAdded: number
  /** 삭제된 자식 행 수. */
  childRemoved: number
  /** 수정된 자식 행 수. */
  childModified: number
}

/** revision 발생 유형. */
export type PartnerRevisionType = 'CREATE' | 'EDIT' | 'RESTORE'

/**
 * BE {@code PartnerRevisionResponse} 와 1:1.
 *
 * <p>UUID 비공개 — actorId 미포함. 화면 표시는 actorName / partnerCode 만.
 */
export interface PartnerRevision {
  /** revision 번호 (1, 2, 3, ... — 큰 수록 최근). */
  revisionNo: number
  /** revision 유형 — CREATE(생성) / EDIT(수정) / RESTORE(복원). */
  revisionType: PartnerRevisionType
  /** RESTORE 일 때 원본 revision 번호 (그 외 null). */
  sourceRevisionNo: number | null
  /** 해당 시점의 거래처 코드 (화면 표시용). */
  partnerCode: string
  /** 변경자 풀네임 — 화면 표시. */
  actorName: string
  /** 생성 시각 (LocalDateTime ISO 문자열). */
  createdAt: string
  /** 직전 revision 대비 변경 요약. */
  changeSummary: ChangeSummary
}

/**
 * 거래처 버전이력 목록 조회 (최신 우선).
 *
 * @param partnerCode 거래처 코드 (예: P-2026-0001) — UUID 가 아님.
 */
export async function listRevisions(partnerCode: string): Promise<PartnerRevision[]> {
  const res = await apiClient.get<ApiEnvelope<PartnerRevision[]>>(
    `/api/v1/partners/${encodeURIComponent(partnerCode)}/revisions`,
  )
  return res.data.data
}

/**
 * 특정 revision 시점으로 거래처 복원 — 200 응답 시 복원된 거래처 4탭 풀 반환.
 *
 * <p>복원은 거래중(ACTIVE)/거래중지(SUSPENDED) 상태에서만 가능하며, 거래종료(TERMINATED)
 * 거래처는 BE 가 409 로 거절한다. 복원은 새 revision(RESTORE) 을 발급한다.
 *
 * @param partnerCode 거래처 코드 (예: P-2026-0001) — UUID 가 아님.
 * @param revisionNo 복원 대상 revision 번호
 */
export async function restoreRevision(
  partnerCode: string,
  revisionNo: number,
): Promise<PartnerFullResponse> {
  const res = await apiClient.post<ApiEnvelope<PartnerFullResponse>>(
    `/api/v1/partners/${encodeURIComponent(partnerCode)}/revisions/${revisionNo}/restore`,
  )
  return res.data.data
}
