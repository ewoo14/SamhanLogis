/**
 * DPS 입고 비교 API 클라이언트 — PR-E1 FE-1.
 *
 * <p>BE-2 (commit 4b14084) 의 inventory-service 신규 endpoint wrapper.
 *
 * <h2>Endpoint</h2>
 * <ul>
 *   <li>POST {@code /warehouse/audit/dps-compare} (multipart) —
 *       DPS 엑셀(.xlsx) + 입고전표 자동 조회 기간(from/to) + groupBy(SLIP/ITEM) → 매칭/mismatch 결과</li>
 *   <li>GET  {@code /warehouse/audit/dps-compare/template} —
 *       헤더 row 만 있는 빈 .xlsx 양식 (Blob 응답)</li>
 * </ul>
 *
 * <h2>권한</h2>
 * <p>FE 진입과 비교 조회는 {@code inventory.dps} VIEW, template download 는 DOWNLOAD 기준.
 *
 * <h2>UUID 비공개</h2>
 * <p>응답 wire-format 에서 UUID 가 제거된 상태 (productId / partnerId 미노출).
 * 사용자 노출 식별자 = slipNo / productCode / partnerCode 만 사용.
 *
 * <h2>사용자 명시 가드</h2>
 * <p>"DPS 엑셀을 그대로 업로드 — 자동 조회 X". 입고전표만 자동(slip-service Feign),
 * DPS 는 반드시 사용자가 .xlsx 직접 업로드.
 */
import { apiClient, type ApiEnvelope } from './client'

// ---------------------------------------------------------------------------
// 타입 (BE wire-format 과 1:1)
// ---------------------------------------------------------------------------

/** BE {@code DpsCompareGroupBy} enum 과 1:1 — 매칭 단위. */
export type DpsCompareGroupBy = 'SLIP' | 'ITEM'

/** BE {@code RowMismatch.MismatchType} enum 과 1:1 — mismatch 카테고리. */
export type DpsMismatchType =
  | 'QUANTITY_MISMATCH'
  | 'AMOUNT_MISMATCH'
  | 'PARTNER_MISMATCH'
  | 'DPS_NOT_FOUND'
  | 'SLIP_NOT_FOUND'

/** BE {@code RowMismatch} record 와 1:1. */
export interface DpsRowMismatch {
  /** mismatch 카테고리. */
  rowType: DpsMismatchType
  /** 전표번호 — slip 매칭 가능 시 사용자 노출 식별자. */
  slipNo: string | null
  /** 품번 — 가능한 경우 양쪽 동일. */
  productCode: string | null
  /** 거래처 코드 — 가능한 경우. */
  partnerCode: string | null
  /** 입고전표 합계/단건 수량. */
  expectedQty: number
  /** DPS 엑셀 합계/단건 수량. */
  actualQty: number
  expectedAmount: number
  actualAmount: number
  /** 사용자 노출용 한국어 사유. */
  reason: string
}

/** BE {@code DpsCompareResponse} record 와 1:1. */
export interface DpsCompareResponse {
  /** 조회 기간 시작 (YYYY-MM-DD echo). */
  from: string
  /** 조회 기간 종료 (YYYY-MM-DD echo). */
  to: string
  /** 매칭 단위. BE 가 String 으로 직렬화 ("SLIP" / "ITEM"). */
  groupBy: string
  /** 입고전표 라인 수. */
  inboundCount: number
  /** DPS 엑셀 row 수 (헤더 제외). */
  dpsRowCount: number
  /** 정상 일치 건수. */
  matchedCount: number
  /** 불일치 건수. */
  mismatchCount: number
  /** mismatch 라인 상세. */
  mismatches: DpsRowMismatch[]
}

// ---------------------------------------------------------------------------
// API 호출
// ---------------------------------------------------------------------------

/**
 * DPS 입고 비교 — multipart 업로드 + 자동 조회.
 *
 * @param file    사용자가 업로드한 DPS 엑셀 (.xlsx)
 * @param from    입고전표 조회 기간 시작 (YYYY-MM-DD)
 * @param to      입고전표 조회 기간 종료 (YYYY-MM-DD)
 * @param groupBy 매칭 단위 (SLIP / ITEM)
 * @return        매칭 통계 + mismatch 행 상세
 */
export async function compareDps(
  file: File,
  from: string,
  to: string,
  groupBy: DpsCompareGroupBy,
): Promise<DpsCompareResponse> {
  const form = new FormData()
  form.append('file', file)
  form.append('from', from)
  form.append('to', to)
  form.append('groupBy', groupBy)
  const res = await apiClient.post<ApiEnvelope<DpsCompareResponse>>(
    '/warehouse/audit/dps-compare',
    form,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      // 엑셀 파싱 + slip-service Feign 호출 → 기본 10s 보다 여유.
      timeout: 60_000,
    },
  )
  return res.data.data
}

/**
 * DPS 엑셀 양식 다운로드 — 헤더 row 만 있는 빈 .xlsx (Blob).
 *
 * <p>호출자는 Blob 을 createObjectURL → anchor click 으로 사용자 다운로드 트리거.
 *
 * @return .xlsx Blob (Content-Type
 *         application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)
 */
export async function downloadDpsTemplate(): Promise<Blob> {
  const res = await apiClient.get<Blob>(
    '/warehouse/audit/dps-compare/template',
    {
      responseType: 'blob',
      timeout: 30_000,
    },
  )
  return res.data
}

// ---------------------------------------------------------------------------
// 표시용 헬퍼 (mismatch 카테고리 한국어 라벨 / 색상)
// ---------------------------------------------------------------------------

/** mismatch 카테고리 → 한국어 라벨. */
export const DPS_MISMATCH_LABEL: Record<DpsMismatchType, string> = {
  QUANTITY_MISMATCH: '수량 불일치',
  AMOUNT_MISMATCH: '합계금액 불일치',
  PARTNER_MISMATCH: '거래처 불일치',
  DPS_NOT_FOUND: 'DPS 미발견',
  SLIP_NOT_FOUND: '입고전표 미발견',
}

/**
 * mismatch 카테고리 → 행/뱃지 색상 (사용자 명시 매핑).
 * QUANTITY=주황, PARTNER=빨강, DPS_NOT_FOUND=회색, SLIP_NOT_FOUND=회색.
 */
export const DPS_MISMATCH_COLOR: Record<
  DpsMismatchType,
  { background: string; border: string; text: string }
> = {
  QUANTITY_MISMATCH: {
    background: '#FFF7ED',
    border: '#FB923C',
    text: '#9A3412',
  },
  AMOUNT_MISMATCH: {
    background: '#FFF7ED',
    border: '#F97316',
    text: '#9A3412',
  },
  PARTNER_MISMATCH: {
    background: '#FEF2F2',
    border: '#EF4444',
    text: '#991B1B',
  },
  DPS_NOT_FOUND: {
    background: '#F3F4F6',
    border: '#9CA3AF',
    text: '#374151',
  },
  SLIP_NOT_FOUND: {
    background: '#F3F4F6',
    border: '#9CA3AF',
    text: '#374151',
  },
}
