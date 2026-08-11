/**
 * 전표 audit log API 클라이언트 — PR-H2 FE-1.
 *
 * <p>BE endpoint:
 * <ul>
 *   <li>{@code GET  /api/v1/slips/{slipId}/audit-logs}            — 변경 이력 목록 (revisionNo 내림차순)</li>
 * </ul>
 *
 * <p>#31: 과거 revert(복원) API 는 제거됨 — 전표 복원은 통합 버전이력 패널의 restore
 * ({@code /api/v1/slips/{id}/revisions/{revisionNo}/restore}, 데스크톱·모바일 공통)로 일원화했다.
 * (구 {@code /revert/{n}} 경로는 BE 실매핑 {@code /audit/revert/{n}} 과 불일치해 실서버 404 였음.)
 *
 * <p>UUID 비공개 가드: 응답의 {@code actorId} 는 색상 hash 입력 전용. 화면 텍스트
 * 노출 금지. 사용자 노출은 {@code actorName} (풀네임) 만 사용한다.
 */
import { apiClient, type ApiEnvelope } from './client'
import {
  normalizeAuditLogEntry,
  type AuditLogEntry,
  type RawAuditLogEntry,
} from './createAuditApi'

/**
 * BE {@code SlipAuditLogResponse} 와 1:1.
 *
 * 한 audit log 행 = 한 필드 변경 한 건. 동일 revisionNo 내에 여러 필드가 변경되면
 * 여러 행으로 응답되며, 호출자가 field 별로 group 하여 AuditOverlay 에 전달한다.
 */
export type SlipAuditLogEntry = AuditLogEntry

/**
 * 전표 변경 이력 목록 조회 (revisionNo 내림차순).
 *
 * @param slipId 전표 UUID (path 전용 — 화면 노출 X)
 */
export async function listAuditLogs(slipId: string): Promise<SlipAuditLogEntry[]> {
  const res = await apiClient.get<ApiEnvelope<RawAuditLogEntry[]>>(
    `/api/v1/slips/${encodeURIComponent(slipId)}/audit-logs`,
  )
  return res.data.data.map(normalizeAuditLogEntry)
}
