import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@samhan/design-system'
import { editGroupChatRoom, fetchChatMessages, fetchChatRooms, fetchGroupChatRooms, searchRecipients, sanitizeInternalLabel, sendChatMessage } from '../api/messengerApi'
import { chatRealtimeClient } from '../realtime/chatRealtimeClient'
import { useParams } from 'react-router-dom'

/** roomCode만 URL에 사용하는 1:1 채팅 화면. SSE event는 REST 재조회 신호로만 소비한다. */
export function ChatRoomPage() {
  const { roomCode = '' } = useParams<{ roomCode: string }>()
  const queryClient = useQueryClient()
  const [body, setBody] = useState('')
  const [sendError, setSendError] = useState(false)
  const [editingGroup, setEditingGroup] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupCodes, setGroupCodes] = useState<string[]>([])
  const [editQuery, setEditQuery] = useState('')
  const [editError, setEditError] = useState(false)
  const messagesQuery = useQuery({ queryKey: ['chat', roomCode, 'messages'], queryFn: () => fetchChatMessages(roomCode), enabled: Boolean(roomCode) })
  const roomsQuery = useQuery({ queryKey: ['chat', 'rooms'], queryFn: fetchChatRooms })
  const groupRoomsQuery = useQuery({ queryKey: ['chat', 'groups'], queryFn: fetchGroupChatRooms })
  const editRecipientsQuery = useQuery({ queryKey: ['chat', 'edit-recipients', editQuery], queryFn: () => searchRecipients(editQuery), enabled: editingGroup && editQuery.trim().length > 0 })
  const room = roomsQuery.data?.find((item) => item.roomCode === roomCode)
  const groupRoom = groupRoomsQuery.data?.find((item) => item.roomCode === roomCode)
  const firstOtherMessage = messagesQuery.data?.find((message) => !message.mine)
  const partnerName = sanitizeInternalLabel(room?.partnerName ?? firstOtherMessage?.senderName)
  const partnerDepartment = room?.partnerDepartment ?? firstOtherMessage?.senderDepartment
  const partnerEmployeeCode = room?.partnerEmployeeCode ?? firstOtherMessage?.senderEmployeeCode
  const sendMutation = useMutation({
    mutationFn: (value: string) => sendChatMessage(roomCode, value),
    onSuccess: () => { setSendError(false); setBody(''); void queryClient.invalidateQueries({ queryKey: ['chat', roomCode, 'messages'] }) },
    onError: () => setSendError(true),
  })
  const editMutation = useMutation({
    mutationFn: () => editGroupChatRoom(roomCode, { roomName: groupName.trim(), employeeCodes: groupCodes }),
    onSuccess: () => { setEditError(false); setEditingGroup(false); void queryClient.invalidateQueries({ queryKey: ['chat', 'rooms'] }); void queryClient.invalidateQueries({ queryKey: ['chat', 'groups'] }) },
    onError: () => setEditError(true),
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
  const startGroupEdit = () => { setGroupName(groupRoom?.roomName ?? ''); setGroupCodes((groupRoom?.participants ?? []).map((participant) => participant.employeeCode).filter((code): code is string => Boolean(code))); setEditQuery(''); setEditingGroup(true); setEditError(false) }
  const toggleEditParticipant = (code: string) => setGroupCodes((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code])
  return <main data-testid="chat-room-page" style={{ display: 'grid', gap: 16, padding: 24 }}>
    <header><div><h3 style={{ margin: 0 }}>{groupRoom?.roomName ?? partnerName ?? '그룹 대화 (이름 미설정)'}</h3><p style={{ margin: '6px 0 0' }}>{groupRoom ? groupRoom.participants.map((participant) => `${sanitizeInternalLabel(participant.name)}${participant.employeeCode ? ` · ${participant.employeeCode}` : ''}`).join(', ') : `${partnerDepartment}${partnerEmployeeCode ? ` · ${partnerEmployeeCode}` : ''}`}</p></div>{groupRoom ? <Button type="button" onClick={startGroupEdit}>그룹방 편집</Button> : null}</header>
    {editingGroup ? <section aria-label="그룹방 편집" style={{ display: 'grid', gap: 8 }}><input aria-label="편집할 그룹방 이름" value={groupName} onChange={(event) => setGroupName(event.target.value)} /><input aria-label="편집 참여자 검색" value={editQuery} onChange={(event) => setEditQuery(event.target.value)} placeholder="이름 또는 담당자코드 검색" />{editRecipientsQuery.data?.map((recipient) => <button type="button" key={recipient.userId} onClick={() => recipient.employeeCode && toggleEditParticipant(recipient.employeeCode)}>{sanitizeInternalLabel(recipient.name)} · {recipient.department ?? ''} · {recipient.employeeCode ?? ''}</button>)}<div aria-label="현재 참여자">{(groupRoom?.participants ?? []).filter((participant) => participant.employeeCode && groupCodes.includes(participant.employeeCode)).map((participant) => <button type="button" key={participant.employeeCode} onClick={() => toggleEditParticipant(participant.employeeCode!)} aria-label={`${sanitizeInternalLabel(participant.name)} 참여자 제거`}>{sanitizeInternalLabel(participant.name)} · {participant.employeeCode} ×</button>)}</div><div><Button type="button" onClick={() => editMutation.mutate()} disabled={editMutation.isPending || !groupName.trim() || groupCodes.length === 0}>저장</Button><Button type="button" onClick={() => setEditingGroup(false)}>취소</Button></div>{editError ? <p role="alert">그룹방을 수정하지 못했습니다. 잠시 후 다시 시도해 주세요.</p> : null}</section> : null}
    <ul aria-label="대화 내용" style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
      {(messagesQuery.data ?? []).map((message) => <li key={`${message.sequence}-${message.sentAt}`}><strong>{message.mine ? '나' : (sanitizeInternalLabel(message.senderName) ?? '알 수 없는 발신자')}</strong><span>{message.senderDepartment ? ` · ${message.senderDepartment}` : ''}{message.senderEmployeeCode ? ` · ${message.senderEmployeeCode}` : ''}</span><p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{message.body}</p><time>{new Date(message.sentAt).toLocaleString('ko-KR')}</time></li>)}
    </ul>
    {sendError ? <p role="alert">메시지를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.</p> : null}
    <form onSubmit={submit} style={{ display: 'flex', gap: 8 }}><textarea aria-label="메시지 본문" value={body} onChange={(event) => { setSendError(false); setBody(event.target.value) }} maxLength={2000} /><Button type="submit" disabled={sendMutation.isPending || !body.trim()}>보내기</Button></form>
  </main>
}

export default ChatRoomPage
