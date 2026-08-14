import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Input } from '@samhan/design-system'
import { askClaude, claudeErrorMessage, createClaudeSession, listClaudeSessions, type ClaudeSession } from './claude/claude-api'
import * as chatApi from './api/chat-api'
import * as presenceApi from './api/presence-api'
import type { Employee, PresenceStatus } from './api/chat-api'

const presenceLabels: Record<PresenceStatus, string> = { AVAILABLE: '접속', AWAY: '자리비움', ABSENT: '부재중', OFFLINE: '오프라인' }
const presenceSession = `desktop-${Date.now()}`
const statusOrder: PresenceStatus[] = ['AVAILABLE', 'AWAY', 'ABSENT', 'OFFLINE']
const jobRank: Record<string, number> = { 대표: 0, 사장: 1, 이사: 2, 부장: 3, 차장: 4, 과장: 5, 대리: 6, 사원: 7 }

function Presence({ employee }: { employee: Pick<Employee, 'name' | 'presenceStatus'> }) {
  return <span className={`presence presence-${employee.presenceStatus.toLowerCase()}`} aria-label={`${employee.name} 상태: ${presenceLabels[employee.presenceStatus]}`} />
}

function ProfileStatus({ employee, onChange }: { employee: Employee; onChange: (status: PresenceStatus) => void }) {
  const [open, setOpen] = useState(false)
  return <div className="profile-row profile-status-control">
    <button type="button" className="profile-status-button" aria-label={`${employee.name} 상태 변경`} onClick={() => setOpen((value) => !value)}>
      <Presence employee={employee} /><strong>{employee.name}</strong><span>{employee.jobTitle}</span>
    </button>
    {open ? <div className="presence-menu" role="menu" aria-label="내 상태 변경">
      {statusOrder.map((status) => <button key={status} type="button" role="menuitem" onClick={() => { onChange(status); setOpen(false) }}><span className={`presence presence-${status.toLowerCase()}`} />{presenceLabels[status]}</button>)}
    </div> : null}
  </div>
}

function roomName(room: { partnerName?: string | null; roomName: string | null }) { return room.partnerName ?? room.roomName ?? '채팅방' }
function formatRoomTime(value?: string | null) {
  if (!value) return ''
  const date = new Date(value); const now = new Date()
  if (date.toDateString() === now.toDateString()) { const hour = date.getHours(); return `${hour < 12 ? '오전' : '오후'} ${hour % 12 || 12}:${String(date.getMinutes()).padStart(2, '0')}` }
  return '어제'
}

function sortedGroups(directory: Employee[]) {
  const groups = new Map<string, Employee[]>()
  for (const employee of directory) groups.set(employee.departmentName, [...(groups.get(employee.departmentName) ?? []), employee])
  return [...groups.entries()].map(([name, employees]) => [name, employees.sort((a, b) => (jobRank[a.jobTitle] ?? 99) - (jobRank[b.jobTitle] ?? 99) || a.name.localeCompare(b.name, 'ko'))] as const)
}

