import React, { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input } from '@samhan/design-system'
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { createDirectChatRoomByEmployeeCode, createGroupChatRoom, fetchChatMessages, fetchChatRooms, fetchGroupChatRooms, fetchMessengerDirectory, fetchMessengerMe, joinMessengerPresence, leaveMessengerPresence, sendChatMessage, subscribeToChatRoom, type GroupChatRoom, type MessengerEmployee, type PresenceStatus } from './api/chatApi'

const presenceLabel: Record<PresenceStatus, string> = { AVAILABLE: '접속', AWAY: '자리비움', ABSENT: '부재중', OFFLINE: '오프라인' }
const presenceSessionId = `desktop-${Date.now()}-${Math.random().toString(36).slice(2)}`

function PresenceIcon({ employee }: { employee: Pick<MessengerEmployee, 'name' | 'presenceStatus'> }) {
  return <span aria-label={`${employee.name} 상태: ${presenceLabel[employee.presenceStatus]}`} className={`presence presence-${employee.presenceStatus.toLowerCase()}`} title={presenceLabel[employee.presenceStatus]} />
}

function roomLabel(room: Awaited<ReturnType<typeof fetchChatRooms>>[number]): string {
  return room.partnerName ? `${room.partnerName}${room.partnerDepartment ? ` · ${room.partnerDepartment}` : ''}${room.partnerEmployeeCode ? ` · ${room.partnerEmployeeCode}` : ''}` : room.roomName ?? '채팅방'
}

function SessionSummary({ employee }: { employee?: MessengerEmployee }) {
  if (!employee) return <section className="session-summary" data-testid="chat-session-summary" aria-label="현재 세션" role="region" />
  return (
    <section className="session-summary" data-testid="chat-session-summary" aria-label="현재 세션" role="region">
      <PresenceIcon employee={employee} />
      <div className="session-summary-copy">
        <strong>{employee.name}</strong>
        <span>{employee.jobTitle}</span>
      </div>
      <span className="session-summary-status">{presenceLabel[employee.presenceStatus]}</span>
    </section>
  )
}

function Header({ mode, onModeChange, onSearch }: { mode: 'individual' | 'group'; onModeChange: (mode: 'individual' | 'group') => void; onSearch?: () => void }) {
  return <header className="chat-header"><div><h1>채팅</h1><nav aria-label="채팅 보기 전환"><Button type="button" onClick={() => onModeChange('individual')}>개별</Button><Button type="button" onClick={() => onModeChange('group')}>그룹별</Button></nav></div>{onSearch ? <Button type="button" onClick={onSearch}>검색</Button> : <Button type="button" onClick={() => document.getElementById('chat-new-conversation')?.focus()}>새 대화</Button>}</header>
}

function GroupCreateDialog({ directory, onClose }: { directory: MessengerEmployee[]; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<MessengerEmployee[]>([])
  const queryClient = useQueryClient()
  const create = useMutation({ mutationFn: () => createGroupChatRoom(selected.map((employee) => employee.employeeCode!).filter(Boolean)), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['chat', 'groups'] }); onClose() } })
  const filtered = directory.filter((employee) => !query.trim() || employee.name.includes(query.trim()) || employee.departmentName.includes(query.trim()))
  const toggle = (employee: MessengerEmployee) => setSelected((current) => current.some((item) => item.employeeCode === employee.employeeCode) ? current.filter((item) => item.employeeCode !== employee.employeeCode) : [...current, employee])
  return <div role="dialog" aria-modal="true" aria-labelledby="group-create-title" aria-label="단톡방 생성" className="chat-modal"><Card><h2 id="group-create-title">단톡방 생성</h2><Input aria-label="직원 검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="직원 검색" />{filtered.map((employee) => <button type="button" key={employee.employeeCode ?? employee.name} onClick={() => toggle(employee)} aria-pressed={selected.some((item) => item.employeeCode === employee.employeeCode)}>{<PresenceIcon employee={employee} />}{employee.name} · {employee.departmentName} · {employee.jobTitle}</button>)}<p>선택: {selected.map((employee) => employee.name).join(', ') || '없음'}</p><Button type="button" onClick={() => create.mutate()} disabled={selected.length === 0 || create.isPending}>단톡방 생성</Button><Button type="button" onClick={onClose}>닫기</Button>{create.isError ? <p role="alert">단톡방을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.</p> : null}</Card></div>
}

function ChatRoomsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'individual' | 'group'>('individual')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<MessengerEmployee | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const rooms = useQuery({ queryKey: ['chat', 'rooms'], queryFn: fetchChatRooms })
  const groups = useQuery({ queryKey: ['chat', 'groups'], queryFn: fetchGroupChatRooms, enabled: mode === 'group' })
  const me = useQuery({ queryKey: ['messenger', 'me'], queryFn: fetchMessengerMe })
  const directory = useQuery({ queryKey: ['messenger', 'directory'], queryFn: fetchMessengerDirectory })
  const create = useMutation({ mutationFn: () => selected?.employeeCode ? createDirectChatRoomByEmployeeCode(selected.employeeCode) : Promise.reject(new Error('직원 식별자가 없습니다')), onSuccess: (room) => { void queryClient.invalidateQueries({ queryKey: ['chat', 'rooms'] }); navigate(encodeURIComponent(room.roomCode)) } })
  const createByEmployee = useMutation({ mutationFn: (employee: MessengerEmployee) => employee.employeeCode ? createDirectChatRoomByEmployeeCode(employee.employeeCode) : Promise.reject(new Error('직원 식별자가 없습니다')), onSuccess: (room) => { void queryClient.invalidateQueries({ queryKey: ['chat', 'rooms'] }); navigate(encodeURIComponent(room.roomCode)) } })
  const filteredDirectory = (directory.data ?? []).filter((employee) => !query.trim() || employee.name.includes(query.trim()) || employee.departmentName.includes(query.trim()))
  if (mode === 'group') return <GroupRoomsPage me={me.data} groups={groups.data ?? []} directory={directory.data ?? []} onModeChange={setMode} dialogOpen={dialogOpen} onSearch={() => setDialogOpen(true)} onCloseDialog={() => setDialogOpen(false)} />
  return <main className="chat-layout" data-testid="chat-rooms-page"><Header mode={mode} onModeChange={setMode} /><Card><SessionSummary employee={me.data} /><ul aria-label="직원 목록" className="employee-list">{directory.data?.map((employee) => <li key={employee.employeeCode ?? employee.name}><button type="button" className="employee" onClick={() => createByEmployee.mutate(employee)} disabled={!employee.employeeCode || createByEmployee.isPending}><PresenceIcon employee={employee} /><strong>{employee.name}</strong><span>{employee.jobTitle}</span><small>{employee.departmentName}</small></button></li>)}</ul></Card><Card><section aria-label="새 대화" id="chat-new-conversation" tabIndex={-1}><Input aria-label="대화 상대 검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름 검색" />{filteredDirectory.map((employee) => <button className="recipient" type="button" key={`search-${employee.employeeCode ?? employee.name}`} onClick={() => setSelected(employee)}><PresenceIcon employee={employee} />{employee.name} · {employee.departmentName} · {employee.jobTitle}</button>)}{selected ? <div className="selected-recipient"><span>{selected.name}</span><Button type="button" onClick={() => create.mutate()} disabled={create.isPending}>대화 시작</Button></div> : null}{create.isError || createByEmployee.isError ? <p role="alert">대화방을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.</p> : null}</section></Card><Card><ul aria-label="채팅방 목록" className="room-list">{rooms.data?.map((room) => <li key={room.roomCode}><Link to={encodeURIComponent(room.roomCode)}>{roomLabel(room)}</Link></li>)}</ul></Card></main>
}

function groupLabel(room: GroupChatRoom): string {
  if (room.roomName?.trim()) return room.roomName
  const names = room.participants.map((participant) => participant.name)
  return names.length > 3 ? `${names.slice(0, 2).join(', ')} 외 ${names.length - 2}명` : names.join(', ')
}

