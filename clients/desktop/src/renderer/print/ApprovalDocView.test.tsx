// @vitest-environment jsdom
import React, { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  findDocumentTemplateRevision: vi.fn(),
}))
const {
  getGroupwareApproval,
  listApprovalAttachments,
  findActiveApprovalTemplate,
  findActiveDocumentTemplate,
  findDocumentTemplateRevision,
} = mocks

vi.mock('../api/groupwareApproval', () => ({ getGroupwareApproval: mocks.getGroupwareApproval }))
vi.mock('../api/groupwareApprovalAttachment', () => ({ listApprovalAttachments: mocks.listApprovalAttachments }))
vi.mock('../api/groupwareApprovalTemplate', () => ({ findActiveApprovalTemplate: mocks.findActiveApprovalTemplate }))
vi.mock('../api/documentTemplate', () => ({
  findActiveDocumentTemplate: mocks.findActiveDocumentTemplate,
  findDocumentTemplateRevision: mocks.findDocumentTemplateRevision,
}))
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
    documentTemplateId: input.documentTemplateId ?? null,
    documentTemplateRevision: input.documentTemplateRevision ?? null,
    documentTemplateDefaultPinned: input.documentTemplateDefaultPinned ?? false,
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
  findDocumentTemplateRevision.mockResolvedValue(null)
  findActiveApprovalTemplate.mockResolvedValue(null)
})

afterEach(() => {
  cleanup()
})

