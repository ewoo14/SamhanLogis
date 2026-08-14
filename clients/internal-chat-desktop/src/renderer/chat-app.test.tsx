import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatApp } from './ChatApp'

const claude = vi.hoisted(() => ({
  listClaudeSessions: vi.fn().mockResolvedValue([]),
  createClaudeSession: vi.fn().mockResolvedValue({ sessionCode: 'CLD-1', title: '새 대화', messageCount: 0 }),
  askClaude: vi.fn().mockResolvedValue('첫 세션 답변'),
  claudeErrorMessage: vi.fn().mockReturnValue('오류'),
}))
vi.mock('./claude/claude-api', () => claude)
vi.mock('./api/chat-api', () => ({ fetchMe: vi.fn().mockResolvedValue({ name: '홍길동', jobTitle: '부장', departmentName: '개발팀', presenceStatus: 'AVAILABLE' }), fetchDirectory: vi.fn().mockResolvedValue([]), fetchRooms: vi.fn().mockResolvedValue([]), fetchGroups: vi.fn().mockResolvedValue([]), fetchMessages: vi.fn().mockResolvedValue([]), joinPresence: vi.fn().mockResolvedValue(undefined), leavePresence: vi.fn().mockResolvedValue(undefined), subscribe: vi.fn().mockReturnValue(() => undefined) }))

function renderApp() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ChatApp /></QueryClientProvider>) }

describe('삼한 메신저 상단 탭과 Claude 세션', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('상단 탭에서 클로드로 전환할 수 있다', () => {
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: '클로드' }))
    expect(screen.getByTestId('claude-app')).toBeInTheDocument()
  })

  it('새 세션을 연속 생성하고 선택 세션별로 질문을 보낸다', async () => {
    claude.createClaudeSession.mockResolvedValueOnce({ sessionCode: 'CLD-1', title: '새 대화 1', messageCount: 0 }).mockResolvedValueOnce({ sessionCode: 'CLD-2', title: '새 대화 2', messageCount: 0 })
    renderApp(); fireEvent.click(screen.getByRole('button', { name: '클로드' }))
    fireEvent.click(screen.getByRole('button', { name: '새 세션' })); await waitFor(() => expect(screen.getByText('새 대화 1')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '새 세션' })); await waitFor(() => expect(screen.getByText('새 대화 2')).toBeInTheDocument())
    fireEvent.change(screen.getByRole('textbox', { name: '클로드 질문' }), { target: { value: '두 번째 세션 질문' } }); fireEvent.click(screen.getByRole('button', { name: '질문 보내기' }))
    await waitFor(() => expect(claude.askClaude).toHaveBeenCalledWith('두 번째 세션 질문', expect.objectContaining({ sessionCode: 'CLD-2' })))
  })
})
