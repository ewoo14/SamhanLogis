import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@samhan/design-system'
import { createDirectChatRoom, fetchChatRooms, searchRecipients, type RecipientOption } from '../api/messengerApi'

function roomLabel(room: Awaited<ReturnType<typeof fetchChatRooms>>[number]): string {
  return room.partnerName ? `${room.partnerName}${room.partnerDepartment ? ` · ${room.partnerDepartment}` : ''}${room.partnerEmployeeCode ? ` · ${room.partnerEmployeeCode}` : ''}` : room.roomName ?? '채팅방'
}

export function ChatRoomsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<RecipientOption | null>(null)
  const rooms = useQuery({ queryKey: ['chat', 'rooms'], queryFn: fetchChatRooms })
  const recipients = useQuery({ queryKey: ['chat', 'recipients', query], queryFn: () => searchRecipients(query), enabled: query.trim().length > 0 })
  const create = useMutation({ mutationFn: () => createDirectChatRoom(selected!.userId), onSuccess: (room) => { void queryClient.invalidateQueries({ queryKey: ['chat', 'rooms'] }); navigate(`/chat/${encodeURIComponent(room.roomCode)}`) } })
  return <main data-testid="chat-rooms-page" style={{ display: 'grid', gap: 16, padding: 24 }}>
    <header><h3>채팅</h3><Button type="button" onClick={() => document.getElementById('chat-new-conversation')?.focus()}>새 대화</Button></header>
    <section aria-label="새 대화" id="chat-new-conversation" tabIndex={-1}>
      <input aria-label="대화 상대 검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름 검색" />
      {recipients.data?.map((recipient) => <button type="button" key={recipient.userId} onClick={() => setSelected(recipient)}>{recipient.name} · {recipient.department ?? ''} · {recipient.employeeCode ?? ''}</button>)}
      {selected ? <><span>{selected.name}</span><Button type="button" onClick={() => create.mutate()} disabled={create.isPending}>대화 시작</Button></> : null}
    </section>
    <ul aria-label="채팅방 목록">{rooms.data?.map((room) => <li key={room.roomCode}><Link to={`/chat/${encodeURIComponent(room.roomCode)}`}>{roomLabel(room)}</Link></li>)}</ul>
  </main>
}

export default ChatRoomsPage
