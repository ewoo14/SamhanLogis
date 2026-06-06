/**
 * 품목별 DPS 입고 pivot API 클라이언트 — P0-B GAS 보강.
 *
 * <p>BE agent 신규 endpoint wrapper.
 *
 * <h2>Endpoint</h2>
 * <ul>
 *   <li>GET {@code /warehouse/audit/dps-compare/by-product} —
 *       fromDate / toDate / warehouseId(optional) → 품목별 DPS 입고 현황 pivot</li>
 * </ul>
 *
 * <h2>권한</h2>
 * <p>FE 진입과 조회 endpoint 모두 {@code inventory.dps} VIEW 기준.
 *
 * <h2>UUID 비공개</h2>
 * <p>응답 wire-format 에서 UUID 미노출.
 * 사용자 노출 식별자 = productCode / productName 만 사용.
 */
import { apiClient, type ApiEnvelope } from './client'

// ---------------------------------------------------------------------------
// 타입 (BE wire-format 과 1:1)
// ---------------------------------------------------------------------------

/**
 * 품목별 DPS 입고 pivot 단일 행.
 *
 * <p>8 컬럼 — 상품코드 / 상품명 / 입고대기 / 완료 / 품질검사 / 반품 / 합계 / DPS차이.
 * UUID 비공개 — productCode / productName 만 사용자 노출 (feedback_uuid_no_user_visibility).
 */
export interface DpsByProductRow {
  /** 상품 코드 (비즈니스 식별자 — 사용자 노출 허용). */
  productCode: string
  /** 상품명 */
  productName: string
  /** 입고대기 수량 (PENDING). */
  pendingQty: number
  /** 완료 수량 (COMPLETED). */
  completedQty: number
  /** 품질검사 수량 (QC). */
  qcQty: number
  /** 반품 수량 (RETURN). 음수 가능 — FE 빨강 표시. */
  returnQty: number
  /** 합계 수량 (pendingQty + completedQty + qcQty + returnQty). */
  totalQty: number
  /**
   * DPS 차이 (DPS 기록 - 자사 입고합계).
   * 음수 = DPS 보다 자사 입고가 많음 — FE 빨강 표시.
   */
  diffFromDps: number
}

/** BE {@code DpsByProductResponse} 와 1:1. */
export interface DpsByProductResponse {
  /** 조회 기간 시작 (YYYY-MM-DD echo). */
  fromDate: string
  /** 조회 기간 종료 (YYYY-MM-DD echo). */
  toDate: string
  /** 창고 ID (조회 파라미터 echo — 전체 조회 시 null). 화면 미노출 (UUID). */
  warehouseId: string | null
  /** 창고명 (사용자 노출용). */
  warehouseName: string | null
  /** 조회 기준 시각 (ISO 8601). */
  generatedAt: string
  /** 총 품목 수. */
  totalProductCount: number
  /** 품목별 pivot 행 목록. */
  rows: DpsByProductRow[]
}

/** getDpsByProduct 파라미터 */
export interface GetDpsByProductOpts {
  /** 조회 기간 시작 (YYYY-MM-DD, Asia/Seoul). */
  fromDate: string
  /** 조회 기간 종료 (YYYY-MM-DD, Asia/Seoul). */
  toDate: string
  /**
   * 창고 ID (UUID — 선택, 전체 조회 시 생략).
   * 화면에는 창고명만 노출하고 warehouseId 는 내부 전송에만 사용.
   */
  warehouseId?: string
}

// ---------------------------------------------------------------------------
// API 호출
// ---------------------------------------------------------------------------

/**
 * 품목별 DPS 입고 pivot 조회.
 *
 * <p>API endpoint: {@code GET /warehouse/audit/dps-compare/by-product}
 *
 * @param opts fromDate / toDate (필수) + warehouseId (선택)
 * @return     총 품목 수 + 품목별 pivot 행 목록 + 생성 시각
 */
export async function getDpsByProduct(
  opts: GetDpsByProductOpts,
): Promise<DpsByProductResponse> {
  const params: Record<string, string> = {
    fromDate: opts.fromDate,
    toDate: opts.toDate,
  }
  if (opts.warehouseId) {
    params['warehouseId'] = opts.warehouseId
  }
  const res = await apiClient.get<ApiEnvelope<DpsByProductResponse>>(
    '/warehouse/audit/dps-compare/by-product',
    { params },
  )
  return res.data.data
}
