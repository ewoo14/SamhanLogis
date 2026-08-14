// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatApp } from './ChatApp'
import * as chatApi from './api/chatApi'
import './styles.css'

vi.mock('./api/chatApi', () => ({
  fetchMessengerMe: vi.fn().mockResolvedValue({ employeeCode: 'ME', name: '홍길동', jobTitle: '부장', departmentName: '개발팀', employmentStatus: 'ACTIVE', presenceStatus: 'AVAILABLE' }),
  joinMessengerPresence: vi.fn().mockResolvedValue(undefined),
  leaveMessengerPresence: vi.fn().mockResolvedValue(undefined),
  fetchMessengerDirectory: vi.fn().mockResolvedValue([
    { employeeCode: 'CEO', name: '김대표', jobTitle: '대표', departmentName: '대표실', employmentStatus: 'ACTIVE', presenceStatus: 'AWAY' },
    { employeeCode: 'STAFF', name: '박사원', jobTitle: '사원', departmentName: '개발팀', employmentStatus: 'ACTIVE', presenceStatus: 'OFFLINE' },
    { employeeCode: 'E002', name: '이개발', jobTitle: '개발자', departmentName: '물류팀', employmentStatus: 'ACTIVE', presenceStatus: 'ABSENT' },
  ]),
  fetchGroupChatRooms: vi.fn().mockResolvedValue([
    { roomCode: 'GROUP-OLD', type: 'GROUP', roomName: null, participants: [{ name: '홍길동' }, { name: '김철수' }, { name: '이영희' }, { name: '박민수' }, { name: '최수진' }], unreadCount: 0, latestMessageAt: '2026-08-14T10:00:00Z' },
    { roomCode: 'GROUP-NEW', type: 'GROUP', roomName: '물류 협의', participants: [{ name: '홍길동' }, { name: '김철수' }], unreadCount: 2, latestMessageAt: '2026-08-14T09:00:00Z' },
    { roomCode: 'GROUP-UNREAD', type: 'GROUP', roomName: null, participants: [{ name: '홍길동' }, { name: '최수진' }], unreadCount: 1, latestMessageAt: '2026-08-14T11:00:00Z' },
  ]),
  createGroupChatRoom: vi.fn().mockResolvedValue({ roomCode: 'GROUP-CREATED', type: 'GROUP', roomName: '새 그룹' }),
  createDirectChatRoomByEmployeeCode: vi.fn().mockResolvedValue({ roomCode: 'CHAT-20260813-000002', type: 'DIRECT', roomName: null, partnerName: '김대표' }),
  fetchChatRooms: vi.fn().mockResolvedValue([
    { roomCode: 'CHAT-20260812-000017', type: 'DIRECT', roomName: null, partnerName: '김개발', partnerDepartment: '플랫폼팀', partnerEmployeeCode: 'E001' },
  ]),
  fetchChatMessages: vi.fn().mockResolvedValue([
    { roomCode: 'CHAT-20260812-000017', sequence: 1, body: '안녕하세요', sentAt: '2026-08-12T09:00:00Z', senderName: '김개발', senderDepartment: '플랫폼팀', senderEmployeeCode: 'E001', mine: false },
  ]),
  sendChatMessage: vi.fn().mockResolvedValue({ roomCode: 'CHAT-20260812-000017', sequence: 2, body: '반갑습니다', sentAt: '2026-08-12T09:01:00Z', mine: true }),
  subscribeToChatRoom: vi.fn().mockReturnValue(() => undefined),
}))

