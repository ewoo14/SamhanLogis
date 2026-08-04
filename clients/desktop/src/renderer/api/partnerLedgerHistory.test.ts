import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { captureLedger, getLedgerHistory, restoreLedger } from './partnerLedgerApi'

vi.mock('./client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}))

describe('거래처 원장 이력 API', () => {
  beforeEach(() => vi.mocked(apiClient.get).mockReset())

  it('이력 목록을 거래처·기간 조건으로 조회한다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: { content: [] } } })

    await getLedgerHistory('P-001', '2026-08-01', '2026-08-31')

    expect(apiClient.get).toHaveBeenCalledWith(
      '/accounting/journals/ledger-history',
      { params: { partnerCode: 'P-001', from: '2026-08-01', to: '2026-08-31' } },
    )
  })

  it('사용자 노출 배치번호로 저장 snapshot을 복원한다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: { batchNo: 'LED20260801120000000' } } })

    await restoreLedger('LED20260801120000000')

    expect(apiClient.get).toHaveBeenCalledWith(
      '/accounting/journals/ledger-history/LED20260801120000000/restore',
    )
  })

  it('명시적 저장 조작은 현재 거래처·기간으로 snapshot POST를 호출한다', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: {
      partnerCode: 'P-001', partnerName: '거래처', partnerBusinessNo: '',
      periodFrom: '2026-08-01', periodTo: '2026-08-31', documents: [],
    } } })

    await captureLedger('P-001', '2026-08-01', '2026-08-31')

    expect(apiClient.post).toHaveBeenCalledWith(
      '/accounting/journals/ledger-snapshots',
      null,
      { params: { partnerCode: 'P-001', from: '2026-08-01', to: '2026-08-31' } },
    )
  })
})
