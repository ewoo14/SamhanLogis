import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError } from 'axios'
import { apiClient } from './client'
import { getJournal, postJournal, updateJournal } from './accounting'

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

describe('accounting journal API error contract', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset()
    vi.mocked(apiClient.post).mockReset()
    vi.mocked(apiClient.put).mockReset()
  })

  it('postJournal 은 BE ApiResponse.message 를 Error.message 로 전달한다', async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce(new AxiosError(
      'Request failed with status code 403',
      undefined,
      undefined,
      undefined,
      {
        data: {
          success: false,
          code: 'FORBIDDEN',
          message: '결재라인 결재자만 회계전표를 게시할 수 있습니다.',
        },
        status: 403,
        statusText: 'Forbidden',
        headers: {},
        config: {} as never,
      },
    ))

    await expect(postJournal('journal-1')).rejects.toThrow(
      '결재라인 결재자만 회계전표를 게시할 수 있습니다.',
    )
  })

  it('getJournal 은 BE line partnerId 와 version 을 slice-2 PUT 왕복용으로 보존한다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        data: {
          id: 'journal-1',
          journalNo: 'JV-2026-001',
          journalDate: '2026-05-04',
          status: 'DRAFT',
          description: '수정 대상',
          totalDebit: '1000',
          totalCredit: '1000',
          version: 7,
          lines: [
            {
              lineId: 'line-1',
              lineNo: 1,
              accountCode: '101',
              debitAmount: '1000',
              creditAmount: '0',
              partnerId: '11111111-1111-1111-1111-111111111111',
              partnerName: '거래처A',
              memo: '차변',
            },
          ],
        },
      },
    })

    const journal = await getJournal('journal-1')

    expect(journal.version).toBe(7)
    expect(journal.lines[0].partnerId).toBe('11111111-1111-1111-1111-111111111111')
  })

  it('updateJournal 은 note 를 memo 로 정규화하고 단일 memo 키만 PUT body 에 보낸다', async () => {
    vi.mocked(apiClient.put).mockResolvedValueOnce({
      data: {
        data: {
          id: 'journal-1',
          journalNo: 'JV-2026-001',
          journalDate: '2026-05-04',
          status: 'DRAFT',
          totalDebit: '1000',
          totalCredit: '1000',
          version: 8,
          lines: [],
        },
      },
    })

    await updateJournal('journal-1', {
      expectedVersion: 7,
      journalDate: '2026-05-04',
      description: '수정',
      lines: [
        {
          accountCode: '101',
          debit: '1000',
          credit: '0',
          partnerId: '11111111-1111-1111-1111-111111111111',
          partnerName: '거래처A',
          note: '라인 메모',
        },
      ],
    })

    // note 만 입력해도 BE @JsonAlias 이중키 충돌을 피하기 위해 memo 단일 키로만 정규화되어
    // 전송되어야 한다(note 키는 포함하지 않음).
    expect(apiClient.put).toHaveBeenCalledWith('/accounting/journals/journal-1', {
      expectedVersion: 7,
      journalDate: '2026-05-04',
      description: '수정',
      lines: [
        {
          accountCode: '101',
          debit: '1000',
          credit: '0',
          partnerId: '11111111-1111-1111-1111-111111111111',
          partnerName: '거래처A',
          memo: '라인 메모',
        },
      ],
    })
  })
})
