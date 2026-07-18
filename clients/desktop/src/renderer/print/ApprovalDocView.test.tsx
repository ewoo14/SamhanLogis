// @vitest-environment jsdom
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApprovalLineAdminResponse } from '../api/groupwareApproval'
import type { ApprovalAttachment } from '../api/groupwareApprovalAttachment'
import type { ApprovalTemplate } from '../api/groupwareApprovalTemplate'
import { DocumentRenderer } from './DocumentRenderer'
import { ApprovalDocView } from './ApprovalDocView'

const mocks = vi.hoisted(() => ({
  getGroupwareApproval: vi.fn(),
  listApprovalAttachments: vi.fn(),
  findActiveApprovalTemplate: vi.fn(),
  findActiveDocumentTemplate: vi.fn(),
}))
const { getGroupwareApproval, listApprovalAttachments, findActiveApprovalTemplate, findActiveDocumentTemplate } = mocks

vi.mock('../api/groupwareApproval', () => ({ getGroupwareApproval: mocks.getGroupwareApproval }))
vi.mock('../api/groupwareApprovalAttachment', () => ({ listApprovalAttachments: mocks.listApprovalAttachments }))
vi.mock('../api/groupwareApprovalTemplate', () => ({ findActiveApprovalTemplate: mocks.findActiveApprovalTemplate }))
vi.mock('../api/documentTemplate', () => ({ findActiveDocumentTemplate: mocks.findActiveDocumentTemplate }))
vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }))
vi.mock('./DocumentRenderer', () => ({
  DocumentRenderer: vi.fn(({ backTo }: { backTo?: string }) => (
    <div data-testid="document-renderer" data-back-to={backTo} />
  )),
}))

function approval(input: Partial<ApprovalLineAdminResponse> = {}): ApprovalLineAdminResponse {
  return {
    approvalId: input.approvalId ?? 'approval-id',
    approvalNo: input.approvalNo ?? 'GW-2026-001',
    requesterId: input.requesterId ?? 'requester-id',
    requesterName: input.requesterName ?? '작성자',
    title: input.title ?? '결재 문서',
    content: input.content ?? '본문',
    templateId: input.templateId ?? 'template-id',
    templateName: null,
    documentType: input.documentType ?? null,
    fieldValues: input.fieldValues ?? { memo: '값' },
    status: input.status ?? 'APPROVED',
    steps: input.steps ?? [],
  }
}

function template(): ApprovalTemplate {
  return {
    id: 'template-id',
    code: 'EXPENSE',
    name: '지출결의',
    description: null,
    active: true,
    displayOrder: 1,
    fields: [{
      fieldKey: 'memo',
      label: '메모',
      fieldType: 'TEXT',
      required: false,
      displayOrder: 1,
      options: [],
      placeholder: null,
    }],
  }
}

function attachment(): ApprovalAttachment[] {
  return []
}

function queryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderView(client = queryClient()) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/groupware/approvals/approval-id/print']}>
        <Routes>
          <Route path="/groupware/approvals/:id/print" element={<ApprovalDocView />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  findActiveDocumentTemplate.mockResolvedValue(null)
})

afterEach(() => {
  cleanup()
})

