// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ApprovalTemplateField } from '../../api/groupwareApprovalTemplate'

const coeditMocks = vi.hoisted(() => ({
  createDocCoeditProvider: vi.fn(),
}))

const apiMocks = vi.hoisted(() => ({
  getGroupwareApprovalCollabComments: vi.fn(() => Promise.resolve([])),
  getGroupwareApprovalCollabEdits: vi.fn(() => Promise.resolve([])),
  addGroupwareApprovalCollabComment: vi.fn(),
  deleteGroupwareApprovalCollabComment: vi.fn(),
  resolveGroupwareApprovalCollabComment: vi.fn(),
  commitGroupwareApprovalCollabEdit: vi.fn(),
}))

vi.mock('./CollaborativeTextField', () => ({
  CollaborativeTextField: () => <div>협업 메모</div>,
}))
vi.mock('../../hooks/usePresence', () => ({ usePresence: () => [] }))
const canAccessMock = vi.fn(() => true)
vi.mock('../../hooks/usePermissions', () => ({ usePermissions: () => ({ canAccess: canAccessMock }) }))
vi.mock('../../realtime/GroupwareApprovalCollabRealtimeClient', () => ({
  GroupwareApprovalCollabRealtimeClient: { subscribe: () => ({ abort: () => undefined }) },
}))
vi.mock('../../api/groupwareApprovalCollab', () => ({
  getGroupwareApprovalCollabComments: apiMocks.getGroupwareApprovalCollabComments,
  getGroupwareApprovalCollabEdits: apiMocks.getGroupwareApprovalCollabEdits,
  addGroupwareApprovalCollabComment: apiMocks.addGroupwareApprovalCollabComment,
  deleteGroupwareApprovalCollabComment: apiMocks.deleteGroupwareApprovalCollabComment,
  resolveGroupwareApprovalCollabComment: apiMocks.resolveGroupwareApprovalCollabComment,
  commitGroupwareApprovalCollabEdit: apiMocks.commitGroupwareApprovalCollabEdit,
}))
vi.mock('../../realtime/createCoeditProvider', () => ({
  EDIT_HIGHLIGHT_MS: 2_500,
  createDocCoeditProvider: coeditMocks.createDocCoeditProvider,
}))

import { GroupwareApprovalCollaborationPanel } from './GroupwareApprovalCollaborationPanel'

const templateFields: ApprovalTemplateField[] = [
  {
    fieldKey: 'department',
    label: '부서',
    fieldType: 'TEXT',
    required: true,
    displayOrder: 1,
    options: [],
    placeholder: null,
  },
  {
    fieldKey: 'amount',
    label: '금액',
    fieldType: 'NUMBER',
    required: false,
    displayOrder: 2,
    options: [],
    placeholder: null,
  },
  {
    fieldKey: 'category',
    label: '분류',
    fieldType: 'SELECT',
    required: false,
    displayOrder: 3,
    options: ['출장', '식대'],
    placeholder: null,
  },
  {
    fieldKey: 'detail',
    label: '상세',
    fieldType: 'TEXTAREA',
    required: false,
    displayOrder: 4,
    options: [],
    placeholder: '상세 입력',
  },
]

function makeProvider() {
  const header = new Map<string, string>()
  const subscribers = new Set<() => void>()
  const provider = {
    setHeaderValue: vi.fn((fieldName: string, value: string) => {
      header.set(fieldName, value)
    }),
    getHeaderValue: vi.fn((fieldName: string) => header.get(fieldName) ?? ''),
    setItemValue: vi.fn(),
    getItemValue: vi.fn(() => ''),
    setItemValueById: vi.fn(),
    getItemValueById: vi.fn(() => ''),
    isEmpty: vi.fn(() => true),
    subscribeDoc: vi.fn((listener: () => void) => {
      subscribers.add(listener)
      return () => subscribers.delete(listener)
    }),
    subscribeAwareness: vi.fn(() => () => undefined),
    getRemoteCursors: vi.fn(() => []),
    getRemoteEdits: vi.fn(() => []),
    setLocalCursor: vi.fn(),
    setLocalLastEdit: vi.fn(),
    destroy: vi.fn(),
    __emit: () => {
      for (const subscriber of subscribers) subscriber()
    },
  }
  return provider
}

