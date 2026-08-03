import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { fetchInbox, markMessageRead, searchRecipients, sendBulkMessage } from './messengerApi'

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
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
      { params: { q: '김', limit: '10000' } },
    )
  })

  it('bulk 발송은 recipientIds와 본문만 전송한다', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(envelope({ batchId: 'batch', sentCount: 1, messages: [] }))
    const payload = { recipientIds: ['seed-recipient-1'], body: '본문' }

    await sendBulkMessage(payload)

    expect(apiClient.post).toHaveBeenCalledWith('/admin/groupware/messages/bulk', payload)
  })

  it('수신함은 호출자 고정 inbox endpoint를 page=0 기본값으로 사용한다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(envelope([]))

    await fetchInbox()

    expect(apiClient.get).toHaveBeenCalledWith(
      '/admin/groupware/messages/inbox',
      { params: { page: 0 } },
    )
  })

  it('M5 수신함 페이지 번호를 쿼리로 전달한다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(envelope([]))

    await fetchInbox(2)

    expect(apiClient.get).toHaveBeenCalledWith(
      '/admin/groupware/messages/inbox',
      { params: { page: 2 } },
    )
  })

  it('D 수신함은 서버의 실제 다음 페이지 헤더를 보존한다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      ...envelope([]),
      headers: { 'x-has-next-page': 'true' },
    })

    const result = await fetchInbox()

    expect(result.hasNextPage).toBe(true)
  })

  it('쪽지 읽음 처리는 messageId 경로의 PUT endpoint를 호출한다', async () => {
    const message = {
      messageId: 'message-1',
      senderId: 'sender-1',
      senderDisplayName: '발신자',
      recipientId: 'recipient-1',
      body: '본문',
      status: 'READ' as const,
      sentAt: '2026-07-22T00:00:00Z',
      readAt: '2026-07-22T00:01:00Z',
    }
    vi.mocked(apiClient.put).mockResolvedValueOnce(envelope(message))

    await expect(markMessageRead(message.messageId)).resolves.toEqual(message)

    expect(apiClient.put).toHaveBeenCalledWith('/admin/groupware/messages/message-1/read')
  })
})