describe('ApprovalDocView renderer transition', () => {
  it('approval/attachment promise가 끝나지 않으면 loading을 유지한다', () => {
    getGroupwareApproval.mockReturnValue(new Promise(() => {}))
    listApprovalAttachments.mockReturnValue(new Promise(() => {}))

    renderView()

    expect(screen.getByText('불러오는 중...')).toBeTruthy()
    expect(DocumentRenderer).not.toHaveBeenCalled()
  })

  it('prefilled query cache가 done이면 DocumentRenderer에 sanitized model과 backTo를 전달한다', async () => {
    const client = queryClient()
    const resolvedApproval = approval()
    getGroupwareApproval.mockResolvedValue(resolvedApproval)
    listApprovalAttachments.mockResolvedValue(attachment())
    findActiveApprovalTemplate.mockResolvedValue(template())
    client.setQueryData(['groupware-approval-print', 'approval-id'], resolvedApproval)
    client.setQueryData(['groupware-approval-print-attachments', 'approval-id'], attachment())
    client.setQueryData(['groupware-approval-print-template', 'template-id'], template())

    renderView(client)

    await waitFor(() => expect(DocumentRenderer).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('document-renderer').dataset.backTo).toBe('/groupware/approvals/approval-id')
    const props = vi.mocked(DocumentRenderer).mock.calls[0]?.[0]
    expect(JSON.stringify(props?.model)).not.toContain('approval-id')
    expect(props?.template.docType).toBe('GROUPWARE_DEFAULT')
  })

  it('template query 오류는 빈 필드 의미로 계속 렌더한다', async () => {
    const client = queryClient()
    const resolvedApproval = approval({ fieldValues: {} })
    getGroupwareApproval.mockResolvedValue(resolvedApproval)
    listApprovalAttachments.mockResolvedValue(attachment())
    client.setQueryData(['groupware-approval-print', 'approval-id'], resolvedApproval)
    client.setQueryData(['groupware-approval-print-attachments', 'approval-id'], attachment())
    findActiveApprovalTemplate.mockRejectedValue(new Error('template unavailable'))

    renderView(client)

    await waitFor(() => expect(DocumentRenderer).toHaveBeenCalledTimes(1))
    const props = vi.mocked(DocumentRenderer).mock.calls[0]?.[0]
    expect(props?.model.body.fieldRows).toEqual([])
    expect(props?.template.docType).toBe('GROUPWARE_DEFAULT')
  })

  it('template not-found(null resolve)도 빈 필드로 GROUPWARE_DEFAULT를 유지한다', async () => {
    // 오류(reject)와 구분되는 경로 — active 템플릿에서 미발견 시 findActiveApprovalTemplate 은 null 을 resolve 한다.
    const client = queryClient()
    const resolvedApproval = approval({ fieldValues: {} })
    getGroupwareApproval.mockResolvedValue(resolvedApproval)
    listApprovalAttachments.mockResolvedValue(attachment())
    client.setQueryData(['groupware-approval-print', 'approval-id'], resolvedApproval)
    client.setQueryData(['groupware-approval-print-attachments', 'approval-id'], attachment())
    findActiveApprovalTemplate.mockResolvedValue(null)

    renderView(client)

    await waitFor(() => expect(DocumentRenderer).toHaveBeenCalledTimes(1))
    const props = vi.mocked(DocumentRenderer).mock.calls[0]?.[0]
    expect(props?.model.body.fieldRows).toEqual([])
    expect(props?.template.docType).toBe('GROUPWARE_DEFAULT')
  })

  it('approval 또는 attachment query 오류는 중단하고 error banner를 보여준다', async () => {
    getGroupwareApproval.mockRejectedValue(new Error('approval unavailable'))
    listApprovalAttachments.mockResolvedValue(attachment())

    renderView()

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('결재문서를 불러오지 못했습니다.'))
    expect(DocumentRenderer).not.toHaveBeenCalled()
  })

  it('attachment query 오류도 approval과 동일하게 중단한다', async () => {
    getGroupwareApproval.mockResolvedValue(approval())
    listApprovalAttachments.mockRejectedValue(new Error('attachments unavailable'))

    renderView()

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('결재문서를 불러오지 못했습니다.'))
    expect(DocumentRenderer).not.toHaveBeenCalled()
  })

  it('id가 없으면 orphan 화면을 렌더하지 않는다', () => {
    render(
      <QueryClientProvider client={queryClient()}>
        <MemoryRouter initialEntries={['/groupware/approvals/print']}>
          <Routes>
            <Route path="/groupware/approvals/print" element={<ApprovalDocView />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(document.body.textContent).toBe('')
    expect(getGroupwareApproval).not.toHaveBeenCalled()
  })
})
