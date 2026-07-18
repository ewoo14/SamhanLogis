// @vitest-environment jsdom
import React, { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApprovalLineAdminResponse } from '../api/groupwareApproval'
import type { ApprovalAttachment } from '../api/groupwareApprovalAttachment'
import type { ApprovalTemplate } from '../api/groupwareApprovalTemplate'
import { DocumentRenderer } from './DocumentRenderer'
import { ApprovalDocView } from './ApprovalDocView'
import type { TemplateEnvelope } from './templateSchema'

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

function activeLayout(docType: string, revision = 1): TemplateEnvelope {
  return {
    schemaVersion: 1,
    revision,
    docType,
    name: `${docType} 활성 양식`,
    document: {
      paper: 'A4_PORTRAIT',
      bands: [
        { key: 'header', kind: 'HEADER', elements: [{ key: 'title', type: 'TITLE' }, { key: 'approval', type: 'APPROVAL_GRID' }] },
        { key: 'body', kind: 'BODY', elements: [{ key: 'content', type: 'CONTENT_PARAGRAPHS' }] },
        { key: 'footer', kind: 'FOOTER', elements: [{ key: 'closing', type: 'CLOSING' }] },
      ],
    },
  }
}

function queryClient(staleTime = 0): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime } } })
}

function renderView(client = queryClient(), entry = '/groupware/approvals/approval-id/print') {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/groupware/approvals/:id/print" element={<ApprovalDocView />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function NavigatingApprovalView({ target }: { target: string }) {
  const navigate = useNavigate()
  useEffect(() => navigate(target), [navigate, target])
  return <ApprovalDocView />
}

function renderNavigatingView(client: QueryClient, target: string) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/groupware/approvals/A/print']}>
        <Routes>
          <Route path="/groupware/approvals/:id/print" element={<NavigatingApprovalView target={target} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  findActiveDocumentTemplate.mockReset()
  findActiveDocumentTemplate.mockResolvedValue(null)
  findActiveApprovalTemplate.mockResolvedValue(null)
})

afterEach(() => {
  cleanup()
})

