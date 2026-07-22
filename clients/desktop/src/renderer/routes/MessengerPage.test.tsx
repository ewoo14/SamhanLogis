// @vitest-environment jsdom

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MessengerPage } from './MessengerPage'
import * as messengerApi from '../api/messengerApi'
import * as notificationApi from '../api/notificationApi'

vi.mock('../api/messengerApi')
vi.mock('../api/notificationApi')

const recipient = {
  userId: 'user-003',
  name: '김수신',
  department: '영업팀',
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

beforeEach(() => {
  vi.mocked(notificationApi.acknowledgeMessengerNotifications).mockResolvedValue(undefined)
})

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MessengerPage />
    </QueryClientProvider>,
  )
}

describe('MessengerPage', () => {
  it('R13 수신자 칩이 없으면 발송 버튼이 비활성이고 POST하지 않는다', async () => {
    vi.mocked(messengerApi.fetchInbox).mockResolvedValue([])
    vi.mocked(messengerApi.searchRecipients).mockResolvedValue([recipient])
    vi.mocked(messengerApi.sendBulkMessage).mockResolvedValue({ batchId: 'batch', sentCount: 1, messages: [] })

    renderPage()

    const send = screen.getByRole('button', { name: '발송' })
    expect((send as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(send)
    expect(messengerApi.sendBulkMessage).not.toHaveBeenCalled()
  })

  it('R14 발송 중 재클릭해도 POST는 한 번만 수행한다', async () => {
    let resolveSend!: (value: messengerApi.MessageBulkSendResponse) => void
    vi.mocked(messengerApi.fetchInbox).mockResolvedValue([])
    vi.mocked(messengerApi.searchRecipients).mockResolvedValue([recipient])
    vi.mocked(messengerApi.sendBulkMessage).mockImplementation(() => new Promise((resolve) => { resolveSend = resolve }))

    renderPage()
    const input = screen.getByTestId('messenger-recipient-search')
    fireEvent.change(input, { target: { value: '김' } })
    await waitFor(() => expect(screen.getByText('김수신')).toBeTruthy())
    fireEvent.mouseDown(screen.getByText('김수신'))
    await waitFor(() => expect(screen.getByTestId('multiselect-chip-count').textContent).toContain('1'))
    fireEvent.change(screen.getByTestId('messenger-body'), { target: { value: '본문' } })

    await waitFor(() => {
      expect((screen.getByRole('button', { name: '발송' }) as HTMLButtonElement).disabled).toBe(false)
    })
    const form = screen.getByRole('button', { name: '발송' }).closest('form')!
    fireEvent.submit(form)
    await waitFor(() => expect(messengerApi.sendBulkMessage).toHaveBeenCalledTimes(1))
    fireEvent.submit(form)
    expect(messengerApi.sendBulkMessage).toHaveBeenCalledTimes(1)
    resolveSend({ batchId: 'batch', sentCount: 1, messages: [] })
  })

  it('R15 칩에는 UUID가 아니라 이름과 부서만 표시한다', async () => {
    vi.mocked(messengerApi.fetchInbox).mockResolvedValue([])
    vi.mocked(messengerApi.searchRecipients).mockResolvedValue([recipient])
    renderPage()
    fireEvent.change(screen.getByTestId('messenger-recipient-search'), { target: { value: '김' } })
    await waitFor(() => expect(screen.getByText('김수신')).toBeTruthy())
    fireEvent.mouseDown(screen.getByText('김수신'))

    const chip = screen.getByTestId('messenger-recipient-chip')
    expect(chip.textContent).toContain('김수신')
    expect(chip.textContent).toContain('영업팀')
    expect(screen.getByRole('main').textContent).not.toContain(recipient.userId)
  })

  it('R16 이미 선택된 수신자는 검색 후보에 중복 표시되지 않는다', async () => {
    vi.mocked(messengerApi.fetchInbox).mockResolvedValue([])
    vi.mocked(messengerApi.searchRecipients).mockResolvedValue([recipient])
    renderPage()
    const input = screen.getByTestId('messenger-recipient-search')
    fireEvent.change(input, { target: { value: '김' } })
    await waitFor(() => expect(screen.getByText('김수신')).toBeTruthy())
    fireEvent.mouseDown(screen.getByText('김수신'))
    await waitFor(() => expect(screen.getByTestId('multiselect-chip-count').textContent).toContain('1'))
    fireEvent.change(input, { target: { value: '김' } })
    await waitFor(() => expect(messengerApi.searchRecipients).toHaveBeenCalled())
    expect(screen.queryByRole('option', { name: /김수신/ })).toBeNull()
    expect(screen.getAllByTestId('messenger-recipient-chip')).toHaveLength(1)
  })

  it('R17 수신함의 UNREAD 행은 열람 시 markRead endpoint를 한 번 호출하고 READ로 갱신한다', async () => {
    const unreadMessage: messengerApi.MessageResponse = {
      messageId: 'message-1',
      senderId: 'sender-1',
      recipientId: 'recipient-1',
      body: '읽음 처리 대상',
      status: 'UNREAD',
      sentAt: '2026-07-22T00:00:00Z',
      readAt: null,
    }
    const readMessage = { ...unreadMessage, status: 'READ' as const, readAt: '2026-07-22T00:01:00Z' }
    vi.mocked(messengerApi.fetchInbox).mockResolvedValue([unreadMessage])
    vi.mocked(messengerApi.markMessageRead).mockResolvedValue(readMessage)
    vi.mocked(messengerApi.searchRecipients).mockResolvedValue([])

    renderPage()

    await waitFor(() => expect(messengerApi.markMessageRead).toHaveBeenCalledWith('message-1'))
    await waitFor(() => expect(screen.getByText('읽음', { exact: true })).toBeTruthy())
    expect(messengerApi.markMessageRead).toHaveBeenCalledTimes(1)
  })
})
