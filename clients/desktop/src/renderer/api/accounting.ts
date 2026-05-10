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
  /** 메모. */
  note: string | null
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

/**
 * 회계 메뉴/라우트 접근 권한 — ACCOUNTANT / MASTER 만 허용.
 *
 * `feedback_role_naming_full.md` — 풀네임 표기 의무. M/M 약어 금지.
 */
export function canAccessAccounting(role: string | undefined | null): boolean {
  if (!role) return false
  return role === 'ACCOUNTANT' || role === 'MASTER'
}

/**
 * 분개 작성 권한 — ACCOUNTANT / MASTER. canAccessAccounting 와 동일하지만
 * 향후 readonly role (예: AUDITOR) 분리에 대비해 별도 함수.
 */
export function canCreateJournal(
  role: string | undefined | null,
): boolean {
  if (!role) return false
  return role === 'ACCOUNTANT' || role === 'MASTER'
}

/**
 * 분개 확정 (POST/REVERSE) 권한 — MASTER 만. ACCOUNTANT 는 작성/조회만.
 */
export function canPostJournal(role: string | undefined | null): boolean {
  if (!role) return false
  return role === 'MASTER'
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
