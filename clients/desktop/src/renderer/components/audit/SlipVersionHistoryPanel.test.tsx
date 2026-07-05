// @vitest-environment jsdom
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SlipVersionHistoryPanel, type SlipVersionHistoryPanelProps } from './SlipVersionHistoryPanel'
import * as slipRevisionApi from '../../api/slipRevision'

vi.mock('../../api/slipRevision', () => ({
  listRevisions: vi.fn(),
  restoreRevision: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderPanel(extraProps: Partial<SlipVersionHistoryPanelProps> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <SlipVersionHistoryPanel slipId="slip-test-id" {...extraProps} />
    </QueryClientProvider>,
  )
}

/**
 * PR #747 재수렴 HIGH fix 회귀 가드용 고정 fixture.
 *
 * <p>BE {@code SlipRevisionService} 가 실제로 내려주는 형태({@code "header.memo"} 접두사 포함)를
 * 그대로 재현한다(mock.ts 시드와 동일 shape) — {@link SlipCollaborationPanel} 의 코멘트 anchor
 * 값은 접두사 없는 {@code "memo"} 로 저장/전송되므로, 두 표현이 실제로 다르다는 점 자체가
 * 회귀의 핵심이다.
 */
const HEADER_PREFIXED_REVISION = [
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
      {
        fieldPath: 'lines[0].quantity',
        label: '품목 1행 수량',
        beforeValue: '1',
        afterValue: '3',
        actorName: '김영업',
        actorColor: '#DB2777',
        changedAt: '2026-06-30T09:15:00',
      },
    ],
  },
] as any

describe('SlipVersionHistoryPanel', () => {
  it('버전별 필드/품목 셀 변경 목록과 단일 actor 색상을 표시한다', async () => {
    vi.mocked(slipRevisionApi.listRevisions).mockResolvedValue([
      {
        revisionNo: 2,
        revisionType: 'EDIT',
        sourceRevisionNo: null,
        slipNo: '2026/06/30-1',
        slipDate: '2026-06-30',
        actorName: '김영업',
        actorColor: '#DB2777',
        createdAt: '2026-06-30T09:15:00',
        changeSummary: {
          headerChanged: 1,
          lineAdded: 0,
          lineRemoved: 0,
          lineModified: 1,
        },
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
          {
            fieldPath: 'lines[0].quantity',
            label: '품목 1행 수량',
            beforeValue: '1',
            afterValue: '3',
            actorName: '김영업',
            actorColor: '#DB2777',
            changedAt: '2026-06-30T09:15:00',
          },
        ],
      } as any,
    ])

    renderPanel()

    const memoChange = await screen.findByTestId('slip-version-history-change-header-memo')
    const quantityChange = await screen.findByTestId('slip-version-history-change-lines-0-quantity')

    expect(memoChange.textContent).toContain('김영업')
    expect(memoChange.textContent).toContain('메모')
    expect(memoChange.textContent).toContain('원본 메모')
    expect(memoChange.textContent).toContain('수정 메모')
    expect(quantityChange.textContent).toContain('품목 1행 수량')
    expect(quantityChange.textContent).toContain('1')
    expect(quantityChange.textContent).toContain('3')
    expect(screen.queryByText('slip-test-id')).toBeNull()
    const color = screen.getAllByTestId('slip-version-history-change-color')[0] as HTMLElement
    expect(['#DB2777', 'rgb(219, 39, 119)']).toContain(color.style.background)
  })

  // PR #747 재수렴 HIGH fix 회귀 가드 — SlipCollaborationPanel 의 코멘트 anchor(접두사 없음, 예:
  // "memo")와 BE fieldPath(접두사 있음, 예: "header.memo")가 이 컴포넌트를 거치지 않고 직접
  // 문자열 비교되면 11개 overlay 필드 전량이 매칭 실패한다. 아래 2건은 SlipCollaborationPanel을
  // 거치지 않고 이 컴포넌트에 실제 BE 응답 shape 을 그대로 주입해 정규화 로직 자체를 검증한다
  // (이전 SlipCollaborationPanel.coedit.test.tsx 는 이 컴포넌트를 통째로 stub 처리해 getByTestId
  // 존재만 확인했을 뿐 fieldPath 정합은 실제로 검증하지 못했다).
  it('접두사 없는 activeFieldPath(코멘트 anchor 유래)가 header. 접두사 붙은 필드변경을 하이라이트한다 (정방향 회귀 가드)', async () => {
    vi.mocked(slipRevisionApi.listRevisions).mockResolvedValue(HEADER_PREFIXED_REVISION)

    // "memo" 는 SlipCollaborationPanel 의 normalizeCollabAnchor('memo') 결과와 동일한 형태 —
    // 코멘트 anchor 클릭이 실제로 만드는 activeFieldPath 값을 그대로 재현한다.
    renderPanel({ activeFieldPath: 'memo' })

    const memoChange = await screen.findByTestId('slip-version-history-change-header-memo')
    expect(memoChange.getAttribute('data-active')).toBe('true')
    // 같은 revision 행 자체도 하이라이트된다 (fieldPaths.includes 매칭).
    expect(screen.getByTestId('slip-version-history-row-2').getAttribute('data-active')).toBe('true')
    // 매칭되지 않는 다른 필드변경(라인 수량)은 하이라이트되지 않는다 — 접두사 strip 이 과매칭을
    // 유발하지 않음을 함께 확인한다.
    const quantityChange = await screen.findByTestId('slip-version-history-change-lines-0-quantity')
    expect(quantityChange.getAttribute('data-active')).toBeNull()
  })

  it('필드변경 클릭 시 header. 접두사를 제거한 fieldPath 를 콜백으로 전달한다 (역방향 회귀 가드)', async () => {
    vi.mocked(slipRevisionApi.listRevisions).mockResolvedValue(HEADER_PREFIXED_REVISION)
    const onRevisionSelect = vi.fn()

    renderPanel({ onRevisionSelect })

    const memoChange = await screen.findByTestId('slip-version-history-change-header-memo')
    fireEvent.click(memoChange)

    // SlipCollaborationPanel 은 이 콜백의 fieldPaths[0] 을 그대로 activeFieldPath 로 저장했다가
    // 코멘트 anchor("memo", 접두사 없음)와 비교한다 — 여기서 "header.memo" 가 그대로 전달되면
    // 코멘트 쪽이 다시 매칭 실패한다(역방향 회귀).
    expect(onRevisionSelect).toHaveBeenCalledWith(2, ['memo'])
  })
})
