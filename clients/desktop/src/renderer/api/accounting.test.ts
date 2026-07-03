import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError } from 'axios'
import { apiClient } from './client'
import { normalizeJournal, postJournal, reverseJournal } from './accounting'

vi.mock('./client', () => ({
  apiClient: {
    post: vi.fn(),
  },
}))

describe('accounting journal API error contract', () => {
  beforeEach(() => {
    vi.mocked(apiClient.post).mockReset()
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

  it('reverseJournal 은 BE 409 안내 메시지를 Error.message 로 전달한다', async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce(new AxiosError(
      'Request failed with status code 409',
      undefined,
      undefined,
      undefined,
      {
        data: {
          success: false,
          code: 'CONFLICT',
          message: '입금보고서 자동 분개는 원장에서 직접 역분개할 수 없습니다 — 입금보고서 취소/수정으로 처리하세요',
        },
        status: 409,
        statusText: 'Conflict',
        headers: {},
        config: {} as never,
      },
    ))

    await expect(reverseJournal('journal-1', '취소')).rejects.toThrow(
      '입금보고서 자동 분개는 원장에서 직접 역분개할 수 없습니다',
    )
  })

  it('normalizeJournal 은 sourceType 을 보존한다', () => {
    const journal = normalizeJournal({
      id: 'journal-1',
      journalNo: '2026/07/03-1',
      journalDate: '2026-07-03',
      status: 'POSTED',
      sourceType: 'CASH_RECEIPT',
      lines: [],
    })

    expect(journal.sourceType).toBe('CASH_RECEIPT')
  })

  it('normalizeJournal 은 sourceType 누락 시 MANUAL 로 폴백한다', () => {
    const journal = normalizeJournal({
      id: 'journal-1',
      journalNo: '2026/07/03-1',
      journalDate: '2026-07-03',
      status: 'POSTED',
      lines: [],
    })

    expect(journal.sourceType).toBe('MANUAL')
  })
})
