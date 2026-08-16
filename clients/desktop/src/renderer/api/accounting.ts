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
 * - 사용자에게 노출되는 식별자는 `journalNo` (예: `2026/05/08-1`) 와
 *   `account.code` (4자리 숫자)
 */
import {
  apiClient,
  type ApiEnvelope,
  type PageResponse,
} from './client'
import type { Account, JournalStatus } from '@samhan/design-system'
import { extractApiErrorResponseMessage } from './apiError'
import { toOrderPathId } from '../utils/orderNo'
import { collabHeaders } from '../auth/collabHeaders'

export type { Account } from '@samhan/design-system'
export type Page<T> = PageResponse<T>

/** 영업수수료 정산서 상태. BE SalesCommissionSettlementStatus와 동일하다. */
export type SalesCommissionSettlementStatus = 'DRAFT' | 'CONFIRMED'

/** 영업수수료 정산서 응답. id는 mutation path용이며 화면에는 표시하지 않는다. */
export interface SalesCommissionSettlement {
  id: string
  documentNo: string | null
  settlementDate: string
  status: SalesCommissionSettlementStatus
  totalAmount: string | null
  payoutAmount: string | null
  supplyAmount: string | null
  vatAmount: string | null
  rateContractVersion: number | null
  equipmentAmount?: string | null
  prepaidAmount?: string | null
  installInputAmount?: string | null
  safetyInputAmount?: string | null
  paymentMethod?: 'CARD' | 'CASH' | string | null
  withholdingApplied?: boolean | null
  manualExpenseRate?: string | null
  cardAmount?: string | null
  salesAmount?: string | null
  expenseAmount?: string | null
  withholdingAmount?: string | null
  installAmount?: string | null
  safetyAmount?: string | null
  subtotalAmount?: string | null
}

/** 영업수수료 정산서 목록 조회 조건. */
export interface ListSalesCommissionSettlementsOptions {
  page?: number
  size?: number
}

/** 번호 없는 DRAFT 정산서 생성 요청. */
export interface CreateSalesCommissionSettlementRequest {
  settlementDate: string
}

export interface CalculateSalesCommissionSettlementRequest {
  total: string
  equipment: string
  prepaid: string
  install: string
  safety: string
  paymentMethod: 'CARD' | 'CASH'
  withholdingApplied: boolean
  manualExpenseRate?: string | null
  rateContractVersion: number
}

/** 영업수수료 정산서 목록을 조회한다. */
export async function listSalesCommissionSettlements(
  options: ListSalesCommissionSettlementsOptions = {},
): Promise<Page<SalesCommissionSettlement>> {
  const res = await apiClient.get<ApiEnvelope<Page<SalesCommissionSettlement>>>(
    '/accounting/sales-commission-settlements',
    { params: { page: options.page ?? 0, size: options.size ?? 20 } },
  )
  return res.data.data
}

/** 영업수수료 정산서 상세를 조회한다. */
export async function getSalesCommissionSettlement(id: string): Promise<SalesCommissionSettlement> {
  const res = await apiClient.get<ApiEnvelope<SalesCommissionSettlement>>(
    `/accounting/sales-commission-settlements/${id}`,
  )
  return res.data.data
}

/** 번호 없는 DRAFT 정산서를 생성한다. */
export async function createSalesCommissionSettlement(
  body: CreateSalesCommissionSettlementRequest,
): Promise<SalesCommissionSettlement> {
  const res = await apiClient.post<ApiEnvelope<SalesCommissionSettlement>>(
    '/accounting/sales-commission-settlements',
    body,
  )
  return res.data.data
}

/** DRAFT 정산서를 확정한다. */
export async function confirmSalesCommissionSettlement(id: string): Promise<SalesCommissionSettlement> {
  const res = await apiClient.post<ApiEnvelope<SalesCommissionSettlement>>(
    `/accounting/sales-commission-settlements/${id}/confirm`,
    {},
  )
  return res.data.data
}

/** 입력·계산 결과를 정산서 snapshot으로 저장한다. */
export async function calculateSalesCommissionSettlement(
  id: string,
  body: CalculateSalesCommissionSettlementRequest,
): Promise<SalesCommissionSettlement> {
  const res = await apiClient.post<ApiEnvelope<SalesCommissionSettlement>>(
    `/accounting/sales-commission-settlements/${id}/calculate`, body,
  )
  return res.data.data
}

/**
 * 분개 라인 단건 (BE `JournalLineResponse`).
 *
 * 한 라인은 차변/대변 중 정확히 한 쪽만 0 보다 크다 (BE 검증).
 */
export interface JournalLine {
  /** 라인 UUID — 화면 미노출. */
  id: string
  /** 1-based 라인 번호 (BE JournalLine.lineNo 그대로). */
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
  /** 사람이 읽는 분개번호 (예: `2026/05/08-1`). */
  journalNo: string
  /** 분개 일자 (YYYY-MM-DD). */
  journalDate: string
  /** 분개 상태. */
  status: JournalStatus
  /** 분개 출처. CASH_RECEIPT는 원천 입금보고서에서만 취소/수정한다. */
  sourceType: string
  /**
   * 출처 참조 UUID — SLIP/CLOSING 등은 원천 문서 UUID. CASH_RECEIPT 역분개는 원분개 Journal
   * UUID (이중 의미, BE Journal.sourceRefId 주석 참고) — CashReceipt 라우팅에는 쓰지 않는다.
   * 라우팅 전용 아님, 화면 미노출.
   */
  sourceRefId?: string | null
  /**
   * CASH_RECEIPT 원천 입금보고서 UUID 전용 링크 — 원분개/역분개 모두 BE 가 동일 CashReceipt 를
   * 채워 보낸다(#771). sourceRefId 로 fallback 하지 않는다(역분개는 sourceRefId≠CashReceipt id).
   * 화면 미노출, deep-link 라우팅 전용.
   */
  cashReceiptId?: string | null
  /** CASH_RECEIPT 원천 입금보고서 전표번호. 화면 링크 라벨에는 UUID 대신 이 값을 사용한다. */
  cashReceiptSlipNo?: string | null
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
  /**
   * 역분개 Journal UUID — 이 분개가 REVERSED 로 마킹되며 새로 생성된 역분개를 가리킨다
   * (BE `Journal.reversedJournalId`, #772 FE 동기화). 화면 미노출, 원분개→역분개 조회 전용.
   */
  reversedJournalId?: string | null
  /** 역분개 사유. REVERSED 만 채워짐. */
  reverseReason: string | null
  /** 라인 목록 (lineNo 오름차순). */
  lines: JournalLine[]
  /** Optimistic lock version. */
  version: number
}

type RawJournalLine = Partial<JournalLine> & {
  lineId?: string
  debitAmount?: string | number
  creditAmount?: string | number
  memo?: string | null
}

