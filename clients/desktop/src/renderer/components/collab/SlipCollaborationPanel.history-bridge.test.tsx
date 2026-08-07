// @vitest-environment jsdom
/**
 * SlipCollaborationPanel ↔ SlipVersionHistoryPanel 실컴포넌트 연동 회귀 가드
 * (PR #747 재수렴 HIGH fix).
 *
 * <p>{@link SlipCollaborationPanel.coedit.test.tsx} 는 {@code SlipVersionHistoryPanel} 을
 * 통째로 stub 처리해 코멘트→activeFieldPaths 배선만 검증한다 — fieldPath 정규화(접두사 정합) 는
 * stub 뒤에 가려져 실제로 검증되지 못했다("getByTestId 만 봐서 누락"). 본 파일은
 * {@code SlipVersionHistoryPanel} 을 stub 하지 않고 두 실컴포넌트를 그대로 조립해, BE 가 실제로
 * 내려주는 {@code "header.memo"} 형태와 코멘트 anchor 의 {@code "memo"}(접두사 없음) 형태가
 * 화면에서 실제로 서로를 하이라이트하는지 data-active 속성으로 확인한다.
 */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const canAccessMock = vi.fn(() => true)
vi.mock('../../hooks/usePermissions', () => ({ usePermissions: () => ({ canAccess: canAccessMock }) }))
vi.mock('../../realtime/SlipCollabRealtimeClient', () => ({
  SlipCollabRealtimeClient: { subscribe: () => ({ abort: () => undefined }) },
}))

vi.mock('../../api/slipCollab', () => ({
  getSlipCollabComments: vi.fn(() => Promise.resolve([
    {
      id: 'comment-memo',
      anchor: 'memo',
      authorName: '홍길동',
      body: '메모 확인 부탁드립니다',
      parentId: null,
      status: 'OPEN',
      createdAt: '2026-07-06T09:00:00',
    },
    {
      id: 'comment-no-anchor',
      anchor: null,
      authorName: '김영업',
      body: '전체 코멘트입니다',
      parentId: null,
      status: 'OPEN',
      createdAt: '2026-07-06T09:05:00',
    },
  ])),
  addSlipCollabComment: vi.fn(),
  deleteSlipCollabComment: vi.fn(),
  resolveSlipCollabComment: vi.fn(),
  commitSlipCollabEdit: vi.fn(),
}))

vi.mock('../../api/slipRevision', () => ({
  listRevisions: vi.fn(() => Promise.resolve([
    {
      revisionNo: 2,
      revisionType: 'EDIT',
      sourceRevisionNo: null,
      slipNo: '2026/06/30-1',
      slipDate: '2026-06-30',
      actorName: '김영업',
      actorColor: '#DB2777',
      createdAt: '2026-06-30T09:15:00',
      changeSummary: { headerChanged: 1, lineAdded: 0, lineRemoved: 0, lineModified: 1 },
      fieldChanges: [
        {
          fieldPath: 'header.memo',
          label: '메모',
          beforeValue: '원본 메모',
          afterValue: '수정 메모',
          actorName: '김영업',
          actorColor: '#DB2777',
          changedAt: '2026-06-30T09:15:00',
        },
      ],
    },
    {
      revisionNo: 1,
      revisionType: 'CREATE',
      sourceRevisionNo: null,
      slipNo: '2026/06/30-1',
      slipDate: '2026-06-30',
      actorName: '김영업',
      actorColor: '#DB2777',
      createdAt: '2026-06-30T09:10:00',
      changeSummary: { headerChanged: 0, lineAdded: 0, lineRemoved: 0, lineModified: 0 },
      fieldChanges: [],
    },
  ])),
  restoreRevision: vi.fn(),
}))

import { OVERLAY_FIELD_OPTIONS, SlipCollaborationPanel } from './SlipCollaborationPanel'
import { getSlipCollabComments } from '../../api/slipCollab'
import { listRevisions } from '../../api/slipRevision'

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SlipCollaborationPanel slipId="slip-test-id" currentValues={{ memo: null }} />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  canAccessMock.mockReturnValue(true)
})

