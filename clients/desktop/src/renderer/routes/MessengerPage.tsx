import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, FormField, MultiSelectAutocomplete, TagChip } from '@samhan/design-system'
import {
  fetchInbox,
  markMessageRead,
  searchRecipients,
  sendBulkMessage,
  type MessageResponse,
  type RecipientOption,
} from '../api/messengerApi'
import { acknowledgeMessengerNotifications } from '../api/notificationApi'
import { usePageTitle } from '../hooks/usePageTitle'

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return '메신저 발송에 실패했습니다.'
}

function inboxStatus(message: MessageResponse): string {
  return message.status === 'UNREAD' ? '읽지 않음' : '읽음'
}

/** 메신저 화면 — 수신자 칩 복수선택 발송 + 읽기 전용 수신함. */
export function MessengerPage() {
  usePageTitle('메신저')
  const queryClient = useQueryClient()
  const [selectedRecipients, setSelectedRecipients] = useState<RecipientOption[]>([])
  const [body, setBody] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [markedReadMessages, setMarkedReadMessages] = useState<Record<string, MessageResponse>>({})
  const markedReadIdsRef = useRef(new Set<string>())
  const inboxQuery = useQuery({
    queryKey: ['messenger', 'inbox'],
    queryFn: fetchInbox,
  })

  /** 수신함을 연 순간 읽지 않은 행만 서버 권위 endpoint로 읽음 처리한다. */
  useEffect(() => {
    const unreadMessages = (inboxQuery.data ?? []).filter(
      (message) => message.status === 'UNREAD' && !markedReadIdsRef.current.has(message.messageId),
    )
    if (unreadMessages.length === 0) return

    for (const message of unreadMessages) {
      markedReadIdsRef.current.add(message.messageId)
      void markMessageRead(message.messageId)
        .then((updatedMessage) => {
          setMarkedReadMessages((current) => ({ ...current, [message.messageId]: updatedMessage }))
          queryClient.setQueryData<MessageResponse[]>(['messenger', 'inbox'], (current) =>
            current?.map((item) => item.messageId === updatedMessage.messageId ? updatedMessage : item),
          )
          // 쪽지 읽음은 이미 성공했으므로 알림 센터 장애가 수신함 상태를 되돌리지 않게 한다.
          void acknowledgeMessengerNotifications()
            .catch(() => undefined)
            .then(() => queryClient.invalidateQueries({ queryKey: ['notifications'] }))
        })
        .catch(() => {
          // 실패한 행은 다음 수신함 refetch에서 다시 시도할 수 있게 한다.
          markedReadIdsRef.current.delete(message.messageId)
        })
    }
  }, [inboxQuery.data, queryClient])
  const sendMutation = useMutation({
    mutationFn: sendBulkMessage,
    onSuccess: async (result) => {
      setSelectedRecipients([])
      setBody('')
      setFeedback(`${result.sentCount}명에게 발송했습니다.`)
      await queryClient.invalidateQueries({ queryKey: ['messenger', 'inbox'] })
    },
    onError: (error) => setFeedback(errorMessage(error)),
  })

  const canSubmit = selectedRecipients.length > 0 && body.trim().length > 0 && !sendMutation.isPending

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return
    setFeedback(null)
    sendMutation.mutate({
      recipientIds: selectedRecipients.map((recipient) => recipient.userId),
      body: body.trim(),
    })
  }

  const inbox = (inboxQuery.data ?? []).map((message) => markedReadMessages[message.messageId] ?? message)

  return (
    <main data-testid="messenger-page" style={{ display: 'grid', gap: 20, padding: 24 }}>
      <header>
        <h3 style={{ margin: 0 }}>메신저</h3>
        <p style={{ margin: '6px 0 0', color: 'var(--color-neutral-600)' }}>
          사원에게 메시지를 보내고 받은 메시지를 확인합니다.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 20 }}>
        <section aria-labelledby="messenger-compose-title" style={{ display: 'grid', gap: 16 }}>
          <h4 id="messenger-compose-title" style={{ margin: 0 }}>메시지 발송</h4>
          {/* 수신자 칩은 내부 autocomplete input이 비어 있어도 선택값이 유효하므로 native required 검증은 사용하지 않는다. */}
          <form noValidate onSubmit={submit} style={{ display: 'grid', gap: 16 }}>
            <MultiSelectAutocomplete<RecipientOption, RecipientOption>
              selected={selectedRecipients}
              onAdd={(recipient) => setSelectedRecipients((current) => [...current, recipient])}
              onRemove={(recipient) => setSelectedRecipients((current) => current.filter((item) => item.userId !== recipient.userId))}
              search={searchRecipients}
              getOptionKey={(recipient) => recipient.userId}
              getSelectedKey={(recipient) => recipient.userId}
              getInputLabel={(recipient) => recipient.name}
              renderOption={(recipient) => (
                <span>
                  {recipient.name}
                  {recipient.department ? (
                    <span style={{ color: 'var(--color-neutral-500)', marginLeft: 6 }}>
                      {recipient.department}
                    </span>
                  ) : null}
                </span>
              )}
              listboxLabel="메신저 수신자 검색 결과"
              label="수신자"
              ariaLabel="메신저 수신자 이름 검색"
              inputTestId="messenger-recipient-search"
              placeholder="사원 이름 검색"
              minChars={1}
              required
              max={50}
              disabled={sendMutation.isPending}
              renderChip={(recipient, index, onRemove) => (
                <TagChip
                  label={String(index + 1)}
                  value={`${recipient.name}${recipient.department ? ` · ${recipient.department}` : ''}`}
                  removeLabel={recipient.name}
                  onRemove={onRemove}
                  data-testid="messenger-recipient-chip"
                />
              )}
            />

            <FormField
              label="메시지 본문"
              required
              render={({ id, ariaDescribedBy }) => (
                <textarea
                  id={id}
                  data-testid="messenger-body"
                  aria-describedby={ariaDescribedBy}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  maxLength={2000}
                  rows={8}
                  style={{
                    width: '100%',
                    resize: 'vertical',
                    padding: '10px 12px',
                    border: '1px solid var(--color-neutral-300)',
                    borderRadius: 6,
                    font: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
              )}
            />

            <Button type="submit" disabled={!canSubmit} loading={sendMutation.isPending}>
              발송
            </Button>
            {feedback ? <p role="status" style={{ margin: 0 }}>{feedback}</p> : null}
          </form>
        </section>

        <section aria-labelledby="messenger-inbox-title" style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 id="messenger-inbox-title" style={{ margin: 0 }}>수신함</h4>
            <span style={{ color: 'var(--color-neutral-500)', fontSize: 12 }}>읽기 전용</span>
          </div>
          {inboxQuery.isLoading ? <p>수신함을 불러오는 중입니다.</p> : null}
          {inboxQuery.isError ? <p role="alert">수신함을 불러오지 못했습니다.</p> : null}
          {!inboxQuery.isLoading && !inboxQuery.isError && inbox.length === 0 ? (
            <p style={{ color: 'var(--color-neutral-500)' }}>받은 메시지가 없습니다.</p>
          ) : null}
          <ul aria-label="메신저 수신함" style={{ listStyle: 'none', display: 'grid', gap: 10, padding: 0, margin: 0 }}>
            {inbox.map((message) => (
              <li key={message.messageId} style={{ border: '1px solid var(--color-neutral-200)', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>메시지</strong>
                  <span>{inboxStatus(message)}</span>
                </div>
                <p style={{ whiteSpace: 'pre-wrap', margin: '8px 0 4px' }}>{message.body}</p>
                <time dateTime={message.sentAt} style={{ color: 'var(--color-neutral-500)', fontSize: 12 }}>
                  {new Date(message.sentAt).toLocaleString('ko-KR')}
                </time>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  )
}

export default MessengerPage