type RawJournal = Partial<Journal> & {
  lines?: RawJournalLine[]
}

function amountText(value: unknown): string {
  return value == null ? '0' : String(value)
}

function normalizeJournalLine(line: RawJournalLine): JournalLine {
  const memo = line.memo ?? line.note ?? null
  return {
    id: String(line.id ?? line.lineId ?? line.lineNo ?? ''),
    lineNo: Number(line.lineNo ?? 0),
    accountCode: String(line.accountCode ?? ''),
    accountName: line.accountName ?? null,
    debit: amountText(line.debit ?? line.debitAmount),
    credit: amountText(line.credit ?? line.creditAmount),
    partnerName: line.partnerName ?? null,
    note: memo,
    memo,
  }
}

export function normalizeJournal(raw: RawJournal): Journal {
  const sourceRefId = raw.sourceRefId == null ? null : String(raw.sourceRefId)
  // BE 는 CASH_RECEIPT 원분개/역분개 모두 전용 cashReceiptId 를 채워 보낸다(#771) — sourceRefId 는
  // 역분개에서 원분개 UUID 로 덮어써지는 이중 의미이므로 더 이상 fallback 하지 않는다. fallback 하면
  // 역분개 상세에서 sourceRefId(원분개 UUID)가 CashReceipt UUID 로 오인되어 잘못된 링크가 만들어진다.
  const cashReceiptId = raw.cashReceiptId == null ? null : String(raw.cashReceiptId)
  return {
    id: String(raw.id ?? ''),
    journalNo: String(raw.journalNo ?? ''),
    journalDate: String(raw.journalDate ?? ''),
    status: raw.status as JournalStatus,
    sourceType: String(raw.sourceType ?? 'MANUAL'),
    sourceRefId,
    cashReceiptId,
    cashReceiptSlipNo: raw.cashReceiptSlipNo == null ? null : String(raw.cashReceiptSlipNo),
    description: raw.description ?? null,
    totalDebit: amountText(raw.totalDebit),
    totalCredit: amountText(raw.totalCredit),
    createdByName: raw.createdByName ?? null,
    createdAt: String(raw.createdAt ?? ''),
    postedAt: raw.postedAt ?? null,
    reversedAt: raw.reversedAt ?? null,
    reversedJournalId: raw.reversedJournalId == null ? null : String(raw.reversedJournalId),
    reverseReason: raw.reverseReason ?? null,
    lines: (raw.lines ?? []).map(normalizeJournalLine),
    version: Number(raw.version ?? 0),
  }
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
    debitAmount: string
    creditAmount: string
    partnerId: string | null
    memo?: string
  }>
}

