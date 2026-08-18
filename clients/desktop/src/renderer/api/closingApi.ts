/**
 * 매출 마감 API 클라이언트 — accounting-service `/accounting/closings/*`.
 *
 * P2-4 매출 마감 (Phase 10 Step 8) — slice 8.
 * 매뉴얼 출처: `docs/manual/02-창고/04-매출-마감.md`.
 *
 * 노출 endpoint:
 * - `POST /accounting/closings`            — 마감 실행 (DAILY/MONTHLY, ACCOUNTANT/MASTER)
 * - `GET  /accounting/closings`            — 마감 list (periodType / year filter, ACCOUNTANT/MANAGER/MASTER)
 * - `POST /accounting/closings/{id}/reverse` — 역마감 (MASTER 만)
 * - `GET  /accounting/closings/daily?date=` — 일별 세금계산서 detail (PR-E2 BE-A12, ACCOUNTANT/MANAGER/MASTER)
 *
 * BE Java 와의 매핑 (`AccountingPeriodResponse` record):
 * - `periodType`: DAILY / MONTHLY
 * - `status`:     OPEN / CLOSED
 * - `periodDate`: LocalDate (DAILY=해당일, MONTHLY=해당월 1일)
 * - 금액 필드 (`totalSales`/`totalPurchase`/`totalExpense`): BigDecimal → string 직렬화
 *
 * UUID 비공개 가드:
 * - 마감 row 의 `id` 는 reverse path param 으로만 사용. 화면 표시 X.
 * - 화면에 노출되는 식별자는 `periodType` + `periodDate` 조합 (예: "월별 2026-05-01").
 */
import { apiClient, type ApiEnvelope } from './client'

/** slip-service 일마감 원본행 — 레거시 17열 + 확장 검증값. */
export interface DailyClosingSourceRow {
  dcCondition: string | null
  slipDate: string
  seqNo: number
  warehouseName: string | null
  productName: string
  quantity: number
  unitPriceWithVat: string | number | null
  supplyAmount: string | number | null
  vatAmount: string | number | null
  /** 원천 SlipLine의 VAT 포함 line total — 회계전표 line/allocation의 정본. */
  total?: string | number | null
  partnerName: string
  partnerCode: string
  partnerId?: string | null
  slipNo?: string | null
  productCode?: string | null
  sourceLineNo?: number | null
  taxType?: 'TAXABLE' | 'ZERO_RATED' | 'EXEMPT' | null
  productPrice: string | number | null
  discountRate: string | number | null
  grandTotal: string | number | null
  confirmation: 'CONFIRMED' | 'MISMATCH' | 'UNDETERMINED'
  confirmationReason: string | null
  accountingPostedAt: string | null
  dcAmount: string | number | null
  sourceStatus: string
  /** 저장 payload 전용 식별자 — 화면에는 렌더링하지 않는다. */
  slipId?: string | null
  lineId?: string | null
  /** 낙관적 잠금 토큰 — 화면에는 렌더링하지 않는다. */
  updatedAt?: string | null
  amountEditable?: boolean
  amountEditBlockReason?: string | null
  modelName?: string | null
  categoryKey?: string | null
  deliveryPrice?: string | null
  expectedRate?: string | null
}

/** 출고일 기준으로 레거시 일마감 원본행을 조회한다. */
export async function getDailyClosingRows(
  slipDate: string,
  slipType: 'OUTBOUND' | 'INBOUND' = 'OUTBOUND',
): Promise<DailyClosingSourceRow[]> {
  const res = await apiClient.get<ApiEnvelope<DailyClosingSourceRow[]>>(
    '/slips/query/daily-closing',
    { params: { slipDate, slipType } },
  )
  return res.data.data
}

export interface DailyClosingAmountLine {
  lineId: string
  unitPriceWithVat: number
  releasePrice: number
  discountRate: number
}

/** 일마감 금액 전용 수정 — 출고가·할인율은 계산 근거이고 단가만 서버에 저장된다. */
export async function updateDailyClosingAmount(
  slipId: string,
  updatedAt: string,
  lines: DailyClosingAmountLine[],
): Promise<void> {
  await apiClient.put<ApiEnvelope<unknown>>(
    `/slips/${encodeURIComponent(slipId)}/daily-closing-amount`,
    { updatedAt, lines },
  )
}

/** 마감 기간 유형 — BE `PeriodType`. */
export type PeriodType = 'DAILY' | 'MONTHLY'

