/**
 * 회계 도메인 API 클라이언트 (accounting-slice-A 신규).
 *
 * 노출 endpoint:
 * - `GET    /accounting/accounts`              표준 계정과목 전체 (트리)
 * - `GET    /accounting/journals`              분개장 페이지 조회 (period/status 필터)
 * - `GET    /accounting/journals/{id}`         분개 단건 상세 (라인 포함)
 * - `POST   /accounting/journals`              신규 분개 생성 (DRAFT)
 * - `POST   /accounting/journals/{id}/post`    DRAFT → POSTED 확정
 * - `POST   /accounting/journals/{id}/reverse` POSTED → REVERSED 역분개
 * - `GET    /accounting/balances?period=YYYYMM` 시산표 조회
 *
 * UUID 비공개 가드:
 * - `Journal.id` / `JournalLine.id` UUID 는 path param 으로만 사용. 화면 표시 X
 * - 사용자에게 노출되는 식별자는 `journalNo` (예: `JV-2026/05-001`) 와
 *   `account.code` (4자리 숫자)
 */
import {
  apiClient,
  type ApiEnvelope,
  type PageResponse,
} from './client'
import type { Account, JournalStatus } from '@samhan/design-system'

export type { Account } from '@samhan/design-system'

/**
 * 분개 라인 단건 (BE `JournalLineResponse`).
 *
 * 한 라인은 차변/대변 중 정확히 한 쪽만 0 보다 크다 (BE 검증).
 */
export interface JournalLine {
  /** 라인 UUID — 화면 미노출. */
  id: string
  /** 0-based 라인 순서 (BE 가 정렬 보장). */
  lineNo: number
  /** 4자리 계정 코드. */
  accountCode: string
  /** 계정명 (BE 가 lookup 후 채움 — 표시용). */
  accountName: string | null
  /** 차변 금액 (KRW 정수, string 으로 BigDecimal 직렬화). */
  debit: string
  /** 대변 금액 (KRW 정수, string). */
  credit: string
  /** 거래처명 (자유 입력). */
  partnerName: string | null
  /** 메모. 기존 FE/fixture 필드명. */
  note: string | null
  /** 메모. 신규 BE 도메인 명칭 호환 필드. */
  memo?: string | null
}

/**
 * 분개 단건 헤더 + 라인 (BE `JournalDetailResponse`).
 */
export interface Journal {
  /** 분개 UUID — 화면 미노출. */
  id: string
  /** 사람이 읽는 분개번호 (예: `JV-2026/05-001`). */
  journalNo: string
  /** 분개 일자 (YYYY-MM-DD). */
  journalDate: string
  /** 분개 상태. */
  status: JournalStatus
  /** 적요 (분개 헤더 메모). */
  description: string | null
  /** 차변 합계 (KRW 정수, string). 라인 합산 결과를 BE 가 캐시. */
  totalDebit: string
  /** 대변 합계 (KRW 정수, string). totalDebit 과 동일해야 POSTED 가능. */
  totalCredit: string
  /** 작성자 fullName. */
  createdByName: string | null
  /** 작성 시각 ISO 8601. */
  createdAt: string
  /** 확정 시각 (POSTED 도달 시점), 미확정 시 null. */
  postedAt: string | null
  /** 역분개 시각 (REVERSED 도달 시점), 정상 분개는 null. */
  reversedAt: string | null
  /** 역분개 사유. REVERSED 만 채워짐. */
  reverseReason: string | null
  /** 라인 목록 (lineNo 오름차순). */
  lines: JournalLine[]
  /** Optimistic lock version. */
  version: number
}

/**
 * 분개장 목록용 요약 (라인 미포함).
 *
 * 페이지 응답 `content[]` 에 사용. 라인 합계만 표시.
 */
export interface JournalSummary {
  id: string
  journalNo: string
  journalDate: string
  status: JournalStatus
  description: string | null
  totalDebit: string
  totalCredit: string
  createdByName: string | null
}

/**
 * 분개장 페이지 조회 옵션.
 */
export interface ListJournalsOptions {
  /** 회계 월 (YYYYMM). 미지정 시 전체. */
  period?: string
  /** 상태 필터. 미지정 시 전체. */
  status?: JournalStatus
  /** 0-based 페이지 번호 (기본 0). */
  page?: number
  /** 페이지 크기 (기본 20). */
  size?: number
}

/**
 * 분개 신규 생성 요청 body (BE `CreateJournalRequest`).
 *
 * 라인 검증 규칙 (BE):
 * - 최소 2 라인
 * - 각 라인: debit / credit 중 정확히 한 쪽만 > 0
 * - sum(debit) == sum(credit)
 */
export interface CreateJournalRequest {
  journalDate: string
  description?: string
  lines: Array<{
    accountCode: string
    debit: string
    credit: string
    partnerName?: string
    note?: string
  }>
}

/**
 * 시산표 1행 — 계정별 기간 합계 (BE `TrialBalanceRow`).
 *
 * `openingBalance` + `periodDebit` - `periodCredit` = `closingBalance` (대변 계정은 부호 반전).
 */
export interface TrialBalanceRow {
  /** 4자리 계정 코드. */
  accountCode: string
  /** 계정명. */
  accountName: string
  /** 카테고리 (100/200/300/400/500/800/900). */
  category: string
  /** 기초 잔액 (전월 이월). */
  openingBalance: string
  /** 당월 차변 합계. */
  periodDebit: string
  /** 당월 대변 합계. */
  periodCredit: string
  /** 기말 잔액. */
  closingBalance: string
}

