/**
 * 거래명세서 일괄 (statement batch) API 클라이언트 — PR-E2 FE-8 (Samhan Public native).
 *
 * <p>BE-A10 (accounting-service commit c48e156) 의 신규 endpoint wrapper.
 *
 * <h2>Endpoint</h2>
 * <ul>
 *   <li>GET {@code /accounting/statements/batch-data?from=YYYY-MM-DD&to=YYYY-MM-DD}
 *       — 기간 ISSUED 세금계산서 → 거래처별 그룹핑 + 라인 snapshot + 단톡방 매핑</li>
 * </ul>
 *
 * <h2>이식 배경 (legacy GAS 4번)</h2>
 * <p>구글 앱스 스크립트 "거래처별 일괄 거래명세서" — 거래처마다 별도 PDF 명세서를
 * 생성하여 회계팀이 수동 발송했다. desktop 자체 화면에서는 한 번의 검색으로
 * 거래처별 요약 표 + 다중 선택 → page-break per partner 인쇄로 일괄 처리한다.
 *
 * <h2>BE 응답 형식 (StatementBatchRow record)</h2>
 * <pre>
 * [{
 *   partnerCode, partnerName,
 *   chatRoomNames: string[],
 *   slips: [{
 *     slipNo, slipDate,
 *     totalSupply, totalVat, totalAmount,  // BigDecimal → string
 *     lines: [{
 *       productName, spec,
 *       quantity, unitPrice, supplyAmount, vatAmount  // BigDecimal → string
 *     }]
 *   }]
 * }]
 * </pre>
 *
 * <h2>접근 제어</h2>
 * <p>FE 진입/인쇄 route 와 BE 조회 endpoint 모두 {@code accounting.statement-batch} VIEW 기준.
 *
 * <h2>UUID 비공개 가드</h2>
 * <p>응답 wire-format 에 UUID 없음. 사용자 노출 식별자는 partnerCode +
 * partnerName + slipNo (taxInvoiceNo) 만.
 */
import { apiClient, type ApiEnvelope } from './client'

// ---------------------------------------------------------------------------
// 타입 (BE wire-format 과 1:1)
// ---------------------------------------------------------------------------

/** BE {@code StatementBatchRow.StatementLine} record 와 1:1. */
export interface StatementBatchLine {
  /** 품목명. */
  productName: string
  /** 규격. */
  spec: string | null
  /** 수량 (BigDecimal → string). */
  quantity: string
  /** 단가 (BigDecimal → string). */
  unitPrice: string
  /** 공급가액 (BigDecimal → string). */
  supplyAmount: string
  /** 세액 (BigDecimal → string). */
  vatAmount: string
}

/** BE {@code StatementBatchRow.StatementSlip} record 와 1:1. */
export interface StatementBatchSlip {
  /** 사용자 노출 전표번호 (taxInvoiceNo, 예: TI-2026-05-001). */
  slipNo: string
  /** 공급일자 (YYYY-MM-DD, LocalDate ISO). */
  slipDate: string
  /** 공급가액 합계 (BigDecimal → string). */
  totalSupply: string
  /** 세액 합계 (BigDecimal → string). */
  totalVat: string
  /** 합계 금액 (BigDecimal → string). */
  totalAmount: string
  /** 라인 목록. */
  lines: StatementBatchLine[]
}

/**
 * BE {@code StatementBatchRow} record 와 1:1 — 거래처 1건 + 슬립(세금계산서) list.
 */
export interface StatementBatchRow {
  /** 거래처코드 (사용자 노출 식별자 — partner-service Feign lookup 결과). */
  partnerCode: string
  /** 거래처명 (snapshot, BE 가 partner lookup 결과로 override 가능). */
  partnerName: string
  /** 단톡방명 매핑 (notification-service Feign 결과, 0~N건). */
  chatRoomNames: string[]
  /** 거래(세금계산서) 단건 그룹 — slipDate 오름차순. */
  slips: StatementBatchSlip[]
}

// ---------------------------------------------------------------------------
// API 호출
// ---------------------------------------------------------------------------

/**
 * 거래명세서 batch 데이터 조회 — {@code GET /accounting/statements/batch-data}.
 *
 * <p>기간 내 ISSUED 세금계산서를 거래처별로 그룹핑하여 응답. 선택 거래처 일괄
 * 인쇄를 위한 raw 데이터 source.
 *
 * @param from 기간 시작 (YYYY-MM-DD, inclusive)
 * @param to   기간 종료 (YYYY-MM-DD, inclusive)
 * @return     거래처별 명세서 그룹 list (partnerCode 순서 보존)
 */
export async function getStatementBatch(
  from: string,
  to: string,
): Promise<StatementBatchRow[]> {
  const res = await apiClient.get<ApiEnvelope<StatementBatchRow[]>>(
    '/accounting/statements/batch-data',
    { params: { from, to } },
  )
  return res.data.data
}

// ---------------------------------------------------------------------------
// 표시용 헬퍼
// ---------------------------------------------------------------------------

/**
 * 슬립 그룹 합계 — 표 요약 row 에 사용.
 *
 * <p>BigDecimal string → number 변환 후 합산 (KRW 정수 가정 — 소수 절사 불필요).
 *
 * @param row 거래처 1건
 * @return    {@code totalSupply + totalVat + totalAmount} 합산 결과 (KRW 정수)
 */
export function sumPartnerTotals(row: StatementBatchRow): {
  totalSupply: number
  totalVat: number
  totalAmount: number
} {
  let totalSupply = 0
  let totalVat = 0
  let totalAmount = 0
  for (const slip of row.slips) {
    totalSupply += Number(slip.totalSupply ?? 0)
    totalVat += Number(slip.totalVat ?? 0)
    totalAmount += Number(slip.totalAmount ?? 0)
  }
  return { totalSupply, totalVat, totalAmount }
}
