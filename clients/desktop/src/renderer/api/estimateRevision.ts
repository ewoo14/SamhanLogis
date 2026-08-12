/**
 * 견적서 버전이력(revision) + 복원 API 클라이언트 — Phase 2.2 Task 6 FE.
 *
 * <p>BE endpoint (확정 계약 — EstimateRevisionController `@RequestMapping("/slips/estimates/{estimateId}")`,
 * gateway 가 {@code /api/v1} prefix 부여):
 * <ul>
 *   <li>{@code GET  /api/v1/slips/estimates/{estimateId}/revisions}                       — 버전이력 목록 (최신 우선)</li>
 *   <li>{@code POST /api/v1/slips/estimates/{estimateId}/revisions/{revisionNo}/restore}  — 특정 시점으로 복원</li>
 * </ul>
 *
 * <p>UUID 비공개 가드: 본 응답에는 actorId(UUID) 가 포함되지 않는다. 화면 텍스트는
 * {@code actorName} (풀네임) / {@code estimateNo} 만 사용한다 ([[uuid-no-user-visibility]]).
 *
 * <p>ApiResponse 래퍼 추출 패턴은 {@link ./estimateApi} 와 동일 — {@code res.data.data}.
 * slip 동형 — {@link ./slipRevision} 미러.
 */
import { apiClient, type ApiEnvelope } from './client'
import { type EstimateDetail } from './estimateApi'
import { toOrderPathId } from '../utils/orderNo'

/**
 * revision 한 건의 변경 요약 — BE {@code EstimateRevisionResponse.changeSummary} 와 1:1.
 *
 * 직전 revision 대비 헤더 필드 변경 건수 + 라인 추가/삭제/수정 건수.
 */
export interface ChangeSummary {
  /** 헤더(견적 본문) 필드 변경 건수. */
  headerChanged: number
  /** 추가된 라인 수. */
  lineAdded: number
  /** 삭제된 라인 수. */
  lineRemoved: number
  /** 수정된 라인 수. */
  lineModified: number
}

/** revision 발생 유형. */
export type EstimateRevisionType = 'CREATE' | 'EDIT' | 'RESTORE'

/**
 * BE {@code EstimateRevisionResponse} 와 1:1.
 *
 * <p>UUID 비공개 — actorId 미포함. 화면 표시는 actorName / estimateNo 만.
 */
export interface EstimateRevision {
  /** revision 번호 (1, 2, 3, ... — 큰 수록 최근). */
  revisionNo: number
  /** revision 유형 — CREATE(생성) / EDIT(수정) / RESTORE(복원). */
  revisionType: EstimateRevisionType
  /** RESTORE 일 때 원본 revision 번호 (그 외 null). */
  sourceRevisionNo: number | null
  /** 해당 시점의 견적번호 (화면 표시용). */
  estimateNo: string
  /** 해당 시점의 견적일자. */
  estimateDate: string
  /** 변경자 풀네임 — 화면 표시. */
  actorName: string
  /** 생성 시각 (LocalDateTime ISO 문자열). */
  createdAt: string
  /** 직전 revision 대비 변경 요약. */
  changeSummary: ChangeSummary
}

/**
 * 견적서 버전이력 목록 조회 (최신 우선).
 *
 * @param estimateId 견적서 UUID (path 전용 — 화면 노출 X)
 */
export async function listRevisions(estimateId: string): Promise<EstimateRevision[]> {
  const res = await apiClient.get<ApiEnvelope<EstimateRevision[]>>(
    `/api/v1/slips/estimates/${encodeURIComponent(toOrderPathId(estimateId))}/revisions`,
  )
  return res.data.data
}

/**
 * 특정 revision 시점으로 견적서 복원 — 200 응답 시 복원된 견적 상세 반환.
 *
 * <p>복원은 편집 가능 상태(QUOTE_DRAFT/QUOTE_SENT)에서만 가능하며, 그 외 상태(ACCEPTED/
 * CONVERTED/REJECTED)는 BE 가 409 로 거절한다. 복원은 새 revision(RESTORE) 을 발급한다.
 *
 * @param estimateId 견적서 UUID (path 전용 — 화면 노출 X)
 * @param revisionNo 복원 대상 revision 번호
 */
export async function restoreRevision(
  estimateId: string,
  revisionNo: number,
): Promise<EstimateDetail> {
  const res = await apiClient.post<ApiEnvelope<EstimateDetail>>(
    `/api/v1/slips/estimates/${encodeURIComponent(toOrderPathId(estimateId))}/revisions/${revisionNo}/restore`,
  )
  return res.data.data
}