/**
 * 시산표 summary — 총 차변/대변/일치 여부 (BE `TrialBalanceSummary`).
 *
 * P0-1 Slice A 보강 — `TrialBalanceResponse.summary` 필드. 옵셔널로 선언하여
 * 기존 mock fixture 와의 하위 호환을 유지한다.
 */
export interface TrialBalanceSummary {
  totalDebit: string
  totalCredit: string
  balanced: boolean
}

/**
 * 시산표 응답 (BE `TrialBalanceResponse`).
 */
export interface TrialBalance {
  /** 회계 월 (YYYYMM). */
  period: string
  /** 행 목록 (계정 코드 오름차순). */
  rows: TrialBalanceRow[]
  /** 차변 총합 (정합성 검증용). */
  totalDebit: string
  /** 대변 총합 (= totalDebit 이어야 함). */
  totalCredit: string
  /** 마감 여부 (당월이 closed 인지). 본 슬라이스 기본 false. */
  closed: boolean
  /**
   * P0-1 Slice A 보강 — 총 차변/대변/일치 여부 요약. 기존 호출자 호환을 위해 옵셔널.
   */
  summary?: TrialBalanceSummary
}

/**
 * 표준 계정과목 전체 조회 — 트리 표시용.
 *
 * BE 가 한국 일반기업회계기준 시드 (~50개) 를 그대로 반환. 카테고리 prefix 별로
 * AccountCodeSelect 가 자체 그룹화 처리.
 */
export async function listAccounts(): Promise<Account[]> {
  const res = await apiClient.get<ApiEnvelope<Account[]>>('/accounting/accounts')
  return res.data.data
}

/**
 * 분개장 페이지 조회. 빈 옵션 시 최신 20건.
 */
export async function listJournals(
  options: ListJournalsOptions = {},
): Promise<PageResponse<JournalSummary>> {
  const params: Record<string, string | number> = {
    page: options.page ?? 0,
    size: options.size ?? 20,
  }
  if (options.period) params['period'] = options.period
  if (options.status) params['status'] = options.status

  const res = await apiClient.get<ApiEnvelope<PageResponse<JournalSummary>>>(
    '/accounting/journals',
    { params },
  )
  return res.data.data
}

/**
 * 분개 단건 상세 조회 — 라인 포함.
 *
 * @param id 분개 UUID (path param 으로만 사용, 화면 표시 X)
 */
export async function getJournal(id: string): Promise<Journal> {
  const res = await apiClient.get<ApiEnvelope<Journal>>(
    `/accounting/journals/${id}`,
  )
  return res.data.data
}

/**
 * 신규 분개 생성. 응답은 라인 포함 상세 (status=DRAFT).
 *
 * BE 가 라인 검증 (sum 일치 + 최소 2 라인) 을 수행. 실패 시 422.
 */
export async function createJournal(
  body: CreateJournalRequest,
): Promise<Journal> {
  const res = await apiClient.post<ApiEnvelope<Journal>>(
    '/accounting/journals',
    body,
  )
  return res.data.data
}

/**
 * DRAFT → POSTED 확정. 라인 합계 검증 + 원장 반영. 이후 수정 불가.
 *
 * BE 가 sum(debit) == sum(credit) 재검증. 불일치 시 422.
 */
export async function postJournal(id: string): Promise<Journal> {
  const res = await apiClient.post<ApiEnvelope<Journal>>(
    `/accounting/journals/${id}/post`,
    {},
  )
  return res.data.data
}

/**
 * POSTED → REVERSED 역분개. 원본은 보관, 대응 분개 1건이 자동 생성된다.
 *
 * @param id     원본 분개 UUID
 * @param reason 역분개 사유 (필수, ≥2자)
 */
export async function reverseJournal(
  id: string,
  reason: string,
): Promise<Journal> {
  const res = await apiClient.post<ApiEnvelope<Journal>>(
    `/accounting/journals/${id}/reverse`,
    { reason },
  )
  return res.data.data
}

/**
 * 시산표 조회 — 단일 회계월.
 *
 * @param period YYYYMM (예: `202605`). BE 가 해당 월 분개를 합산.
 */
export async function getTrialBalance(period: string): Promise<TrialBalance> {
  const res = await apiClient.get<ApiEnvelope<TrialBalance>>(
    '/accounting/balances',
    { params: { period } },
  )
  return res.data.data
}

// ==========================================================================
// P0-1 Slice A: 3대 재무 보고서 API (손익계산서 / 재무상태표)
// ==========================================================================

/**
 * 손익계산서 / 재무상태표 개별 라인 항목.
 *
 * `amount` 는 KRW 정수 (BigDecimal → string 직렬화). 음수 = 비용/부채.
 */
export interface FinancialStatementLine {
  /** 4자리 계정 코드. */
  accountCode: string
  /** 계정명 (한국어 표준 계정명). */
  accountName: string
  /** 카테고리 prefix (100/200/300/400/500/800/900). */
  category: string
  /** 금액 (KRW 정수, string). */
  amount: string
  /** 표시 순서 (오름차순). */
  sortOrder: number
}

/**
 * 손익계산서 응답 (BE `IncomeStatementResponse`).
 *
 * 한국 일반기업회계기준 형식 — 매출 → 매출원가 → 매출총이익 → 판관비 → 영업이익
 * → 영업외 → 법인세차감전순이익 → 법인세 → 당기순이익.
 */
