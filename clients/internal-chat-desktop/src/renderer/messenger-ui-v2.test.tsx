import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
const claudeApi = vi.hoisted(() => ({
  listClaudeSessions: vi.fn().mockResolvedValue([]),
  createClaudeSession: vi.fn(),
  askClaude: vi.fn(),
  claudeErrorMessage: vi.fn().mockReturnValue('오류'),
}))
vi.mock('./api/chat-api', () => chatApi)
vi.mock('./claude/claude-api', () => claudeApi)
vi.mock('./api/presence-api', () => ({ subscribePresence: chatApi.subscribePresence, updatePresence: chatApi.updatePresence }))

function renderApp() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ChatApp /></QueryClientProvider>)
}

describe('삼한 메신저 UI v2', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-08-14T12:00:00+09:00'))
    chatApi.fetchDirectory.mockResolvedValue([
      { employeeCode: 'E2', name: '김대리', jobTitle: '대리', departmentName: '영업팀', presenceStatus: 'OFFLINE' },
      { employeeCode: 'E1', name: '박개발', jobTitle: '개발자', departmentName: '개발팀', presenceStatus: 'AVAILABLE' },
      { employeeCode: 'E3', name: '이과장', jobTitle: '과장', departmentName: '개발팀', presenceStatus: 'AWAY' },
    ])
    chatApi.fetchGroups.mockResolvedValue([{ roomCode: 'ROOM-1', type: 'GROUP', roomName: '운영방', memberCount: 4, lastMessage: '오늘 일정 공유드립니다', lastMessageAt: '2026-08-14T08:36:00+09:00' }])
    chatApi.createDirectRoom.mockResolvedValue({ roomCode: 'ROOM-DIRECT', type: 'DIRECT', partnerName: '박개발' })
    claudeApi.listClaudeSessions.mockResolvedValue([])
  })
  afterEach(() => { vi.useRealTimers(); cleanup(); vi.clearAllMocks() })

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

  it('메인 창은 목록만 표시하고 방을 누르면 대화방 별도 창을 연다', async () => {
    const openConversation = vi.fn().mockResolvedValue({ opened: true })
    Object.defineProperty(window, 'internalChatShell', { configurable: true, value: { openConversation, onWillQuit: vi.fn().mockReturnValue(() => undefined) } })
    renderApp()
    await waitFor(() => expect(screen.getByText('박개발')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /박개발/ }))
    await waitFor(() => expect(openConversation).toHaveBeenCalledWith(expect.objectContaining({ roomCode: expect.any(String) })))
    expect(screen.queryByRole('region', { name: '대화' })).not.toBeInTheDocument()
  })

  it('같은 방을 다시 누르면 새 창 대신 기존 창을 앞으로 가져온다', async () => {
    const openConversation = vi.fn().mockResolvedValue({ opened: true })
    Object.defineProperty(window, 'internalChatShell', { configurable: true, value: { openConversation, onWillQuit: vi.fn().mockReturnValue(() => undefined) } })
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: '그룹별' }))
    await waitFor(() => expect(screen.getByText('운영방')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /운영방/ }))
    fireEvent.click(screen.getByRole('button', { name: /운영방/ }))
    await waitFor(() => expect(openConversation).toHaveBeenCalledTimes(2))
    expect(openConversation.mock.calls.at(0)?.at(0)).toEqual(openConversation.mock.calls.at(1)?.at(0))
  })

  it('Claude 세션은 수직 대화방 목록 행으로 요약 제목·마지막 대화·시각을 표시한다', async () => {
    const openConversation = vi.fn().mockResolvedValue({ opened: true })
    Object.defineProperty(window, 'internalChatShell', { configurable: true, value: { openConversation, onWillQuit: vi.fn().mockReturnValue(() => undefined) } })
    claudeApi.listClaudeSessions.mockResolvedValue([
      { sessionCode: 'CLD-1', title: '배차 일정 요약', messageCount: 2, lastMessage: '내일 오전 배차를 정리했습니다.', lastMessageAt: '2026-08-14T08:36:00+09:00' } as never,
    ])
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: '클로드' }))
    expect(await screen.findByRole('list', { name: '클로드 세션 목록' })).toBeInTheDocument()
    expect(await screen.findByText('배차 일정 요약')).toBeInTheDocument()
    expect(await screen.findByText('내일 오전 배차를 정리했습니다.')).toBeInTheDocument()
    expect(await screen.findByText('오전 8:36')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /배차 일정 요약/ }))
    expect(openConversation).toHaveBeenCalledWith(expect.objectContaining({ sessionCode: 'CLD-1' }))
  })

  it('Claude 자격 미설정·가상 세션은 제목에서 실제 요약과 구분된다', async () => {
    claudeApi.listClaudeSessions.mockResolvedValue([
      { sessionCode: 'CLD-OFF', title: '요약 없음', summaryMode: 'CREDENTIAL_UNAVAILABLE' },
      { sessionCode: 'CLD-VIRTUAL', title: '가상 에이전트 요약', summaryMode: 'VIRTUAL' },
    ] as never)
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: '클로드' }))
    expect(await screen.findByText('요약을 생성할 수 없음 · 자격 미설정')).toBeInTheDocument()
    expect(await screen.findByText('가상 요약 · 가상 에이전트 요약')).toBeInTheDocument()
  })

  it('사용자 화면에 내부 설계 용어와 원시 식별자를 출력하지 않는다', async () => {
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: '클로드' }))
    expect(await screen.findByTestId('claude-app')).not.toHaveTextContent('축 0 권한 보호')
    fireEvent.click(screen.getByRole('button', { name: '그룹별' }))
    await waitFor(() => expect(screen.getByTestId('messenger-app')).not.toHaveTextContent('CHAT-'))
  })

  it('시드 데이터 표시는 사용자 이름에서 제거한다', async () => {
    chatApi.fetchDirectory.mockResolvedValueOnce([
      { employeeCode: 'E-SEED', name: '[DEV-SEED] 박개발', jobTitle: '개발자', departmentName: '개발팀', presenceStatus: 'AVAILABLE' },
    ])
    renderApp()
    expect(await screen.findByText('박개발')).toBeInTheDocument()
    expect(screen.getByTestId('messenger-app')).not.toHaveTextContent('[DEV-SEED]')
  })

  it('presence SSE 식별자가 비어도 directory를 재조회해 다른 직원 화면을 갱신한다', async () => {
    const subscribe = vi.mocked(chatApi.subscribePresence)
    vi.mocked(chatApi.fetchDirectory)
      .mockResolvedValueOnce([
        { employeeCode: 'E2', name: '김대리', jobTitle: '대리', departmentName: '영업팀', presenceStatus: 'OFFLINE' },
        { employeeCode: 'E1', name: '박개발', jobTitle: '개발자', departmentName: '개발팀', presenceStatus: 'AVAILABLE' },
      ])
      .mockResolvedValueOnce([
        { employeeCode: 'E2', name: '김대리', jobTitle: '대리', departmentName: '영업팀', presenceStatus: 'IN_MEETING' },
        { employeeCode: 'E1', name: '박개발', jobTitle: '개발자', departmentName: '개발팀', presenceStatus: 'AVAILABLE' },
      ])
    let emit: ((event: { employeeCode: string | null; presenceStatus: 'IN_MEETING' }) => void) | undefined
    subscribe.mockImplementationOnce((onEvent) => { emit = onEvent as typeof emit; return () => undefined })
    renderApp()
    await waitFor(() => expect(screen.getByLabelText('박개발 상태: 접속')).toBeInTheDocument())
    emit?.({ employeeCode: null, presenceStatus: 'IN_MEETING' })
    await waitFor(() => expect(screen.getByLabelText('김대리 상태: 회의중')).toBeInTheDocument())
  })

  it('directory presence를 REST 재조회가 아닌 별도 SSE로 구독한다', async () => {
    renderApp()
    await waitFor(() => expect(subscribePresence).toHaveBeenCalled())
  })
})
