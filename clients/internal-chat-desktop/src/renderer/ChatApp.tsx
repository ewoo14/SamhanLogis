import React, { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input } from '@samhan/design-system'
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { createDirectChatRoomByEmployeeCode, fetchChatMessages, fetchChatRooms, fetchMessengerDirectory, fetchMessengerMe, sendChatMessage, subscribeToChatRoom, type MessengerEmployee } from './api/chatApi'

function roomLabel(room: Awaited<ReturnType<typeof fetchChatRooms>>[number]): string {
  return room.partnerName ? `${room.partnerName}${room.partnerDepartment ? ` · ${room.partnerDepartment}` : ''}${room.partnerEmployeeCode ? ` · ${room.partnerEmployeeCode}` : ''}` : room.roomName ?? '채팅방'
}

function ChatRoomsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<MessengerEmployee | null>(null)
  const rooms = useQuery({ queryKey: ['chat', 'rooms'], queryFn: fetchChatRooms })
  const me = useQuery({ queryKey: ['messenger', 'me'], queryFn: fetchMessengerMe })
  const directory = useQuery({ queryKey: ['messenger', 'directory'], queryFn: fetchMessengerDirectory })
  const create = useMutation({ mutationFn: () => selected?.employeeCode ? createDirectChatRoomByEmployeeCode(selected.employeeCode) : Promise.reject(new Error('직원 식별자가 없습니다')), onSuccess: (room) => { void queryClient.invalidateQueries({ queryKey: ['chat', 'rooms'] }); navigate(encodeURIComponent(room.roomCode)) } })
  const createByEmployee = useMutation({ mutationFn: (employee: MessengerEmployee) => employee.employeeCode ? createDirectChatRoomByEmployeeCode(employee.employeeCode) : Promise.reject(new Error('직원 식별자가 없습니다')), onSuccess: (room) => { void queryClient.invalidateQueries({ queryKey: ['chat', 'rooms'] }); navigate(encodeURIComponent(room.roomCode)) } })
  const filteredDirectory = (directory.data ?? []).filter((employee) => !query.trim() || employee.name.includes(query.trim()) || employee.departmentName.includes(query.trim()))
  return <main className="chat-layout" data-testid="chat-rooms-page"><header className="chat-header"><h1>채팅</h1><Button type="button" onClick={() => document.getElementById('chat-new-conversation')?.focus()}>새 대화</Button></header><Card><div className="messenger-me" aria-label="내 정보">{me.data ? <><span aria-hidden="true">●</span><strong>{me.data.name}</strong><span>{me.data.jobTitle}</span></> : null}</div><ul aria-label="직원 목록" className="employee-list">{directory.data?.map((employee) => <li key={employee.employeeCode ?? employee.name}><button type="button" className="employee" onClick={() => createByEmployee.mutate(employee)} disabled={!employee.employeeCode || createByEmployee.isPending}><span aria-hidden="true">●</span><strong>{employee.name}</strong><span>{employee.jobTitle}</span><small>{employee.departmentName}</small></button></li>)}</ul></Card><Card><section aria-label="새 대화" id="chat-new-conversation" tabIndex={-1}><Input aria-label="대화 상대 검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름 검색" />{filteredDirectory.map((employee) => <button className="recipient" type="button" key={`search-${employee.employeeCode ?? employee.name}`} onClick={() => setSelected(employee)}>{employee.name} · {employee.departmentName} · {employee.jobTitle}</button>)}{selected ? <div className="selected-recipient"><span>{selected.name}</span><Button type="button" onClick={() => create.mutate()} disabled={create.isPending}>대화 시작</Button></div> : null}{create.isError || createByEmployee.isError ? <p role="alert">대화방을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.</p> : null}</section></Card><Card><ul aria-label="채팅방 목록" className="room-list">{rooms.data?.map((room) => <li key={room.roomCode}><Link to={encodeURIComponent(room.roomCode)}>{roomLabel(room)}</Link></li>)}</ul></Card></main>
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

export function ChatApp() { return <Routes><Route index element={<ChatRoomsPage />} /><Route path=":roomCode" element={<ChatRoomPage />} /></Routes> }