export interface IncomeStatementResponse {
  /** 회계 월 (YYYYMM). */
  period: string
  /** 기간 시작일 (YYYY-MM-DD). */
  fromDate: string
  /** 기간 종료일 (YYYY-MM-DD). */
  toDate: string
  /** 매출액 라인. */
  revenue: FinancialStatementLine[]
  /** 매출원가 라인. */
  costOfSales: FinancialStatementLine[]
  /** 매출총이익 (KRW 정수, string). */
  grossProfit: string
  /** 판매비와관리비 라인. */
  sga: FinancialStatementLine[]
  /** 영업이익 (KRW 정수, string). */
  operatingProfit: string
  /** 영업외수익/비용 라인 (amount 양수 = 수익, 음수 = 비용). */
  nonOperating: FinancialStatementLine[]
  /** 법인세차감전순이익 (KRW 정수, string). */
  incomeBeforeTax: string
  /** 법인세비용 (KRW 정수, string). */
  incomeTax: string
  /** 당기순이익 (KRW 정수, string). */
  netIncome: string
  /** 보고서 생성 시각 ISO 8601. */
  generatedAt: string
}

/**
 * 재무상태표 라인 항목 (자산 / 부채 / 자본 공통).
 */
export interface BalanceSheetLine {
  /** 4자리 계정 코드. */
  accountCode: string
  /** 계정명 (한국어 표준 계정명). */
  accountName: string
  /** 카테고리 (100=자산, 200=부채, 300=자본). */
  category: string
  /** 금액 (KRW 정수, string). */
  amount: string
  /** 표시 순서 (오름차순). */
  sortOrder: number
}

/**
 * 재무상태표 응답 (BE `BalanceSheetResponse`).
 *
 * 한국 일반기업회계기준 형식 — 자산 (유동/비유동) / 부채 (유동/비유동) / 자본.
 * `balanced=true` 이면 `totalAssets == totalLiabilitiesAndEquity`.
 */
export interface BalanceSheetResponse {
  /** 기준일 (YYYY-MM-DD). */
  asOfDate: string
  /** 자산 라인 목록. */
  assets: BalanceSheetLine[]
  /** 자산 총계 (KRW 정수, string). */
  totalAssets: string
  /** 부채 라인 목록. */
  liabilities: BalanceSheetLine[]
  /** 부채 총계 (KRW 정수, string). */
  totalLiabilities: string
  /** 자본 라인 목록. */
  equity: BalanceSheetLine[]
  /** 자본 총계 (KRW 정수, string). */
  totalEquity: string
  /** 부채 + 자본 합계 (= totalAssets 이어야 함). */
  totalLiabilitiesAndEquity: string
  /** 자산 = 부채+자본 일치 여부. false 시 분개 오류 경고 배너 표시. */
  balanced: boolean
  /** 보고서 생성 시각 ISO 8601. */
  generatedAt: string
}

/**
 * 손익계산서 조회.
 *
 * @param period 회계 월 (YYYYMM, 예: `202605`). BE 가 해당 월 분개 합산.
 * @returns `IncomeStatementResponse` (BE `IncomeStatementController.byPeriod`)
 */
export async function getIncomeStatement(
  period: string,
): Promise<IncomeStatementResponse> {
  const res = await apiClient.get<ApiEnvelope<IncomeStatementResponse>>(
    '/accounting/reports/income-statement',
    { params: { period } },
  )
  return res.data.data
}

/**
 * 재무상태표 조회.
 *
 * @param asOfDate 기준일 (YYYY-MM-DD, 예: `2026-04-30`). BE 가 해당일 잔액 집계.
 * @returns `BalanceSheetResponse` (BE `BalanceSheetController.byDate`)
 */
export async function getBalanceSheet(
  asOfDate: string,
): Promise<BalanceSheetResponse> {
  const res = await apiClient.get<ApiEnvelope<BalanceSheetResponse>>(
    '/accounting/reports/balance-sheet',
    { params: { asOfDate } },
  )
  return res.data.data
}

// ==========================================================================
// P0-1 Slice B: 세금/거래처 보고서 API (부가세 / 법인세 / 거래처별 미수미지급)
// ==========================================================================

/**
 * 부가세 신고서 응답 (BE `VatReportResponse`).
 *
 * 한국 부가가치세법 표준 형식 — 매출 VAT / 매입 VAT / 납부세액.
 * UUID 비공개 가드: 이 DTO 에 UUID 필드 없음.
 *
 * TM 통합 검증 fix (PR #136 BE-FE 계약 정렬):
 * - 기존 `dueDate` → BE `filingDeadline` 으로 정정.
 * - 기존 `period` 는 BE 가 "YYYY-MM" 또는 "YYYY-MM ~ YYYY-MM" 라벨 형식으로 반환 (YYYYMM 아님).
 * - `salesTotalAmount` / `purchaseTotalAmount` 필드 추가 (BE 가 계산하여 내려줌).
 */