function renderApp(initialEntries = ['/chat']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/chat/*" element={<ChatApp />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function renderProductionApp(initialEntries = ['/chat']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter basename="/chat" initialEntries={initialEntries}>
        <ChatApp />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('독립 앱 S1 채팅 이식', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('채팅방 목록과 새 대화 생성 흐름을 제공한다', async () => {
    renderApp()
    expect(await screen.findByRole('heading', { name: '채팅' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /김개발/ })).toHaveAttribute('href', '/chat/CHAT-20260812-000017')

    fireEvent.click(screen.getByRole('button', { name: '새 대화' }))
    fireEvent.change(screen.getByRole('textbox', { name: '대화 상대 검색' }), { target: { value: '이개발' } })
    fireEvent.click((await screen.findAllByRole('button', { name: /이개발/ })).at(-1)!)
    fireEvent.click(screen.getByRole('button', { name: '대화 시작' }))

    await waitFor(() => expect(chatApi.createDirectChatRoomByEmployeeCode).toHaveBeenCalledWith('E002'))
  })

  it('내 정보 아래 직원 목록을 표시하고 직원 클릭으로 대화를 만든다', async () => {
    renderApp()

    expect(await screen.findByText('홍길동')).toBeInTheDocument()
    const employees = await screen.findByRole('list', { name: '직원 목록' })
    expect(employees).toHaveTextContent('김대표')
    expect(employees).toHaveTextContent('박사원')
    fireEvent.click(within(employees).getByRole('button', { name: /김대표/ }))

    await waitFor(() => expect(chatApi.createDirectChatRoomByEmployeeCode).toHaveBeenCalledWith('CEO'))
  })

  it('세션 목록 상단은 상태를 읽을 수 있는 요약 영역으로 표시한다', async () => {
    renderApp()

    const summary = await screen.findByTestId('chat-session-summary')
    await screen.findByText('홍길동')
    expect(summary.getAttribute('role')).toBe('region')
    expect(summary).toHaveAccessibleName('현재 세션')
    expect(within(summary).getByText('홍길동')).toBeInTheDocument()
    expect(within(summary).getByText('접속')).toBeInTheDocument()
  })

  it('production basename 환경에서 방 생성 직후 생성된 대화방에 진입한다', async () => {
    renderProductionApp()

    fireEvent.change(await screen.findByRole('textbox', { name: '대화 상대 검색' }), { target: { value: '이개발' } })
    fireEvent.click((await screen.findAllByRole('button', { name: /이개발/ })).at(-1)!)
    fireEvent.click(screen.getByRole('button', { name: '대화 시작' }))

    await waitFor(() => expect(screen.getByTestId('chat-room-page')).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: '채팅' })).toBeInTheDocument()
  })

  it('대화 내용과 메시지 전송을 제공한다', async () => {
    renderApp(['/chat/CHAT-20260812-000017'])
    expect(await screen.findByText('안녕하세요')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: '메시지 본문' }), { target: { value: '반갑습니다' } })
    fireEvent.click(screen.getByRole('button', { name: '보내기' }))
    await waitFor(() => expect(chatApi.sendChatMessage).toHaveBeenCalledWith('CHAT-20260812-000017', '반갑습니다'))
  })

  it('독립 앱은 본체 채팅 구현을 import하지 않는다', async () => {
    const module = await import('./ChatApp')
    expect(module).toBeDefined()
    expect(module).not.toHaveProperty('desktopChatSource')
  })

  it('데스크톱 세션을 접속 상태로 등록하고 언마운트 시 해제한다', async () => {
    const { unmount } = renderApp()
    await waitFor(() => expect(chatApi.joinMessengerPresence).toHaveBeenCalledWith(expect.stringMatching(/^desktop-/)))
    const firstJoinCall = vi.mocked(chatApi.joinMessengerPresence).mock.calls[0]
    expect(firstJoinCall).toBeDefined()
    const sessionId = firstJoinCall![0]
    unmount()
    await waitFor(() => expect(chatApi.leaveMessengerPresence).toHaveBeenCalledWith(sessionId))
  })

  it('상태 아이콘과 개별·그룹별 전환을 제공한다', async () => {
    renderApp()
    expect(await screen.findByLabelText('홍길동 상태: 접속')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '그룹별' }))
    expect(await screen.findByTestId('group-chat-rooms-page')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '개별' })).toBeInTheDocument()
  })

  it('네 가지 상태 아이콘은 실제로 표시되는 픽셀 요소를 가진다', async () => {
    renderApp()

    await screen.findByText('홍길동')
    await screen.findByRole('list', { name: '직원 목록' })
    for (const status of ['접속', '자리비움', '부재중', '오프라인']) {
      const icon = screen.getAllByLabelText(new RegExp(`상태: ${status}$`))[0]
      expect(icon).toHaveClass(`presence-${status === '접속' ? 'available' : status === '자리비움' ? 'away' : status === '부재중' ? 'absent' : 'offline'}`)
    }
    const stylesheet = readFileSync(resolve(process.cwd(), 'src/renderer/styles.css'), 'utf8')
    expect(stylesheet).toContain('.presence { display: inline-block; width: 10px; height: 10px;')
    expect(stylesheet).toContain('.presence-available { background: #16a34a; }')
    expect(stylesheet).toContain('.presence-away { background: #f59e0b; }')
    expect(stylesheet).toContain('.presence-absent { background: #ef4444; }')
    expect(stylesheet).toContain('.presence-offline { background: #94a3b8; }')
  })

  it('직접 대화 생성 성공 후 basename 내부 room route에 남는다', async () => {
    renderProductionApp()
    fireEvent.change(await screen.findByRole('textbox', { name: '대화 상대 검색' }), { target: { value: '김대표' } })
    fireEvent.click((await screen.findAllByRole('button', { name: /김대표/ })).at(-1)!)
    fireEvent.click(screen.getByRole('button', { name: '대화 시작' }))
    await waitFor(() => expect(screen.getByTestId('chat-room-page')).toBeInTheDocument())
  })

  it('그룹방을 안읽음 먼저, 최신순으로 표시하고 참여자 표시명을 만든다', async () => {
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: '그룹별' }))
    const list = await screen.findByRole('list', { name: '그룹 채팅방 목록' })
    expect((await within(list).findAllByRole('link')).map((link) => link.textContent?.replace(/\d+$/, ''))).toEqual([
      '물류 협의', '홍길동, 최수진', '홍길동, 김철수 외 3명',
    ])
    expect(within(list).getByText('2')).toBeInTheDocument()
  })

  it('돋보기 모달에서 복수 직원을 선택해 그룹방을 만든다', async () => {
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: '그룹별' }))
    fireEvent.click(await screen.findByRole('button', { name: '검색' }))
    const dialog = await screen.findByRole('dialog', { name: '단톡방 생성' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '직원 검색' }), { target: { value: '김' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /김대표/ }))
    fireEvent.change(within(dialog).getByRole('textbox', { name: '직원 검색' }), { target: { value: '박' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /박사원/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: '단톡방 생성' }))
    await waitFor(() => expect(chatApi.createGroupChatRoom).toHaveBeenCalledWith(['CEO', 'STAFF']))
  })
})
