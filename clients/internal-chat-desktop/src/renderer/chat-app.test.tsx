// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatApp } from './ChatApp'
import * as chatApi from './api/chatApi'

vi.mock('./api/chatApi', () => ({
  fetchMessengerMe: vi.fn().mockResolvedValue({ employeeCode: 'ME', name: '홍길동', jobTitle: '부장', departmentName: '개발팀', employmentStatus: 'ACTIVE' }),
  fetchMessengerDirectory: vi.fn().mockResolvedValue([
    { employeeCode: 'CEO', name: '김대표', jobTitle: '대표', departmentName: '대표실', employmentStatus: 'ACTIVE' },
    { employeeCode: 'STAFF', name: '박사원', jobTitle: '사원', departmentName: '개발팀', employmentStatus: 'ACTIVE' },
    { employeeCode: 'E002', name: '이개발', jobTitle: '개발자', departmentName: '물류팀', employmentStatus: 'ACTIVE' },
  ]),
  createDirectChatRoomByEmployeeCode: vi.fn().mockResolvedValue({ roomCode: 'CHAT-20260813-000002', type: 'DIRECT', roomName: null, partnerName: '김대표' }),
  fetchChatRooms: vi.fn().mockResolvedValue([
    { roomCode: 'CHAT-20260812-000017', type: 'DIRECT', roomName: null, partnerName: '김개발', partnerDepartment: '플랫폼팀', partnerEmployeeCode: 'E001' },
  ]),
  searchRecipients: vi.fn().mockResolvedValue([
    { userId: '4f6f6c2e-5a8e-4db2-a2d7-4b9f2f4f0002', name: '이개발', department: '물류팀', employeeCode: 'E002' },
  ]),
  createDirectChatRoom: vi.fn().mockResolvedValue({ roomCode: 'CHAT-20260813-000001', type: 'DIRECT', roomName: null, partnerName: '이개발', partnerDepartment: '물류팀', partnerEmployeeCode: 'E002' }),
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
})