export interface VatReportResponse {
  /** 표시 기간 라벨 (예: "2026-04" 또는 "2026-01 ~ 2026-03"). */
  period: string
  /** 신고 기간 시작일 (YYYY-MM-DD). */
  fromDate: string
  /** 신고 기간 종료일 (YYYY-MM-DD). */
  toDate: string
  /** 매출 공급가액 합계 (KRW 정수, string). */
  salesSupplyAmount: string
  /** 매출 부가세 합계 (KRW 정수, string). */
  salesVatAmount: string
  /** 매출 총액 = 공급가액 + 부가세 (BE 가 계산, KRW 정수, string). */
  salesTotalAmount: string
  /** 매출 세금계산서 발행 매수. */
  salesInvoiceCount: number
  /** 매입 공급가액 합계 (KRW 정수, string). */
  purchaseSupplyAmount: string
  /** 매입 부가세 합계 (KRW 정수, string). */
  purchaseVatAmount: string
  /** 매입 총액 = 공급가액 + 부가세 (BE 가 계산, KRW 정수, string). */
  purchaseTotalAmount: string
  /** 매입 세금계산서 수취 매수. */
  purchaseInvoiceCount: number
  /**
   * 납부세액 = 매출VAT − 매입VAT (KRW 정수, string).
   * 음수 시 환급세액.
   */
  vatPayable: string
  /** 신고 기한 (YYYY-MM-DD) — BE `filingDeadline` 필드. */
  filingDeadline: string
  /** 보고서 생성 시각 ISO 8601. */
  generatedAt: string
}

/**
 * 법인세 신고서 응답 (BE `CorporateTaxReportResponse`).
 *
 * 한국 법인세법 표준 계산 형식 (단계별 세율 9% / 19% / 21% / 24%).
 *
 * TM 통합 검증 fix (PR #136 BE-FE 계약 정렬):
 * - `addBack` → `addedDeductions`
 * - `deductions` → `subtractedDeductions`
 * - `prepaidTax` → `taxAlreadyPaid`
 * - `dueDate` → `filingDeadline`
 * - `fromDate` / `toDate` 신규 (BE 가 사업연도 1월 1일 / 12월 31일 반환).
 */
export interface CorporateTaxReportResponse {
  /** 사업연도 (YYYY). */
  fiscalYear: number
  /** 사업연도 시작 일자 (YYYY-MM-DD). */
  fromDate: string
  /** 사업연도 종료 일자 (YYYY-MM-DD). */
  toDate: string
  /** 법인세차감전순이익 (KRW 정수, string). */
  incomeBeforeTax: string
  /** 가산조정 합계 (KRW 정수, string) — BE `addedDeductions`. */
  addedDeductions: string
  /** 차감조정 합계 (KRW 정수, string) — BE `subtractedDeductions`. */
  subtractedDeductions: string
  /** 과세표준 (KRW 정수, string). */
  taxableIncome: string
  /** 산출세액 (KRW 정수, string). */
  calculatedTax: string
  /** 기납부세액 (KRW 정수, string) — BE `taxAlreadyPaid`. */
  taxAlreadyPaid: string
  /**
   * 차감납부세액 (KRW 정수, string).
   * 음수 시 환급.
   */
  taxPayable: string
  /** 신고 기한 (YYYY-MM-DD) — BE `filingDeadline` 필드. */
  filingDeadline: string
  /** 보고서 생성 시각 ISO 8601. */
  generatedAt: string
}

/**
 * 거래처별 미수/미지급 내역 1행 (BE `PartnerAgingLine`).
 *
 * UUID 비공개 가드: `partnerId` 는 내부 참조용. 화면 미노출.
 * 사용자 노출 식별자: `partnerCode` / `partnerName` 만.
 */
export interface PartnerAgingLine {
  /** 거래처 코드 (화면 표시 OK). */
  partnerCode: string
  /** 거래처명 (화면 표시 OK). */
  partnerName: string
  /** 잔액 (KRW 정수, string). */
  balance: string
  /** 가장 오래된 미결제 일자 (YYYY-MM-DD). */
  oldestUnpaidDate: string | null
  /** 연체일수 (0 이상 정수). */
  agingDays: number
  /**
   * 거래처 UUID — 내부 참조용. 화면 절대 노출 금지 (feedback_uuid_no_user_visibility).
   * @internal
   */
  partnerId: string
}

/**
 * 거래처별 미수/미지급 응답 (BE `PartnerAgingResponse`).
 */
export interface PartnerAgingResponse {
  /** 채권/채무 구분. */
  type: 'RECEIVABLE' | 'PAYABLE'
  /** 계정과목 코드 (3자리). */
  accountCode: string
  /** 계정과목명. */
  accountName: string
  /** 기준일 (YYYY-MM-DD). */
  asOfDate: string
  /** 조회된 거래처 수. */
  partnerCount: number
  /** 잔액 총합 (KRW 정수, string). */
  totalAmount: string
  /** 거래처별 행 목록. */
  lines: PartnerAgingLine[]
  /** 보고서 생성 시각 ISO 8601. */
  generatedAt: string
}

/**
 * 부가세 신고서 조회.
 *
 * @param period 신고 기간 (YYYYMM, 예: `202604`).
 * @returns `VatReportResponse`
 */
export async function getVatReport(period: string): Promise<VatReportResponse> {
  const res = await apiClient.get<ApiEnvelope<VatReportResponse>>(
    '/accounting/reports/vat',
    { params: { period } },
  )
  return res.data.data
}

/**
 * 법인세 신고서 조회.
 *
 * @param fiscalYear 사업연도 (YYYY 정수).
 * @returns `CorporateTaxReportResponse`
 */
export async function getCorporateTaxReport(
  fiscalYear: number,
): Promise<CorporateTaxReportResponse> {
  const res = await apiClient.get<ApiEnvelope<CorporateTaxReportResponse>>(
    '/accounting/reports/corporate-tax',
    { params: { fiscalYear } },
  )
  return res.data.data
}

/**
 * 거래처별 미수/미지급 잔액 조회.
 *
 * @param asOfDate 기준일 (YYYY-MM-DD).
 * @param type     `'RECEIVABLE'` = 미수금, `'PAYABLE'` = 미지급금.
 * @returns `PartnerAgingResponse`
 */
