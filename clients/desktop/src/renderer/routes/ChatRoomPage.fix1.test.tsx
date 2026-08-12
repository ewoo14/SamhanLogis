// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
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
})
