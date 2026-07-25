import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import {
  importScopedCodef,
  listCodefBankAccounts,
  listCodefCards,
  listCodefLoans,
  loadCodefImportScope,
  saveCodefImportScope,
  type CodefImportScope,
  type CodefScopedImportRequest,
} from './codef'

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

describe('codef API BC3 계약', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset()
    vi.mocked(apiClient.post).mockReset()
    vi.mocked(apiClient.put).mockReset()
  })

  it('연결 식별자로 계좌/카드/대출 목록을 조회한다', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: { data: { accounts: [{ ref: 'bank-1', name: '운영계좌', bankName: '국민은행', accountNumber: '123' }] } } })
      .mockResolvedValueOnce({ data: { data: { cards: [{ ref: 'card-1', name: '물류카드', issuerName: '신한카드', cardNumber: '9999' }] } } })
      .mockResolvedValueOnce({ data: { data: { loans: [{ ref: 'loan-1', name: '운전자금', lenderName: '하나은행', loanType: '운전자금' }] } } })

    await expect(listCodefBankAccounts('connected-main')).resolves.toEqual([
      { ref: 'bank-1', name: '운영계좌', bankName: '국민은행', accountNumber: '123' },
    ])
    await expect(listCodefCards('connected-main')).resolves.toEqual([
      { ref: 'card-1', name: '물류카드', issuerName: '신한카드', cardNumber: '9999' },
    ])
    await expect(listCodefLoans('connected-main')).resolves.toEqual([
      { ref: 'loan-1', name: '운전자금', lenderName: '하나은행', loanType: '운전자금' },
    ])

    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/accounting/codef/bank-accounts', { params: { connectedId: 'connected-main' } })
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/accounting/codef/cards', { params: { connectedId: 'connected-main' } })
    expect(apiClient.get).toHaveBeenNthCalledWith(3, '/accounting/codef/loans', { params: { connectedId: 'connected-main' } })
  })

  it('사용자별 가져오기 선택을 저장하고 조회한다', async () => {
    const scope: CodefImportScope = {
      connectedId: 'connected-main',
      accountRefs: ['bank-1'],
      cardRefs: ['card-1'],
      loanRefs: [],
      defaultImportType: 'ALL',
      scopeMode: 'SELECTED',
      version: 0,
    }
    vi.mocked(apiClient.put).mockResolvedValueOnce({ data: { data: scope } })
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: scope } })

    await expect(saveCodefImportScope(scope)).resolves.toEqual(scope)
    await expect(loadCodefImportScope('connected-main')).resolves.toEqual(scope)

    expect(apiClient.put).toHaveBeenCalledWith('/accounting/codef/scopes', scope)
    expect(apiClient.get).toHaveBeenCalledWith('/accounting/codef/scopes', { params: { connectedId: 'connected-main' } })
  })

  it('다중 선택 가져오기는 BC3a DTO 배열 필드를 그대로 전송한다', async () => {
    const request: CodefScopedImportRequest = {
      connectedId: 'connected-main',
      from: '2026-06-01',
      to: '2026-06-26',
      type: 'CARD',
      scopeMode: 'SELECTED',
      accountRefs: [],
      cardRefs: ['card-1', 'card-2'],
      loanRefs: [],
    }
    // #810 R3 (L2-M1): BE CodefImportResponse 전체 필드 형태 — stale(영구)·unavailable(일시장애) additive.
    const result = {
      fetchedCount: 4,
      importedCount: 3,
      duplicateSkippedCount: 1,
      matchedCount: 0,
      staleSkippedCount: 0,
      staleNormalizedNames: [],
      unavailableSkippedCount: 0,
      unavailableNames: [],
    }
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: result } })

    await expect(importScopedCodef(request)).resolves.toEqual(result)

    expect(apiClient.post).toHaveBeenCalledWith('/accounting/codef/import-scoped', {
      ...request,
      submitMethod: 'DRY_RUN',
    })
  })
})
