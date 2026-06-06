/**
 * 전표 정리 리스트 API 클라이언트 — PR-E1 FE-5 (legacy GAS 13번 "전표정리리스트" 자동 조회 이식).
 *
 * <p>BE 출처: services/slip-service/.../web/SlipController.java {@code GET /slips/cleanup}
 * (commit 281415f). BE-A6 SlipCleanupService 가 기간 내 활성 슬립 전체 + 정합성 flag 4종 +
 * status / partner 그룹핑 카운트를 반환한다.
 *
 * <p>BE @PreAuthorize: SALES / MANAGER / MASTER. ACCOUNTANT 는 정합성 검증 회계용으로 화면
 * 진입 가드에 추가되어 있으나 BE 가 거부할 경우 403 (FE 표시는 RoleGuard 에서 처리).
 *
 * <p>UUID 비공개 가드 (feedback_uuid_no_user_visibility.md):
 * - {@code CleanupEntry.id} 는 "원본 슬립 보기" link 의 path key 전용 (사용자 미노출)
 * - 사용자 노출 식별자 = slipNo / partnerCode / partnerName
 *
 * <p>풀네임 ROLE (feedback_role_naming_full.md): SALES / MANAGER / MASTER / ACCOUNTANT.
 */
import { apiClient, type ApiEnvelope } from './client'
import type { SlipStatus } from '@samhan/design-system'

/**
 * 정합성 flag 4종 — BE {@code SlipCleanupResponse.CleanupEntry} 의 boolean 필드 4개를
 * 화면 표시용 enum 형태로 정규화한 코드.
 *
 * <p>색상 규약 (PR-E1 FE-5 spec):
 * <ul>
 *   <li>{@code REJECTED} — partner_code 누락 (위험, 빨강)</li>
 *   <li>{@code INVALID} — 라인 0건 (위험, 빨강)</li>
 *   <li>{@code PENDING} — 라인 합계 = 0 (검증 대기, 주황)</li>
 *   <li>{@code DUPLICATE} — region 그룹 누락 (회색)</li>
 * </ul>
 *
 * <p>BE flag → FE flag 매핑:
 * <ul>
 *   <li>partnerCodeMissing → REJECTED</li>
 *   <li>linesMissing       → INVALID</li>
 *   <li>amountZero         → PENDING</li>
 *   <li>regionMissing      → DUPLICATE</li>
 * </ul>
 */
export type CleanupFlag = 'REJECTED' | 'PENDING' | 'DUPLICATE' | 'INVALID'

/** flag → 한국어 표시 라벨. */
export const CLEANUP_FLAG_LABEL: Record<CleanupFlag, string> = {
  REJECTED: '거래처 미매핑',
  PENDING: '금액 0원',
  DUPLICATE: '지역그룹 누락',
  INVALID: '라인 누락',
}

/** flag → chip 색상 (Designer 합의 — REJECTED/INVALID 빨강 · PENDING 주황 · DUPLICATE 회색). */
export const CLEANUP_FLAG_COLOR: Record<
  CleanupFlag,
  { bg: string; fg: string; border: string }
> = {
  REJECTED: { bg: '#FEE2E2', fg: '#991B1B', border: '#F87171' },
  PENDING: { bg: '#FFEDD5', fg: '#9A3412', border: '#FB923C' },
  DUPLICATE: { bg: '#F3F4F6', fg: '#374151', border: '#D1D5DB' },
  INVALID: { bg: '#FEE2E2', fg: '#991B1B', border: '#F87171' },
}

/**
 * 슬립 1건의 정리 entry — BE {@code SlipCleanupResponse.CleanupEntry} 와 1:1.
 *
 * <p>{@link #id} 는 "원본 슬립 보기" 클릭 시 SlipDetailPage path key 로만 사용 (UUID 비공개).
 */
export interface CleanupEntry {
  id: string
  slipNo: string
  slipDate: string
  status: SlipStatus
  partnerCode: string | null
  partnerName: string | null
  classifiedRegionGroup: string | null
  lineCount: number
  /** KRW 정수 string (BigDecimal 직렬화). */
  totalAmount: string
  partnerCodeMissing: boolean
  amountZero: boolean
  linesMissing: boolean
  regionMissing: boolean
}

/** status 별 카운트 — BE {@code SlipCleanupResponse.StatusCount}. */
export interface StatusCount {
  status: SlipStatus
  count: number
}

/** partner 별 카운트 — BE {@code SlipCleanupResponse.PartnerCount}. */
export interface PartnerCount {
  partnerCode: string
  partnerName: string | null
  count: number
}

/** 전체 응답 — BE {@code SlipCleanupResponse} 와 1:1. */
export interface SlipCleanupResponse {
  /** YYYY-MM-DD. */
  from: string
  /** YYYY-MM-DD. */
  to: string
  totalSlips: number
  byStatus: StatusCount[]
  byPartner: PartnerCount[]
  entries: CleanupEntry[]
}

/**
 * 전표 정리 리스트 조회. BE {@code GET /slips/cleanup?from=&to=} 호출.
 *
 * @param from 기간 시작일 (ISO YYYY-MM-DD)
 * @param to 기간 종료일 (ISO YYYY-MM-DD)
 * @return BE 응답 (status/partner 카운트 + 슬립별 정합성 flag entries)
 */
export async function getCleanupList(
  from: string,
  to: string,
): Promise<SlipCleanupResponse> {
  const res = await apiClient.get<ApiEnvelope<SlipCleanupResponse>>(
    '/slips/cleanup',
    { params: { from, to } },
  )
  return res.data.data
}

/**
 * entry 의 4 boolean flag 를 FE flag 코드 배열로 정규화.
 *
 * <p>chip 표시 순서: REJECTED → INVALID → PENDING → DUPLICATE (위험도 내림차순).
 */
export function entryFlags(entry: CleanupEntry): CleanupFlag[] {
  const flags: CleanupFlag[] = []
  if (entry.partnerCodeMissing) flags.push('REJECTED')
  if (entry.linesMissing) flags.push('INVALID')
  if (entry.amountZero) flags.push('PENDING')
  if (entry.regionMissing) flags.push('DUPLICATE')
  return flags
}
