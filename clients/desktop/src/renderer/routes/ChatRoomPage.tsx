import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@samhan/design-system'
import { fetchChatMessages, fetchChatRooms, sanitizeInternalLabel, sendChatMessage } from '../api/messengerApi'
import { chatRealtimeClient } from '../realtime/chatRealtimeClient'
import { useParams } from 'react-router-dom'

/** roomCode만 URL에 사용하는 1:1 채팅 화면. SSE event는 REST 재조회 신호로만 소비한다. */
export function ChatRoomPage() {
  const { roomCode = '' } = useParams<{ roomCode: string }>()
  const queryClient = useQueryClient()
  const [body, setBody] = useState('')
  const [sendError, setSendError] = useState(false)
  const messagesQuery = useQuery({ queryKey: ['chat', roomCode, 'messages'], queryFn: () => fetchChatMessages(roomCode), enabled: Boolean(roomCode) })
  const roomsQuery = useQuery({ queryKey: ['chat', 'rooms'], queryFn: fetchChatRooms })
  const room = roomsQuery.data?.find((item) => item.roomCode === roomCode)
  const firstOtherMessage = messagesQuery.data?.find((message) => !message.mine)
  const partnerName = sanitizeInternalLabel(room?.partnerName ?? firstOtherMessage?.senderName)
  const partnerDepartment = room?.partnerDepartment ?? firstOtherMessage?.senderDepartment
  const partnerEmployeeCode = room?.partnerEmployeeCode ?? firstOtherMessage?.senderEmployeeCode
  const sendMutation = useMutation({
    mutationFn: (value: string) => sendChatMessage(roomCode, value),
    onSuccess: () => { setSendError(false); setBody(''); void queryClient.invalidateQueries({ queryKey: ['chat', roomCode, 'messages'] }) },
    onError: () => setSendError(true),
  })
  useEffect(() => {
    if (!roomCode) return undefined
    const controller = chatRealtimeClient.subscribe(roomCode, (event) => {
      if (event.event === 'chat:message-created' || event.event === 'chat:room-updated') {
        void queryClient.invalidateQueries({ queryKey: ['chat', roomCode, 'messages'] })
      }
    })
    return () => controller.abort()
  }, [roomCode, queryClient])
  const submit = (event: FormEvent) => { event.preventDefault(); if (body.trim()) sendMutation.mutate(body.trim()) }
  return <main data-testid="chat-room-page" style={{ display: 'grid', gap: 16, padding: 24 }}>
    <header><h3 style={{ margin: 0 }}>{partnerName ?? '채팅'}</h3><p style={{ margin: '6px 0 0' }}>{partnerDepartment}{partnerEmployeeCode ? ` · ${partnerEmployeeCode}` : ''}</p></header>
    <ul aria-label="대화 내용" style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
      {(messagesQuery.data ?? []).map((message) => <li key={`${message.sequence}-${message.sentAt}`}><strong>{message.mine ? '나' : (sanitizeInternalLabel(message.senderName) ?? '알 수 없는 발신자')}</strong><span>{message.senderDepartment ? ` · ${message.senderDepartment}` : ''}{message.senderEmployeeCode ? ` · ${message.senderEmployeeCode}` : ''}</span><p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{message.body}</p><time>{new Date(message.sentAt).toLocaleString('ko-KR')}</time></li>)}
    </ul>
    {sendError ? <p role="alert">메시지를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.</p> : null}
    <form onSubmit={submit} style={{ display: 'flex', gap: 8 }}><textarea aria-label="메시지 본문" value={body} onChange={(event) => { setSendError(false); setBody(event.target.value) }} maxLength={2000} /><Button type="submit" disabled={sendMutation.isPending || !body.trim()}>보내기</Button></form>
  </main>
}

export default ChatRoomPage