export async function getPartnerAging(
  asOfDate: string,
  type: 'RECEIVABLE' | 'PAYABLE',
): Promise<PartnerAgingResponse> {
  const res = await apiClient.get<ApiEnvelope<PartnerAgingResponse>>(
    '/accounting/reports/partner-aging',
    { params: { asOfDate, type } },
  )
  return res.data.data
}

// ==========================================================================
// P0-1 Slice C: 분석 보고서 API (현금흐름표 / 자본변동표 / 일계표 / 월계표)
// ==========================================================================

/**
 * 현금흐름표 영업/투자/재무 개별 활동 항목.
 *
 * 한국 일반기업회계기준 직접법 현금흐름표 기준.
 * `amount` 양수 = 유입, 음수 = 유출 (KRW 정수, string 직렬화).
 */
export interface CashFlowItem {
  /** 항목명 (한국어 표준 계정명). */
  label: string
  /** 금액 (KRW 정수, string). 음수 = 유출. */
  amount: string
  /** 표시 순서 (오름차순). */
  sortOrder: number
}

/**
 * 현금흐름표 응답 (BE `CashFlowStatementResponse`).
 *
 * 한국 일반기업회계기준 — 영업활동 / 투자활동 / 재무활동 현금흐름 3분류.
 * `cashReconciled=false` 시 UI 경고 배너 표시.
 *
 * BE endpoint: `GET /api/v1/accounting/reports/cash-flow?period=YYYYMM`
 */
export interface CashFlowStatementResponse {
  /** 회계 월 (YYYYMM). */
  period: string
  /** 기간 시작일 (YYYY-MM-DD). */
  fromDate: string
  /** 기간 종료일 (YYYY-MM-DD). */
  toDate: string
  /** 당기순이익 (KRW 정수, string). */
  netIncome: string
  /** 영업활동 조정 항목 목록. */
  operatingAdjustments: CashFlowItem[]
  /** 영업활동 현금흐름 합계 (KRW 정수, string). */
  cashFromOperating: string
  /** 투자활동 항목 목록. */
  investingActivities: CashFlowItem[]
  /** 투자활동 현금흐름 합계 (KRW 정수, string). */
  cashFromInvesting: string
  /** 재무활동 항목 목록. */
  financingActivities: CashFlowItem[]
  /** 재무활동 현금흐름 합계 (KRW 정수, string). */
  cashFromFinancing: string
  /** 현금 순증감 = CFO + CFI + CFF (KRW 정수, string). */
  netCashFlow: string
  /** 기초 현금 (KRW 정수, string). */
  beginningCash: string
  /** 기말 현금 (KRW 정수, string). */
  endingCash: string
  /** 기말현금 일치 여부 (기초+순증감 = 기말). false 시 경고 배너 표시. */
  cashReconciled: boolean
}

/**
 * 자본변동표 응답 (BE `EquityChangesResponse`).
 *
 * 한국 일반기업회계기준 — 자본금 / 이익잉여금 / 자본총계 기초→증감→기말 표.
 *
 * BE endpoint: `GET /api/v1/accounting/reports/equity-changes?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD`
 */
export interface EquityChangesResponse {
  /** 기간 시작일 (YYYY-MM-DD). */
  fromDate: string
  /** 기간 종료일 (YYYY-MM-DD). */
  toDate: string
  /** 자본금 — 기초 잔액 (KRW 정수, string). */
  beginningCapitalStock: string
  /** 자본금 — 당기 증가 (KRW 정수, string). */
  capitalStockIncrease: string
  /** 자본금 — 당기 감소 (KRW 정수, string). */
  capitalStockDecrease: string
  /** 자본금 — 기말 잔액 (KRW 정수, string). */
  endingCapitalStock: string
  /** 이익잉여금 — 기초 잔액 (KRW 정수, string). */
  beginningRetainedEarnings: string
  /** 이익잉여금 — 당기순이익 (KRW 정수, string). */
  netIncome: string
  /** 이익잉여금 — 배당금 (KRW 정수, string). 음수 = 유출. */
  dividends: string
  /** 이익잉여금 — 기말 잔액 (KRW 정수, string). */
  endingRetainedEarnings: string
  /** 자본 총계 변동 (KRW 정수, string). */
  totalChange: string
}

/**
 * 일계표 / 월계표 계정별 차/대 합계 행 (BE `AccountSummaryLine`).
 *
 * B-1 fix (PR #137): 기존 `AccountSummaryItem { category, totalDebit, totalCredit, balance, sortOrder }`
 * → BE record 실제 필드 `{ accountCode, accountName, debitTotal, creditTotal }` 로 정렬.
 * - `category` / `balance` / `sortOrder` 필드 BE 미제공 → 화면 측 클라이언트 산출.
 */
export interface AccountSummaryLine {
  /** 4자리 계정 코드. */
  accountCode: string
  /** 계정명 (한국어 표준). */
  accountName: string
  /** 차변 합계 (KRW 정수, string) — BE 필드명 `debitTotal`. */
  debitTotal: string
  /** 대변 합계 (KRW 정수, string) — BE 필드명 `creditTotal`. */
  creditTotal: string
}

/**
 * @deprecated PR #137 fix 이전 별칭. 신규 코드에서는 `AccountSummaryLine` 사용.
 */
export type AccountSummaryItem = AccountSummaryLine

