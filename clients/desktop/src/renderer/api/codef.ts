import { apiClient, type ApiEnvelope } from './client'

export type CodefImportType = 'BANK' | 'CARD' | 'LOAN' | 'ALL'
export type CodefSubmitMethod = 'DRY_RUN' | 'CODEF'
export type CodefScopeMode = 'ALL' | 'SELECTED'

export interface CodefBankAccountItem {
  ref: string
  name: string
  bankName: string
  accountNumber: string
}

export interface CodefCardItem {
  ref: string
  name: string
  issuerName: string
  cardNumber: string
}

export interface CodefLoanItem {
  ref: string
  name: string
  lenderName: string
  loanType: string
}

export interface CodefImportScope {
  connectedId: string
  accountRefs: string[]
  cardRefs: string[]
  loanRefs: string[]
  defaultImportType: CodefImportType
  /**
   * 저장된 선택 범위. 저장 요청(PUT)에서는 항상 명시(ALL/SELECTED)해야 한다.
   * 조회 응답(GET)에서는 한 번도 저장한 적 없으면 {@code null}(미저장)로 온다 —
   * '전체 저장'과 '미저장'을 재방문 시에도 구별하기 위한 3-상태 필드다(#825 슬5 R1 H-4).
  */
  scopeMode: CodefScopeMode | null
  /** 저장 행 버전. 미저장 상태는 null이며 PUT 요청의 낙관적 잠금값으로 사용한다. */
  version: number | null
}

export interface CodefScopedImportRequest {
  connectedId: string
  from: string
  to: string
  type: CodefImportType
  scopeMode: CodefScopeMode
  accountRefs?: string[] | null
  cardRefs?: string[] | null
  loanRefs?: string[] | null
}

export interface CodefImportResponse {
  fetchedCount: number
  importedCount: number
  duplicateSkippedCount: number
  matchedCount: number
  staleSkippedCount: number
  staleNormalizedNames: string[]
  /**
   * 거래처 조회 일시 장애(UNAVAILABLE)로 저장 없이 skip 한 건수(#810 R3 L2-M1) —
   * stale(영구·재선택 필요)과 별개인 재시도 대상. 미저장이라 다음 가져오기에서 재적재·재매칭된다.
   */
  unavailableSkippedCount: number
  /** unavailable skip 근거 이름 — 매핑 정규화 키 또는 상대처명(중복 제거). */
  unavailableNames: string[]
}

export async function listCodefBankAccounts(
  connectedId: string,
): Promise<CodefBankAccountItem[]> {
  const res = await apiClient.get<ApiEnvelope<{ accounts: CodefBankAccountItem[] }>>(
    '/accounting/codef/bank-accounts',
    { params: { connectedId } },
  )
  return res.data.data.accounts
}

export async function listCodefCards(
  connectedId: string,
): Promise<CodefCardItem[]> {
  const res = await apiClient.get<ApiEnvelope<{ cards: CodefCardItem[] }>>(
    '/accounting/codef/cards',
    { params: { connectedId } },
  )
  return res.data.data.cards
}

export async function listCodefLoans(
  connectedId: string,
): Promise<CodefLoanItem[]> {
  const res = await apiClient.get<ApiEnvelope<{ loans: CodefLoanItem[] }>>(
    '/accounting/codef/loans',
    { params: { connectedId } },
  )
  return res.data.data.loans
}

export async function saveCodefImportScope(
  scope: CodefImportScope,
): Promise<CodefImportScope> {
  const res = await apiClient.put<ApiEnvelope<CodefImportScope>>(
    '/accounting/codef/scopes',
    scope,
  )
  return res.data.data
}

export async function loadCodefImportScope(
  connectedId: string,
): Promise<CodefImportScope> {
  const res = await apiClient.get<ApiEnvelope<CodefImportScope>>(
    '/accounting/codef/scopes',
    { params: { connectedId } },
  )
  return res.data.data
}

export async function importScopedCodef(
  request: CodefScopedImportRequest,
): Promise<CodefImportResponse> {
  const res = await apiClient.post<ApiEnvelope<CodefImportResponse>>(
    '/accounting/codef/import-scoped',
    {
      ...request,
      // 실 CODEF 계약 활성 시 'CODEF' 로 전환한다.
      submitMethod: 'DRY_RUN' satisfies CodefSubmitMethod,
    },
  )
  return res.data.data
}
