import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
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
import { extractApiErrorMessage } from '../api/apiError'
import { getAuthProvider } from '../auth/authProvider'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'

const BODY_MAX_LENGTH = 2000
const RECIPIENT_MAX = 50
/** 같은 쪽지의 읽음 처리 실패를 이 횟수만큼 재시도한 뒤에는 포기하고 화면에 실패를 드러낸다. */
const MARK_READ_MAX_ATTEMPTS = 3
const ACKNOWLEDGE_MAX_ATTEMPTS = 3
const READ_NOTIFICATION_RECONCILIATION_MS = 5_000

function inboxStatus(message: MessageResponse): string {
  return message.status === 'UNREAD' ? '읽지 않음' : '읽음'
}

async function acknowledgeWithRetry(messageIds: string[]): Promise<void> {
  for (let attempt = 1; attempt <= ACKNOWLEDGE_MAX_ATTEMPTS; attempt += 1) {
    try {
      await acknowledgeMessengerNotifications(messageIds)
      return
    } catch (error) {
      if (attempt === ACKNOWLEDGE_MAX_ATTEMPTS) throw error
    }
  }
}

/**
 * 검색 결과 중 이름이 2건 이상 겹치는 항목에만 담당자코드를 병기한다.
 * 평소에는 이름·부서만 표시하고, 동명이인이 감지될 때만 구분자를 붙인다(UUID·로그인ID·이메일 금지).
 */
function disambiguateByName(options: RecipientOption[]): RecipientOption[] {
  const nameCounts = new Map<string, number>()
  for (const option of options) {
    nameCounts.set(option.name, (nameCounts.get(option.name) ?? 0) + 1)
  }
  return options.map((option) => {
    if ((nameCounts.get(option.name) ?? 0) < 2) return option
    const code = option.employeeCode && option.employeeCode.trim() ? option.employeeCode : '코드없음'
    return { ...option, name: `${option.name} (${code})` }
  })
}

