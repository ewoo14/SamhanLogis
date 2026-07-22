import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { fetchInbox, searchRecipients, sendBulkMessage } from './messengerApi'

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

const envelope = <T,>(data: T) => ({ data: { data } })

describe('메신저 API 계약', () => {
  beforeEach(() => vi.clearAllMocks())

  it('R16 수신자 검색은 전용 endpoint와 activeOnly를 사용한다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(envelope([]))

    await searchRecipients('김')

    expect(apiClient.get).toHaveBeenCalledWith(
      '/admin/groupware/messages/recipient-search',
      { params: { q: '김', limit: '20' } },
    )
  })

  it('bulk 발송은 recipientIds와 본문만 전송한다', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(envelope({ batchId: 'batch', sentCount: 1, messages: [] }))
    const payload = { recipientIds: ['seed-recipient-1'], body: '본문' }

    await sendBulkMessage(payload)

    expect(apiClient.post).toHaveBeenCalledWith('/admin/groupware/messages/bulk', payload)
  })

  it('수신함은 호출자 고정 inbox endpoint를 사용한다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(envelope([]))

    await fetchInbox()

    expect(apiClient.get).toHaveBeenCalledWith('/admin/groupware/messages/inbox')
  })
})