/** 마감 상태 — BE `PeriodStatus`. */
export type PeriodStatus = 'OPEN' | 'CLOSED'
export type DailyClosingKind = 'SALES' | 'PURCHASE'
export type DailyClosingSourceKind = 'TAX_INVOICE' | 'SALES_SLIP' | 'PURCHASE_SLIP'
export type DailyProductRevalidationStatus =
  | 'VERIFIED'
  | 'NOT_FOUND'
  | 'AMBIGUOUS'
  | 'MISSING_REFERENT'
  | 'MISSING_GLOBAL_DISCOUNT'
  | 'NOT_MEASURABLE'
  | 'OUT_OF_SCOPE'

/**
 * 마감 단건 응답 — BE `AccountingPeriodResponse` record.
 *
 * BigDecimal 직렬화는 Spring 기본 ObjectMapper 가 string 으로 처리.
 */
export interface AccountingPeriod {
  /** UUID — reverse 액션 path 용, 화면 미노출. */
  id: string
  /** 기간 유형. */
  periodType: PeriodType
  /** 기간 일자 (LocalDate "YYYY-MM-DD"). MONTHLY 는 1일로 normalize. */
  periodDate: string
  /** 마감 상태. */
  status: PeriodStatus
  /** 마감 시각 ISO 8601 — OPEN(역마감 후) 은 null. */
  closedAt: string | null
  /** 마감 실행자 (X-User-Id 또는 "system"). */
  closedBy: string | null
  /** 역마감 시각 — CLOSED 는 null. */
  reversedAt: string | null
  /** 역마감 실행자. */
  reversedBy: string | null
  /** 매출 합계 (KRW BigDecimal — string). */
  totalSales: string
  /** 매입 합계. */
  totalPurchase: string
  /** 판관비 합계. */
  totalExpense: string
  /** lock 처리된 슬립 건수 — slip-service.lock-by-period 응답 합계. */
  lockedSlipCount: number
  /** 마감 사유/메모 (≤500자). */
  description: string | null
}

/** 마감 실행 요청 — BE `CreateClosingRequest`. */
export interface CreateClosingRequest {
  /** 마감 유형 — DAILY / MONTHLY. */
  periodType: PeriodType
  /** 기간 일자 ("YYYY-MM-DD"). MONTHLY 는 service 가 1일로 normalize. */
  periodDate: string
  /** 마감 사유/메모 (옵션, ≤500자). */
  description?: string
}

/** 마감 list 옵션 — periodType / year. */
export interface ListClosingsOptions {
  periodType?: PeriodType
  year?: number
}

/**
 * 마감 list 조회.
 *
 * @return 마감 row 목록 (BE 가 createdAt DESC 정렬을 보장).
 */
export async function listClosings(
  options: ListClosingsOptions = {},
): Promise<AccountingPeriod[]> {
  const params: Record<string, string | number> = {}
  if (options.periodType) params['periodType'] = options.periodType
  if (options.year) params['year'] = options.year
  const res = await apiClient.get<ApiEnvelope<AccountingPeriod[]>>(
    '/accounting/closings',
    { params },
  )
  return res.data.data
}

/**
 * 마감 실행 — DAILY 또는 MONTHLY.
 *
 * BE 동작:
 * 1) slip-service.lock-by-period 호출 → 해당 기간 CONFIRMED 슬립 일괄 LOCKED
 * 2) accounting-service 가 매출/매입/판관비 합계 stamp + status=CLOSED
 * 3) 이후 분개 / 슬립 변경은 `AccountingPeriodGuard` 가 차단
 *
 * @return 신규 생성된 AccountingPeriod (status=CLOSED).
 */
export async function createClosing(
  body: CreateClosingRequest,
): Promise<AccountingPeriod> {
  const res = await apiClient.post<ApiEnvelope<AccountingPeriod>>(
    '/accounting/closings',
    body,
  )
  return res.data.data
}

/**
 * 역마감 — CLOSED → OPEN. MASTER 권한만 (BE 가 403 가드).
 *
 * @param id 마감 UUID (path param, 화면 미노출).
 * @return 갱신된 AccountingPeriod (status=OPEN, reversedAt/By stamp).
 */
export async function reverseClosing(id: string): Promise<AccountingPeriod> {
  const res = await apiClient.post<ApiEnvelope<AccountingPeriod>>(
    `/accounting/closings/${id}/reverse`,
    {},
  )
  return res.data.data
}

/**
 * 일별 세금계산서 detail 1건 — BE `DailyClosingDetailResponse.DailyTaxInvoice` record.
 *
 * UUID 비공개 가드: 식별자는 `taxInvoiceNo` (세금계산서 발행번호) — 사용자 노출 OK.
 */