function MessengerPage({ mode }: { mode: 'individual' | 'group' }) {
  const client = useQueryClient(); const [query, setQuery] = useState(''); const [selectedGroup, setSelectedGroup] = useState<Employee[]>([]); const [roomCode, setRoomCode] = useState<string | null>(null); const [body, setBody] = useState('')
  const me = useQuery({ queryKey: ['me'], queryFn: chatApi.fetchMe }); const directory = useQuery({ queryKey: ['directory'], queryFn: chatApi.fetchDirectory }); const rooms = useQuery({ queryKey: ['rooms', mode], queryFn: mode === 'group' ? chatApi.fetchGroups : chatApi.fetchRooms }); const messages = useQuery({ queryKey: ['messages', roomCode], queryFn: () => chatApi.fetchMessages(roomCode!), enabled: Boolean(roomCode) })
  const create = useMutation({ mutationFn: (employeeCode: string) => chatApi.createDirectRoom(employeeCode), onSuccess: (room) => { setRoomCode(room.roomCode); void client.invalidateQueries({ queryKey: ['rooms'] }) } })
  const createGroup = useMutation({ mutationFn: () => chatApi.createGroupRoom(selectedGroup.map((employee) => employee.employeeCode!).filter(Boolean)), onSuccess: (room) => { setRoomCode(room.roomCode); setSelectedGroup([]); void client.invalidateQueries({ queryKey: ['rooms'] }) } })
  const send = useMutation({ mutationFn: () => chatApi.sendMessage(roomCode!, body.trim()), onSuccess: () => { setBody(''); void client.invalidateQueries({ queryKey: ['messages', roomCode] }) } })
  const update = useMutation({ mutationFn: presenceApi.updatePresence, onSuccess: (_, status) => { client.setQueryData<Employee>(['me'], (current) => current ? { ...current, presenceStatus: status } : current) } })
  useEffect(() => { void chatApi.joinPresence(presenceSession); return () => { void chatApi.leavePresence(presenceSession) } }, [])
  useEffect(() => presenceApi.subscribePresence((event) => { if (event.employeeCode) client.setQueryData<Employee[]>(['directory'], (current) => current?.map((employee) => employee.employeeCode === event.employeeCode ? { ...employee, presenceStatus: event.presenceStatus } : employee)); if (!event.employeeCode) client.setQueryData<Employee>(['me'], (current) => current ? { ...current, presenceStatus: event.presenceStatus } : current) }), [client])
  useEffect(() => roomCode ? chatApi.subscribe(roomCode, () => { void client.invalidateQueries({ queryKey: ['messages', roomCode] }) }) : undefined, [roomCode, client])
  const filtered = useMemo(() => (directory.data ?? []).filter((item) => !query.trim() || `${item.name} ${item.departmentName}`.includes(query.trim())), [directory.data, query])
  const grouped = useMemo(() => sortedGroups(filtered), [filtered])
  const submit = (event: FormEvent) => { event.preventDefault(); if (body.trim() && roomCode) send.mutate() }
  return <main className="messenger-app" data-testid="messenger-app">
    {me.data ? <ProfileStatus employee={me.data} onChange={(status) => update.mutate(status)} /> : <div className="profile-row">내 정보 불러오는 중</div>}
    <Card as="section" padding={0} shadow="none" variant="plain"><div className="messenger-grid"><aside className="conversation-sidebar">
      <div className="sidebar-title"><h2>{mode === 'individual' ? '개별 대화' : '그룹 대화'}</h2>{mode === 'group' ? <Button size="sm" variant="secondary" onClick={() => createGroup.mutate()} disabled={selectedGroup.length === 0} loading={createGroup.isPending}>새 그룹</Button> : null}</div>
      <Input aria-label="직원 검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름 또는 부서 검색" />
      {mode === 'individual' ? <ul aria-label="직원 목록" className="conversation-list grouped-directory">{grouped.map(([group, employees]) => <li key={group} className="directory-group"><h3>{group}</h3>{employees.map((employee) => <button type="button" className="conversation" key={employee.employeeCode ?? employee.name} onClick={() => employee.employeeCode && create.mutate(employee.employeeCode)}><Presence employee={employee} /><span><strong>{employee.name}</strong><small>{employee.jobTitle}</small></span></button>)}</li>)}</ul> : <ul aria-label="그룹방 목록" className="conversation-list group-room-list">{(rooms.data ?? []).map((room) => <li key={room.roomCode}><button type="button" className={room.roomCode === roomCode ? 'conversation active group-room' : 'conversation group-room'} onClick={() => setRoomCode(room.roomCode)}><span className="avatar group-avatar">{roomName(room).slice(0, 1)}</span><span><strong>{roomName(room)} <small className="member-count">{room.memberCount ?? 0}</small></strong><small className="last-message">{room.lastMessage ?? '아직 메시지가 없습니다.'}</small></span><time>{formatRoomTime(room.lastMessageAt)}</time></button></li>)}</ul>}
      {mode === 'group' && selectedGroup.length > 0 ? <div className="new-chat-box"><p>선택: {selectedGroup.map((employee) => employee.name).join(', ')}</p></div> : null}
      {mode === 'group' ? <div className="directory-list">{filtered.map((employee) => <button type="button" key={employee.employeeCode ?? employee.name} onClick={() => setSelectedGroup((current) => current.some((item) => item.employeeCode === employee.employeeCode) ? current.filter((item) => item.employeeCode !== employee.employeeCode) : [...current, employee])}><Presence employee={employee} />{employee.name}<small>{employee.departmentName}</small></button>)}</div> : null}
    </aside><section className="conversation-pane" aria-label="대화"><header className="conversation-header"><div className="avatar large">{roomCode ? '대' : 'S'}</div><div><h2>{roomCode ? roomName((rooms.data ?? []).find((room) => room.roomCode === roomCode) ?? { roomName: '대화', partnerName: null }) : '대화를 선택하세요'}</h2><p>{roomCode ? '온라인 상태와 메시지가 실시간으로 동기화됩니다' : '왼쪽에서 대화를 선택하거나 새로 시작하세요'}</p></div></header><div className="message-scroll"><ul aria-label="대화 내용" className="message-list">{(messages.data ?? []).map((message) => <li key={`${message.sequence}-${message.sentAt}`} className={message.mine ? 'mine' : ''}><span className="message-author">{message.mine ? '나' : message.senderName ?? '알 수 없는 발신자'}</span><p>{message.body}</p><time>{new Date(message.sentAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}{message.mine ? ' · 읽음' : ''}</time></li>)}</ul></div>{roomCode ? <form className="composer" onSubmit={submit}><textarea aria-label="메시지 본문" value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} placeholder="메시지를 입력하세요" /><Button type="submit" disabled={!body.trim() || send.isPending}>보내기</Button></form> : null}</section></div></Card>
  </main>
}

