import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError } from 'axios'
import { apiClient } from './client'
import {
  cancelCashReceipt,
  confirmCashReceipt,
  createCashReceipt,
  deleteCashReceipt,
  getCashReceipt,
  normalizeJournal,
  postJournal,
  reverseJournal,
  updateCashReceipt,
} from './accounting'

vi.mock('./client', () => ({
  apiClient: {
    delete: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
}))

function apiMessageError(message: string, status = 400): AxiosError {
  return new AxiosError(
    `Request failed with status code ${status}`,
    undefined,
    undefined,
    undefined,
    {
      data: {
        success: false,
        code: 'CASH_RECEIPT_ERROR',
        message,
      },
      status,
      statusText: 'Error',
      headers: {},
      config: {} as never,
    },
  )
}

describe('accounting journal API error contract', () => {
  beforeEach(() => {
    vi.mocked(apiClient.delete).mockReset()
    vi.mocked(apiClient.get).mockReset()
    vi.mocked(apiClient.patch).mockReset()
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

  it('normalizeJournal 은 sourceRefId 를 cashReceiptId 후보로 보존한다', () => {
    const journal = normalizeJournal({
      id: 'journal-1',
      journalNo: '2026/07/03-1',
      journalDate: '2026-07-03',
      status: 'POSTED',
      sourceType: 'CASH_RECEIPT',
      sourceRefId: '00000000-0000-4000-8000-000000000717',
      lines: [],
    })

    expect(journal.sourceRefId).toBe('00000000-0000-4000-8000-000000000717')
  })

  // #771 — 역분개는 sourceRefId=원분개 Journal UUID (CashReceipt UUID 아님, 이중 의미). BE 가
  // 이제 원분개/역분개 모두 전용 cashReceiptId 를 채워 보내므로, cashReceiptId 가 없을 때 더 이상
  // sourceRefId 로 fallback 하면 안 된다 — fallback 하면 역분개 상세에서 원분개 UUID 가 CashReceipt
  // UUID 로 오인되어 잘못된 "입금보고서 보기" 링크가 만들어진다(과거 latent 버그).
  it('normalizeJournal 은 cashReceiptId 미제공 시 sourceRefId 로 폴백하지 않는다', () => {
    const journal = normalizeJournal({
      id: 'journal-rev-1',
      journalNo: '2026/07/08-2',
      journalDate: '2026-07-08',
      status: 'POSTED',
      sourceType: 'CASH_RECEIPT',
      sourceRefId: '00000000-0000-4000-8000-000000000772',
      lines: [],
    })

    expect(journal.sourceRefId).toBe('00000000-0000-4000-8000-000000000772')
    expect(journal.cashReceiptId).toBeNull()
  })

  it('normalizeJournal 은 cashReceiptId 가 sourceRefId 와 달라도 cashReceiptId 값을 그대로 사용한다', () => {
    const journal = normalizeJournal({
      id: 'journal-rev-1',
      journalNo: '2026/07/08-2',
      journalDate: '2026-07-08',
      status: 'POSTED',
      sourceType: 'CASH_RECEIPT',
      sourceRefId: '00000000-0000-4000-8000-000000000772',
      cashReceiptId: '00000000-0000-4000-8000-000000000771',
      cashReceiptSlipNo: '2026/07/08-1',
      lines: [],
    })

    expect(journal.cashReceiptId).toBe('00000000-0000-4000-8000-000000000771')
    expect(journal.cashReceiptId).not.toBe(journal.sourceRefId)
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

describe('accounting cash receipt API error contract', () => {
  beforeEach(() => {
    vi.mocked(apiClient.delete).mockReset()
    vi.mocked(apiClient.get).mockReset()
    vi.mocked(apiClient.patch).mockReset()
    vi.mocked(apiClient.post).mockReset()
  })

  const body = {
    partnerName: 'S4b 오류 거래처',
    amount: '1000',
    transactionDate: '2026-07-05',
  }

  it.each([
    [
      'createCashReceipt',
      () => {
        vi.mocked(apiClient.post).mockRejectedValueOnce(apiMessageError('입금보고서 생성 권한이 없습니다.'))
        return createCashReceipt(body)
      },
      '입금보고서 생성 권한이 없습니다.',
    ],
    [
      'getCashReceipt',
      () => {
        vi.mocked(apiClient.get).mockRejectedValueOnce(apiMessageError('입금보고서를 찾을 수 없습니다.', 404))
        return getCashReceipt('receipt-1')
      },
      '입금보고서를 찾을 수 없습니다.',
    ],
    [
      'updateCashReceipt',
      () => {
        vi.mocked(apiClient.patch).mockRejectedValueOnce(apiMessageError('통장연계 입금보고서는 수정할 수 없습니다. 취소 후 다시 생성하세요.', 409))
        return updateCashReceipt('receipt-1', body)
      },
      '통장연계 입금보고서는 수정할 수 없습니다. 취소 후 다시 생성하세요.',
    ],
    [
      'confirmCashReceipt',
      () => {
        vi.mocked(apiClient.post).mockRejectedValueOnce(apiMessageError('이미 확정된 입금보고서입니다.', 409))
        return confirmCashReceipt('receipt-1')
      },
      '이미 확정된 입금보고서입니다.',
    ],
    [
      'cancelCashReceipt',
      () => {
        vi.mocked(apiClient.post).mockRejectedValueOnce(apiMessageError('취소할 수 없는 입금보고서입니다.', 409))
        return cancelCashReceipt('receipt-1')
      },
      '취소할 수 없는 입금보고서입니다.',
    ],
    [
      'deleteCashReceipt',
      () => {
        vi.mocked(apiClient.delete).mockRejectedValueOnce(apiMessageError('DRAFT 입금보고서만 삭제할 수 있습니다.', 409))
        return deleteCashReceipt('receipt-1')
      },
      'DRAFT 입금보고서만 삭제할 수 있습니다.',
    ],
  ])('%s 는 BE ApiResponse.message 를 Error.message 로 전달한다', async (_name, run, message) => {
    await expect(run()).rejects.toThrow(message)
  })
})