/**
 * 월계표 일별 소계 행 (BE `DailyBreakdownLine`).
 *
 * B-3 fix (PR #137): 기존 `DailyBreakdownItem { date, totalDebit, totalCredit }`
 * → BE record 실제 필드 `{ journalDate, journalCount, debitTotal, creditTotal }` 로 정렬.
 */
export interface DailyBreakdownLine {
  /** 일자 (YYYY-MM-DD) — BE 필드명 `journalDate`. */
  journalDate: string
  /** 당일 분개 건수. */
  journalCount: number
  /** 당일 차변 합계 (KRW 정수, string) — BE 필드명 `debitTotal`. */
  debitTotal: string
  /** 당일 대변 합계 (KRW 정수, string) — BE 필드명 `creditTotal`. */
  creditTotal: string
}

/**
 * @deprecated PR #137 fix 이전 별칭. 신규 코드에서는 `DailyBreakdownLine` 사용.
 */
export type DailyBreakdownItem = DailyBreakdownLine

/**
 * 일계표 응답 (BE `DailySummaryResponse`).
 *
 * 특정 일자의 분개 건수 + 계정별 차/대변 합계.
 *
 * BE endpoint: `GET /api/v1/accounting/reports/daily-summary?date=YYYY-MM-DD`
 *
 * B-1 fix (PR #137): 기존 `date` → BE `summaryDate`, 기존 `accountSummary[]` → BE `accountTotals[]`.
 */
export interface DailySummaryResponse {
  /** 조회 일자 (YYYY-MM-DD) — BE 필드명 `summaryDate`. */
  summaryDate: string
  /** 당일 분개 건수. */
  journalCount: number
  /** 당일 총 차변 합계 (KRW 정수, string). */
  totalDebit: string
  /** 당일 총 대변 합계 (KRW 정수, string). */
  totalCredit: string
  /** 차변/대변 균형 여부. */
  balanced: boolean
  /** 계정별 요약 목록 — BE 필드명 `accountTotals`. */
  accountTotals: AccountSummaryLine[]
  /** 보고서 생성 시각 ISO 8601. */
  generatedAt: string
}

/**
 * 월계표 응답 (BE `MonthlySummaryResponse`).
 *
 * 회계 월 기준 분개 + 일별 breakdown.
 *
 * BE endpoint: `GET /api/v1/accounting/reports/monthly-summary?period=YYYYMM`
 *
 * B-3 fix (PR #137): BE record 에 accountSummary 없음 — dailyBreakdown 만 제공.
 * period 는 BE 라벨 형식 (예: "2026-01"). yearMonth 필드 추가.
 */
export interface MonthlySummaryResponse {
  /** 표시 기간 라벨 (예: "2026-01"). */
  period: string
  /** YearMonth 직렬화 (예: "2026-01"). */
  yearMonth: string
  /** 기간 시작일 (YYYY-MM-DD). */
  fromDate: string
  /** 기간 종료일 (YYYY-MM-DD). */
  toDate: string
  /** 당월 총 분개 건수. */
  journalCount: number
  /** 당월 총 차변 합계 (KRW 정수, string). */
  totalDebit: string
  /** 당월 총 대변 합계 (KRW 정수, string). */
  totalCredit: string
  /** 차변/대변 균형 여부. */
  balanced: boolean
  /** 일별 분해 목록 (날짜 오름차순). */
  dailyBreakdown: DailyBreakdownLine[]
  /** 보고서 생성 시각 ISO 8601. */
  generatedAt: string
}

/**
 * 현금흐름표 조회.
 *
 * @param period 회계 월 (YYYYMM, 예: `202605`). BE 가 해당 월 현금흐름 집계.
 * @returns `CashFlowStatementResponse` (BE `CashFlowStatementController.byPeriod`)
 */
export async function getCashFlowStatement(
  period: string,
): Promise<CashFlowStatementResponse> {
  const res = await apiClient.get<ApiEnvelope<CashFlowStatementResponse>>(
    '/accounting/reports/cash-flow',
    { params: { period } },
  )
  return res.data.data
}

/**
 * 자본변동표 조회.
 *
 * @param fromDate 기간 시작일 (YYYY-MM-DD, 예: `2026-01-01`).
 * @param toDate   기간 종료일 (YYYY-MM-DD, 예: `2026-12-31`).
 * @returns `EquityChangesResponse` (BE `EquityChangesController.byDateRange`)
 */
export async function getEquityChanges(
  fromDate: string,
  toDate: string,
): Promise<EquityChangesResponse> {
  const res = await apiClient.get<ApiEnvelope<EquityChangesResponse>>(
    '/accounting/reports/equity-changes',
    { params: { fromDate, toDate } },
  )
  return res.data.data
}

/**
 * 일계표 조회.
 *
 * @param date 조회 일자 (YYYY-MM-DD, 예: `2026-05-10`).
 * @returns `DailySummaryResponse` (BE `DailySummaryController.byDate`)
 */
export async function getDailySummary(
  date: string,
): Promise<DailySummaryResponse> {
  const res = await apiClient.get<ApiEnvelope<DailySummaryResponse>>(
    '/accounting/reports/daily-summary',
    { params: { date } },
  )
  return res.data.data
}

/**
 * 월계표 조회.
 *
 * @param period 회계 월 (YYYYMM, 예: `202605`). BE 가 해당 월 합계 집계.
 * @returns `MonthlySummaryResponse` (BE `MonthlySummaryController.byPeriod`)
 */
