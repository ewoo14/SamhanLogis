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
  CollaborativeTextField: (props: {
    documentId: string
    basePath: string
    fieldName: string
    label: string
    rows?: number
    readOnly?: boolean
  }) => (
    <div
      data-testid="memo-coedit-stub"
      data-document-id={props.documentId}
      data-base-path={props.basePath}
      data-field-name={props.fieldName}
      data-rows={String(props.rows)}
      data-read-only={String(props.readOnly)}
    >
      {props.label}
    </div>
  ),
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

describe('GroupwareApprovalCollaborationPanel coedit memo wiring', () => {
  it('wires the memo field to documentId/basePath(encodeURIComponent)/fieldName=memo', () => {
    renderPanel('approval/id with spaces')
    const stub = screen.getByTestId('memo-coedit-stub')
    expect(stub.getAttribute('data-document-id')).toBe('approval/id with spaces')
    expect(stub.getAttribute('data-base-path')).toBe('/admin/groupware/approvals/approval%2Fid%20with%20spaces')
    expect(stub.getAttribute('data-field-name')).toBe('memo')
    expect(stub.getAttribute('data-rows')).toBe('4')
    expect(stub.getAttribute('data-read-only')).toBe('false')
  })

  it('wires the memo field as readOnly without edit permission', () => {
    canAccessMock.mockReturnValue(false)
    renderPanel('approval-readonly')
    expect(screen.getByTestId('memo-coedit-stub').getAttribute('data-read-only')).toBe('true')
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
    expect(provider.setLocalLastEdit).toHaveBeenLastCalledWith('header.field_category')
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
})
