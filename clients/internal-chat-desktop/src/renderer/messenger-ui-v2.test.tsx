import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatApp } from './ChatApp'
import { subscribePresence, updatePresence } from './api/presence-api'

const chatApi = vi.hoisted(() => ({
  fetchMe: vi.fn().mockResolvedValue({ employeeCode: 'ME', name: '홍길동', jobTitle: '부장', departmentName: '개발팀', presenceStatus: 'AVAILABLE' }),
  fetchDirectory: vi.fn().mockResolvedValue([
    { employeeCode: 'E2', name: '김대리', jobTitle: '대리', departmentName: '영업팀', presenceStatus: 'OFFLINE' },
    { employeeCode: 'E1', name: '박개발', jobTitle: '개발자', departmentName: '개발팀', presenceStatus: 'AVAILABLE' },
    { employeeCode: 'E3', name: '이과장', jobTitle: '과장', departmentName: '개발팀', presenceStatus: 'AWAY' },
  ]),
  fetchRooms: vi.fn().mockResolvedValue([]),
  fetchGroups: vi.fn().mockResolvedValue([{ roomCode: 'ROOM-1', type: 'GROUP', roomName: '운영방', memberCount: 4, lastMessage: '오늘 일정 공유드립니다', lastMessageAt: '2026-08-14T08:36:00+09:00' }]),
  fetchMessages: vi.fn().mockResolvedValue([]),
  joinPresence: vi.fn().mockResolvedValue(undefined), leavePresence: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn().mockReturnValue(() => undefined),
  subscribePresence: vi.fn().mockReturnValue(() => undefined), updatePresence: vi.fn(),
  createDirectRoom: vi.fn(), createGroupRoom: vi.fn(), sendMessage: vi.fn(),
}))
vi.mock('./api/chat-api', () => chatApi)
vi.mock('./api/presence-api', () => ({ subscribePresence: chatApi.subscribePresence, updatePresence: chatApi.updatePresence }))

function renderApp() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ChatApp /></QueryClientProvider>)
}

describe('삼한 메신저 UI v2', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('상단을 개별·그룹별·클로드 pill 칩으로 전환한다', () => {
    renderApp()
    expect(screen.getByRole('button', { name: '개별' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '그룹별' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '클로드' })).toBeInTheDocument()
  })

  it('내 상태를 칩 바로 아래에서 네 상태 중 하나로 변경한다', async () => {
    vi.mocked(updatePresence).mockResolvedValueOnce(undefined)
    renderApp()
    await waitFor(() => expect(screen.getByRole('button', { name: /홍길동 상태/ })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /홍길동 상태/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: '자리비움' }))
    await waitFor(() => expect(updatePresence).toHaveBeenCalledWith('AWAY', expect.anything()))
  })

  it('내 상태 메뉴에 회의중과 통화중을 포함한 여섯 상태를 모두 표시한다', async () => {
    renderApp()
    await waitFor(() => expect(screen.getByRole('button', { name: /홍길동 상태/ })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /홍길동 상태/ }))
    expect(screen.getByRole('menuitem', { name: '접속' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '자리비움' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '부재중' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '회의중' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '통화중' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '오프라인' })).toBeInTheDocument()
  })

  it('그룹별 페이지는 마지막 메시지와 인원수를 목록 행에 표시한다', async () => {
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: '그룹별' }))
    await waitFor(() => expect(screen.getByText('운영방')).toBeInTheDocument())
    expect(screen.getByText('운영방')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('오늘 일정 공유드립니다')).toBeInTheDocument()
    expect(screen.getByText('오전 8:36')).toBeInTheDocument()
  })

  it('directory presence를 REST 재조회가 아닌 별도 SSE로 구독한다', async () => {
    renderApp()
    await waitFor(() => expect(subscribePresence).toHaveBeenCalled())
  })
})