function renderPanel(
  approvalId: string,
  overrides: Partial<React.ComponentProps<typeof GroupwareApprovalCollaborationPanel>> = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <GroupwareApprovalCollaborationPanel
        approvalId={approvalId}
        approvalNo="GW-1"
        status="PENDING"
        currentValues={{
          title: '결재 제목',
          content: '초기 본문',
          fieldValues: {
            department: '영업',
            amount: '1000',
            category: '출장',
            detail: '초기 상세',
          },
        }}
        templateFields={templateFields}
        {...overrides}
      />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  apiMocks.getGroupwareApprovalCollabComments.mockResolvedValue([])
  apiMocks.getGroupwareApprovalCollabEdits.mockResolvedValue([])
  canAccessMock.mockReturnValue(true)
})

describe('GroupwareApprovalCollaborationPanel 협업 패널 배치', () => {
  it('협업 헤더와 changeSet 수정 이력 목록을 제거하고 코멘트와 후속 버전이력 안내만 렌더한다', () => {
    renderPanel('approval/id with spaces')

    const commentSection = screen.getByLabelText('코멘트')
    expect(screen.queryByText('협업 메모')).toBeNull()
    expect(screen.queryByRole('heading', { name: '협업' })).toBeNull()
    expect(screen.queryByLabelText('수정 이력')).toBeNull()
    expect(screen.queryByTestId('groupware-approval-collab-edit-list')).toBeNull()
    expect(commentSection.style.width).toBe('100%')
    expect(screen.getByTestId('groupware-approval-version-history-gap').textContent).toContain('그룹웨어 결재 버전이력')
  })
})

