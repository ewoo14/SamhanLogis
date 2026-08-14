// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatApp } from './ChatApp'

const claude = vi.hoisted(() => ({
  listClaudeSessions: vi.fn().mockResolvedValue([]),
  createClaudeSession: vi.fn().mockResolvedValue({ sessionCode: 'CLD-1', title: '새 대화', messageCount: 0 }),
  askClaude: vi.fn().mockResolvedValue('첫 세션 답변'),
  claudeErrorMessage: vi.fn().mockReturnValue('오류'),
}))
vi.mock('./claude/claude-api', () => claude)
vi.mock('./api/chat-api', () => ({
  fetchMe: vi.fn().mockResolvedValue({ name: '홍길동', jobTitle: '부장', departmentName: '개발팀', presenceStatus: 'AVAILABLE' }),
  fetchDirectory: vi.fn().mockResolvedValue([]), fetchRooms: vi.fn().mockResolvedValue([]), fetchGroups: vi.fn().mockResolvedValue([]), fetchMessages: vi.fn().mockResolvedValue([]),
  joinPresence: vi.fn().mockResolvedValue(undefined), leavePresence: vi.fn().mockResolvedValue(undefined), createDirectRoom: vi.fn(), createGroupRoom: vi.fn(), sendMessage: vi.fn(), subscribe: vi.fn().mockReturnValue(() => undefined),
}))
vi.mock('./api/chatApi', () => ({
  fetchMessengerMe: vi.fn().mockResolvedValue({ employeeCode: 'ME', name: '홍길동', jobTitle: '부장', departmentName: '개발팀', employmentStatus: 'ACTIVE', presenceStatus: 'AVAILABLE' }),
  joinMessengerPresence: vi.fn().mockResolvedValue(undefined), leaveMessengerPresence: vi.fn().mockResolvedValue(undefined),
  fetchMessengerDirectory: vi.fn().mockResolvedValue([{ employeeCode: 'CEO', name: '김대표', jobTitle: '대표', departmentName: '대표실', employmentStatus: 'ACTIVE', presenceStatus: 'AWAY' }]),
  fetchGroupChatRooms: vi.fn().mockResolvedValue([{ roomCode: 'GROUP-1', type: 'GROUP', roomName: '물류 협의', participants: [{ name: '홍길동' }], unreadCount: 2, latestMessageAt: '2026-08-14T09:00:00Z' }]),
  createDirectChatRoomByEmployeeCode: vi.fn().mockResolvedValue({ roomCode: 'CHAT-1', type: 'DIRECT', roomName: null, partnerName: '김대표' }),
  fetchChatRooms: vi.fn().mockResolvedValue([{ roomCode: 'CHAT-1', type: 'DIRECT', roomName: null, partnerName: '김개발', partnerDepartment: '플랫폼팀', partnerEmployeeCode: 'E001' }]),
  fetchChatMessages: vi.fn().mockResolvedValue([{ roomCode: 'CHAT-1', sequence: 1, body: '안녕하세요', sentAt: '2026-08-12T09:00:00Z', senderName: '김개발', mine: false }]),
  sendChatMessage: vi.fn().mockResolvedValue({ roomCode: 'CHAT-1', sequence: 2, body: '반갑습니다', sentAt: '2026-08-12T09:01:00Z', mine: true }),
  subscribeToChatRoom: vi.fn().mockReturnValue(() => undefined),
}))

function plain() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ChatApp /></QueryClientProvider>) }
function routed(initialEntries = ['/chat']) { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={initialEntries}><Routes><Route path="/chat/*" element={<ChatApp />} /></Routes></MemoryRouter></QueryClientProvider>) }

describe('삼한 메신저 v2와 Claude 세션', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('상단 탭에서 클로드로 전환할 수 있다', () => { plain(); fireEvent.click(screen.getByRole('button', { name: '클로드' })); expect(screen.getByTestId('claude-app')).toBeInTheDocument() })
  it('새 세션을 연속 생성하고 각 세션 창을 연다', async () => { const openConversation = vi.fn().mockResolvedValue({ opened: true }); Object.defineProperty(window, 'internalChatShell', { configurable: true, value: { openConversation, onWillQuit: vi.fn().mockReturnValue(() => undefined) } }); plain(); fireEvent.click(screen.getByRole('button', { name: '클로드' })); fireEvent.click(screen.getByRole('button', { name: '새 세션' })); await waitFor(() => expect(openConversation).toHaveBeenCalledWith(expect.objectContaining({ sessionCode: 'CLD-1' }))) })
})

describe('main 본체 채팅 회귀와 S5 세션 요약', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks() })
  it('채팅방 목록과 직원 목록을 제공한다', async () => { routed(); expect(await screen.findByRole('heading', { name: '채팅' })).toBeInTheDocument(); expect(await screen.findByRole('link', { name: /김개발/ })).toBeInTheDocument(); expect(screen.getByRole('list', { name: '직원 목록' })).toHaveTextContent('김대표') })
  it('S5 상단 세션 요약은 이름·직급·접속 상태를 보존한다', async () => { routed(); const summary = await screen.findByTestId('chat-session-summary'); expect(summary).toHaveAccessibleName('현재 세션'); expect(await screen.findByText('홍길동')).toBeInTheDocument(); expect(summary).toHaveTextContent('부장'); expect(summary).toHaveTextContent('접속') })
  it('그룹별 화면과 메시지 전송 경로를 유지한다', async () => { routed(); fireEvent.click(screen.getByRole('button', { name: '그룹별' })); expect(await screen.findByTestId('group-chat-rooms-page')).toBeInTheDocument(); routed(['/chat/CHAT-1']); expect(await screen.findByText('안녕하세요')).toBeInTheDocument(); fireEvent.change(screen.getByRole('textbox', { name: '메시지 본문' }), { target: { value: '반갑습니다' } }); fireEvent.click(screen.getByRole('button', { name: '보내기' })); await waitFor(() => expect(screen.getByRole('textbox', { name: '메시지 본문' })).toHaveValue('')) })
  it('상태 아이콘의 픽셀 CSS를 보존한다', async () => { routed(); expect(await screen.findByLabelText('홍길동 상태: 접속')).toHaveClass('presence-available'); const stylesheet = readFileSync(resolve(process.cwd(), 'src/renderer/styles.css'), 'utf8'); expect(stylesheet).toContain('.presence { display: inline-block; width: 10px; height: 10px;'); expect(stylesheet).toContain('.presence-available { background: #16a34a; }') })
})