function ClaudePage() {
  const client = useQueryClient(); const [active, setActive] = useState<ClaudeSession | null>(null); const [question, setQuestion] = useState(''); const [answer, setAnswer] = useState(''); const [error, setError] = useState(''); const sessions = useQuery({ queryKey: ['claude-sessions'], queryFn: () => listClaudeSessions() }); const create = useMutation({ mutationFn: () => createClaudeSession(), onSuccess: (session) => { setActive(session); setAnswer(''); void client.invalidateQueries({ queryKey: ['claude-sessions'] }) } }); const ask = useMutation({ mutationFn: () => askClaude(question.trim(), { sessionCode: active!.sessionCode }), onSuccess: (value) => { setAnswer(value); setQuestion('') }, onError: (cause) => setError(claudeErrorMessage(cause)) })
  return <main className="claude-app" data-testid="claude-app"><header className="claude-topbar"><div><span className="eyebrow">축 0 권한 보호</span><h2>클로드</h2><p>새 세션을 만들면 대화와 감사 기록이 세션별로 남습니다.</p></div><Button onClick={() => create.mutate()} loading={create.isPending}>새 세션</Button></header><div className="claude-grid"><aside className="session-list"><h3>세션 목록</h3>{(sessions.data ?? []).map((session) => <button type="button" key={session.sessionCode} className={active?.sessionCode === session.sessionCode ? 'session active' : 'session'} onClick={() => { setActive(session); setAnswer(''); setError('') }}><strong>{session.title}</strong><small>{session.messageCount ?? 0}개 메시지</small></button>)}</aside><section className="claude-conversation" aria-label="클로드 대화"><div className="claude-empty">{active ? <><span className="avatar claude-avatar">C</span><h3>{active.title}</h3><p>이 세션의 질문과 답변은 다른 세션과 분리됩니다.</p>{answer ? <div className="claude-answer"><strong>클로드</strong><p>{answer}</p></div> : null}</> : <><span className="claude-orbit">✦</span><h3>새 세션을 시작하세요</h3><p>서버 권한과 자격을 확인한 후 대화를 시작합니다.</p></>}</div>{error ? <p role="alert" className="error-text">{error}</p> : null}{active ? <form className="composer" onSubmit={(event) => { event.preventDefault(); if (question.trim()) ask.mutate() }}><textarea aria-label="클로드 질문" value={question} onChange={(event) => { setError(''); setQuestion(event.target.value) }} placeholder="질문을 입력하세요" /><Button type="submit" disabled={!question.trim() || ask.isPending}>질문 보내기</Button></form> : null}</section></div></main>
}

export function ChatApp() { const [page, setPage] = useState<'individual' | 'group' | 'claude'>('individual'); return <div className="app-shell"><nav className="page-chips" aria-label="메신저 페이지 전환"><button type="button" className={page === 'individual' ? 'page-chip active' : 'page-chip'} onClick={() => setPage('individual')}>개별</button><button type="button" className={page === 'group' ? 'page-chip active' : 'page-chip'} onClick={() => setPage('group')}>그룹별</button><button type="button" className={page === 'claude' ? 'page-chip active' : 'page-chip'} onClick={() => setPage('claude')}>클로드</button></nav>{page === 'claude' ? <ClaudePage /> : <MessengerPage mode={page} />}</div> }