/** 분개 라인 거래처 피커 옵션. partnerId 는 저장 payload 내부용이며 화면 표시 금지. */
export interface JournalPartnerOption {
  partnerId: string
  partnerCode: string
  name: string
  bizNo?: string | null
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
 * 분개 라인 거래처 검색.
 *
 * 기존 admin 거래처 검색은 UUID 비공개로 partnerCode/name 만 반환하므로, 분개 저장에 필요한
 * partnerId 는 accounting-service proxy endpoint 에서 내부 token lookup 결과만 받는다.
 * 화면에는 name/partnerCode 만 표시하고 partnerId 는 POST body 조립에만 사용한다.
 */
export async function searchJournalPartners(q: string): Promise<JournalPartnerOption[]> {
  if (!q.trim()) return []
  const res = await apiClient.get<ApiEnvelope<JournalPartnerOption[]>>(
    '/accounting/partners/search',
    { params: { q, limit: 20 } },
  )
  return res.data.data ?? []
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
  const res = await apiClient.get<ApiEnvelope<RawJournal>>(
    `/accounting/journals/${id}`,
  )
  return normalizeJournal(res.data.data)
}

/**
 * 신규 분개 생성. 응답은 라인 포함 상세 (status=DRAFT).
 *
 * BE 가 라인 검증 (sum 일치 + 최소 2 라인) 을 수행. 실패 시 422.
 */
export async function createJournal(
  body: CreateJournalRequest,
): Promise<Journal> {
  const res = await apiClient.post<ApiEnvelope<RawJournal>>(
    '/accounting/journals',
    body,
  )
  return normalizeJournal(res.data.data)
}

/**
 * DRAFT → POSTED 확정. 라인 합계 검증 + 원장 반영. 이후 수정 불가.
 *
 * BE 가 sum(debit) == sum(credit) 재검증. 불일치 시 422.
 */
export async function postJournal(id: string): Promise<Journal> {
  try {
    const res = await apiClient.post<ApiEnvelope<RawJournal>>(
      `/accounting/journals/${id}/post`,
      {},
    )
    return normalizeJournal(res.data.data)
  } catch (err) {
    const message = extractApiErrorResponseMessage(err)
    if (message) {
      throw new Error(message)
    }
    throw err
  }
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
  try {
    const res = await apiClient.post<ApiEnvelope<RawJournal>>(
      `/accounting/journals/${id}/reverse`,
      { reason },
    )
    return normalizeJournal(res.data.data)
  } catch (err) {
    const message = extractApiErrorResponseMessage(err)
    if (message) {
      throw new Error(message)
    }
    throw err
  }
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

export type TrialBalanceGranularity = 'DAY' | 'MONTH' | 'RANGE'

/**
 * 합계잔액시산표 1행.
 *
 * eCount 표준 4컬럼: 차변잔액 / 차변합계 / 대변합계 / 대변잔액.
 */
export interface TrialBalanceSummaryLine {
  accountCode: string
  accountName: string
  category: string
  categoryDisplayName: string
  openingBalance: string
  debitBalance: string
  debitTotal: string
  creditTotal: string
  creditBalance: string
  closingBalance: string
}

/**
 * 합계잔액시산표 총계.
 */
export interface TrialBalanceSummaryTotals {
  openingBalanceTotal: string
  debitBalanceTotal: string
  debitTotal: string
  creditTotal: string
  creditBalanceTotal: string
  closingBalanceTotal: string
  /** 차변 잔액 컬럼 합계와 대변 잔액 컬럼 합계 일치 여부. */
  balanced: boolean
}

/**
 * 합계잔액시산표 응답.
 */
export interface TrialBalanceSummaryResponse {
  fromDate: string
  toDate: string
  granularity: TrialBalanceGranularity
  rows: TrialBalanceSummaryLine[]
  totals: TrialBalanceSummaryTotals
  generatedAt: string
}

/**
 * 합계잔액시산표 조회.
 *
 * BE endpoint: `GET /accounting/reports/trial-balance/summary?from&to&granularity`.
 * 권한은 트라이얼밸런스 화면과 동일한 `accounting.balances` VIEW 를 사용한다.
 */
export async function getTrialBalanceSummary(
  from: string,
  to: string,
  granularity: TrialBalanceGranularity,
): Promise<TrialBalanceSummaryResponse> {
  const res = await apiClient.get<ApiEnvelope<TrialBalanceSummaryResponse>>(
    '/accounting/reports/trial-balance/summary',
    { params: { from, to, granularity } },
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

export type MonthlyIncomeStatementRowKind = 'ACCOUNT' | 'SUBTOTAL' | 'TOTAL'

export interface MonthlyIncomeStatementLine {
  rowKind: MonthlyIncomeStatementRowKind
  section: string
  accountCode: string | null
  accountName: string
  category: string | null
  monthlyAmounts: Array<string | number>
  annualTotal: string | number
  priorYearTotal: string | number
  difference: string | number
  sortOrder: number
}

/**
 * 월별손익분석 응답.
 *
 * 당기 1~12월 손익계정 매트릭스와 전기 연간 비교 컬럼을 함께 제공한다.
 */
export interface MonthlyIncomeStatementResponse {
  fiscalYear: number
  priorYear: number
  fromDate: string
  toDate: string
  months: number[]
  rows: MonthlyIncomeStatementLine[]
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
 * 월별손익분석 조회.
 *
 * BE endpoint: `GET /accounting/reports/income-statement/monthly?year=YYYY`.
 */
export async function getMonthlyIncomeStatement(
  year: number,
): Promise<MonthlyIncomeStatementResponse> {
  const res = await apiClient.get<ApiEnvelope<MonthlyIncomeStatementResponse>>(
    '/accounting/reports/income-statement/monthly',
    { params: { year } },
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
 * UUID 비공개 가드: BE 응답에 `partnerId` 를 포함하지 않는다.
 * 사용자 노출 식별자: `partnerCode` / `bizNo` / `partnerName` 만.
 */
export interface PartnerAgingLine {
  /** 거래처 코드 (화면 표시 OK). */
  partnerCode: string
  /** 사업자번호 숫자 문자열. */
  bizNo: string
  /** 거래처명 (화면 표시 OK). */
  partnerName: string
  /** 잔액 (KRW 정수, string). */
  balance: string
  /** 가장 오래된 미결제 일자 (YYYY-MM-DD). */
  oldestUnpaidDate: string | null
  /** 연체일수 (0 이상 정수). */
  agingDays: number
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

export type ReceivablesPayablesDirection = 'RECEIVABLE' | 'PAYABLE' | 'ALL'

export interface ReceivablesPayablesAgingBuckets {
  currentMonth: string | number
  oneMonthElapsed: string | number
  twoMonthsElapsed: string | number
  threeMonthsOver: string | number
}

/** 채권채무 현황 행. UUID 없이 거래처 표시 식별자와 금액 집계만 사용한다. */
export interface ReceivablesPayablesLine {
  bizNo: string
  partnerCode: string
  partnerName: string
  receivableBalance: string | number
  payableBalance: string | number
  netBalance: string | number
  agingBuckets: ReceivablesPayablesAgingBuckets
  creditLimit: string | number | null
  creditUsageRate: string | number | null
  notesHeldAmount: string | number
  notesMaturingSoonAmount: string | number
  collectionPlanPlannedAmount: string | number
  collectionPlanOverdueAmount: string | number
  collectionPlanTotalAmount: string | number
}

export interface ReceivablesPayablesResponse {
  asOfDate: string
  direction: ReceivablesPayablesDirection
  receivableTotal: string | number
  payableTotal: string | number
  netTotal: string | number
  partnerCount: number
  lines: ReceivablesPayablesLine[]
  generatedAt: string
}

/**
 * 채권채무 현황 조회.
 *
 * BE endpoint: `GET /accounting/reports/receivables-payables?asOfDate=&direction=`.
 */
export async function getReceivablesPayables(
  asOfDate: string,
  direction: ReceivablesPayablesDirection,
): Promise<ReceivablesPayablesResponse> {
  const res = await apiClient.get<ApiEnvelope<ReceivablesPayablesResponse>>(
    '/accounting/reports/receivables-payables',
    { params: { asOfDate, direction } },
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
export type DailyClosingScopeMode = 'ALL' | 'SELECTED'

export interface DailyClosing {
  closingKind: DailyClosingKind
  sourceKind: DailyClosingSourceKind
  /** 마감 대상 일자 (YYYY-MM-DD). */
  closingDate: string
  /** 사업자번호 숫자 문자열. */
  bizNo: string
  /** 관리코드 필터 (단일 거래처 마감 시 채워짐, null = 전체). */
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
  /** 선택 범위 — 전체/선택 거래처를 명시한다. */
  scopeMode: DailyClosingScopeMode
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
  /** 사용자 노출 분개번호 (예: 2026/05/08-1). */
  journalNo: string
  /** 계정 코드. */
  accountCode: string
  /** 계정명. 화면에서는 코드 prefix 없이 이 필드만 계정명으로 표시한다. */
  accountName?: string | null
  /** 계정 카테고리 enum. */
  accountCategory?: string | null
  /** 계정 카테고리 한국어 표시명. */
  accountCategoryDisplayName?: string | null
  /** 정상 잔액 방향. */
  balanceDirection?: 'DEBIT' | 'CREDIT' | null
  /** 정상 잔액 방향 한국어 표시명. */
  balanceDirectionDisplayName?: string | null
  /** 사업자번호 숫자 문자열. */
  bizNo: string
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

// --------------------------------------------------------------------------
// 계정명세서 API — 원장 통일안 E
// --------------------------------------------------------------------------

export type AccountStatementBalanceDirection = 'DEBIT' | 'CREDIT'

export interface AccountStatementAmountSummary {
  openingBalance: string
  increase: string
  decrease: string
  debitTotal: string
  creditTotal: string
  balance: string
}

export interface AccountStatementLine {
  accountCode: string
  accountName: string
  partnerCode: string
  bizNo: string
  partnerName: string
  openingBalance: string
  increase: string
  decrease: string
  debitTotal: string
  creditTotal: string
  balance: string
}

export interface AccountStatementAccountSection {
  accountCode: string
  accountName: string
  category: string
  categoryDisplayName: string
  balanceDirection: AccountStatementBalanceDirection
  balanceDirectionDisplayName: string
  lines: AccountStatementLine[]
  subtotal: AccountStatementAmountSummary
}

export interface AccountStatementAccountGroup {
  groupCode: string
  groupName: string
  balanceDirection: AccountStatementBalanceDirection
  accounts: AccountStatementAccountSection[]
  subtotal: AccountStatementAmountSummary
}

export interface AccountStatementTotal {
  receivableTotal: AccountStatementAmountSummary | null
  payableTotal: AccountStatementAmountSummary | null
}

export interface AccountStatementResponse {
  asOfDate: string
  accountCode: string | null
  groups: AccountStatementAccountGroup[]
  total: AccountStatementTotal
  generatedAt: string
}

/**
 * 계정명세서 조회.
 *
 * BE endpoint: `GET /accounting/reports/account-statement?asOfDate=&accountCode=`.
 */
export async function getAccountStatement(
  asOfDate: string,
  accountCode?: string,
): Promise<AccountStatementResponse> {
  const params: Record<string, string> = { asOfDate }
  if (accountCode && accountCode.trim()) params['accountCode'] = accountCode.trim()
  const res = await apiClient.get<ApiEnvelope<AccountStatementResponse>>(
    '/accounting/reports/account-statement',
    { params },
  )
  return res.data.data
}

// --------------------------------------------------------------------------
// 자금현황 (Funds Status) API — 회계 메뉴 갭 슬라이스 A
// --------------------------------------------------------------------------

/**
 * 자금현황 금액 요약.
 */
export interface FundsAmountSummary {
  openingBalance: string
  increase: string
  decrease: string
  closingBalance: string
}

/**
 * 자금현황 거래처별 라인.
 *
 * UUID 비공개 가드: BE 응답에 partnerId 를 포함하지 않는다. 화면은 bizNo/거래처명만 표시한다.
 */
export interface FundsStatusLine {
  accountCode: string
  accountName: string
  bizNo: string
  partnerName: string
  openingBalance: string
  increase: string
  decrease: string
  closingBalance: string
}

/**
 * 자금현황 계정 섹션.
 */
export interface FundsStatusAccountSection {
  accountCode: string
  accountName: string
  category: 'ASSET' | 'LIABILITY' | string
  lines: FundsStatusLine[]
  subtotal: FundsAmountSummary
}

/**
 * 자금현황 계정그룹 섹션.
 */
export interface FundsStatusAccountGroup {
  groupCode: string
  groupName: string
  accounts: FundsStatusAccountSection[]
  subtotal: FundsAmountSummary
}

/**
 * 자금현황 응답.
 */
export interface FundsStatusResponse {
  fromDate: string
  toDate: string
  groups: FundsStatusAccountGroup[]
  total: FundsAmountSummary
  generatedAt: string
}

/**
 * 자금 증가 상세 라인.
 */
export interface FundsIncreaseDetailLine {
  txDate: string
  counterAccountName: string
  counterPartnerName: string
  description: string | null
  amount: string
}

/**
 * 자금 증가 상세 응답.
 */
export interface FundsIncreaseDetailResponse {
  fromDate: string
  toDate: string
  accountCode: string
  accountName: string
  partnerName: string | null
  lines: FundsIncreaseDetailLine[]
  totalAmount: string
  generatedAt: string
}

/**
 * 자금 증가 상세 조회 옵션.
 *
 * partnerId 는 내부 필터용 선택 파라미터다. 화면에는 표시하지 않는다.
 */
export interface GetFundsIncreaseDetailOptions {
  from: string
  to: string
  accountCode: string
  partnerId?: string
}

/**
 * 자금현황 조회.
 *
 * BE endpoint: `GET /accounting/reports/funds-status?from=YYYY-MM-DD&to=YYYY-MM-DD`.
 */
export async function getFundsStatus(
  from: string,
  to: string,
): Promise<FundsStatusResponse> {
  const res = await apiClient.get<ApiEnvelope<FundsStatusResponse>>(
    '/accounting/reports/funds-status',
    { params: { from, to } },
  )
  return res.data.data
}

/**
 * 자금 증가 상세 조회.
 *
 * BE endpoint: `GET /accounting/reports/funds-status/increase-detail`.
 */
export async function getFundsIncreaseDetail(
  options: GetFundsIncreaseDetailOptions,
): Promise<FundsIncreaseDetailResponse> {
  const params: Record<string, string> = {
    from: options.from,
    to: options.to,
    accountCode: options.accountCode,
  }
  if (options.partnerId) params['partnerId'] = options.partnerId

  const res = await apiClient.get<ApiEnvelope<FundsIncreaseDetailResponse>>(
    '/accounting/reports/funds-status/increase-detail',
    { params },
  )
  return res.data.data
}

// --------------------------------------------------------------------------
// 전표현황 (Journal Status) API — 회계 보고 스위트 통일안 F
// --------------------------------------------------------------------------

/** 전표현황 출처 필터. */
export type JournalStatusSourceType =
  | 'SLIP'
  | 'MANUAL'
  | 'CLOSING'
  | 'CASH_DISBURSEMENT'
  | 'CASH_RECEIPT'

/** 전표현황 grouping 기준. */
export type JournalStatusGroupBy = 'DATE' | 'SOURCE_TYPE' | 'PARTNER'

/** 전표현황 금액 소계. */
export interface JournalStatusSummary {
  totalDebit: string
  totalCredit: string
  journalCount: number
}

/** 전표현황 행. UUID 는 응답/화면에 포함하지 않는다. */
export interface JournalStatusLine {
  journalNo: string
  journalDate: string
  sourceType: JournalStatusSourceType
  sourceTypeDisplayName: string
  bizNo: string
  partnerName: string
  description: string | null
  totalDebit: string
  totalCredit: string
}

/** 전표현황 grouping 섹션. */
export interface JournalStatusGroup {
  groupKey: string
  groupLabel: string
  lines: JournalStatusLine[]
  subtotal: JournalStatusSummary
}

/** 전표현황 응답. */
export interface JournalStatusReportResponse {
  fromDate: string
  toDate: string
  status: JournalStatus
  sourceTypes: JournalStatusSourceType[]
  groupBy: JournalStatusGroupBy
  groups: JournalStatusGroup[]
  total: JournalStatusSummary
  generatedAt: string
}

/** 전표현황 조회 옵션. */
export interface GetJournalStatusReportOptions {
  from: string
  to: string
  sourceTypes?: JournalStatusSourceType[]
  partnerCode?: string
  groupBy?: JournalStatusGroupBy
  status?: JournalStatus
}

/**
 * 전표현황 조회.
 *
 * BE endpoint: `GET /accounting/reports/journal-status`.
 */
export async function getJournalStatusReport(
  options: GetJournalStatusReportOptions,
): Promise<JournalStatusReportResponse> {
  const params: Record<string, string> = {
    from: options.from,
    to: options.to,
    groupBy: options.groupBy ?? 'DATE',
    status: options.status ?? 'POSTED',
  }
  if (options.sourceTypes && options.sourceTypes.length > 0) {
    params['sourceTypes'] = options.sourceTypes.join(',')
  }
  if (options.partnerCode) params['partnerCode'] = options.partnerCode

  const res = await apiClient.get<ApiEnvelope<JournalStatusReportResponse>>(
    '/accounting/reports/journal-status',
    { params },
  )
  return res.data.data
}

// --------------------------------------------------------------------------
// 받을어음 API — 회계 보고 스위트 G-1
// --------------------------------------------------------------------------

export type NoteType = 'PROMISSORY' | 'BILL_OF_EXCHANGE'
export type NoteStatus = 'BOARDING' | 'COLLECTING' | 'SETTLED' | 'DISHONORED'

export const NOTE_TYPE_LABEL: Record<NoteType, string> = {
  PROMISSORY: '약속어음',
  BILL_OF_EXCHANGE: '환어음',
}

export const NOTE_STATUS_LABEL: Record<NoteStatus, string> = {
  BOARDING: '보유',
  COLLECTING: '추심',
  SETTLED: '결제완료',
  DISHONORED: '부도',
}

/** 받을어음 행. UUID 없이 noteNo + 거래처 표시 식별자만 사용한다. */
export interface NotesReceivableRow {
  noteNo: string
  partnerCode: string
  bizNo: string
  partnerName: string
  issueDate: string
  maturityDate: string
  amount: string | number
  noteType: NoteType
  status: NoteStatus
  memo?: string | null
}

export interface CreateNotesReceivablePayload {
  partnerCode?: string
  bizNo?: string
  partnerName?: string
  noteNo: string
  issueDate: string
  maturityDate: string
  amount: string
  noteType: NoteType
  memo?: string
}

export interface ListNotesReceivableOptions {
  status?: NoteStatus
  partnerCode?: string
  bizNo?: string
  partnerName?: string
}

export async function listNotesReceivable(
  options: ListNotesReceivableOptions = {},
): Promise<NotesReceivableRow[]> {
  const params: Record<string, string> = {}
  if (options.status) params['status'] = options.status
  if (options.partnerCode) params['partnerCode'] = options.partnerCode
  if (options.bizNo) params['bizNo'] = options.bizNo
  if (options.partnerName) params['partnerName'] = options.partnerName

  const res = await apiClient.get<ApiEnvelope<NotesReceivableRow[]>>(
    '/accounting/notes-receivable',
    { params },
  )
  return res.data.data ?? []
}

export async function registerNotesReceivable(
  payload: CreateNotesReceivablePayload,
): Promise<NotesReceivableRow> {
  const res = await apiClient.post<ApiEnvelope<NotesReceivableRow>>(
    '/accounting/notes-receivable',
    payload,
  )
  return res.data.data
}

export async function updateNotesReceivableStatus(
  noteNo: string,
  status: NoteStatus,
): Promise<NotesReceivableRow> {
  const res = await apiClient.patch<ApiEnvelope<NotesReceivableRow>>(
    `/accounting/notes-receivable/${encodeURIComponent(noteNo)}/status`,
    { status },
  )
  return res.data.data
}

// --------------------------------------------------------------------------
// 수금계획 API — 회계 보고 스위트 G-2
// --------------------------------------------------------------------------

export type PlanBasis = 'RECEIVABLE_BALANCE' | 'NOTE_MATURITY' | 'MANUAL'
export type PlanStatus = 'PLANNED' | 'COLLECTED' | 'OVERDUE'

export const PLAN_BASIS_LABEL: Record<PlanBasis, string> = {
  RECEIVABLE_BALANCE: '외상매출잔액',
  NOTE_MATURITY: '어음만기',
  MANUAL: '수동',
}

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  PLANNED: '예정',
  COLLECTED: '수금완료',
  OVERDUE: '연체',
}

/** 수금계획 행. UUID 없이 planNo + 거래처 표시 식별자만 사용한다. */
export interface CollectionPlanRow {
  planNo: string
  partnerCode: string
  bizNo: string
  partnerName: string
  plannedDate: string
  plannedAmount: string | number
  basis: PlanBasis
  status: PlanStatus
  sourceReference?: string | null
  memo?: string | null
}

export interface CreateCollectionPlanPayload {
  partnerCode?: string
  bizNo?: string
  partnerName?: string
  plannedDate: string
  plannedAmount: string
  basis: PlanBasis
  sourceReference?: string
  memo?: string
}

export interface ListCollectionPlanOptions {
  status?: PlanStatus
  partnerCode?: string
  bizNo?: string
  partnerName?: string
}

export interface CollectionPlanSuggestion {
  partnerCode: string
  bizNo: string
  partnerName: string
  plannedDate: string
  plannedAmount: string | number
  basis: PlanBasis
  sourceReference: string
  memo?: string | null
}

export interface CollectionPlanForecastMonth {
  month: string
  plannedAmount: string | number
}

export interface CollectionPlanForecast {
  from: string
  to: string
  totalAmount: string | number
  months: CollectionPlanForecastMonth[]
}

export async function listCollectionPlans(
  options: ListCollectionPlanOptions = {},
): Promise<CollectionPlanRow[]> {
  const params: Record<string, string> = {}
  if (options.status) params['status'] = options.status
  if (options.partnerCode) params['partnerCode'] = options.partnerCode
  if (options.bizNo) params['bizNo'] = options.bizNo
  if (options.partnerName) params['partnerName'] = options.partnerName

  const res = await apiClient.get<ApiEnvelope<CollectionPlanRow[]>>(
    '/accounting/collection-plans',
    { params },
  )
  return res.data.data ?? []
}

export async function registerCollectionPlan(
  payload: CreateCollectionPlanPayload,
): Promise<CollectionPlanRow> {
  const res = await apiClient.post<ApiEnvelope<CollectionPlanRow>>(
    '/accounting/collection-plans',
    payload,
  )
  return res.data.data
}

export async function updateCollectionPlanStatus(
  planNo: string,
  status: PlanStatus,
): Promise<CollectionPlanRow> {
  // planNo 는 슬래시 표준(yyyy/MM/dd-N)이다. 게이트웨이 StrictHttpFirewall 이 URL 경로의
  // 인코딩된 슬래시(%2F)를 차단하므로(#728 라이브 실증: %2F 경로 400, 하이픈 경로 200),
  // URL path 에서는 공용 toOrderPathId(슬래시→하이픈) 규약을 적용하고 BE 가 하이픈 pathId 를
  // 슬래시 표준 번호로 정규화한다.
  const res = await apiClient.patch<ApiEnvelope<CollectionPlanRow>>(
    `/accounting/collection-plans/${encodeURIComponent(toOrderPathId(planNo))}/status`,
    { status },
  )
  return res.data.data
}

export async function getCollectionPlanSuggestions(
  partnerCode: string,
): Promise<CollectionPlanSuggestion[]> {
  const res = await apiClient.get<ApiEnvelope<CollectionPlanSuggestion[]>>(
    '/accounting/collection-plans/suggestions',
    { params: { partnerCode } },
  )
  return res.data.data ?? []
}

export async function getCollectionPlanForecast(
  from: string,
  to: string,
): Promise<CollectionPlanForecast> {
  const res = await apiClient.get<ApiEnvelope<CollectionPlanForecast>>(
    '/accounting/collection-plans/forecast',
    { params: { from, to } },
  )
  return res.data.data
}

// --------------------------------------------------------------------------
// 입금보고서 목록 API — E3 S4a
// --------------------------------------------------------------------------

export type CashReceiptKind = 'DEPOSIT_REPORT' | 'MANUAL_RECEIPT' | 'BANK_LINKED'

export type CashReceiptStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED'

export interface CashReceiptRow {
  /** mutation/detail path 전용 UUID. 화면에는 렌더링하지 않는다. */
  id?: string | null
  slipNo: string
  partnerCode?: string | null
  bizNo?: string | null
  partnerName: string
  amount: string | number
  transactionDate: string
  kind: CashReceiptKind | string
  status: CashReceiptStatus | string
  memo?: string | null
  journalNo?: string | null
  reverseJournalNo?: string | null
  externalRef?: string | null
  debitAccountCode?: string | null
  creditAccountCode?: string | null
  lines?: CashReceiptLine[] | null
}

export interface CashReceiptLine {
  partnerCode?: string | null
  bizNo?: string | null
  partnerName?: string | null
  amount: string | number
  memo?: string | null
}

export interface CashReceiptRequest {
  partnerCode?: string
  bizNo?: string
  partnerName?: string
  amount: string
  transactionDate: string
  memo?: string
  debitAccountCode?: string
  creditAccountCode?: string
  lines?: CashReceiptLine[]
}

export interface BankTransactionNaturalKey {
  bankAccountLabel: string
  transactedAt: string
  amount: number
  externalRef: string
}

export interface BankDepositReceiptRequest {
  transactions: BankTransactionNaturalKey[]
  transactionDate: string
  memo?: string
  debitAccountCode?: string
  creditAccountCode?: string
}

export interface ListCashReceiptsOptions {
  partnerName?: string
  slipNo?: string
  kind?: CashReceiptKind | string
  from?: string
  to?: string
  status?: CashReceiptStatus | string
  page?: number
  size?: number
}

export async function listCashReceipts(
  options: ListCashReceiptsOptions = {},
): Promise<Page<CashReceiptRow>> {
  const params: Record<string, string | number> = {
    page: options.page ?? 0,
    size: options.size ?? 20,
  }
  if (options.partnerName) params['partnerName'] = options.partnerName
  if (options.slipNo) params['slipNo'] = options.slipNo
  if (options.kind) params['kind'] = options.kind
  if (options.from) params['from'] = options.from
  if (options.to) params['to'] = options.to
  if (options.status) params['status'] = options.status

  const res = await apiClient.get<ApiEnvelope<Page<CashReceiptRow>>>(
    '/accounting/cash-receipts',
    { params },
  )
  return res.data.data
}

export async function createCashReceipt(
  body: CashReceiptRequest,
): Promise<CashReceiptRow> {
  try {
    const res = await apiClient.post<ApiEnvelope<CashReceiptRow>>(
      '/accounting/cash-receipts',
      body,
    )
    return res.data.data
  } catch (err) {
    const message = extractApiErrorResponseMessage(err)
    if (message) throw new Error(message)
    throw err
  }
}

export async function createBankDepositReceipt(
  body: BankDepositReceiptRequest,
): Promise<CashReceiptRow> {
  try {
    const res = await apiClient.post<ApiEnvelope<CashReceiptRow>>(
      '/accounting/cash-receipts/from-bank-transactions',
      body,
    )
    return res.data.data
  } catch (err) {
    const message = extractApiErrorResponseMessage(err)
    if (message) throw new Error(message)
    throw err
  }
}

export async function getCashReceipt(id: string): Promise<CashReceiptRow> {
  try {
    const res = await apiClient.get<ApiEnvelope<CashReceiptRow>>(
      `/accounting/cash-receipts/${id}`,
    )
    return res.data.data
  } catch (err) {
    const message = extractApiErrorResponseMessage(err)
    if (message) throw new Error(message)
    throw err
  }
}

export async function updateCashReceipt(
  id: string,
  body: CashReceiptRequest,
): Promise<CashReceiptRow> {
  try {
    const res = await apiClient.patch<ApiEnvelope<CashReceiptRow>>(
      `/accounting/cash-receipts/${id}`,
      body,
    )
    return res.data.data
  } catch (err) {
    const message = extractApiErrorResponseMessage(err)
    if (message) throw new Error(message)
    throw err
  }
}

export async function confirmCashReceipt(id: string): Promise<CashReceiptRow> {
  try {
    const res = await apiClient.post<ApiEnvelope<CashReceiptRow>>(
      `/accounting/cash-receipts/${id}/confirm`,
      {},
    )
    return res.data.data
  } catch (err) {
    const message = extractApiErrorResponseMessage(err)
    if (message) throw new Error(message)
    throw err
  }
}

export async function cancelCashReceipt(id: string): Promise<CashReceiptRow> {
  try {
    const res = await apiClient.post<ApiEnvelope<CashReceiptRow>>(
      `/accounting/cash-receipts/${id}/cancel`,
      {},
    )
    return res.data.data
  } catch (err) {
    const message = extractApiErrorResponseMessage(err)
    if (message) throw new Error(message)
    throw err
  }
}

export async function deleteCashReceipt(id: string): Promise<void> {
  try {
    await apiClient.delete<ApiEnvelope<null>>(
      `/accounting/cash-receipts/${id}`,
    )
  } catch (err) {
    const message = extractApiErrorResponseMessage(err)
    if (message) throw new Error(message)
    throw err
  }
}

// --------------------------------------------------------------------------
// 입출금 매칭 API — 회계 보고 스위트 H-1
// --------------------------------------------------------------------------

export type BankTxnType = 'DEPOSIT' | 'WITHDRAWAL'
export type BankTxnSource = 'CSV_IMPORT' | 'CODEF_BANK' | 'CODEF_CARD' | 'CODEF_LOAN'
export type BankMatchStatus = 'UNREFLECTED' | 'REFLECTED' | 'FORCED'
export type BankPartnerMatchSource = 'MANUAL' | 'DEPOSITOR_MAPPING' | 'PARTNER_CODE_EXACT'

export const BANK_TXN_TYPE_LABEL: Record<BankTxnType, string> = {
  DEPOSIT: '입금',
  WITHDRAWAL: '출금',
}

export const BANK_TXN_SOURCE_LABEL: Record<BankTxnSource, string> = {
  CSV_IMPORT: '파일',
  CODEF_BANK: '계좌',
  CODEF_CARD: '카드',
  CODEF_LOAN: '대출',
}

export const BANK_MATCH_STATUS_LABEL: Record<BankMatchStatus, string> = {
  UNREFLECTED: '미반영',
  REFLECTED: '반영',
  FORCED: '강제',
}

/** 통장 거래 행. UUID 없이 externalRef + 표시 식별자만 사용한다. */
export interface BankTransactionRow {
  transactedAt: string
  txnType: BankTxnType
  amount: string | number
  balanceAfter?: string | number | null
  description: string
  counterpartyName?: string | null
  counterpartyAccount?: string | null
  bankAccountLabel: string
  source: BankTxnSource
  externalRef: string
  cardName?: string | null
  approvalId?: string | null
  loanName?: string | null
  matchStatus: BankMatchStatus
  matchedPartnerCode?: string | null
  matchedBizNo?: string | null
  matchedPartnerName?: string | null
  /** 거래처 자동/수동 매칭 근거. 미매칭이면 null. */
  partnerMatchSource?: BankPartnerMatchSource | null
  /** 자동 입금자명 매칭에 사용된 원본명. 화면 부가설명 전용. */
  appliedMappingRawName?: string | null
  /** 자동 입금자명 매칭에 사용된 정규화 business key. 화면에는 필요 시에만 표시한다. */
  appliedMappingNormalizedName?: string | null
  cashReceiptSlipNo?: string | null
}

export interface ListBankTransactionsOptions {
  matchStatus?: BankMatchStatus
  from?: string
  to?: string
  /** 계좌 표시명 다중 선택(빈/미지정=계좌 전체). 계좌 소스행에만 적용. */
  accountLabels?: string[]
  /** 카드 표시명 다중 선택(빈/미지정=카드 전체). 카드 소스행에만 적용. */
  cardLabels?: string[]
}

export interface BankTransactionFilterPreferences {
  accountLabels: string[]
  cardLabels: string[]
}

export interface BankTransactionFilterLabels {
  accountLabels: string[]
  cardLabels: string[]
}

export interface ImportBankTransactionsMapping {
  bankAccountLabel: string
  dateColumn: string
  depositColumn?: string
  withdrawalColumn?: string
  balanceColumn?: string
  descriptionColumn: string
  counterpartyColumn?: string
  counterpartyAccountColumn?: string
  externalRefColumn?: string
  headerRow?: boolean
}

export interface BankTransactionImportResult {
  totalRows: number
  importedCount: number
  duplicateSkippedCount: number
  staleSkippedCount: number
  staleNormalizedNames: string[]
  /**
   * 거래처 조회 일시 장애(UNAVAILABLE)로 저장 없이 skip 한 건수(#810 R3 L2-M1) —
   * stale(영구·재선택 필요)과 별개인 재시도 대상. 미저장이라 다음 import 재시도에서 재적재·재매칭된다.
   */
  unavailableSkippedCount: number
  /** unavailable skip 근거 이름 — 매핑 정규화 키(중복 제거). */
  unavailableNames: string[]
}

export interface MatchBankTransactionPartnerRequest {
  bankAccountLabel: string
  transactedAt: string
  amount: string | number
  externalRef: string
  partnerCode: string
}

export interface ClearBankTransactionMatchRequest {
  bankAccountLabel: string
  transactedAt: string
  amount: string | number
  externalRef: string
}

export interface DepositorMappingResponse {
  rawName: string
  normalizedName: string
  /**
   * 거래처 코드 — 거래처 master 미조회(삭제/유실/일시장애) 시에도 BE 가 매핑에 저장된
   * partnerCodeSnapshot 을 반환할 수 있어 stale 매핑에서도 non-null 일 수 있다.
   * stale 여부는 partnerCode null 검사가 아니라 staleTarget 으로 판정한다(#810 R3 L4-L2 주석 정정).
   */
  partnerCode: string | null
  /** 거래처명 — 거래처 master 미조회(삭제/유실/일시장애) 시 null. */
  partnerName: string | null
  /**
   * 거래처 master 상태(ACTIVE/SUSPENDED/TERMINATED). 거래처 미존재 시 null.
   * 거래처 서비스 일시장애로 조회 자체가 실패하면 'UNAVAILABLE'(이때 staleTarget=false —
   * #810 R3 계약 pin: FE 는 "거래처 조회 불가(일시)"로 표시하고 재선택을 강요하지 않는다).
   */
  targetStatus: string | null
  /**
   * 거래처가 없거나 ACTIVE 가 아니어서 재선택이 필요한 stale target 여부.
   * 일시 조회 불가(targetStatus='UNAVAILABLE')는 stale 이 아니므로 false 다.
   */
  staleTarget: boolean
  modifiedAt: string
  actor: string
  active: boolean
}

export interface DepositorMappingHistoryResponse {
  /**
   * 이력 행 식별용 opaque 키(#810 R3 S4-M3 계약 pin) — BE 가 채번하는 안정(같은 행=같은 값)
   * 문자열이며 UUID 가 아니다. FE 는 의미를 파싱하지 않고 React rowKey 로만 쓴다.
   * revisionNo+changedAt+fieldName 조합은 서로 다른 entity(같은 키 삭제+재생성)가
   * 같은 회차·시각·필드를 가질 수 있어 행 키로 쓰지 않는다.
   */
  entryKey: string
  fieldName: string
  oldValue: string | null
  newValue: string | null
  actor: string
  changedAt: string
  revisionNo: number
  operationOrdinal: number
  generation: number
}

export interface DepositorMappingRequest {
  rawName: string
  partnerCode: string
  reason?: string
}

export async function listBankTransactions(
  options: ListBankTransactionsOptions = {},
): Promise<BankTransactionRow[]> {
  const params: Record<string, string | string[]> = {}
  if (options.matchStatus) params['matchStatus'] = options.matchStatus
  if (options.from) params['from'] = options.from
  if (options.to) params['to'] = options.to
  if (options.accountLabels && options.accountLabels.length > 0) {
    params['accountLabels'] = options.accountLabels
  }
  if (options.cardLabels && options.cardLabels.length > 0) {
    params['cardLabels'] = options.cardLabels
  }

  const res = await apiClient.get<ApiEnvelope<BankTransactionRow[]>>(
    '/accounting/bank-transactions',
    { params },
  )
  return res.data.data ?? []
}

export async function loadBankTransactionFilterPreferences(): Promise<BankTransactionFilterPreferences> {
  const res = await apiClient.get<ApiEnvelope<BankTransactionFilterPreferences>>(
    '/accounting/bank-transactions/filter-preferences',
  )
  return res.data.data ?? { accountLabels: [], cardLabels: [] }
}

export async function saveBankTransactionFilterPreferences(
  preferences: BankTransactionFilterPreferences,
): Promise<BankTransactionFilterPreferences> {
  const res = await apiClient.put<ApiEnvelope<BankTransactionFilterPreferences>>(
    '/accounting/bank-transactions/filter-preferences',
    preferences,
  )
  return res.data.data ?? { accountLabels: [], cardLabels: [] }
}

export async function listBankTransactionFilterLabels(): Promise<BankTransactionFilterLabels> {
  const res = await apiClient.get<ApiEnvelope<BankTransactionFilterLabels>>(
    '/accounting/bank-transactions/filter-labels',
  )
  return res.data.data ?? { accountLabels: [], cardLabels: [] }
}

export async function importBankTransactionsCsv(
  file: File,
  mapping: ImportBankTransactionsMapping,
): Promise<BankTransactionImportResult> {
  const form = new FormData()
  form.append('file', file)
  form.append('bankAccountLabel', mapping.bankAccountLabel)
  form.append('dateColumn', mapping.dateColumn)
  if (mapping.depositColumn) form.append('depositColumn', mapping.depositColumn)
  if (mapping.withdrawalColumn) form.append('withdrawalColumn', mapping.withdrawalColumn)
  if (mapping.balanceColumn) form.append('balanceColumn', mapping.balanceColumn)
  form.append('descriptionColumn', mapping.descriptionColumn)
  if (mapping.counterpartyColumn) form.append('counterpartyColumn', mapping.counterpartyColumn)
  if (mapping.counterpartyAccountColumn) form.append('counterpartyAccountColumn', mapping.counterpartyAccountColumn)
  if (mapping.externalRefColumn) form.append('externalRefColumn', mapping.externalRefColumn)
  form.append('headerRow', String(mapping.headerRow ?? true))

  const res = await apiClient.post<ApiEnvelope<BankTransactionImportResult>>(
    '/accounting/bank-transactions/import',
    form,
  )
  return res.data.data
}

export async function matchBankTransactionPartner(
  request: MatchBankTransactionPartnerRequest,
): Promise<BankTransactionRow> {
  const res = await apiClient.patch<ApiEnvelope<BankTransactionRow>>(
    '/accounting/bank-transactions/match-partner',
    request,
  )
  return res.data.data
}

export async function clearBankTransactionMatch(
  request: ClearBankTransactionMatchRequest,
): Promise<BankTransactionRow> {
  const res = await apiClient.patch<ApiEnvelope<BankTransactionRow>>(
    '/accounting/bank-transactions/match-partner/clear',
    request,
    { headers: await collabHeaders() },
  )
  return res.data.data
}

/** 거래를 해제하고 학습된 입금자명 매핑도 함께 삭제한다. */
export async function clearBankTransactionMatchAndDeleteMapping(
  request: ClearBankTransactionMatchRequest,
): Promise<BankTransactionRow> {
  try {
    const res = await apiClient.patch<ApiEnvelope<BankTransactionRow>>(
      '/accounting/bank-transactions/match-partner/clear-and-delete-mapping',
      request,
      { headers: await collabHeaders() },
    )
    return res.data.data
  } catch (err) {
    const message = extractApiErrorResponseMessage(err)
    if (message) {
      throw new Error(message)
    }
    throw err
  }
}

export async function listDepositorMappings(): Promise<DepositorMappingResponse[]> {
  const res = await apiClient.get<ApiEnvelope<DepositorMappingResponse[]>>(
    '/accounting/deposit-mappings',
    { headers: await collabHeaders() },
  )
  return res.data.data ?? []
}

export async function listDepositorMappingHistory(
  normalizedName: string,
): Promise<DepositorMappingHistoryResponse[]> {
  const res = await apiClient.get<ApiEnvelope<DepositorMappingHistoryResponse[]>>(
    '/accounting/deposit-mappings/history',
    { params: { normalizedName }, headers: await collabHeaders() },
  )
  return res.data.data ?? []
}

export async function createDepositorMapping(
  request: DepositorMappingRequest,
): Promise<DepositorMappingResponse> {
  try {
    const res = await apiClient.post<ApiEnvelope<DepositorMappingResponse>>(
      '/accounting/deposit-mappings',
      request,
      { headers: await collabHeaders() },
    )
    return res.data.data
  } catch (err) {
    const message = extractApiErrorResponseMessage(err)
    if (message) {
      throw new Error(message)
    }
    throw err
  }
}

/**
 * 매핑 수정 — BE 계약(#810)에 따라 정규화 key 는 경로변수가 아닌
 * `?normalizedName=` 쿼리파라미터로 전달한다(경로 %2F 인코딩 함정 제거).
 */
export async function updateDepositorMapping(
  normalizedName: string,
  request: DepositorMappingRequest,
): Promise<DepositorMappingResponse> {
  try {
    const res = await apiClient.put<ApiEnvelope<DepositorMappingResponse>>(
      `/accounting/deposit-mappings?normalizedName=${encodeURIComponent(normalizedName)}`,
      request,
      { headers: await collabHeaders() },
    )
    return res.data.data
  } catch (err) {
    const message = extractApiErrorResponseMessage(err)
    if (message) {
      throw new Error(message)
    }
    throw err
  }
}

/**
 * 매핑 삭제(soft delete) — BE 계약(#810)에 따라 정규화 key 는
 * `?normalizedName=` 쿼리파라미터로 전달한다.
 */
export async function deleteDepositorMapping(
  normalizedName: string,
  reason?: string,
): Promise<void> {
  try {
    await apiClient.delete<ApiEnvelope<null>>(
      `/accounting/deposit-mappings?normalizedName=${encodeURIComponent(normalizedName)}`,
      { params: reason ? { reason } : undefined, headers: await collabHeaders() },
    )
  } catch (err) {
    const message = extractApiErrorResponseMessage(err)
    if (message) {
      throw new Error(message)
    }
    throw err
  }
}

// --------------------------------------------------------------------------
// 자금 입출금내역 2기간 비교 API — 회계 보고 스위트 통일안 B
// --------------------------------------------------------------------------

/**
 * 자금 입출금내역 상대계정별 라인.
 */
export interface FundsFlowCounterAccountLine {
  counterAccountCode: string
  counterAccountName: string
  amount: string
}

/**
 * 자금 입출금내역 단일 기간.
 */
export interface FundsFlowPeriod {
  fromDate: string
  toDate: string
  openingBalance: string
  increases: FundsFlowCounterAccountLine[]
  increaseSubtotal: string
  decreases: FundsFlowCounterAccountLine[]
  decreaseSubtotal: string
  closingBalance: string
  reconciled: boolean
}

/**
 * 자금 입출금내역 2기간 비교 응답.
 */
export interface FundsFlowComparisonResponse {
  current: FundsFlowPeriod
  prior: FundsFlowPeriod
  generatedAt: string
}

/**
 * 자금 입출금내역 2기간 비교 조회.
 *
 * BE endpoint: `GET /accounting/reports/funds-flow-comparison?from=YYYY-MM-DD&to=YYYY-MM-DD`.
 */
export async function getFundsFlowComparison(
  from: string,
  to: string,
): Promise<FundsFlowComparisonResponse> {
  const res = await apiClient.get<ApiEnvelope<FundsFlowComparisonResponse>>(
    '/accounting/reports/funds-flow-comparison',
    { params: { from, to } },
  )
  return res.data.data
}
