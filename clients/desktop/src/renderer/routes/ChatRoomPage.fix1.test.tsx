// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, describe, it, expect, afterEach } from 'vitest'
import { ChatRoomPage } from './ChatRoomPage'
import { ChatRoomsPage } from './ChatRoomsPage'

vi.mock('../api/messengerApi', () => ({
  fetchChatRooms: vi.fn().mockResolvedValue([
    { roomCode: 'CHAT-20260812-000017', type: 'DIRECT', roomName: '김개발 · 플랫폼팀 · E001' },
  ]),
  fetchChatMessages: vi.fn().mockResolvedValue([
    { roomCode: 'CHAT-20260812-000017', sequence: 1, body: '안녕하세요', sentAt: '2026-08-12T09:00:00Z', senderName: '김개발', senderDepartment: '플랫폼팀', senderEmployeeCode: 'E001', mine: false },
  ]),
  sendChatMessage: vi.fn(),
  createDirectChatRoom: vi.fn(),
  searchRecipients: vi.fn(),
}))

function renderWithQuery(element: React.ReactElement) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{element}</QueryClientProvider>)
}

describe('room 기반 1:1 채팅 fix1 화면 계약', () => {
  afterEach(() => cleanup())
  it('방 목록과 새 대화 진입 버튼을 실제 화면에 제공한다', async () => {
    renderWithQuery(<MemoryRouter><ChatRoomsPage /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: '채팅' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '새 대화' })).toBeTruthy()
    expect((await screen.findByRole('link', { name: /김개발/ })).getAttribute('href')).toBe('/chat/CHAT-20260812-000017')
  })

  it('메시지 화면에 발신자 이름과 부서를 표시한다', async () => {
    renderWithQuery(<MemoryRouter initialEntries={['/chat/CHAT-20260812-000017']}><Routes><Route path="/chat/:roomCode" element={<ChatRoomPage />} /></Routes></MemoryRouter>)
    expect((await screen.findAllByText('김개발')).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/플랫폼팀/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/E001/).length).toBeGreaterThan(0)
  })

  it('DIRECT 방 헤더에 상대 이름·부서·사번을 표시한다', async () => {
    renderWithQuery(<MemoryRouter initialEntries={['/chat/CHAT-20260812-000017']}><Routes><Route path="/chat/:roomCode" element={<ChatRoomPage />} /></Routes></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: /김개발/ })).toBeTruthy()
    expect(screen.getAllByText(/플랫폼팀/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/E001/).length).toBeGreaterThan(0)
  })

  it('방 생성 실패 시 개발자 원문이 아닌 사용자 안내 문구를 표시한다 RED', async () => {
    vi.mocked(await import('../api/messengerApi')).searchRecipients.mockResolvedValue([
      { userId: 'user-2', name: '김개발', department: '플랫폼팀', employeeCode: 'E001' },
    ])
    vi.mocked(await import('../api/messengerApi')).createDirectChatRoom.mockRejectedValue(new Error('ConstraintViolationException: room_id'))
    renderWithQuery(<MemoryRouter><ChatRoomsPage /></MemoryRouter>)
    fireEvent.change(screen.getByRole('textbox', { name: '대화 상대 검색' }), { target: { value: '김개발' } })
    fireEvent.click(await screen.findByRole('button', { name: /김개발/ }))
    fireEvent.click(screen.getByRole('button', { name: '대화 시작' }))
    expect(await screen.findByText('대화방을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.')).toBeTruthy()
    expect(screen.queryByText(/ConstraintViolationException/)).toBeNull()
  })

  it('메시지 발송 실패 시 개발자 원문이 아닌 사용자 안내 문구를 표시한다 RED', async () => {
    vi.mocked(await import('../api/messengerApi')).sendChatMessage.mockRejectedValue(new Error('PGobject cannot be cast to Long'))
    renderWithQuery(<MemoryRouter initialEntries={['/chat/CHAT-20260812-000017']}><Routes><Route path="/chat/:roomCode" element={<ChatRoomPage />} /></Routes></MemoryRouter>)
    fireEvent.change(await screen.findByRole('textbox', { name: '메시지 본문' }), { target: { value: '실패 메시지' } })
    fireEvent.click(screen.getByRole('button', { name: '보내기' }))
    expect(await screen.findByText('메시지를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.')).toBeTruthy()
    expect(screen.queryByText(/PGobject/)).toBeNull()
  })

  it('방 API가 내려준 상대 이름·부서·사번을 헤더에 표시한다 RED', async () => {
    vi.mocked(await import('../api/messengerApi')).fetchChatRooms.mockResolvedValue([
      { roomCode: 'CHAT-20260812-000017', type: 'DIRECT', roomName: null, partnerName: '김개발', partnerDepartment: '플랫폼팀', partnerEmployeeCode: 'E001' },
    ])
    renderWithQuery(<MemoryRouter initialEntries={['/chat/CHAT-20260812-000017']}><Routes><Route path="/chat/:roomCode" element={<ChatRoomPage />} /></Routes></MemoryRouter>)
    await waitFor(() => expect(screen.getByRole('heading', { name: '김개발' })).toBeTruthy())
    expect(screen.getByText('플랫폼팀 · E001')).toBeTruthy()
  })
})
