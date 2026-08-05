// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('./CollaborativeTextField', () => ({
  CollaborativeTextField: () => <div>협업 메모</div>,
}))
vi.mock('../audit/SlipVersionHistoryPanel', () => ({
  SlipVersionHistoryPanel: ({ activeFieldPaths, activeRevisionNo, onRevisionSelect }: {
    activeFieldPaths?: string[] | null
    activeRevisionNo?: number | null
    onRevisionSelect?: (revisionNo: number, fieldPaths?: string[]) => void
  }) => (
    <div
      data-testid="slip-version-history-stub"
      data-active-field={(activeFieldPaths ?? []).join(',')}
      data-active-revision={activeRevisionNo ?? ''}
    >
      <button type="button" onClick={() => onRevisionSelect?.(2, ['memo'])}>
        버전 선택
      </button>
    </div>
  ),
}))

const canAccessMock = vi.fn(() => true)
vi.mock('../../hooks/usePermissions', () => ({ usePermissions: () => ({ canAccess: canAccessMock }) }))
vi.mock('../../realtime/SlipCollabRealtimeClient', () => ({
  SlipCollabRealtimeClient: { subscribe: () => ({ abort: () => undefined }) },
}))
vi.mock('../../api/slipCollab', () => ({
  getSlipCollabComments: vi.fn(() => Promise.resolve([{
    id: 'comment-1',
    anchor: 'memo',
    authorName: '홍길동',
    body: '메모 확인',
    parentId: null,
    status: 'OPEN',
    createdAt: '2026-07-06T09:00:00',
  }])),
  getSlipCollabEdits: vi.fn(() => Promise.resolve([])),
  addSlipCollabComment: vi.fn(),
  deleteSlipCollabComment: vi.fn(),
  resolveSlipCollabComment: vi.fn(),
  commitSlipCollabEdit: vi.fn(),
}))

import { addSlipCollabComment, commitSlipCollabEdit } from '../../api/slipCollab'
import { SlipCollaborationPanel } from './SlipCollaborationPanel'

function renderPanel(slipId: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SlipCollaborationPanel slipId={slipId} currentValues={{ memo: null }} />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  canAccessMock.mockReturnValue(true)
  vi.mocked(addSlipCollabComment).mockReset()
  vi.mocked(commitSlipCollabEdit).mockReset()
})

describe('SlipCollaborationPanel 협업 패널 배치', () => {
  it('협업 헤더와 changeSet 수정 이력 목록을 제거하고 코멘트와 버전 이력만 렌더한다', () => {
    renderPanel('slip/id with spaces')

    const commentSection = screen.getByLabelText('코멘트')
    expect(screen.queryByText('협업 메모')).toBeNull()
    expect(screen.queryByRole('heading', { name: '협업' })).toBeNull()
    expect(screen.queryByLabelText('수정 이력')).toBeNull()
    expect(screen.queryByTestId('slip-collab-edit-list')).toBeNull()
    expect(commentSection.style.width).toBe('100%')
    expect(screen.getByTestId('slip-version-history-stub')).not.toBeNull()
    expect(commentSection.compareDocumentPosition(screen.getByTestId('slip-version-history-stub')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('코멘트 anchor 클릭과 버전 행 선택이 같은 하이라이트 상태를 공유한다', async () => {
    renderPanel('slip/id with spaces')

    await screen.findByText('메모 확인')
    fireEvent.click(screen.getByTestId('slip-collab-comment-item'))
    await waitFor(() => {
      expect(screen.getByTestId('slip-version-history-stub').getAttribute('data-active-field')).toBe('memo')
    })

    fireEvent.click(screen.getByText('버전 선택'))
    expect(screen.getByTestId('slip-version-history-stub').getAttribute('data-active-revision')).toBe('2')
  })

  it('연결 필드를 선택해 코멘트를 등록하면 anchor 가 요청에 포함된다 (결정2 anchor 생성 UX)', async () => {
    vi.mocked(addSlipCollabComment).mockResolvedValue({
      id: 'comment-2',
      anchor: 'shippingAddress',
      authorName: '홍길동',
      body: '배송지 확인 요청',
      parentId: null,
      status: 'OPEN',
      createdAt: '2026-07-06T09:20:00',
    })

    renderPanel('slip/id with spaces')
    await screen.findByText('메모 확인')

    fireEvent.change(screen.getByTestId('slip-collab-comment-anchor-select'), { target: { value: 'shippingAddress' } })
    fireEvent.change(screen.getByTestId('slip-collab-comment-input'), { target: { value: '배송지 확인 요청' } })
    fireEvent.click(screen.getByRole('button', { name: '등록' }))

    await waitFor(() => {
      expect(addSlipCollabComment).toHaveBeenCalledWith('slip/id with spaces', {
        body: '배송지 확인 요청',
        anchor: 'shippingAddress',
      })
    })
  })

  it('협업 수정 라벨을 사용하고 원격 갱신 뒤에도 편집 시작 baseline 으로 저장한다', async () => {
    vi.mocked(commitSlipCollabEdit).mockResolvedValue({} as never)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const onEditModeChange = vi.fn()
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <SlipCollaborationPanel
          slipId="slip/concurrency"
          currentValues={{ memo: '초기 메모', shippingAddress: null }}
          editMode
          onEditModeChange={onEditModeChange}
        />
      </QueryClientProvider>,
    )

    expect(await screen.findByLabelText('협업 수정')).not.toBeNull()
    expect(screen.queryByLabelText('수정', { exact: true })).toBeNull()
    const memoInput = await screen.findByLabelText('메모 수정값')
    expect((memoInput as HTMLInputElement).value).toBe('초기 메모')
    fireEvent.change(memoInput, { target: { value: '로컬 초안' } })

    rerender(
      <QueryClientProvider client={client}>
        <SlipCollaborationPanel
          slipId="slip/concurrency"
          currentValues={{ memo: '원격 최신값', shippingAddress: null }}
          editMode
          onEditModeChange={onEditModeChange}
        />
      </QueryClientProvider>,
    )

    expect((screen.getByLabelText('메모 수정값') as HTMLInputElement).value).toBe('로컬 초안')
    fireEvent.click(screen.getByRole('button', { name: '수정완료' }))

    await waitFor(() => {
      expect(commitSlipCollabEdit).toHaveBeenCalledWith('slip/concurrency', {
        changeSet: JSON.stringify({ memo: { before: '초기 메모', after: '로컬 초안' } }),
        reason: undefined,
      })
    })
  })
})