export async function getMonthlySummary(
  period: string,
): Promise<MonthlySummaryResponse> {
  const res = await apiClient.get<ApiEnvelope<MonthlySummaryResponse>>(
    '/accounting/reports/monthly-summary',
    { params: { period } },
  )
  return res.data.data
}

// ==========================================================================
// SP-08-6-5 P2: 일마감 (DailyClosing) + 원장 (GeneralLedger) API
// ==========================================================================

/**
 * 일마감 단건 응답 (BE `DailyClosingResponse`).
 *
 * UUID 비공개 가드:
 * - BE DTO 에 UUID 없음. 비즈니스 식별자 `closingDate` + `partnerCode` 만 노출.
 *
 * BE 필드 정합 (1c fix):
 * - `closingDate` / `partnerCode` / `totalSupply` / `totalVat` / `totalAmount`
 * - `slipCount` / `isLocked` / `lockedAt` / `lockedBy`
 * - `status` 는 BE 미제공 — `isLocked` boolean 에서 UI 파생.
 */
export type DailyClosingKind = 'SALES' | 'PURCHASE'
export type DailyClosingSourceKind = 'TAX_INVOICE' | 'SALES_SLIP' | 'PURCHASE_SLIP'

export interface DailyClosing {
  closingKind: DailyClosingKind
  sourceKind: DailyClosingSourceKind
  /** 마감 대상 일자 (YYYY-MM-DD). */
  closingDate: string
  /** 거래처 코드 필터 (단일 거래처 마감 시 채워짐, null = 전체). */
  partnerCode: string | null
  /** 공급가액 합계 (KRW BigDecimal — string). */
  totalSupply: string
  /** 세액 합계 (KRW BigDecimal — string). */
  totalVat: string
  /** 합계금액 (KRW BigDecimal — string). */
  totalAmount: string
  /** 마감 건수 (전표 건수). */
  slipCount: number
  /** 잠금 여부 (true = 마감 완료). */
  isLocked: boolean
  /** 잠금 시각 ISO 8601. 잠금 전 null. */
  lockedAt: string | null
  /** 잠금 실행자 user-id. 잠금 전 null. */
  lockedBy: string | null
}

/**
 * 일마감 조회 옵션.
 *
 * BE query param: `from` / `to` (YYYY-MM-DD, 필수). `partnerCode` 선택.
 */
export interface ListDailyClosingsOptions {
  /** 시작 일자 (YYYY-MM-DD). BE param: `from`. */
  from: string
  /** 종료 일자 (YYYY-MM-DD). BE param: `to`. */
  to: string
  /** 거래처 코드 필터. */
  partnerCode?: string
  closingKind?: DailyClosingKind
  sourceKind?: DailyClosingSourceKind
  /** 페이지 번호 (0-based, 기본 0). */
  page?: number
  /** 페이지 크기 (기본 20). */
  size?: number
}

/**
 * 일마감 실행 요청 body (BE `CreateDailyClosingRequest`).
 */
export interface CreateDailyClosingRequest {
  /** 마감 대상 일자 (YYYY-MM-DD). */
  closingDate: string
  /** 거래처 코드 (선택 — 미지정 시 해당일 전체 마감). */
  partnerCode?: string
  /** 메모 (선택, ≤500자). */
  description?: string
  closingKind?: DailyClosingKind
  sourceKind?: DailyClosingSourceKind
}

/**
 * 일마감 목록 조회 — `Page<DailyClosingResponse>`.
 *
 * BE endpoint: `GET /api/v1/accounting/daily-closings?from=...&to=...`
 * 응답: `ApiResponse<Page<DailyClosingResponse>>` — `data.content[]` 에 실제 행.
 */
export async function listDailyClosings(
  options: ListDailyClosingsOptions,
): Promise<PageResponse<DailyClosing>> {
  const params: Record<string, string | number> = {
    from: options.from,
    to: options.to,
    page: options.page ?? 0,
    size: options.size ?? 20,
  }
  if (options.partnerCode) params['partnerCode'] = options.partnerCode
  if (options.closingKind) params['kind'] = options.closingKind
  if (options.sourceKind) params['sourceKind'] = options.sourceKind
  const res = await apiClient.get<ApiEnvelope<PageResponse<DailyClosing>>>(
    '/accounting/daily-closings',
    { params },
  )
  return res.data.data
}

/**
 * 일마감 실행.
 *
 * BE endpoint: `POST /api/v1/accounting/daily-closings`
 *
 * @param body 마감 실행 요청
 * @returns 신규 생성된 DailyClosing (status=CLOSED)
 */
export async function createDailyClosing(
  body: CreateDailyClosingRequest,
): Promise<DailyClosing> {
  const res = await apiClient.post<ApiEnvelope<DailyClosing>>(
    '/accounting/daily-closings',
    body,
  )
  return res.data.data
}

/**
 * 일마감 잠금 해제 — isLocked=true → false. MASTER 권한만 (BE 403 가드).
 *
 * BE endpoint: `PATCH /api/v1/accounting/daily-closings/{closingDate}/lock`
 * body: `{ "locked": false }`
 *
 * @param closingDate 마감 날짜 (YYYY-MM-DD) — path variable
 * @param partnerCode 거래처코드 (선택 — null 이면 전체 마감 행)
 * @returns 갱신된 DailyClosing (isLocked=false)
 */