export interface DailyTaxInvoiceRow {
  /** 세금계산서 발행번호 (사용자 노출 식별자). */
  taxInvoiceNo: string
  salesSlipNo: string | null
  sourceSlipNo: string | null
  /** 사업자번호 숫자 문자열. */
  bizNo: string
  /** 거래처명 (사용자 노출). */
  partnerName: string
  /** 공급가액 (KRW BigDecimal — string). */
  supplyAmount: string
  /** 세액. */
  vatAmount: string
  /** 합계. */
  totalAmount: string
}

/**
 * 일별 모델별 매출 detail — BE `DailyClosingDetailResponse.DailyProductLine` record.
 *
 * product-service 마스터 lookup 결과 (productName + modelName 사용자 노출).
 */
export interface DailyProductLine {
  /** 품명 — product-service 마스터 lookup. */
  productName: string
  /** 모델명 — BE 가 extractModelTokenOrNull 로 채움(실 모델코드만·운임/서비스 등 미매치는 null→'—'). */
  modelName: string | null
  /** 판매 당시 정규화된 GAS schedule 카테고리 축. 미상 라인은 UNKNOWN으로 별도 집계. */
  categoryKey: string
  /** 수량 (BigDecimal → Jackson 기본 JSON number). */
  quantity: number
  /** 공급가액 합 (BigDecimal → JSON number). */
  supplyAmount: number
  /** 원천 전표의 VAT 포함 실제 단가. 수량 0 등 계산 불가 시 null. */
  actualUnitPrice: number | null
  /** 적용 출고가 (BigDecimal → JSON number). 미매칭/정가결측 시 null. */
  releasePrice: number | null
  /** 적용 납품가 (BigDecimal → JSON number). 미매칭/정가결측 시 null. */
  deliveryPrice: number | null
  /** 기대 할인율(정수 %). */
  expectedRate: number | null
  /** 실제 할인율(정수 %). */
  actualRate: number | null
  /** 싱글중대형 실제 DC액(출고가 - VAT 포함 유효단가). */
  discountAmount: number | null
  /** 재검증 확인 판정. */
  verified: boolean | null
  /** 재검증 사유. */
  revalidationStatus: DailyProductRevalidationStatus | null
}

/**
 * 일별 마감 detail 응답 — BE `DailyClosingDetailResponse` record.
 *
 * legacy GAS 12번 "일마감 프로그램" — 일별 매출/세금계산서/할인 detail.
 * 마감 OPEN/CLOSED 무관 (read-only).
 */
export interface DailyClosingDetail {
  /** 대상 일자 (LocalDate "YYYY-MM-DD"). */
  date: string
  /** 발행된 세금계산서 건수 (ISSUED 상태). */
  totalTaxInvoiceCount: number
  /** 공급가액 합. */
  totalSupply: string
  /** 세액 합. */
  totalVat: string
  /** 합계. */
  totalAmount: string
  /** 할인 합 (BE placeholder 0 — 본 단계 reference). */
  totalDiscount: string
  /** 일별 세금계산서 detail (slipNo + 거래처 + 합계). */
  taxInvoices: DailyTaxInvoiceRow[]
  /** 모델별 매출 합계 (top N — BE 정렬 기준 따름). */
  productSummaries: DailyProductLine[]
}

/**
 * 일별 세금계산서 마감 detail 조회 — BE-A12.
 *
 * BE 동작: ISSUED 상태 세금계산서 + line 모델별 누적 합계 (product-service join).
 *
 * @param date "YYYY-MM-DD" (LocalDate ISO).
 * @return 일별 detail (taxInvoices + productSummaries + 합계).
 */
export async function getDailyClosingDetail(
  date: string,
  kind?: DailyClosingKind,
  sourceKind?: DailyClosingSourceKind,
): Promise<DailyClosingDetail> {
  const res = await apiClient.get<ApiEnvelope<DailyClosingDetail>>(
    '/accounting/closings/daily',
    { params: { date, kind, sourceKind } },
  )
  return res.data.data
}

// [C5 후속 사이클1 D-005] canExecuteClosing/canReverseClosing role 문자열 헬퍼 제거 —
// 호출처(SalesClosingPage/MonthEndClosingPage/PeriodCloseListPage)는
// usePermissions().canAccess('accounting.period-close','create') /
// canAccess('accounting.period-close.reverse','update') 로 BE @RequirePermission 과 1:1 판정.

/** 마감 유형 한국어 라벨. */
export const PERIOD_TYPE_LABEL: Record<PeriodType, string> = {
  DAILY: '일별',
  MONTHLY: '월별',
}

/** 마감 상태 한국어 라벨. */
export const PERIOD_STATUS_LABEL: Record<PeriodStatus, string> = {
  OPEN: '열림',
  CLOSED: '마감',
}
