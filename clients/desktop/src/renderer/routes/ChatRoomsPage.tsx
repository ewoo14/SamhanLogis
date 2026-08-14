import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@samhan/design-system'
import { createDirectChatRoom, fetchChatRooms, searchRecipients, sanitizeInternalLabel, type RecipientOption } from '../api/messengerApi'

function roomLabel(room: Awaited<ReturnType<typeof fetchChatRooms>>[number]): string {
  return room.partnerName ? `${sanitizeInternalLabel(room.partnerName)}${room.partnerDepartment ? ` · ${room.partnerDepartment}` : ''}${room.partnerEmployeeCode ? ` · ${room.partnerEmployeeCode}` : ''}` : sanitizeInternalLabel(room.roomName) ?? '채팅방'
}

export function ChatRoomsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<RecipientOption | null>(null)
  const [createError, setCreateError] = useState(false)
  const rooms = useQuery({ queryKey: ['chat', 'rooms'], queryFn: fetchChatRooms })
  const recipients = useQuery({ queryKey: ['chat', 'recipients', query], queryFn: () => searchRecipients(query), enabled: query.trim().length > 0 })
  const create = useMutation({ mutationFn: () => createDirectChatRoom(selected!.userId), onSuccess: (room) => { setCreateError(false); void queryClient.invalidateQueries({ queryKey: ['chat', 'rooms'] }); navigate(`/chat/${encodeURIComponent(room.roomCode)}`) }, onError: () => setCreateError(true) })
  return <main data-testid="chat-rooms-page" style={{ display: 'grid', gap: 16, padding: 24 }}>
    <header><h3>채팅</h3><Button type="button" onClick={() => document.getElementById('chat-new-conversation')?.focus()}>새 대화</Button></header>
    <section aria-label="새 대화" id="chat-new-conversation" tabIndex={-1}>
      <input aria-label="대화 상대 검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름 검색" />
      {recipients.data?.map((recipient) => <button type="button" key={recipient.userId} onClick={() => setSelected(recipient)}>{sanitizeInternalLabel(recipient.name)} · {recipient.department ?? ''} · {recipient.employeeCode ?? ''}</button>)}
      {selected ? <><span>{sanitizeInternalLabel(selected.name)}</span><Button type="button" onClick={() => create.mutate()} disabled={create.isPending}>대화 시작</Button></> : null}
      {createError ? <p role="alert">대화방을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.</p> : null}
    </section>
    <ul aria-label="채팅방 목록">{rooms.data?.map((room) => <li key={room.roomCode}><Link to={`/chat/${encodeURIComponent(room.roomCode)}`}>{roomLabel(room)}</Link></li>)}</ul>
  </main>
}

export default ChatRoomsPage
