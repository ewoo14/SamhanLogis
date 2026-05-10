/**
 * 인쇄 양식 API 클라이언트 — accounting-service 세금계산서 단건 조회 등
 * 인쇄 view 가 호출하는 BE endpoint 의 좁은 facade.
 *
 * P0-4 인쇄 5건 BE 연결 — slip-service / sales-service 의 기존 facade
 * (`api/slip.ts`, `api/sales.ts`) 와 분리하여 인쇄 view 의 호출 경로를 단일화한다.
 *
 * 노출 endpoint:
 * - `GET /accounting/tax-invoices/{id}` — TaxInvoice 단건 (라인 포함, ACCOUNTANT/MASTER)
 *
 * UUID 비공개 가드:
 * - taxInvoice.id / line.lineId / partnerId 모두 path param + 응답 body 내부 키.
 *   화면에 노출되는 식별자는 사람이 읽는 `taxInvoiceNo` (예: 20260509-00001).
 */
import { apiClient, type ApiEnvelope } from './client'

/** 세금계산서 상태 — BE `TaxInvoiceStatus` 와 1:1. */
export type TaxInvoiceStatus = 'DRAFT' | 'ISSUED' | 'CANCELLED'

/**
 * 세금계산서 라인 — BE `TaxInvoiceLineResponse`.
 *
 * <p>P0-4 (PR #139) BE rename:
 * - {@code spec} → {@code specification} (NTS 표준 필드명 정렬)
 * - {@code unit} 신규 (단위 — 건/kg/CBM 등)
 */
export interface TaxInvoiceLine {
  /** 라인 UUID — 화면 미노출 (UUID 비공개 가드). */
  lineId: string
  /** 1-based 라인 순서. */
  lineNo: number
  /** 품목명 (≤200자). */
  itemName: string
  /** 규격 (≤80자, nullable) — BE 필드명 {@code specification}. */
  specification: string | null
  /** 단위 (≤20자, nullable, P0-4 신규). */
  unit: string | null
  /** 수량 (BigDecimal — string 직렬화). */
  quantity: string
  /** 단가 (KRW BigDecimal — string). */
  unitPrice: string
  /** 라인 공급가액 = 수량 × 단가. */
  supplyAmount: string
  /** 라인 부가세 = supplyAmount × 10%. */
  vatAmount: string
  /** 라인 메모 (nullable). */
  memo: string | null
}

/**
 * 세금계산서 단건 상세 — BE `TaxInvoiceDetailResponse`.
 *
 * 발행 후 (ISSUED) 에는 `taxInvoiceNo` 가 채번되며, 인쇄 미리보기는 이 번호를
 * "공급받는자 보관용" 양식의 일련번호 셀에 표시한다. DRAFT 단계는 `taxInvoiceNo`
 * 가 빈 문자열 또는 null 이므로 미리보기는 "미발행" 라벨로 대체.
 */
export interface TaxInvoiceDetail {
  /** 세금계산서 UUID — 화면 미노출. */
  id: string
  /** 발행번호 (예: 20260509-00001) — ISSUED 시 채번, DRAFT 는 null/빈 문자열. */
  taxInvoiceNo: string | null
  /** 거래처 UUID — 화면 미노출. */
  partnerId: string | null
  /** 거래처 사업자등록번호 (000-00-00000). */
  partnerBusinessNo: string | null
  /** 거래처명 (e-Tax 양식 "공급받는자 상호" 셀). */
  partnerName: string | null
  /** 거래처 주소 (e-Tax 양식 "공급받는자 사업장 주소" 셀). */
  partnerAddress: string | null
  /** 공급일자 (LocalDate "YYYY-MM-DD") — 작성일자 셀에 분리 표시. */
  supplyDate: string
  /** 공급가액 합계 (KRW BigDecimal — string). */
  supplyAmount: string
  /** 부가세 합계 (KRW BigDecimal — string). */
  vatAmount: string
  /** 합계 = 공급가액 + 부가세. */
  totalAmount: string
  /** 상태 (DRAFT / ISSUED / CANCELLED). */
  status: TaxInvoiceStatus
  /** 발행 시각 ISO 8601 — DRAFT 시 null. */
  issuedAt: string | null
  /** 발행자 (X-User-Id) — DRAFT 시 null. */
  issuedBy: string | null
  /** 취소 시각 — CANCELLED 만 채워짐. */
  cancelledAt: string | null
  /** 취소자. */
  cancelledBy: string | null
  /** 자동 분개 UUID — 화면 미노출. */
  journalId: string | null
  /** 역분개 UUID (CANCELLED) — 화면 미노출. */
  reverseJournalId: string | null
  /** 외부 e-Tax(NTS) 식별자 — 연동 후 채워짐. */
  eTaxExternalId: string | null
  /** 적요 (≤500자). */
  description: string | null
  /** 라인 목록 (lineNo 오름차순). */
  lines: TaxInvoiceLine[]
}

/**
 * 세금계산서 단건 상세 조회.
 *
 * @param id 세금계산서 UUID (path param 으로만 사용 — 화면 표시 X).
 */
export async function getTaxInvoice(id: string): Promise<TaxInvoiceDetail> {
  const res = await apiClient.get<ApiEnvelope<TaxInvoiceDetail>>(
    `/accounting/tax-invoices/${id}`,
  )
  return res.data.data
}