describe('GroupwareApprovalCollaborationPanel full-form coedit wiring', () => {
  it('creates the header-only doc provider in editMode and seeds dot-free header keys', async () => {
    const provider = makeProvider()
    coeditMocks.createDocCoeditProvider.mockResolvedValue(provider)

    renderPanel('approval/id with spaces')
    fireEvent.click(screen.getByTestId('groupware-approval-collab-edit-start'))

    await waitFor(() => expect(coeditMocks.createDocCoeditProvider).toHaveBeenCalledTimes(1))
    expect(coeditMocks.createDocCoeditProvider).toHaveBeenCalledWith({
      documentId: 'approval/id with spaces',
      basePath: '/admin/groupware/approvals/approval%2Fid%20with%20spaces',
      headerTextFields: new Set(['content', 'field_detail']),
    })
    expect(provider.setHeaderValue).toHaveBeenCalledWith('title', '결재 제목')
    expect(provider.setHeaderValue).toHaveBeenCalledWith('content', '초기 본문')
    expect(provider.setHeaderValue).toHaveBeenCalledWith('field_department', '영업')
    expect(provider.setHeaderValue).toHaveBeenCalledWith('field_amount', '1000')
    expect(provider.setHeaderValue).toHaveBeenCalledWith('field_category', '출장')
    expect(provider.setHeaderValue).toHaveBeenCalledWith('field_detail', '초기 상세')
    expect(provider.setItemValue).not.toHaveBeenCalled()
  })

  it('reflects remote header updates into title/content/dynamic drafts', async () => {
    const provider = makeProvider()
    coeditMocks.createDocCoeditProvider.mockResolvedValue(provider)

    renderPanel('approval-remote')
    fireEvent.click(screen.getByTestId('groupware-approval-collab-edit-start'))
    await waitFor(() => expect(provider.subscribeDoc).toHaveBeenCalled())

    provider.setHeaderValue('title', '원격 제목')
    provider.setHeaderValue('content', '원격 본문\n둘째 줄')
    provider.setHeaderValue('field_department', '원격 부서')
    provider.setHeaderValue('field_amount', '3000')
    provider.setHeaderValue('field_category', '식대')
    provider.setHeaderValue('field_detail', '원격 상세')
    act(() => provider.__emit())

    await waitFor(() => {
      expect((screen.getByTestId('groupware-approval-collab-edit-title') as HTMLInputElement).value).toBe('원격 제목')
    })
    expect((screen.getByTestId('groupware-approval-collab-edit-content') as HTMLTextAreaElement).value).toBe('원격 본문\n둘째 줄')
    expect((screen.getByTestId('dynamic-approval-field-department') as HTMLInputElement).value).toBe('원격 부서')
    expect((screen.getByTestId('dynamic-approval-field-amount') as HTMLInputElement).value).toBe('3000')
    expect((screen.getByTestId('dynamic-approval-field-category') as HTMLSelectElement).value).toBe('식대')
    expect((screen.getByTestId('dynamic-approval-field-detail') as HTMLTextAreaElement).value).toBe('원격 상세')
  })

  it('writes SELECT dynamic fields as dot-free header LWW values', async () => {
    const provider = makeProvider()
    coeditMocks.createDocCoeditProvider.mockResolvedValue(provider)

    renderPanel('approval-select')
    fireEvent.click(screen.getByTestId('groupware-approval-collab-edit-start'))
    await waitFor(() => expect(provider.subscribeDoc).toHaveBeenCalled())

    fireEvent.change(screen.getByTestId('dynamic-approval-field-category'), { target: { value: '식대' } })

    expect(provider.setHeaderValue).toHaveBeenLastCalledWith('field_category', '식대')
    // D2: SELECT 은 edit-pulse 미표시(LWW-no-cursor)라 lastEdit awareness 미방출 → 값 sync 만.
    expect(provider.setLocalLastEdit).not.toHaveBeenCalled()
  })

  it('keeps commit changeSet keys decoupled as field.<key> dot paths', async () => {
    const provider = makeProvider()
    coeditMocks.createDocCoeditProvider.mockResolvedValue(provider)
    apiMocks.commitGroupwareApprovalCollabEdit.mockResolvedValue({
      approval: {
        approvalId: 'approval-commit',
        title: '결재 제목',
      },
    })

    renderPanel('approval-commit')
    fireEvent.click(screen.getByTestId('groupware-approval-collab-edit-start'))
    await waitFor(() => expect(provider.subscribeDoc).toHaveBeenCalled())

    fireEvent.change(screen.getByTestId('dynamic-approval-field-category'), { target: { value: '식대' } })
    fireEvent.click(screen.getByTestId('groupware-approval-collab-edit-submit'))

    await waitFor(() => expect(apiMocks.commitGroupwareApprovalCollabEdit).toHaveBeenCalledTimes(1))
    const payload = apiMocks.commitGroupwareApprovalCollabEdit.mock.calls[0][1]
    expect(JSON.parse(payload.changeSet)).toEqual({
      'field.category': { after: '식대' },
    })
    expect(payload.changeSet).not.toContain('field_category')
  })

  it('does not truncate a dynamic fieldKey containing a dot (B1 regression)', async () => {
    const dottedField: ApprovalTemplateField = {
      fieldKey: 'cost.center',
      label: '코스트센터',
      fieldType: 'TEXT',
      required: false,
      displayOrder: 5,
      options: [],
      placeholder: null,
    }
    const provider = makeProvider()
    coeditMocks.createDocCoeditProvider.mockResolvedValue(provider)
    apiMocks.commitGroupwareApprovalCollabEdit.mockResolvedValue({
      approval: { approvalId: 'approval-dotted', title: '결재 제목' },
    })

    renderPanel('approval-dotted', {
      templateFields: [dottedField],
      currentValues: { title: '결재 제목', content: '초기 본문', fieldValues: { 'cost.center': '초기값' } },
    })
    fireEvent.click(screen.getByTestId('groupware-approval-collab-edit-start'))
    await waitFor(() => expect(provider.subscribeDoc).toHaveBeenCalled())

    // seed·write 는 절단 없이 전체 dotted 키를 provider 헤더 키로 사용(field_cost.center) — split[1] 절단이면 field_cost 로 오기록.
    expect(provider.setHeaderValue).toHaveBeenCalledWith('field_cost.center', '초기값')
    fireEvent.change(screen.getByTestId('dynamic-approval-field-cost.center'), { target: { value: '변경값' } })
    expect(provider.setHeaderValue).toHaveBeenLastCalledWith('field_cost.center', '변경값')

    // commit changeSet 은 원본 dotted 키로 field.cost.center (provider 키와 decoupled).
    fireEvent.click(screen.getByTestId('groupware-approval-collab-edit-submit'))
    await waitFor(() => expect(apiMocks.commitGroupwareApprovalCollabEdit).toHaveBeenCalledTimes(1))
    const payload = apiMocks.commitGroupwareApprovalCollabEdit.mock.calls[0][1]
    expect(JSON.parse(payload.changeSet)).toEqual({ 'field.cost.center': { after: '변경값' } })
  })
})
