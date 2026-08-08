// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('./CollaborativeTextField', () => ({
  CollaborativeTextField: () => <div>협업 메모</div>,
}))
vi.mock('../../hooks/usePresence', () => ({ usePresence: () => [] }))
vi.mock('../audit/PartnerOrderVersionHistoryPanel', () => ({
  PartnerOrderVersionHistoryPanel: ({ activeFieldPath, activeRevisionNo, onRevisionSelect }: {
    activeFieldPath?: string | null
    activeRevisionNo?: number | null
    onRevisionSelect?: (revisionNo: number, fieldPaths?: string[]) => void
  }) => (
    <div
      data-testid="partner-order-version-history-stub"
      data-active-field={activeFieldPath ?? ''}
      data-active-revision={activeRevisionNo ?? ''}
    >
      <button type="button" onClick={() => onRevisionSelect?.(4, ['memo'])}>
        주문 버전 선택
      </button>
    </div>
  ),
}))
const canAccessMock = vi.fn(() => true)
vi.mock('../../hooks/usePermissions', () => ({ usePermissions: () => ({ canAccess: canAccessMock }) }))
const realtimeMocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
}))
vi.mock('../../realtime/PartnerOrderCollabRealtimeClient', () => ({
  PartnerOrderCollabRealtimeClient: { subscribe: realtimeMocks.subscribe },
}))
vi.mock('../../api/partnerOrderCollab', () => ({
  getPartnerOrderCollabComments: vi.fn(() => Promise.resolve([{
    id: 'comment-1',
    anchor: 'memo',
    authorName: '홍길동',
    body: '주문 요청사항 확인',
    parentId: null,
    status: 'OPEN',
    createdAt: '2026-07-06T09:00:00',
  }])),
  getPartnerOrderCollabEdits: vi.fn(() => Promise.resolve([])),
  addPartnerOrderCollabComment: vi.fn(),
  deletePartnerOrderCollabComment: vi.fn(),
  resolvePartnerOrderCollabComment: vi.fn(),
  commitPartnerOrderCollabEdit: vi.fn(),
}))

import { addPartnerOrderCollabComment } from '../../api/partnerOrderCollab'
import { PartnerOrderCollaborationPanel } from './PartnerOrderCollaborationPanel'

function renderPanel(orderId: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <PartnerOrderCollaborationPanel
        orderId={orderId}
        status="DRAFT"
        currentValues={{ memo: null, dueDate: null, lines: [] }}
      />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  canAccessMock.mockReturnValue(true)
  vi.mocked(addPartnerOrderCollabComment).mockReset()
  realtimeMocks.subscribe.mockReset()
  realtimeMocks.subscribe.mockReturnValue({ abort: vi.fn() })
})