describe('ApprovalDocView renderer transition', () => {
  it('동일 QueryClient 재마운트에서 cached null을 재사용하지 않고 active layout을 다시 조회한다', async () => {
    const client = queryClient(5 * 60 * 1000)
    const resolvedApproval = approval({ documentType: 'GROUPWARE_CACHE', templateId: null })
    getGroupwareApproval.mockResolvedValue(resolvedApproval)
    listApprovalAttachments.mockResolvedValue(attachment())
    findActiveDocumentTemplate.mockResolvedValueOnce(null).mockResolvedValueOnce(activeLayout('GROUPWARE_CACHE'))

    const first = renderView(client)
    await waitFor(() => expect(DocumentRenderer).toHaveBeenCalledTimes(1))
    expect(vi.mocked(DocumentRenderer).mock.calls.at(-1)?.[0]?.template.docType).toBe('GROUPWARE_DEFAULT')

    first.unmount()
    vi.mocked(DocumentRenderer).mockClear()
    renderView(client)

    await waitFor(() => expect(DocumentRenderer).toHaveBeenCalledTimes(1))
    expect(vi.mocked(DocumentRenderer).mock.calls[0]?.[0]?.template.docType).toBe('GROUPWARE_CACHE')
    expect(findActiveDocumentTemplate).toHaveBeenCalledTimes(2)
  })

  it('cached active layout은 새 mount의 null 또는 교체 응답으로 갱신된다', async () => {
    const client = queryClient(5 * 60 * 1000)
    const resolvedApproval = approval({ documentType: 'GROUPWARE_CACHE', templateId: null })
    getGroupwareApproval.mockResolvedValue(resolvedApproval)
    listApprovalAttachments.mockResolvedValue(attachment())
    findActiveDocumentTemplate
      .mockResolvedValueOnce(activeLayout('GROUPWARE_CACHE', 1))
      .mockResolvedValueOnce(activeLayout('GROUPWARE_CACHE', 2))
      .mockResolvedValueOnce(null)

    const first = renderView(client)
    await waitFor(() => expect(DocumentRenderer).toHaveBeenCalledTimes(1))
    expect(vi.mocked(DocumentRenderer).mock.calls.at(-1)?.[0]?.template.revision).toBe(1)

    first.unmount()
    vi.mocked(DocumentRenderer).mockClear()
    const second = renderView(client)
    await waitFor(() => expect(DocumentRenderer).toHaveBeenCalledTimes(1))
    expect(vi.mocked(DocumentRenderer).mock.calls[0]?.[0]?.template.revision).toBe(2)

    second.unmount()
    vi.mocked(DocumentRenderer).mockClear()
    renderView(client)
    await waitFor(() => expect(DocumentRenderer).toHaveBeenCalledTimes(1))
    expect(vi.mocked(DocumentRenderer).mock.calls[0]?.[0]?.template.docType).toBe('GROUPWARE_DEFAULT')
    expect(findActiveDocumentTemplate).toHaveBeenCalledTimes(3)
  })

  it('cached layout이 있어도 현재 mount fetch가 끝날 때까지 latch하지 않는다', async () => {
    const client = queryClient(5 * 60 * 1000)
    const resolvedApproval = approval({ documentType: 'GROUPWARE_PENDING', templateId: null })
    getGroupwareApproval.mockResolvedValue(resolvedApproval)
    listApprovalAttachments.mockResolvedValue(attachment())
    const cached = activeLayout('GROUPWARE_PENDING', 1)
    client.setQueryData(['approval.documentType', 'GROUPWARE_PENDING'], cached)
    let resolveFetch!: (value: TemplateEnvelope | null) => void
    findActiveDocumentTemplate.mockReturnValue(new Promise<TemplateEnvelope | null>((resolve) => {
      resolveFetch = resolve
    }))

    renderView(client)
    await waitFor(() => expect(screen.getByText('불러오는 중...')).toBeTruthy())
    expect(DocumentRenderer).not.toHaveBeenCalled()

    resolveFetch(cached)
    await waitFor(() => expect(DocumentRenderer).toHaveBeenCalledTimes(1))
  })

  it('cached active layout의 refetch error는 cached data가 아닌 DEFAULT로 수렴한다', async () => {
    const client = queryClient(5 * 60 * 1000)
    const resolvedApproval = approval({ documentType: 'GROUPWARE_ERROR', templateId: null })
    getGroupwareApproval.mockResolvedValue(resolvedApproval)
    listApprovalAttachments.mockResolvedValue(attachment())
    client.setQueryData(['approval.documentType', 'GROUPWARE_ERROR'], activeLayout('GROUPWARE_ERROR'))
    findActiveDocumentTemplate.mockRejectedValueOnce(new Error('offline'))

    renderView(client)

    await waitFor(() => expect(DocumentRenderer).toHaveBeenCalledTimes(1))
    expect(vi.mocked(DocumentRenderer).mock.calls[0]?.[0]?.template.docType).toBe('GROUPWARE_DEFAULT')
  })

  it('route id 변경 시 이전 route의 layout decision을 재사용하지 않는다', async () => {
    const client = queryClient()
    getGroupwareApproval.mockImplementation((approvalId: string) => Promise.resolve(
      approval({ approvalId, documentType: approvalId === 'A' ? 'GROUPWARE_A' : 'GROUPWARE_B' }),
    ))
    listApprovalAttachments.mockResolvedValue(attachment())
    findActiveDocumentTemplate.mockImplementation((docType: string) => Promise.resolve(activeLayout(docType)))

    const rendered = renderNavigatingView(client, '/groupware/approvals/A/print')
    await waitFor(() => expect(DocumentRenderer).toHaveBeenCalledTimes(1))
    expect(vi.mocked(DocumentRenderer).mock.calls[0]?.[0]?.template.docType).toBe('GROUPWARE_A')

    vi.mocked(DocumentRenderer).mockClear()
    rendered.rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/groupware/approvals/A/print']}>
          <Routes>
            <Route path="/groupware/approvals/:id/print" element={<NavigatingApprovalView target="/groupware/approvals/B/print" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await waitFor(() => expect(findActiveDocumentTemplate).toHaveBeenCalledWith('GROUPWARE_B'))
    await waitFor(() => expect(vi.mocked(DocumentRenderer).mock.calls.at(-1)?.[0]?.template.docType).toBe('GROUPWARE_B'))
  })

  it('같은 docType의 A→B 전환은 동일 QueryClient에서도 새 revision을 렌더한다', async () => {
    const client = queryClient(5 * 60 * 1000)
    getGroupwareApproval.mockImplementation((approvalId: string) => Promise.resolve(
      approval({
        approvalId,
        documentType: 'GROUPWARE_SHARED',
        title: approvalId === 'A' ? 'A 문서' : 'B 문서',
      }),
    ))
    listApprovalAttachments.mockResolvedValue(attachment())
    findActiveDocumentTemplate
      .mockResolvedValueOnce(activeLayout('GROUPWARE_SHARED', 1))
      .mockResolvedValueOnce(activeLayout('GROUPWARE_SHARED', 2))

    const rendered = renderNavigatingView(client, '/groupware/approvals/A/print')
    await waitFor(() => expect(vi.mocked(DocumentRenderer).mock.calls.at(-1)?.[0]?.template.revision).toBe(1))

    vi.mocked(DocumentRenderer).mockClear()
    rendered.rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/groupware/approvals/A/print']}>
          <Routes>
            <Route path="/groupware/approvals/:id/print" element={<NavigatingApprovalView target="/groupware/approvals/B/print" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await waitFor(() => expect(getGroupwareApproval).toHaveBeenCalledWith('B'))
    await waitFor(() => expect(vi.mocked(DocumentRenderer).mock.calls.at(-1)?.[0]?.template.revision).toBe(2))
    expect(findActiveDocumentTemplate).toHaveBeenCalledTimes(2)
  })

  it('approval A/B 캐시가 준비된 같은 docType 전환도 layout query epoch를 새로 시작한다', async () => {
    const client = queryClient(5 * 60 * 1000)
    const approvalA = approval({ approvalId: 'A', documentType: 'GROUPWARE_CACHED_SHARED', title: 'A 문서' })
    const approvalB = approval({ approvalId: 'B', documentType: 'GROUPWARE_CACHED_SHARED', title: 'B 문서' })
    client.setQueryData(['groupware-approval-print', 'A'], approvalA)
    client.setQueryData(['groupware-approval-print', 'B'], approvalB)
    client.setQueryData(['groupware-approval-print-attachments', 'A'], attachment())
    client.setQueryData(['groupware-approval-print-attachments', 'B'], attachment())
    client.setQueryData(
      ['approval.documentType', 'GROUPWARE_CACHED_SHARED'],
      activeLayout('GROUPWARE_CACHED_SHARED', 1),
    )
    findActiveDocumentTemplate
      .mockResolvedValueOnce(activeLayout('GROUPWARE_CACHED_SHARED', 1))
      .mockResolvedValueOnce(activeLayout('GROUPWARE_CACHED_SHARED', 2))

    const rendered = renderNavigatingView(client, '/groupware/approvals/A/print')
    await waitFor(() => expect(vi.mocked(DocumentRenderer).mock.calls.at(-1)?.[0]?.template.revision).toBe(1))

    vi.mocked(DocumentRenderer).mockClear()
    rendered.rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/groupware/approvals/A/print']}>
          <Routes>
            <Route path="/groupware/approvals/:id/print" element={<NavigatingApprovalView target="/groupware/approvals/B/print" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await waitFor(() => expect(vi.mocked(DocumentRenderer).mock.calls.at(-1)?.[0]?.template.revision).toBe(2))
    expect(findActiveDocumentTemplate).toHaveBeenCalledTimes(2)
  })

  it('상이 docType 전환 중에는 이전 layout을 새 approval model과 함께 한 프레임도 렌더하지 않는다', async () => {
    const client = queryClient(5 * 60 * 1000)
    getGroupwareApproval.mockImplementation((approvalId: string) => Promise.resolve(
      approval({
        approvalId,
        documentType: approvalId === 'A' ? 'GROUPWARE_A' : 'GROUPWARE_B',
        title: approvalId === 'A' ? 'A 문서' : 'B 문서',
      }),
    ))
    listApprovalAttachments.mockResolvedValue(attachment())
    let resolveBLayout!: (value: TemplateEnvelope | null) => void
    findActiveDocumentTemplate.mockImplementation((docType: string) => {
      if (docType === 'GROUPWARE_A') return Promise.resolve(activeLayout(docType, 1))
      return new Promise<TemplateEnvelope | null>((resolve) => { resolveBLayout = resolve })
    })

    const rendered = renderNavigatingView(client, '/groupware/approvals/A/print')
    await waitFor(() => expect(vi.mocked(DocumentRenderer).mock.calls.at(-1)?.[0]?.template.docType).toBe('GROUPWARE_A'))

    vi.mocked(DocumentRenderer).mockClear()
    rendered.rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/groupware/approvals/A/print']}>
          <Routes>
            <Route path="/groupware/approvals/:id/print" element={<NavigatingApprovalView target="/groupware/approvals/B/print" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await waitFor(() => expect(getGroupwareApproval).toHaveBeenCalledWith('B'))
    await waitFor(() => expect(findActiveDocumentTemplate).toHaveBeenCalledWith('GROUPWARE_B'))
    expect(vi.mocked(DocumentRenderer).mock.calls.some(([props]) => (
      props?.backTo === '/groupware/approvals/B' && props.template.docType === 'GROUPWARE_A'
    ))).toBe(false)

    resolveBLayout(activeLayout('GROUPWARE_B', 2))
    await waitFor(() => expect(vi.mocked(DocumentRenderer).mock.calls.at(-1)?.[0]?.template.docType).toBe('GROUPWARE_B'))
  })

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