describe('SlipCollaborationPanel + SlipVersionHistoryPanel 실컴포넌트 연동 (접두사 정합 회귀 가드)', () => {
  it('memo anchor 코멘트 클릭 → header.memo 버전이력 항목이 하이라이트된다 (정방향)', async () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: '버전이력' }))

    await screen.findByText('메모 확인 부탁드립니다')
    const memoChange = await screen.findByTestId('slip-version-history-change-header-memo')
    const revisionRow = await screen.findByTestId('slip-version-history-row-2')

    // 클릭 전 — 코멘트 anchor 를 아직 활성화하지 않았으므로 미하이라이트.
    expect(memoChange.getAttribute('data-active')).toBeNull()
    expect(revisionRow.getAttribute('data-active')).toBeNull()

    const commentItems = screen.getAllByTestId('slip-collab-comment-item')
    const memoComment = commentItems.find((el) => el.textContent?.includes('메모 확인 부탁드립니다'))
    expect(memoComment).toBeDefined()
    fireEvent.click(memoComment!)

    await waitFor(() => {
      expect(screen.getByTestId('slip-version-history-change-header-memo').getAttribute('data-active')).toBe('true')
    })
    expect(screen.getByTestId('slip-version-history-row-2').getAttribute('data-active')).toBe('true')
  })

  it('header.memo 버전이력 항목 클릭 → memo anchor 코멘트가 하이라이트된다 (역방향)', async () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: '버전이력' }))

    await screen.findByText('메모 확인 부탁드립니다')
    const memoChange = await screen.findByTestId('slip-version-history-change-header-memo')
    fireEvent.click(memoChange)

    const commentItems = await screen.findAllByTestId('slip-collab-comment-item')
    const memoComment = commentItems.find((el) => el.textContent?.includes('메모 확인 부탁드립니다'))
    const otherComment = commentItems.find((el) => el.textContent?.includes('전체 코멘트입니다'))
    expect(memoComment).toBeDefined()
    expect(otherComment).toBeDefined()

    expect(memoComment!.getAttribute('data-active')).toBe('true')
    expect(memoComment!.getAttribute('aria-current')).toBe('true')
    // anchor 없는 코멘트는 애초 매칭 대상이 아니므로 하이라이트되지 않는다.
    expect(otherComment!.getAttribute('data-active')).toBeNull()
  })

  // PR #747 재수렴 MEDIUM fix 회귀 가드 — 리비전 1건이 헤더 필드 2개(memo, shippingAddress)를
  // 동시에 바꿀 때, 버전이력 행 클릭이 두 필드에 각각 anchor 된 코멘트를 모두 하이라이트해야 한다.
  // SlipCollaborationPanel 이 fieldPaths?.[0] 처럼 첫 필드만 채택하는 구현으로 되돌아가면
  // shippingAddress 코멘트 쪽이 매칭되지 않아 RED 가 된다.
  it('다중필드 변경 리비전 행 선택 → 두 필드에 각각 anchor 된 코멘트가 모두 하이라이트된다 (역방향, 다중필드 회귀 가드)', async () => {
    vi.mocked(getSlipCollabComments).mockResolvedValueOnce([
      {
        id: 'comment-memo-multi',
        anchor: 'memo',
        authorName: '홍길동',
        body: '메모 다중필드 확인',
        parentId: null,
        status: 'OPEN',
        createdAt: '2026-07-06T09:00:00',
      },
      {
        id: 'comment-shipping-multi',
        anchor: 'shippingAddress',
        authorName: '김영업',
        body: '배송지 다중필드 확인',
        parentId: null,
        status: 'OPEN',
        createdAt: '2026-07-06T09:05:00',
      },
    ])
    vi.mocked(listRevisions).mockResolvedValueOnce([
      {
        revisionNo: 5,
        revisionType: 'EDIT',
        sourceRevisionNo: null,
        slipNo: '2026/07/06-5',
        slipDate: '2026-07-06',
        actorName: '김영업',
        actorColor: '#DB2777',
        createdAt: '2026-07-06T09:30:00',
        changeSummary: { headerChanged: 2, lineAdded: 0, lineRemoved: 0, lineModified: 0 },
        fieldChanges: [
          {
            fieldPath: 'header.memo',
            label: '메모',
            beforeValue: '원본 메모',
            afterValue: '수정 메모',
            actorName: '김영업',
            actorColor: '#DB2777',
            changedAt: '2026-07-06T09:30:00',
          },
          {
            fieldPath: 'header.shippingAddress',
            label: '배송지',
            beforeValue: '서울시 강남구',
            afterValue: '서울시 서초구',
            actorName: '김영업',
            actorColor: '#DB2777',
            changedAt: '2026-07-06T09:30:00',
          },
        ],
      },
    ])

    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: '버전이력' }))

    await screen.findByText('메모 다중필드 확인')
    const commentItems = screen.getAllByTestId('slip-collab-comment-item')
    const memoComment = commentItems.find((el) => el.textContent?.includes('메모 다중필드 확인'))
    const shippingComment = commentItems.find((el) => el.textContent?.includes('배송지 다중필드 확인'))
    expect(memoComment).toBeDefined()
    expect(shippingComment).toBeDefined()
    expect(memoComment!.getAttribute('data-active')).toBeNull()
    expect(shippingComment!.getAttribute('data-active')).toBeNull()

    fireEvent.click(await screen.findByTestId('slip-version-history-row-5'))

    await waitFor(() => {
      expect(memoComment!.getAttribute('data-active')).toBe('true')
    })
    // 2번째 필드(shippingAddress)에 anchor 된 코멘트도 함께 하이라이트되어야 한다 — 여기가 본
    // fix 의 핵심 검증 지점이다.
    expect(shippingComment!.getAttribute('data-active')).toBe('true')
  })

  it('anchor comment shows a field-label badge and general comment does not', async () => {
    vi.mocked(getSlipCollabComments).mockResolvedValueOnce([
      {
        id: 'comment-memo-badge',
        anchor: 'memo',
        authorName: 'tester',
        body: 'Slip memo anchor',
        parentId: null,
        status: 'OPEN',
        createdAt: '2026-07-06T09:00:00',
      },
      {
        id: 'comment-general-badge',
        anchor: null,
        authorName: 'tester',
        body: 'Slip general comment',
        parentId: null,
        status: 'OPEN',
        createdAt: '2026-07-06T09:05:00',
      },
    ])

    renderPanel()

    await screen.findByText('Slip memo anchor')
    const commentItems = screen.getAllByTestId('slip-collab-comment-item')
    const memoComment = commentItems.find((el) => el.textContent?.includes('Slip memo anchor'))
    const generalComment = commentItems.find((el) => el.textContent?.includes('Slip general comment'))
    expect(memoComment).toBeDefined()
    expect(generalComment).toBeDefined()

    const memoLabel = OVERLAY_FIELD_OPTIONS.find((option) => option.value === 'memo')?.label
    expect(within(memoComment!).getByTestId('slip-collab-comment-anchor-badge').textContent).toBe(memoLabel)
    expect(within(generalComment!).queryByTestId('slip-collab-comment-anchor-badge')).toBeNull()
  })
})