describe('PartnerOrderCollaborationPanel 협업 패널 배치', () => {
  it('권위 사건은 상세와 revision을 한 번만 재검증하고 공유 문서를 건드리지 않는다', async () => {
    let onEvent!: (event: { event: string; data: unknown; raw: string }) => void
    realtimeMocks.subscribe.mockImplementation((_orderId: string, handler: typeof onEvent) => {
      onEvent = handler
      return { abort: vi.fn() }
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    render(
      <QueryClientProvider client={client}>
        <PartnerOrderCollaborationPanel
          orderId="2099/06/27-COED-1"
          status="DRAFT"
          currentValues={{ memo: null, dueDate: null, lines: [] }}
        />
      </QueryClientProvider>,
    )

    await waitFor(() => expect(onEvent).toBeTypeOf('function'))
    const event = {
      event: 'partner-order:authority',
      data: {
        commitId: 'commit-1',
        orderId: '2099/06/27-COED-1',
        revisionNo: 8,
        changeType: 'RESTORE',
      },
      raw: '',
    }
    onEvent(event)
    onEvent(event)

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledTimes(3)
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['partner-order', '2099/06/27-COED-1'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['partner-order-revisions', '2099/06/27-COED-1'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['partner-orders'] })
    })
  })

  it('권위 사건으로 부모 상세가 갱신되어도 편집 중인 overlay draft는 유지한다', async () => {
    let onEvent!: (event: { event: string; data: unknown; raw: string }) => void
    realtimeMocks.subscribe.mockImplementation((_orderId: string, handler: typeof onEvent) => {
      onEvent = handler
      return { abort: vi.fn() }
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = render(
      <QueryClientProvider client={client}>
        <PartnerOrderCollaborationPanel
          orderId="2099/06/27-COED-1"
          status="DRAFT"
          editMode
          currentValues={{ memo: '서버의 이전 값', dueDate: null, lines: [] }}
        />
      </QueryClientProvider>,
    )

    const memoInput = await screen.findByLabelText('요청사항 수정값')
    fireEvent.change(memoInput, { target: { value: 'A의 미저장 초안' } })
    onEvent({
      event: 'partner-order:authority',
      data: { commitId: 'commit-restore', orderId: '2099/06/27-COED-1', revisionNo: 9, changeType: 'RESTORE' },
      raw: '',
    })
    view.rerender(
      <QueryClientProvider client={client}>
        <PartnerOrderCollaborationPanel
          orderId="2099/06/27-COED-1"
          status="DRAFT"
          editMode
          currentValues={{ memo: 'B가 복원한 서버 값', dueDate: null, lines: [] }}
        />
      </QueryClientProvider>,
    )

    expect((screen.getByLabelText('요청사항 수정값') as HTMLInputElement).value).toBe('A의 미저장 초안')
  })

  it('협업 헤더와 changeSet 수정 이력 목록을 제거하고 코멘트와 버전 이력만 렌더한다', () => {
    renderPanel('2099/06/27-COED-1')

    const commentSection = screen.getByLabelText('코멘트')
    expect(screen.queryByText('협업 메모')).toBeNull()
    expect(screen.queryByRole('heading', { name: '협업' })).toBeNull()
    expect(screen.queryByLabelText('수정 이력')).toBeNull()
    expect(screen.queryByTestId('partner-order-collab-edit-list')).toBeNull()
    expect(commentSection.style.width).toBe('100%')
    expect(screen.getByTestId('partner-order-version-history-stub')).not.toBeNull()
    expect(commentSection.compareDocumentPosition(screen.getByTestId('partner-order-version-history-stub')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('코멘트 anchor 클릭과 버전 행 선택이 같은 하이라이트 상태를 공유한다', async () => {
    renderPanel('2099/06/27-COED-1')

    await screen.findByText('주문 요청사항 확인')
    fireEvent.click(screen.getByTestId('partner-order-collab-comment-item'))
    await waitFor(() => {
      expect(screen.getByTestId('partner-order-version-history-stub').getAttribute('data-active-field')).toBe('memo')
    })

    fireEvent.click(screen.getByText('주문 버전 선택'))
    expect(screen.getByTestId('partner-order-version-history-stub').getAttribute('data-active-revision')).toBe('4')
  })

  it('연결 필드를 선택해 코멘트를 등록하면 anchor 가 요청에 포함된다 (결정2 anchor 생성 UX)', async () => {
    vi.mocked(addPartnerOrderCollabComment).mockResolvedValue({
      id: 'comment-2',
      anchor: 'dueDate',
      authorName: '홍길동',
      body: '납기 확인 요청',
      parentId: null,
      status: 'OPEN',
      createdAt: '2026-07-06T09:20:00',
    })

    renderPanel('2099/06/27-COED-1')
    await screen.findByText('주문 요청사항 확인')

    fireEvent.change(screen.getByTestId('partner-order-collab-comment-anchor-select'), { target: { value: 'dueDate' } })
    fireEvent.change(screen.getByTestId('partner-order-collab-comment-input'), { target: { value: '납기 확인 요청' } })
    fireEvent.click(screen.getByRole('button', { name: '등록' }))

    await waitFor(() => {
      expect(addPartnerOrderCollabComment).toHaveBeenCalledWith('2099/06/27-COED-1', {
        body: '납기 확인 요청',
        anchor: 'dueDate',
      })
    })
  })
})