describe('ApprovalDocView renderer transition', () => {
  it('승인 완료 문서는 활성 양식이 바뀌어도 각인된 revision을 재인쇄한다', async () => {
    const resolvedApproval = approval({
      approvalId: 'pinned-approval',
      documentType: 'GROUPWARE_PINNED',
      documentTemplateId: 'layout-template-id',
      documentTemplateRevision: 4,
    })
    getGroupwareApproval.mockResolvedValue(resolvedApproval)
    listApprovalAttachments.mockResolvedValue(attachment())
    findDocumentTemplateRevision.mockResolvedValue(activeLayout('GROUPWARE_PINNED', 4))
    findActiveDocumentTemplate.mockResolvedValue(activeLayout('GROUPWARE_PINNED', 9))

    renderView(queryClient(), '/groupware/approvals/pinned-approval/print')

    await waitFor(() => expect(DocumentRenderer).toHaveBeenCalledTimes(1))
    const props = vi.mocked(DocumentRenderer).mock.calls[0]?.[0]
    expect(props?.template.revision).toBe(4)
    expect(props?.template.docType).toBe('GROUPWARE_PINNED')
    expect(findDocumentTemplateRevision).toHaveBeenCalledWith('layout-template-id', 4, 'GROUPWARE_PINNED')
    expect(findActiveDocumentTemplate).not.toHaveBeenCalled()
  })

  it('pin이 없는 승인 완료 문서는 현재 양식 fallback과 운영자 고지를 함께 표시한다', async () => {
    const resolvedApproval = approval({ documentType: 'GROUPWARE_UNPINNED', status: 'APPROVED' })
    getGroupwareApproval.mockResolvedValue(resolvedApproval)
    listApprovalAttachments.mockResolvedValue(attachment())
    findActiveDocumentTemplate.mockResolvedValue(activeLayout('GROUPWARE_UNPINNED', 9))

    renderView(queryClient(), '/groupware/approvals/approval-id/print')

    await waitFor(() => expect(DocumentRenderer).toHaveBeenCalledTimes(1))
    const notice = screen.getByTestId('approval-reprint-unpinned-notice')
    expect(notice.textContent).toBe(
      '승인 당시 레이아웃 정보가 없어 현재 양식으로 표시됩니다.',
    )
    expect(notice.className).toContain('no-print')
    expect(vi.mocked(DocumentRenderer).mock.calls[0]?.[0]?.template.revision).toBe(9)
  })

  it('R3 D-1: pin도 없고 현재 활성 양식도 없으면 고지가 "현재 양식"이 아니라 기본 양식 사용을 알린다', async () => {
    const resolvedApproval = approval({ documentType: 'GROUPWARE_UNPINNED_NO_ACTIVE', status: 'APPROVED' })
    getGroupwareApproval.mockResolvedValue(resolvedApproval)
    listApprovalAttachments.mockResolvedValue(attachment())
    // 이 docType의 현재 ACTIVE 양식이 0개인 경우 — findActiveDocumentTemplate은 null을 resolve한다.
    findActiveDocumentTemplate.mockResolvedValue(null)

    renderView(queryClient(), '/groupware/approvals/approval-id/print')

    await waitFor(() => expect(DocumentRenderer).toHaveBeenCalledTimes(1))
    // 실제 렌더는 GROUPWARE_DEFAULT인데(현재 활성이 없으므로), 고지가 "현재 양식으로 표시됩니다"라고
    // 말하면 실제 렌더와 불일치한다 — 그 문서는 이 docType의 어떤 저장된 활성 양식도 아니다.
    expect(vi.mocked(DocumentRenderer).mock.calls[0]?.[0]?.template.docType).toBe('GROUPWARE_DEFAULT')
    const notice = screen.getByTestId('approval-reprint-unpinned-notice')
    expect(notice.textContent).not.toBe('승인 당시 레이아웃 정보가 없어 현재 양식으로 표시됩니다.')
    expect(notice.textContent).toBe(
      '승인 당시 레이아웃 정보가 없고 현재 활성 양식도 없어 기본 양식(GROUPWARE_DEFAULT)으로 표시됩니다.',
    )
  })

  it('승인 당시 ACTIVE-0은 기본 양식으로 고정하고 이후 ACTIVE 양식을 조회하지 않는다', async () => {
    const resolvedApproval = approval({
      documentType: 'GROUPWARE_ACTIVE_ZERO',
      documentTemplateDefaultPinned: true,
      status: 'APPROVED',
    })
    getGroupwareApproval.mockResolvedValue(resolvedApproval)
    listApprovalAttachments.mockResolvedValue(attachment())
    findActiveDocumentTemplate.mockResolvedValue(activeLayout('GROUPWARE_ACTIVE_ZERO', 9))

    renderView(queryClient(), '/groupware/approvals/approval-id/print')

    await waitFor(() => expect(DocumentRenderer).toHaveBeenCalledTimes(1))
    expect(vi.mocked(DocumentRenderer).mock.calls[0]?.[0]?.template.docType).toBe('GROUPWARE_DEFAULT')
    const notice = screen.getByTestId('approval-reprint-default-pinned-notice')
    expect(notice.textContent).toBe(
      '승인 당시 활성 양식이 없어 기본 양식(GROUPWARE_DEFAULT)으로 고정 표시됩니다.',
    )
    expect(notice.className).toContain('no-print')
    expect(findActiveDocumentTemplate).not.toHaveBeenCalled()
  })

  it('docType이 없는 승인 완료 문서에는 미pin 고지를 노출하지 않는다(레이아웃 개념 자체가 없는 구식/독립형 결재)', async () => {
    const resolvedApproval = approval({ documentType: null, templateId: null, status: 'APPROVED' })
    getGroupwareApproval.mockResolvedValue(resolvedApproval)
    listApprovalAttachments.mockResolvedValue(attachment())

    renderView(queryClient(), '/groupware/approvals/approval-id/print')

    await waitFor(() => expect(DocumentRenderer).toHaveBeenCalledTimes(1))
    expect(screen.queryByTestId('approval-reprint-unpinned-notice')).toBeNull()
  })

  it('pin revision 조회가 실패하면 무고지 DEFAULT 대신 alert 고지 + 재시도 버튼을 보여준다', async () => {
    const resolvedApproval = approval({
      documentType: 'GROUPWARE_PIN_FETCH_FAILED',
      documentTemplateId: 'layout-template-id',
      documentTemplateRevision: 3,
    })
    getGroupwareApproval.mockResolvedValue(resolvedApproval)
    listApprovalAttachments.mockResolvedValue(attachment())
    findDocumentTemplateRevision.mockRejectedValue(new Error('revision fetch failed'))

    renderView(queryClient(), '/groupware/approvals/approval-id/print')

    await waitFor(() => expect(DocumentRenderer).toHaveBeenCalledTimes(1))
    // 무고지 강하 금지(H-2) — DEFAULT로 내려가되 alert 고지가 반드시 함께 떠야 한다.
    expect(vi.mocked(DocumentRenderer).mock.calls[0]?.[0]?.template.docType).toBe('GROUPWARE_DEFAULT')
    const notice = screen.getByTestId('approval-reprint-pin-failed-notice')
    expect(notice.getAttribute('role')).toBe('alert')
    expect(notice.className).toContain('no-print')
    expect(notice.textContent).toBe(
      '승인 당시 레이아웃 조회에 실패해 기본 양식(GROUPWARE_DEFAULT)으로 대신 표시됩니다. 실제 승인 당시 양식과 다를 수 있습니다. 다시 시도',
    )
    // 미pin 고지(pin 자체가 없는 경우)와는 상호 배타적이라 동시에 뜨지 않아야 한다.
    expect(screen.queryByTestId('approval-reprint-unpinned-notice')).toBeNull()
  })

  it('pin revision malformed(null) 응답도 alert 고지와 DEFAULT fallback을 유지한다', async () => {
    const resolvedApproval = approval({
      documentType: 'GROUPWARE_PIN_MALFORMED',
      documentTemplateId: 'layout-template-id',
      documentTemplateRevision: 3,
    })
    getGroupwareApproval.mockResolvedValue(resolvedApproval)
    listApprovalAttachments.mockResolvedValue(attachment())
    findDocumentTemplateRevision.mockResolvedValue(null)

    renderView(queryClient(), '/groupware/approvals/approval-id/print')

    await waitFor(() => expect(DocumentRenderer).toHaveBeenCalledTimes(1))
    expect(vi.mocked(DocumentRenderer).mock.calls[0]?.[0]?.template.docType).toBe('GROUPWARE_DEFAULT')
    const notice = screen.getByTestId('approval-reprint-pin-failed-notice')
    expect(notice.getAttribute('role')).toBe('alert')
    expect(notice.className).toContain('no-print')
  })

  it('pin revision 조회 실패 후 재시도가 성공하면 alert 고지가 사라지고 pinned revision을 렌더한다', async () => {
    const resolvedApproval = approval({
      documentType: 'GROUPWARE_PIN_RETRY',
      documentTemplateId: 'layout-template-id',
      documentTemplateRevision: 2,
    })
    getGroupwareApproval.mockResolvedValue(resolvedApproval)
    listApprovalAttachments.mockResolvedValue(attachment())
    findDocumentTemplateRevision
      .mockRejectedValueOnce(new Error('revision fetch failed'))
      .mockResolvedValueOnce(activeLayout('GROUPWARE_PIN_RETRY', 2))

    renderView(queryClient(), '/groupware/approvals/approval-id/print')

    await waitFor(() => expect(screen.getByTestId('approval-reprint-pin-failed-notice')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))

    await waitFor(() => expect(vi.mocked(DocumentRenderer).mock.calls.at(-1)?.[0]?.template.revision).toBe(2))
    expect(screen.queryByTestId('approval-reprint-pin-failed-notice')).toBeNull()
    expect(findDocumentTemplateRevision).toHaveBeenCalledTimes(2)
  })

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
    client.setQueryData(['approval.documentLayout', 'approval-id', 'GROUPWARE_PENDING', null, null], cached)
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
    client.setQueryData(['approval.documentLayout', 'approval-id', 'GROUPWARE_ERROR', null, null], activeLayout('GROUPWARE_ERROR'))
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
    // R3 HIGH-1 fix로 approvalQuery가 이제 매 mount마다 refetchOnMount:'always'로 실제
    // 재검증을 트리거한다 — setQueryData만으로 캐시를 심어도 background refetch가 반드시
    // 발생하므로, 그 refetch가 seed와 다른(leak된 이전 테스트의) 응답을 돌려주면 docType이
    // 바뀌어 버려 이 테스트의 "같은 docType 유지" 전제 자체가 깨진다. seed와 정합하는
    // 응답을 명시한다.
    getGroupwareApproval.mockImplementation((approvalId: string) => Promise.resolve(
      approvalId === 'A' ? approvalA : approvalB,
    ))
    listApprovalAttachments.mockResolvedValue(attachment())
    client.setQueryData(['groupware-approval-print', 'A'], approvalA)
    client.setQueryData(['groupware-approval-print', 'B'], approvalB)
    client.setQueryData(['groupware-approval-print-attachments', 'A'], attachment())
    client.setQueryData(['groupware-approval-print-attachments', 'B'], attachment())
    client.setQueryData(
      ['approval.documentLayout', 'A', 'GROUPWARE_CACHED_SHARED', null, null],
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

  it('R3 HIGH-1/MED-1: 5분 캐시 창 내에서도 stale 승인 데이터가 아닌 fresh pin을 렌더한다', async () => {
    // 재현: 인쇄 미리보기를 먼저 열어(PENDING, pin 없음) approvalQuery가 5분 staleTime으로
    // 캐시된 뒤, 같은 mount 안에서 최종 승인이 반영된 fresh 응답(APPROVED + pin rev7)이
    // 와도 화면이 stale 데이터를 계속 신뢰하면 승인 당시 외형이 아닌 엉뚱한 현재 활성
    // 양식(rev99)이 무고지로 인쇄된다.
    const client = queryClient(5 * 60 * 1000)
    const stalePending = approval({
      documentType: 'GROUPWARE_R3_STALE',
      status: 'PENDING',
      documentTemplateId: null,
      documentTemplateRevision: null,
    })
    const freshPinned = approval({
      documentType: 'GROUPWARE_R3_STALE',
      status: 'APPROVED',
      documentTemplateId: 'layout-r3',
      documentTemplateRevision: 7,
    })
    client.setQueryData(['groupware-approval-print', 'approval-id'], stalePending)
    getGroupwareApproval.mockResolvedValue(freshPinned)
    listApprovalAttachments.mockResolvedValue(attachment())
    findDocumentTemplateRevision.mockResolvedValue(activeLayout('GROUPWARE_R3_STALE', 7))
    findActiveDocumentTemplate.mockResolvedValue(activeLayout('GROUPWARE_R3_STALE', 99))

    renderView(client)

    await waitFor(() => expect(vi.mocked(DocumentRenderer).mock.calls.at(-1)?.[0]?.template.revision).toBe(7))
    expect(findActiveDocumentTemplate).not.toHaveBeenCalled()
    expect(screen.queryByTestId('approval-reprint-unpinned-notice')).toBeNull()
  })

  it('R3 MED-2: 결정 latch 이후 defaultPinned이 바뀌어도 배너와 실제 렌더가 항상 함께 일치한다', async () => {
    // pinApprovedLayout()은 각인을 1회성으로 만들지만(ensureMutable), FE가 배너를 latch된
    // 결정과 별개로 approval의 "현재" 값에서 매 렌더 다시 계산하면, latch 이후 approval
    // 캐시가 (V13 이전 감사무결성 공백 등으로) 바뀌었을 때 "각인 없음" 배너가 뜨면서도
    // 화면에는 여전히 이전 latch가 고정한 rev5 pin 내용이 남는 모순이 생길 수 있다.
    const client = queryClient(5 * 60 * 1000)
    const pinnedRev5 = approval({
      documentType: 'GROUPWARE_R3_LATCH',
      status: 'APPROVED',
      documentTemplateId: 'layout-r3-latch',
      documentTemplateRevision: 5,
      documentTemplateDefaultPinned: false,
    })
    getGroupwareApproval.mockResolvedValue(pinnedRev5)
    listApprovalAttachments.mockResolvedValue(attachment())
    findDocumentTemplateRevision.mockResolvedValue(activeLayout('GROUPWARE_R3_LATCH', 5))

    renderView(client)
    await waitFor(() => expect(vi.mocked(DocumentRenderer).mock.calls.at(-1)?.[0]?.template.revision).toBe(5))
    expect(screen.queryByTestId('approval-reprint-default-pinned-notice')).toBeNull()
    expect(screen.queryByTestId('approval-reprint-unpinned-notice')).toBeNull()

    // latch 이후 배경 refetch가 CHECK-valid한 다른 조합(각인 해제+defaultPinned)을 들고
    // 오는 방어적 시나리오. pin 3컬럼은 함께 바뀌어도(상호배타 유지) FE는 이미 렌더한
    // rev5를 계속 보여줘야 하고, 그렇다면 배너도 "각인 없음" 쪽으로 혼자 앞서가면 안 된다.
    client.setQueryData(['groupware-approval-print', 'approval-id'], {
      ...pinnedRev5,
      documentTemplateId: null,
      documentTemplateRevision: null,
      documentTemplateDefaultPinned: true,
    })

    await waitFor(() => expect(vi.mocked(DocumentRenderer).mock.calls.at(-1)?.[0]?.template.revision).toBe(5))
    expect(screen.queryByTestId('approval-reprint-default-pinned-notice')).toBeNull()
    expect(screen.queryByTestId('approval-reprint-unpinned-notice')).toBeNull()
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
