// @vitest-environment jsdom
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SlipVersionHistoryPanel, type SlipVersionHistoryPanelProps } from './SlipVersionHistoryPanel'
import * as slipRevisionApi from '../../api/slipRevision'
import type { SlipRevision } from '../../api/slipRevision'

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
const HEADER_PREFIXED_REVISION: SlipRevision[] = [
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
]

/**
 * 다중필드 변경 리비전 fixture (PR #747 재수렴 MEDIUM fix 회귀 가드).
 *
 * <p>{@code header.memo} 와 {@code header.shippingAddress} 를 동시에 바꾼 리비전 1건 —
 * {@code activeFieldPaths} 배열에 두 원소가 모두 포함될 때 두 필드변경 항목이 모두
 * 하이라이트되는지(및 행 자체가 하이라이트되는지) 확인한다.
 */
const MULTI_FIELD_REVISION: SlipRevision[] = [
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
]

describe('SlipVersionHistoryPanel', () => {
  it('버전이력 버튼을 눌러야 모달이 열리고 변경항목은 접힌 채 전부 도달 가능하다', async () => {
    vi.mocked(slipRevisionApi.listRevisions).mockResolvedValue([
      {
        ...HEADER_PREFIXED_REVISION[0],
        revisionNo: 2,
        createdAt: '2026-06-30T09:15:00',
        fieldChanges: Array.from({ length: 78 }, (_, index) => ({
          fieldPath: `header.field${index}`,
          label: `변경 항목 ${index + 1}`,
          beforeValue: `이전 ${index + 1}`,
          afterValue: `이후 ${index + 1}`,
          actorName: '김영업',
          actorColor: '#DB2777',
          changedAt: '2026-06-30T09:15:00',
        })),
      },
      {
        ...HEADER_PREFIXED_REVISION[0],
        revisionNo: 1,
        createdAt: '2026-06-29T09:15:00',
        fieldChanges: [],
      },
    ])

    renderPanel()

    expect(screen.queryByTestId('slip-version-history-list')).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: '버전이력' }))

    const list = await screen.findByTestId('slip-version-history-list')
    expect(list).toBeTruthy()
    const changes = screen.getByTestId('slip-version-history-changes-2')
    expect(changes.tagName).toBe('DETAILS')
    expect((changes as HTMLDetailsElement).open).toBe(false)

    fireEvent.click(changes.querySelector('summary')!)
    expect((changes as HTMLDetailsElement).open).toBe(true)
    expect(screen.getByTestId('slip-version-history-change-header-field77')).toBeTruthy()
    expect(screen.getByTestId('slip-version-history-row-1')).toBeTruthy()
  })

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
      },
    ])

    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: '버전이력' }))

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

  it('BE identity guard가 보존한 UUID-shaped actorName을 버전 카드와 fieldChanges에 표시한다', async () => {
    const actorName = 'cafebabecafebabecafebabecafebabe'
    vi.mocked(slipRevisionApi.listRevisions).mockResolvedValue([{
      ...HEADER_PREFIXED_REVISION[0],
      actorName,
      fieldChanges: [{ ...HEADER_PREFIXED_REVISION[0].fieldChanges[0], actorName }],
    }])

    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: '버전이력' }))

    expect((await screen.findByTestId('slip-version-history-row-2')).textContent).not.toContain(actorName)
    expect((await screen.findByTestId('slip-version-history-change-header-memo')).textContent)
      .not.toContain(actorName)
  })

  // PR #747 재수렴 HIGH fix 회귀 가드 — SlipCollaborationPanel 의 코멘트 anchor(접두사 없음, 예:
  // "memo")와 BE fieldPath(접두사 있음, 예: "header.memo")가 이 컴포넌트를 거치지 않고 직접
  // 문자열 비교되면 11개 overlay 필드 전량이 매칭 실패한다. 아래 2건은 SlipCollaborationPanel을
  // 거치지 않고 이 컴포넌트에 실제 BE 응답 shape 을 그대로 주입해 정규화 로직 자체를 검증한다
  // (이전 SlipCollaborationPanel.coedit.test.tsx 는 이 컴포넌트를 통째로 stub 처리해 getByTestId
  // 존재만 확인했을 뿐 fieldPath 정합은 실제로 검증하지 못했다).
  it('접두사 없는 activeFieldPaths(코멘트 anchor 유래)가 header. 접두사 붙은 필드변경을 하이라이트한다 (정방향 회귀 가드)', async () => {
    vi.mocked(slipRevisionApi.listRevisions).mockResolvedValue(HEADER_PREFIXED_REVISION)

    // "memo" 는 SlipCollaborationPanel 의 normalizeCollabAnchor('memo') 결과와 동일한 형태 —
    // 코멘트 anchor 클릭이 실제로 만드는 activeFieldPaths 배열 값을 그대로 재현한다.
    renderPanel({ activeFieldPaths: ['memo'] })
    fireEvent.click(screen.getByRole('button', { name: '버전이력' }))

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
    fireEvent.click(screen.getByRole('button', { name: '버전이력' }))

    const memoChange = await screen.findByTestId('slip-version-history-change-header-memo')
    fireEvent.click(memoChange)

    // SlipCollaborationPanel 은 이 콜백의 fieldPaths 배열을 그대로 activeFieldPaths 로 저장했다가
    // 코멘트 anchor("memo", 접두사 없음)와 비교한다 — 여기서 "header.memo" 가 그대로 전달되면
    // 코멘트 쪽이 다시 매칭 실패한다(역방향 회귀).
    expect(onRevisionSelect).toHaveBeenCalledWith(2, ['memo'])
  })

  // PR #747 재수렴 MEDIUM fix 회귀 가드 — 리비전 1건이 헤더 필드 2개(memo, shippingAddress)를
  // 동시에 바꿀 때 activeFieldPaths 배열 전체와 대조해야 한다. fieldPaths?.[0] 처럼 첫 원소만
  // 채택하는 구현으로 되돌아가면 아래 두 테스트 중 최소 하나가 RED 가 된다.
  it('activeFieldPaths 배열 중 두 번째 필드만 일치해도 해당 필드변경과 행이 하이라이트된다 (다중필드 회귀 가드)', async () => {
    vi.mocked(slipRevisionApi.listRevisions).mockResolvedValue(MULTI_FIELD_REVISION)

    renderPanel({ activeFieldPaths: ['shippingAddress'] })
    fireEvent.click(screen.getByRole('button', { name: '버전이력' }))

    const memoChange = await screen.findByTestId('slip-version-history-change-header-memo')
    const shippingChange = await screen.findByTestId('slip-version-history-change-header-shippingAddress')
    // shippingAddress 만 활성화하면 같은 리비전의 memo 필드변경까지 과매칭되어선 안 된다(필드 단위 정밀도).
    expect(memoChange.getAttribute('data-active')).toBeNull()
    expect(shippingChange.getAttribute('data-active')).toBe('true')
    // 행 자체는 fieldPaths 중 하나라도 activeFieldPaths 와 겹치면 하이라이트된다.
    expect(screen.getByTestId('slip-version-history-row-5').getAttribute('data-active')).toBe('true')
  })

  it('activeFieldPaths 배열에 두 필드가 모두 담기면 두 필드변경이 모두 하이라이트된다 (다중필드 회귀 가드)', async () => {
    vi.mocked(slipRevisionApi.listRevisions).mockResolvedValue(MULTI_FIELD_REVISION)

    renderPanel({ activeFieldPaths: ['memo', 'shippingAddress'] })
    fireEvent.click(screen.getByRole('button', { name: '버전이력' }))

    const memoChange = await screen.findByTestId('slip-version-history-change-header-memo')
    const shippingChange = await screen.findByTestId('slip-version-history-change-header-shippingAddress')
    expect(memoChange.getAttribute('data-active')).toBe('true')
    expect(shippingChange.getAttribute('data-active')).toBe('true')
  })
})
