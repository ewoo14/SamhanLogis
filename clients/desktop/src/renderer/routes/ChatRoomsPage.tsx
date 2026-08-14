import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@samhan/design-system'
import { createDirectChatRoom, createGroupChatRoom, fetchChatRooms, searchRecipients, sanitizeInternalLabel, type RecipientOption } from '../api/messengerApi'

function roomLabel(room: Awaited<ReturnType<typeof fetchChatRooms>>[number]): string {
  if (room.partnerName) return `${sanitizeInternalLabel(room.partnerName)}${room.partnerDepartment ? ` · ${room.partnerDepartment}` : ''}${room.partnerEmployeeCode ? ` · ${room.partnerEmployeeCode}` : ''}`
  return sanitizeInternalLabel(room.roomName) ?? '그룹 대화 (이름 미설정)'
}

export function ChatRoomsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<RecipientOption | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<RecipientOption[]>([])
  const [groupMode, setGroupMode] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [createError, setCreateError] = useState(false)
  const rooms = useQuery({ queryKey: ['chat', 'rooms'], queryFn: fetchChatRooms })
  const recipients = useQuery({ queryKey: ['chat', 'recipients', query], queryFn: () => searchRecipients(query), enabled: query.trim().length > 0 })
  const create = useMutation({ mutationFn: () => createDirectChatRoom(selected!.userId), onSuccess: (room) => { setCreateError(false); void queryClient.invalidateQueries({ queryKey: ['chat', 'rooms'] }); navigate(`/chat/${encodeURIComponent(room.roomCode)}`) }, onError: () => setCreateError(true) })
  const createGroup = useMutation({ mutationFn: () => createGroupChatRoom({ roomName: groupName.trim(), employeeCodes: selectedGroup.map((recipient) => recipient.employeeCode).filter((code): code is string => Boolean(code)) }), onSuccess: (room) => { setCreateError(false); void queryClient.invalidateQueries({ queryKey: ['chat', 'rooms'] }); navigate(`/chat/${encodeURIComponent(room.roomCode)}`) }, onError: () => setCreateError(true) })
  const chooseRecipient = (recipient: RecipientOption) => {
    if (groupMode) setSelectedGroup((current) => current.some((item) => item.userId === recipient.userId) ? current : [...current, recipient])
    else setSelected(recipient)
  }
  const resetComposer = (nextGroupMode: boolean) => { setGroupMode(nextGroupMode); setSelected(null); setSelectedGroup([]); setGroupName(''); setQuery(''); setCreateError(false) }
  return <main data-testid="chat-rooms-page" style={{ display: 'grid', gap: 16, padding: 24 }}>
    <header><h3>채팅</h3><div style={{ display: 'flex', gap: 8 }}><Button type="button" onClick={() => resetComposer(false)}>새 대화</Button><Button type="button" onClick={() => resetComposer(true)}>그룹방 만들기</Button></div></header>
    <section aria-label="새 대화" id="chat-new-conversation" tabIndex={-1}>
      {groupMode ? <input aria-label="그룹방 이름" value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="그룹방 이름" /> : null}
      <input aria-label="대화 상대 검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름 검색" />
      {recipients.data?.map((recipient) => <button type="button" key={recipient.userId} onClick={() => chooseRecipient(recipient)}>{sanitizeInternalLabel(recipient.name)} · {recipient.department ?? ''} · {recipient.employeeCode ?? ''}</button>)}
      {groupMode ? <>{selectedGroup.map((recipient) => <span key={recipient.userId}>{sanitizeInternalLabel(recipient.name)} · {recipient.department ?? ''} · {recipient.employeeCode ?? ''}</span>)}<Button type="button" onClick={() => createGroup.mutate()} disabled={createGroup.isPending || !groupName.trim() || selectedGroup.length === 0}>그룹방 만들기</Button></> : null}
      {!groupMode && selected ? <><span>{sanitizeInternalLabel(selected.name)}</span><Button type="button" onClick={() => create.mutate()} disabled={create.isPending}>대화 시작</Button></> : null}
      {createError ? <p role="alert">대화방을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.</p> : null}
    </section>
    <ul aria-label="채팅방 목록">{rooms.data?.map((room) => <li key={room.roomCode}><Link to={`/chat/${encodeURIComponent(room.roomCode)}`}>{roomLabel(room)}</Link></li>)}</ul>
  </main>
}

export default ChatRoomsPage