/** 메신저 화면 — 수신자 칩 복수선택 발송 + 읽기 전용 수신함(페이지 단위). */
export function MessengerPage() {
  usePageTitle('메신저')
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const canSend = canAccess('messenger.send', 'create')

  const [selectedRecipients, setSelectedRecipients] = useState<RecipientOption[]>([])
  const [body, setBody] = useState('')
  const [bodyTruncated, setBodyTruncated] = useState(false)
  const [sendFeedback, setSendFeedback] = useState<string | null>(null)
  const [markReadFeedback, setMarkReadFeedback] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [markedReadMessages, setMarkedReadMessages] = useState<Record<string, MessageResponse>>({})
  const [markReadFailedIds, setMarkReadFailedIds] = useState<Record<string, true>>({})
  const markedReadIdsRef = useRef(new Set<string>())
  const inFlightMarkReadIdsRef = useRef(new Set<string>())

  const sessionQuery = useQuery({
    queryKey: ['auth', 'session'],
    queryFn: () => getAuthProvider().getSession(),
    staleTime: Infinity,
  })

  const inboxQuery = useQuery({
    queryKey: ['messenger', 'inbox', page],
    queryFn: () => fetchInbox(page),
    // 알림 INSERT가 markRead 이후 늦게 도착해도 READ 행의 refId로 재확인할 기회를 만든다.
    refetchInterval: READ_NOTIFICATION_RECONCILIATION_MS,
  })

  /**
   * 현재 페이지를 연 순간, 아직 읽지 않은 행만 서버 권위 endpoint로 읽음 처리한다.
   * 각 메시지는 최대 {@link MARK_READ_MAX_ATTEMPTS}회까지 즉시 재시도하고, 그래도 실패하면
   * 무한 재시도하지 않고 포기한 뒤 화면에 실패를 드러낸다(M-4).
   */
  useEffect(() => {
    const unreadMessages = (inboxQuery.data ?? []).filter(
      (message) => message.status === 'UNREAD'
        && !markedReadIdsRef.current.has(message.messageId)
        && !inFlightMarkReadIdsRef.current.has(message.messageId),
    )
    const alreadyReadIds = (inboxQuery.data ?? [])
      .filter((message) => message.status === 'READ')
      .map((message) => message.messageId)
      .filter((messageId) => !markedReadIdsRef.current.has(messageId))

    if (unreadMessages.length === 0) {
      if (alreadyReadIds.length > 0) {
        void acknowledgeWithRetry(alreadyReadIds)
          .catch(() => undefined)
          .then(() => queryClient.invalidateQueries({ queryKey: ['notifications'] }))
      }
      return
    }

    unreadMessages.forEach((message) => inFlightMarkReadIdsRef.current.add(message.messageId))

    void (async () => {
      const succeededIds: string[] = []
      const failedIds: string[] = []
      const updates: Record<string, MessageResponse> = {}

      await Promise.all(unreadMessages.map(async (message) => {
        for (let attempt = 1; attempt <= MARK_READ_MAX_ATTEMPTS; attempt += 1) {
          try {
            const updated = await markMessageRead(message.messageId)
            markedReadIdsRef.current.add(message.messageId)
            inFlightMarkReadIdsRef.current.delete(message.messageId)
            succeededIds.push(message.messageId)
            updates[message.messageId] = updated
            return
          } catch {
            if (attempt === MARK_READ_MAX_ATTEMPTS) {
              inFlightMarkReadIdsRef.current.delete(message.messageId)
              failedIds.push(message.messageId)
            }
          }
        }
      }))

      if (Object.keys(updates).length > 0) {
        setMarkedReadMessages((current) => ({ ...current, ...updates }))
        queryClient.setQueryData<MessageResponse[]>(['messenger', 'inbox', page], (current) =>
          current?.map((item) => updates[item.messageId] ?? item),
        )
      }
      if (failedIds.length > 0) {
        setMarkReadFailedIds((current) => {
          const next = { ...current }
          failedIds.forEach((id) => { next[id] = true })
          return next
        })
        setMarkReadFeedback('일부 쪽지의 읽음 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.')
      }
      if (succeededIds.length > 0) {
        // 쪽지 읽음은 이미 성공했으므로, 방금 실제로 읽음 처리한 messageId에 대응하는 알림만 확인 처리한다.
        // 전체 미열람 MESSENGER 알림을 일괄 확인하면 다음 페이지의 아직 안 읽은 쪽지 알림까지
        // 배지에서 먼저 사라지는 결함이 생긴다.
        void acknowledgeWithRetry(succeededIds)
          .catch(() => undefined)
          .then(() => queryClient.invalidateQueries({ queryKey: ['notifications'] }))
      }
    })()
  }, [inboxQuery.data, inboxQuery.dataUpdatedAt, page, queryClient])

  const sendMutation = useMutation({
    mutationFn: sendBulkMessage,
    onSuccess: async (result) => {
      setSelectedRecipients([])
      setBody('')
      setBodyTruncated(false)
      setSendFeedback(`${result.sentCount}명에게 발송했습니다.`)
      await queryClient.invalidateQueries({ queryKey: ['messenger', 'inbox'] })
    },
    onError: (error) => setSendFeedback(extractApiErrorMessage(error)),
  })

  const canSubmit = canSend
    && selectedRecipients.length > 0
    && body.trim().length > 0
    && !sendMutation.isPending

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return
    setSendFeedback(null)
    sendMutation.mutate({
      recipientIds: selectedRecipients.map((recipient) => recipient.userId),
      body: body.trim(),
    })
  }

  const handleBodyChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    const raw = event.target.value
    if (raw.length > BODY_MAX_LENGTH) {
      setBody(raw.slice(0, BODY_MAX_LENGTH))
      setBodyTruncated(true)
    } else {
      setBody(raw)
      setBodyTruncated(false)
    }
  }, [])

  const search = useCallback(async (q: string) => {
    const results = await searchRecipients(q)
    const selfId = sessionQuery.data?.userId
    const withoutSelf = selfId ? results.filter((recipient) => recipient.userId !== selfId) : results
    return disambiguateByName(withoutSelf)
  }, [sessionQuery.data?.userId])

  const inbox = useMemo(
    () => (inboxQuery.data ?? []).map((message) => markedReadMessages[message.messageId] ?? message),
    [inboxQuery.data, markedReadMessages],
  )
  const hasNextPage = inboxQuery.data?.hasNextPage === true
  const recipientLimitReached = selectedRecipients.length >= RECIPIENT_MAX

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
          {!canSend ? (
            <p role="alert" style={{ margin: 0, color: 'var(--color-danger-600, #c0392b)' }}>
              메신저 발송 권한이 없어 발송할 수 없습니다.
            </p>
          ) : null}
          {/* 수신자 칩은 내부 autocomplete input이 비어 있어도 선택값이 유효하므로 native required 검증은 사용하지 않는다. */}
          <form noValidate onSubmit={submit} style={{ display: 'grid', gap: 16 }}>
            <fieldset disabled={!canSend || sendMutation.isPending} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 16 }}>
              <MultiSelectAutocomplete<RecipientOption, RecipientOption>
                selected={selectedRecipients}
                onAdd={(recipient) => setSelectedRecipients((current) => [...current, recipient])}
                onRemove={(recipient) => setSelectedRecipients((current) => current.filter((item) => item.userId !== recipient.userId))}
                search={search}
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
                max={RECIPIENT_MAX}
                resultSelectionMode="multiple"
                resultSelectionTitle="수신자 검색 결과"
                disabled={!canSend || sendMutation.isPending}
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
              {recipientLimitReached ? (
                <p role="status" style={{ margin: 0, fontSize: 12, color: 'var(--color-neutral-600)' }}>
                  수신자는 최대 {RECIPIENT_MAX}명까지 선택할 수 있습니다. 추가하려면 먼저 칩을 제거하십시오.
                </p>
              ) : null}

              <FormField
                label="메시지 본문"
                required
                render={({ id, ariaDescribedBy }) => (
                  <div style={{ display: 'grid', gap: 4 }}>
                    <textarea
                      id={id}
                      data-testid="messenger-body"
                      aria-describedby={ariaDescribedBy}
                      value={body}
                      onChange={handleBodyChange}
                      maxLength={BODY_MAX_LENGTH}
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
                    <span
                      data-testid="messenger-body-counter"
                      style={{ fontSize: 12, color: 'var(--color-neutral-500)', justifySelf: 'end' }}
                    >
                      {body.length} / {BODY_MAX_LENGTH}자
                    </span>
                    {bodyTruncated ? (
                      <p role="alert" style={{ margin: 0, fontSize: 12, color: 'var(--color-danger-600, #c0392b)' }}>
                        본문은 {BODY_MAX_LENGTH}자를 초과할 수 없어 이후 내용이 제거되었습니다.
                      </p>
                    ) : null}
                  </div>
                )}
              />

              <Button type="submit" disabled={!canSubmit} loading={sendMutation.isPending}>
                발송
              </Button>
            </fieldset>
            {sendFeedback ?? markReadFeedback ? (
              <p role="status" style={{ margin: 0 }}>{sendFeedback ?? markReadFeedback}</p>
            ) : null}
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
                  <strong>{message.senderDisplayName ?? '알 수 없는 발신자'}</strong>
                  <span>{inboxStatus(message)}</span>
                </div>
                <p style={{ whiteSpace: 'pre-wrap', margin: '8px 0 4px' }}>{message.body}</p>
                <time dateTime={message.sentAt} style={{ color: 'var(--color-neutral-500)', fontSize: 12 }}>
                  {new Date(message.sentAt).toLocaleString('ko-KR')}
                </time>
                {markReadFailedIds[message.messageId] ? (
                  <p role="alert" style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-danger-600, #c0392b)' }}>
                    읽음 처리에 실패했습니다.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Button
              type="button"
              variant="secondary"
              disabled={page === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
            >
              이전
            </Button>
            <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>{page + 1}페이지</span>
            <Button
              type="button"
              variant="secondary"
              disabled={!hasNextPage}
              onClick={() => setPage((current) => current + 1)}
            >
              다음
            </Button>
          </div>
        </section>
      </div>
    </main>
  )
}

export default MessengerPage
