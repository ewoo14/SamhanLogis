// @vitest-environment jsdom

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MessengerPage } from './MessengerPage'
import * as messengerApi from '../api/messengerApi'
import * as notificationApi from '../api/notificationApi'
import { usePermissions } from '../hooks/usePermissions'

vi.mock('../api/messengerApi')
vi.mock('../api/notificationApi')
vi.mock('../hooks/usePermissions', () => ({ usePermissions: vi.fn() }))
vi.mock('../auth/authProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth/authProvider')>()
  return {
    ...actual,
    getAuthProvider: () => ({
      getSession: async () => ({ userId: 'self-user-id', role: 'SALES', fullName: '나' }),
    }),
  }
})

const recipient = {
  userId: 'user-003',
  name: '김수신',
  department: '영업팀',
  employeeCode: null,
}

const secondRecipient = {
  userId: 'user-004',
  name: '박수신',
  department: '구매팀',
  employeeCode: null,
}

const selfOption = {
  userId: 'self-user-id',
  name: '나',
  department: '영업팀',
  employeeCode: null,
}

const duplicateNameA = {
  userId: 'dup-a',
  name: '채권추심',
  department: '회계팀',
  employeeCode: '00000',
}
const duplicateNameB = {
  userId: 'dup-b',
  name: '채권추심',
  department: '영업2팀',
  employeeCode: '999-99-99999',
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

beforeEach(() => {
  vi.mocked(notificationApi.acknowledgeMessengerNotifications).mockResolvedValue(undefined)
  vi.mocked(usePermissions).mockReturnValue({
    canAccess: () => true,
    permissions: [],
    isLoading: false,
    isError: false,
  })
})

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <MessengerPage />
    </QueryClientProvider>,
  )
  return { ...rendered, queryClient }
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

  it('R3-4 발송 실패 시 선택한 칩과 본문을 보존한다', async () => {
    vi.mocked(messengerApi.fetchInbox).mockResolvedValue([])
    vi.mocked(messengerApi.searchRecipients).mockResolvedValue([recipient])
    vi.mocked(messengerApi.sendBulkMessage).mockRejectedValue(new Error('send failed'))

    renderPage()
    fireEvent.change(screen.getByTestId('messenger-recipient-search'), { target: { value: '김' } })
    await waitFor(() => expect(screen.getByText('김수신')).toBeTruthy())
    fireEvent.mouseDown(screen.getByText('김수신'))
    fireEvent.change(screen.getByTestId('messenger-body'), { target: { value: '보존되어야 하는 본문' } })
    await waitFor(() => expect((screen.getByRole('button', { name: '발송' }) as HTMLButtonElement).disabled).toBe(false))

    fireEvent.submit(screen.getByRole('button', { name: '발송' }).closest('form')!)

    await waitFor(() => expect(messengerApi.sendBulkMessage).toHaveBeenCalledTimes(1))
    expect(screen.getAllByTestId('messenger-recipient-chip')).toHaveLength(1)
    expect((screen.getByTestId('messenger-body') as HTMLTextAreaElement).value).toBe('보존되어야 하는 본문')
  })

  it('R3-5 칩 제거 후 발송 payload에는 남은 수신자만 포함한다', async () => {
    vi.mocked(messengerApi.fetchInbox).mockResolvedValue([])
    vi.mocked(messengerApi.searchRecipients).mockResolvedValue([recipient, secondRecipient])
    vi.mocked(messengerApi.sendBulkMessage).mockResolvedValue({ batchId: 'batch', sentCount: 1, messages: [] })

    renderPage()
    const input = screen.getByTestId('messenger-recipient-search')
    fireEvent.change(input, { target: { value: '수신' } })
    await waitFor(() => expect(screen.getByText('김수신')).toBeTruthy())
    fireEvent.click(screen.getByRole('checkbox', { name: '김수신' }))
    fireEvent.click(screen.getByRole('button', { name: '선택 확정' }))
    fireEvent.change(input, { target: { value: '박수신' } })
    await waitFor(() => expect(screen.getByText('박수신')).toBeTruthy())
    fireEvent.mouseDown(screen.getByText('박수신'))
    await waitFor(() => expect(screen.getAllByTestId('messenger-recipient-chip')).toHaveLength(2))

    fireEvent.click(screen.getByRole('button', { name: /김수신.*제거/ }))
    await waitFor(() => expect(screen.getAllByTestId('messenger-recipient-chip')).toHaveLength(1))
    fireEvent.change(screen.getByTestId('messenger-body'), { target: { value: '남은 수신자에게만 발송' } })
    await waitFor(() => expect((screen.getByRole('button', { name: '발송' }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.submit(screen.getByRole('button', { name: '발송' }).closest('form')!)

    await waitFor(() => expect(messengerApi.sendBulkMessage).toHaveBeenCalledTimes(1))
    expect(messengerApi.sendBulkMessage.mock.calls[0]?.[0]).toEqual({
      recipientIds: [secondRecipient.userId],
      body: '남은 수신자에게만 발송',
    })
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
      senderDisplayName: '발신자',
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

  it('H-2 BE 오류 메시지가 axios 영문 메시지 대신 화면에 그대로 뜬다', async () => {
    vi.mocked(messengerApi.fetchInbox).mockResolvedValue([])
    vi.mocked(messengerApi.searchRecipients).mockResolvedValue([recipient])
    const axiosLikeError = Object.assign(new Error('Request failed with status code 400'), {
      isAxiosError: true,
      response: { status: 400, data: { code: 'INVALID_INPUT', message: '본인은 수신자로 지정할 수 없습니다' } },
    })
    vi.mocked(messengerApi.sendBulkMessage).mockRejectedValue(axiosLikeError)

    renderPage()
    fireEvent.change(screen.getByTestId('messenger-recipient-search'), { target: { value: '김' } })
    await waitFor(() => expect(screen.getByText('김수신')).toBeTruthy())
    fireEvent.mouseDown(screen.getByText('김수신'))
    fireEvent.change(screen.getByTestId('messenger-body'), { target: { value: '본문' } })
    await waitFor(() => expect((screen.getByRole('button', { name: '발송' }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.submit(screen.getByRole('button', { name: '발송' }).closest('form')!)

    await waitFor(() => expect(screen.getByText('본인은 수신자로 지정할 수 없습니다')).toBeTruthy())
    expect(screen.queryByText('Request failed with status code 400')).toBeNull()
  })

  it('H-3 검색 후보에는 본인이 나타나지 않는다', async () => {
    vi.mocked(messengerApi.fetchInbox).mockResolvedValue([])
    vi.mocked(messengerApi.searchRecipients).mockResolvedValue([selfOption, recipient])

    renderPage()
    // 세션 조회(현재 사용자 UUID)가 커밋될 시간을 준 뒤 검색한다 — 자기자신 필터는 세션 로드 이후 적용된다.
    await new Promise((resolve) => setTimeout(resolve, 20))
    fireEvent.change(screen.getByTestId('messenger-recipient-search'), { target: { value: '아' } })
    await waitFor(() => expect(screen.getByText('김수신')).toBeTruthy())
    expect(screen.queryByRole('option', { name: /^나(\s|$)/ })).toBeNull()
  })

  it('H-4 발송 권한이 없으면 발송 폼 전체가 비활성이고 POST할 수 없다', async () => {
    vi.mocked(usePermissions).mockReturnValue({
      canAccess: () => false,
      permissions: [],
      isLoading: false,
      isError: false,
    })
    vi.mocked(messengerApi.fetchInbox).mockResolvedValue([])
    vi.mocked(messengerApi.searchRecipients).mockResolvedValue([recipient])

    renderPage()

    expect((screen.getByRole('button', { name: '발송' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('messenger-recipient-search') as HTMLInputElement).disabled).toBe(true)
    // textarea 자체엔 disabled 속성을 직접 걸지 않고 감싸는 <fieldset disabled>로 전체를 잠근다.
    // HTMLTextAreaElement.disabled IDL은 fieldset 상속을 반영하지 않으므로 fieldset 쪽을 확인한다.
    expect(screen.getByTestId('messenger-body').closest('fieldset')?.disabled).toBe(true)
    expect(screen.getByRole('alert').textContent).toContain('권한이 없어')
  })

  it('M-1/M-2 미열람 N건에도 markRead는 N회, 알림 확인은 방금 읽은 messageId로만 1회 스코프한다', async () => {
    const unread = Array.from({ length: 5 }, (_, i) => ({
      messageId: `msg-${i}`,
      senderId: 'sender-1',
      senderDisplayName: '발신자',
      recipientId: 'me',
      body: `본문 ${i}`,
      status: 'UNREAD' as const,
      sentAt: '2026-07-22T00:00:00Z',
      readAt: null,
    }))
    vi.mocked(messengerApi.fetchInbox).mockResolvedValue(unread)
    vi.mocked(messengerApi.searchRecipients).mockResolvedValue([])
    vi.mocked(messengerApi.markMessageRead).mockImplementation(async (id: string) => ({
      ...unread.find((m) => m.messageId === id)!,
      status: 'READ',
      readAt: '2026-07-22T00:01:00Z',
    }))

    renderPage()

    await waitFor(() => expect(messengerApi.markMessageRead).toHaveBeenCalledTimes(5))
    await waitFor(() => expect(notificationApi.acknowledgeMessengerNotifications).toHaveBeenCalledTimes(1))
    const scopedIds = vi.mocked(notificationApi.acknowledgeMessengerNotifications).mock.calls[0]![0] as string[]
    expect(new Set(scopedIds)).toEqual(new Set(unread.map((m) => m.messageId)))
  })

  it('M-3 수신함 행에 발신자 표시명이 보인다', async () => {
    vi.mocked(messengerApi.fetchInbox).mockResolvedValue([{
      messageId: 'msg-name',
      senderId: 'sender-1',
      senderDisplayName: '김발신',
      recipientId: 'me',
      body: '본문',
      status: 'READ',
      sentAt: '2026-07-22T00:00:00Z',
      readAt: '2026-07-22T00:01:00Z',
    }])
    vi.mocked(messengerApi.searchRecipients).mockResolvedValue([])

    renderPage()

    await waitFor(() => expect(screen.getByText('김발신')).toBeTruthy())
  })

  it('M-4 읽음 처리가 계속 실패하면 상한 후 화면에 실패를 드러내고 무한 재시도하지 않는다', async () => {
    const unread = {
      messageId: 'msg-fail',
      senderId: 'sender-1',
      senderDisplayName: '발신자',
      recipientId: 'me',
      body: '실패 대상',
      status: 'UNREAD' as const,
      sentAt: '2026-07-22T00:00:00Z',
      readAt: null,
    }
    vi.mocked(messengerApi.fetchInbox).mockResolvedValue([unread])
    vi.mocked(messengerApi.searchRecipients).mockResolvedValue([])
    vi.mocked(messengerApi.markMessageRead).mockRejectedValue(new Error('network'))

    renderPage()

    // 즉시 재시도 3회(상한) 소진 후 화면에 실패가 드러나야 한다.
    await waitFor(() => expect(screen.getByText('읽음 처리에 실패했습니다.')).toBeTruthy())
    await waitFor(() => expect(messengerApi.markMessageRead).toHaveBeenCalledTimes(3))

    // 추가 시간이 지나도 더 이상 재시도(무한 재시도)하지 않는다.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(messengerApi.markMessageRead).toHaveBeenCalledTimes(3)
  })

  it('R3-1 acknowledge가 일시 실패해도 같은 화면에서 재시도하여 배지를 복구한다', async () => {
    const unread = {
      messageId: 'msg-ack-retry',
      senderId: 'sender-1',
      senderDisplayName: '발신자',
      recipientId: 'me',
      body: 'ack 재시도',
      status: 'UNREAD' as const,
      sentAt: '2026-07-22T00:00:00Z',
      readAt: null,
    }
    vi.mocked(messengerApi.fetchInbox).mockResolvedValue([unread])
    vi.mocked(messengerApi.searchRecipients).mockResolvedValue([])
    vi.mocked(messengerApi.markMessageRead).mockResolvedValue({
      ...unread,
      status: 'READ',
      readAt: '2026-07-22T00:01:00Z',
    })
    vi.mocked(notificationApi.acknowledgeMessengerNotifications)
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce(undefined)

    renderPage()

    await waitFor(() => expect(notificationApi.acknowledgeMessengerNotifications).toHaveBeenCalledTimes(2))
  })

  it('R3-2 markRead 3회 실패 후 refetch하면 같은 화면에서 해당 쪽지를 재시도한다', async () => {
    const unread = {
      messageId: 'msg-mark-read-retry',
      senderId: 'sender-1',
      senderDisplayName: '발신자',
      recipientId: 'me',
      body: 'markRead 재시도',
      status: 'UNREAD' as const,
      sentAt: '2026-07-22T00:00:00Z',
      readAt: null,
    }
    let fetchCount = 0
    vi.mocked(messengerApi.fetchInbox).mockImplementation(async () => ([{
      ...unread,
      body: fetchCount++ === 0 ? unread.body : 'refetched markRead 재시도',
    }]))
    vi.mocked(messengerApi.searchRecipients).mockResolvedValue([])
    vi.mocked(messengerApi.markMessageRead)
      .mockRejectedValueOnce(new Error('1'))
      .mockRejectedValueOnce(new Error('2'))
      .mockRejectedValueOnce(new Error('3'))
      .mockResolvedValueOnce({ ...unread, status: 'READ', readAt: '2026-07-22T00:01:00Z' })

    const { queryClient } = renderPage()
    await waitFor(() => expect(messengerApi.markMessageRead).toHaveBeenCalledTimes(3))

    await queryClient.invalidateQueries({ queryKey: ['messenger', 'inbox', 0] })
    await waitFor(() => expect(messengerApi.markMessageRead).toHaveBeenCalledTimes(4))
  })

  it('R3-3 늦게 끝난 읽음 실패가 발송 오류 사유를 덮어쓰지 않는다', async () => {
    const unread = {
      messageId: 'msg-feedback-race',
      senderId: 'sender-1',
      senderDisplayName: '발신자',
      recipientId: 'me',
      body: 'feedback 경합',
      status: 'UNREAD' as const,
      sentAt: '2026-07-22T00:00:00Z',
      readAt: null,
    }
    vi.mocked(messengerApi.fetchInbox).mockResolvedValue([unread])
    vi.mocked(messengerApi.searchRecipients).mockResolvedValue([recipient])
    vi.mocked(messengerApi.markMessageRead).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      throw new Error('markRead down')
    })
    const sendError = Object.assign(new Error('Request failed'), {
      isAxiosError: true,
      response: { status: 400, data: { code: 'INVALID_INPUT', message: '발송할 수 없는 사유' } },
    })
    vi.mocked(messengerApi.sendBulkMessage).mockRejectedValue(sendError)

    renderPage()
    fireEvent.change(screen.getByTestId('messenger-recipient-search'), { target: { value: '김' } })
    await waitFor(() => expect(screen.getByText('김수신')).toBeTruthy())
    fireEvent.mouseDown(screen.getByText('김수신'))
    fireEvent.change(screen.getByTestId('messenger-body'), { target: { value: '본문' } })
    await waitFor(() => expect((screen.getByRole('button', { name: '발송' }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.submit(screen.getByRole('button', { name: '발송' }).closest('form')!)

    await waitFor(() => expect(screen.getByText('발송할 수 없는 사유')).toBeTruthy())
    await waitFor(() => expect(messengerApi.markMessageRead).toHaveBeenCalledTimes(3))
    expect(screen.getByText('발송할 수 없는 사유')).toBeTruthy()
    expect(screen.queryByText('일부 쪽지의 읽음 처리에 실패했습니다.')).toBeNull()
  })

  it('C 늦게 도착한 알림도 이미 READ인 쪽지의 refId로 다시 acknowledge한다', async () => {
    const read = {
      messageId: 'msg-late-notification',
      senderId: 'sender-1',
      senderDisplayName: '발신자',
      recipientId: 'me',
      body: '늦은 알림 대상',
      status: 'READ' as const,
      sentAt: '2026-07-22T00:00:00Z',
      readAt: '2026-07-22T00:01:00Z',
    }
    vi.mocked(messengerApi.fetchInbox).mockResolvedValue([read])
    vi.mocked(messengerApi.searchRecipients).mockResolvedValue([])

    const { queryClient } = renderPage()
    await waitFor(() => expect(notificationApi.acknowledgeMessengerNotifications).toHaveBeenCalledTimes(1))

    await queryClient.invalidateQueries({ queryKey: ['messenger', 'inbox', 0] })
    await waitFor(() => expect(notificationApi.acknowledgeMessengerNotifications).toHaveBeenCalledTimes(2))
    expect(notificationApi.acknowledgeMessengerNotifications).toHaveBeenLastCalledWith(['msg-late-notification'])
  })

  it('M-5 수신함이 50건이면 다음 페이지 버튼이 활성화되고 클릭 시 page=1을 요청한다', async () => {
    const fullPage = Object.assign(Array.from({ length: 50 }, (_, i) => ({
      messageId: `msg-${i}`,
      senderId: 'sender-1',
      senderDisplayName: '발신자',
      recipientId: 'me',
      body: `본문 ${i}`,
      status: 'READ' as const,
      sentAt: '2026-07-22T00:00:00Z',
      readAt: '2026-07-22T00:01:00Z',
    })), { hasNextPage: true })
    vi.mocked(messengerApi.fetchInbox).mockResolvedValue(fullPage)
    vi.mocked(messengerApi.searchRecipients).mockResolvedValue([])

    renderPage()

    await waitFor(() => expect(messengerApi.fetchInbox).toHaveBeenCalledWith(0))
    const next = screen.getByRole('button', { name: '다음' })
    await waitFor(() => expect((next as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(next)
    await waitFor(() => expect(messengerApi.fetchInbox).toHaveBeenCalledWith(1))
  })

  it('D 실제 다음 페이지가 없다고 응답하면 50건이어도 다음 이동을 막는다', async () => {
    const exactLastPage = Object.assign(Array.from({ length: 50 }, (_, i) => ({
      messageId: `last-${i}`,
      senderId: 'sender-1',
      senderDisplayName: '발신자',
      recipientId: 'me',
      body: `마지막 ${i}`,
      status: 'READ' as const,
      sentAt: '2026-07-22T00:00:00Z',
      readAt: '2026-07-22T00:01:00Z',
    })), { hasNextPage: false })
    vi.mocked(messengerApi.fetchInbox).mockResolvedValue(exactLastPage)
    vi.mocked(messengerApi.searchRecipients).mockResolvedValue([])

    renderPage()

    await waitFor(() => expect(messengerApi.fetchInbox).toHaveBeenCalledWith(0))
    await waitFor(() => expect(screen.getByText('마지막 0')).toBeTruthy())
    const next = screen.getByRole('button', { name: '다음' }) as HTMLButtonElement
    expect(next.disabled).toBe(true)
  })

  it('M-6 본문이 2000자를 넘으면 잘리고 무음이 아니라 화면에 안내가 뜬다', async () => {
    vi.mocked(messengerApi.fetchInbox).mockResolvedValue([])
    vi.mocked(messengerApi.searchRecipients).mockResolvedValue([])

    renderPage()
    const overLong = 'a'.repeat(2500)
    fireEvent.change(screen.getByTestId('messenger-body'), { target: { value: overLong } })

    expect((screen.getByTestId('messenger-body') as HTMLTextAreaElement).value).toHaveLength(2000)
    expect(screen.getByText(/2000자를 초과할 수 없어/)).toBeTruthy()
    expect(screen.getByTestId('messenger-body-counter').textContent).toContain('2000 / 2000')
  })

  it('L-2 수신자 상한에 도달하면 검색결과 없음과 구분되는 전용 안내가 뜬다', async () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      userId: `cap-${i}`,
      name: `사원${i}`,
      department: '영업팀',
      employeeCode: null,
    }))
    vi.mocked(messengerApi.fetchInbox).mockResolvedValue([])
    vi.mocked(messengerApi.searchRecipients).mockImplementation(async (query) =>
      many.filter((option) => option.name === query),
    )

    renderPage()
    const input = screen.getByTestId('messenger-recipient-search')
    for (const option of many) {
      fireEvent.change(input, { target: { value: option.name } })
      await waitFor(() => expect(screen.getByText(option.name)).toBeTruthy())
      fireEvent.mouseDown(screen.getByText(option.name))
    }

    await waitFor(() => expect(screen.getByTestId('multiselect-chip-count').textContent).toContain('50'))
    expect(screen.getByText(/최대 50명까지 선택할 수 있습니다/)).toBeTruthy()
  }, 30_000)

  it('M-7 검색 결과에 동명이인이 2건 이상이면 담당자코드를 병기하고, 아니면 병기하지 않는다', async () => {
    vi.mocked(messengerApi.fetchInbox).mockResolvedValue([])
    vi.mocked(messengerApi.searchRecipients).mockResolvedValue([duplicateNameA, duplicateNameB])

    renderPage()
    fireEvent.change(screen.getByTestId('messenger-recipient-search'), { target: { value: '채권' } })

    await waitFor(() => expect(screen.getAllByText(/채권추심 \(00000\)/).length).toBeGreaterThan(0))
    expect(screen.getAllByText(/채권추심 \(999-99-99999\)/).length).toBeGreaterThan(0)
  })

  it('M-7 동명이인이 없으면 평소처럼 이름·부서만 표시한다', async () => {
    vi.mocked(messengerApi.fetchInbox).mockResolvedValue([])
    vi.mocked(messengerApi.searchRecipients).mockResolvedValue([recipient])

    renderPage()
    fireEvent.change(screen.getByTestId('messenger-recipient-search'), { target: { value: '김' } })

    await waitFor(() => expect(screen.getByText('김수신')).toBeTruthy())
    const listbox = screen.getByRole('listbox', { name: '메신저 수신자 검색 결과' })
    expect(listbox.textContent).not.toContain('(')
  })
})