export async function reverseDailyClosing(
  closingDate: string,
  partnerCode?: string | null,
  closingKind?: DailyClosingKind,
  sourceKind?: DailyClosingSourceKind,
): Promise<DailyClosing> {
  const params: Record<string, string> = {}
  if (partnerCode) params['partnerCode'] = partnerCode
  if (closingKind) params['kind'] = closingKind
  if (sourceKind) params['sourceKind'] = sourceKind
  const res = await apiClient.patch<ApiEnvelope<DailyClosing>>(
    `/accounting/daily-closings/${closingDate}/lock`,
    { locked: false },
    { params },
  )
  return res.data.data
}

// [C5 후속 사이클2 D2-FE-001] canExecuteDailyClosing/canReverseDailyClosing role 문자열 헬퍼 제거 —
// DailyClosingPage 는 usePermissions().canAccess('accounting.daily-closing.run','create') /
// canAccess('accounting.daily-closing.unlock','update') 로 BE @RequirePermission 과 1:1 판정.

/**
 * `isLocked` → UI 상태 문자열 파생.
 *
 * BE `DailyClosingResponse` 에는 `status` 필드 없음 — `isLocked` boolean 에서 변환.
 */
export function deriveDailyClosingStatus(isLocked: boolean): 'LOCKED' | 'OPEN' {
  return isLocked ? 'LOCKED' : 'OPEN'
}

/** 일마감 상태 한국어 라벨. */
export const DAILY_CLOSING_STATUS_LABEL: Record<'LOCKED' | 'OPEN', string> = {
  LOCKED: '마감',
  OPEN: '열림',
}

// --------------------------------------------------------------------------
// 원장 (GeneralLedger) API — SP-08-6-5 P2
// --------------------------------------------------------------------------

/**
 * 원장 라인 단건 (BE `LedgerResponse.LedgerLine`).
 *
 * UUID 비공개 가드: `journalNo` 만 표시. 분개 UUID 미노출.
 *
 * BE 필드 정합:
 * - `date` (LocalDate → YYYY-MM-DD) — 분개 일자
 * - `journalNo` / `accountCode` / `partnerCode` / `description`
 * - `debit` / `credit` / `balance` (누적 잔액)
 */
export interface GeneralLedgerLine {
  /** 분개 일자 (YYYY-MM-DD) — BE 필드명 `date`. */
  date: string
  /** 사용자 노출 분개번호 (예: JV-2026/05-001). */
  journalNo: string
  /** 계정 코드. */
  accountCode: string
  /** 거래처 코드 (partnerCode, 화면 표시 OK). */
  partnerCode: string | null
  /** 적요. */
  description: string | null
  /** 차변 금액 (KRW BigDecimal — string). */
  debit: string
  /** 대변 금액 (KRW BigDecimal — string). */
  credit: string
  /** 누적 잔액 (KRW BigDecimal — string, 음수 가능) — BE 필드명 `balance`. */
  balance: string
}

/**
 * 원장 응답 (BE `LedgerResponse`).
 *
 * BE endpoint: `GET /api/v1/accounting/ledgers?from=...&to=...`
 *
 * BE 필드 정합 (1c fix):
 * - `periodFrom` / `periodTo` (LocalDate → YYYY-MM-DD)
 * - `partnerCode` (거래처코드 필터 — 전체 시 null)
 * - `totalDebit` / `totalCredit` (기간 합계)
 * - `closingBalance` (기간 말 누적 잔액)
 * - `lines[]` — `LedgerResponse.LedgerLine` 배열
 * ※ `openingBalance` / `generatedAt` 는 BE DTO 미제공.
 */
export interface GeneralLedgerResponse {
  /** 거래처 코드 필터 (전체 조회이면 null). */
  partnerCode: string | null
  /** 기간 시작 (YYYY-MM-DD) — BE 필드명 `periodFrom`. */
  periodFrom: string
  /** 기간 종료 (YYYY-MM-DD) — BE 필드명 `periodTo`. */
  periodTo: string
  /** 기간 내 차변 합계 (KRW BigDecimal — string). */
  totalDebit: string
  /** 기간 내 대변 합계 (KRW BigDecimal — string). */
  totalCredit: string
  /** 기간 말 누적 잔액 (KRW BigDecimal — string). */
  closingBalance: string
  /** 라인 목록 (date 오름차순). */
  lines: GeneralLedgerLine[]
}

/**
 * 원장 조회 옵션.
 *
 * BE query param: `from` / `to` (YYYY-MM-DD, 필수). `partnerCode` 선택.
 */
export interface GetGeneralLedgerOptions {
  /** 기간 시작 (YYYY-MM-DD, 필수) — BE param: `from`. */
  from: string
  /** 기간 종료 (YYYY-MM-DD, 필수) — BE param: `to`. */
  to: string
  /** 계정 코드 필터 (선택 — BE 미지원, 현재 사용 불가). */
  accountCode?: string
  /** 거래처 코드 필터 (선택). */
  partnerCode?: string
}

/**
 * 원장 조회.
 *
 * BE endpoint: `GET /api/v1/accounting/ledgers?from=...&to=...`
 *
 * @param options 조회 옵션 (기간 필수 `from`/`to`, 거래처 선택 필터)
 * @returns `GeneralLedgerResponse` (BE `LedgerResponse`)
 */
export async function getGeneralLedger(
  options: GetGeneralLedgerOptions,
): Promise<GeneralLedgerResponse> {
  const params: Record<string, string> = {
    from: options.from,
    to: options.to,
  }
  if (options.partnerCode) params['partnerCode'] = options.partnerCode
  const res = await apiClient.get<ApiEnvelope<GeneralLedgerResponse>>(
    '/accounting/ledgers',
    { params },
  )
  return res.data.data
}
