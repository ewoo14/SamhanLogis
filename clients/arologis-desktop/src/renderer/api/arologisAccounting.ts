/**
 * 아로로지스 간이 회계 admin API (`/admin/arologis/accounting/**`).
 *
 * 단식부기(현금출납장). 분개/차변·대변/마감/세금계산서 개념 없음.
 *
 * UUID 비공개 가드: 거래 식별자(UUID)는 화면 routing / 수정·삭제 키 한정으로만 사용하고
 * 화면 텍스트에는 일자/유형/계정명/거래처/금액/적요만 노출한다. 계정 식별은 code 를 사용한다.
 *
 * 금액은 BE 가 BigDecimal 로 처리하나 JSON 직렬화 시 number 로 내려온다.
 *
 * BE 계약(PR #428): ArologisAccountingController + ArologisAccountingService 의 record
 * (CashTxnView / CashSummaryView / SimpleAccountView) 와 정확히 일치한다.
 */
import { apiClient, type ApiEnvelope } from './client'

/** 거래 유형 — 수입/지출 단식. */
export type CashTxnType = 'INCOME' | 'EXPENSE'

/** 계정과목 유형 — 자산/부채/수입/지출. */
export type AccountType = 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE'

/** 계정과목(SimpleAccountView). UUID 없음 — code 가 식별자. */
export interface SimpleAccountView {
  code: string
  name: string
  type: AccountType
  displayOrder: number
}

/** 현금 거래(CashTxnView). id 는 routing/수정·삭제 키 한정. */
export interface CashTxnView {
  id: string
  txnDate: string
  type: CashTxnType
  partnerName: string | null
  amount: number
  accountCode: string
  accountName: string | null
  description: string | null
}

/** 기간/월별 집계(CashSummaryView). */
export interface CashSummaryView {
  from: string
  to: string
  incomeTotal: number
  expenseTotal: number
  balance: number
  count: number
}

/** 현금 거래 등록/수정 요청(CashTxnRequest). */
export interface CashTxnRequest {
  txnDate: string
  type: CashTxnType
  partnerName: string | null
  amount: number
  accountCode: string
  description: string | null
}

/** 거래 목록 조회 필터(기간 필수 + 선택적 유형). */
export interface CashTxnListParams {
  from: string
  to: string
  type?: CashTxnType
}

const ACCOUNTING_BASE = '/admin/arologis/accounting'

/** 계정과목 목록 조회(활성). */
export async function listAccounts(): Promise<SimpleAccountView[]> {
  const res = await apiClient.get<ApiEnvelope<SimpleAccountView[]>>(`${ACCOUNTING_BASE}/accounts`)
  return res.data.data
}

/** 현금 거래 목록 조회(기간 + 선택적 유형 필터). */
export async function listCashTxns(params: CashTxnListParams): Promise<CashTxnView[]> {
  const res = await apiClient.get<ApiEnvelope<CashTxnView[]>>(`${ACCOUNTING_BASE}/cash-txns`, {
    params: {
      from: params.from,
      to: params.to,
      ...(params.type ? { type: params.type } : {}),
    },
  })
  return res.data.data
}

/** 현금 거래 단건 조회. */
export async function getCashTxn(id: string): Promise<CashTxnView> {
  const res = await apiClient.get<ApiEnvelope<CashTxnView>>(
    `${ACCOUNTING_BASE}/cash-txns/${encodeURIComponent(id)}`,
  )
  return res.data.data
}

/** 현금 거래 등록. */
export async function createCashTxn(body: CashTxnRequest): Promise<CashTxnView> {
  const res = await apiClient.post<ApiEnvelope<CashTxnView>>(
    `${ACCOUNTING_BASE}/cash-txns`,
    body,
  )
  return res.data.data
}

/** 현금 거래 수정. */
export async function updateCashTxn(id: string, body: CashTxnRequest): Promise<CashTxnView> {
  const res = await apiClient.put<ApiEnvelope<CashTxnView>>(
    `${ACCOUNTING_BASE}/cash-txns/${encodeURIComponent(id)}`,
    body,
  )
  return res.data.data
}

/** 현금 거래 삭제(soft-delete). */
export async function deleteCashTxn(id: string): Promise<void> {
  await apiClient.delete<ApiEnvelope<null>>(
    `${ACCOUNTING_BASE}/cash-txns/${encodeURIComponent(id)}`,
  )
}

/** 월별 집계 조회(연-월). */
export async function getMonthlySummary(year: number, month: number): Promise<CashSummaryView> {
  const res = await apiClient.get<ApiEnvelope<CashSummaryView>>(`${ACCOUNTING_BASE}/summary`, {
    params: { year, month },
  })
  return res.data.data
}

/** 기간 집계 조회(from~to). */
export async function getPeriodSummary(from: string, to: string): Promise<CashSummaryView> {
  const res = await apiClient.get<ApiEnvelope<CashSummaryView>>(`${ACCOUNTING_BASE}/summary`, {
    params: { from, to },
  })
  return res.data.data
}