function GroupRoomsPage({ me, groups, directory, onModeChange, dialogOpen, onSearch, onCloseDialog }: { me?: MessengerEmployee; groups: GroupChatRoom[]; directory: MessengerEmployee[]; onModeChange: (mode: 'individual' | 'group') => void; dialogOpen: boolean; onSearch: () => void; onCloseDialog: () => void }) {
  const sorted = useMemo(() => [...groups].sort((a, b) => (Number(b.unreadCount > 0) - Number(a.unreadCount > 0)) || (b.unreadCount - a.unreadCount) || ((b.latestMessageAt ?? '').localeCompare(a.latestMessageAt ?? ''))), [groups])
  return <main className="chat-layout" data-testid="group-chat-rooms-page"><Header mode="group" onModeChange={onModeChange} onSearch={onSearch} /><Card><SessionSummary employee={me} /></Card><Card><ul aria-label="그룹 채팅방 목록" className="room-list">{sorted.map((room) => <li key={room.roomCode}><Link to={encodeURIComponent(room.roomCode)}>{groupLabel(room)}{room.unreadCount > 0 ? <strong aria-label={`안읽은 메시지 ${room.unreadCount}`}>{room.unreadCount}</strong> : null}</Link></li>)}</ul></Card>{dialogOpen ? <GroupCreateDialog directory={directory} onClose={onCloseDialog} /> : null}</main>
}

function ChatRoomPage() {
  const { roomCode = '' } = useParams<{ roomCode: string }>()
  const queryClient = useQueryClient()
  const [body, setBody] = useState('')
  const rooms = useQuery({ queryKey: ['chat', 'rooms'], queryFn: fetchChatRooms })
  const messages = useQuery({ queryKey: ['chat', roomCode, 'messages'], queryFn: () => fetchChatMessages(roomCode), enabled: Boolean(roomCode) })
  const room = rooms.data?.find((item) => item.roomCode === roomCode)
  const send = useMutation({ mutationFn: (value: string) => sendChatMessage(roomCode, value), onSuccess: () => { setBody(''); void queryClient.invalidateQueries({ queryKey: ['chat', roomCode, 'messages'] }) } })
  useEffect(() => roomCode ? subscribeToChatRoom(roomCode, () => { void queryClient.invalidateQueries({ queryKey: ['chat', roomCode, 'messages'] }) }) : undefined, [roomCode, queryClient])
  const submit = (event: FormEvent) => { event.preventDefault(); if (body.trim()) send.mutate(body.trim()) }
  return <main className="chat-layout" data-testid="chat-room-page"><header className="chat-header"><div><h1>{room?.partnerName ?? '채팅'}</h1><p>{room?.partnerDepartment}{room?.partnerEmployeeCode ? ` · ${room.partnerEmployeeCode}` : ''}</p></div><Link to="..">목록</Link></header><Card><ul aria-label="대화 내용" className="message-list">{(messages.data ?? []).map((message) => <li key={`${message.sequence}-${message.sentAt}`} className={message.mine ? 'mine' : ''}><strong>{message.mine ? '나' : message.senderName ?? '알 수 없는 발신자'}</strong><span>{message.senderDepartment ? ` · ${message.senderDepartment}` : ''}{message.senderEmployeeCode ? ` · ${message.senderEmployeeCode}` : ''}</span><p>{message.body}</p><time>{new Date(message.sentAt).toLocaleString('ko-KR')}</time></li>)}</ul></Card>{send.isError ? <p role="alert">메시지를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.</p> : null}<form className="composer" onSubmit={submit}><textarea aria-label="메시지 본문" value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} /><Button type="submit" disabled={send.isPending || !body.trim()}>보내기</Button></form></main>
}

export function ChatApp() {
  useEffect(() => { void joinMessengerPresence(presenceSessionId); return () => { void leaveMessengerPresence(presenceSessionId) } }, [])
  return <Routes><Route index element={<ChatRoomsPage />} /><Route path=":roomCode" element={<ChatRoomPage />} /></Routes>
}
