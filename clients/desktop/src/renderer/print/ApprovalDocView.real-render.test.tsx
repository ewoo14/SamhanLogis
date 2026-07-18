// @vitest-environment jsdom
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { onlineManager } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { StaticRouter } from 'react-router-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApprovalLineAdminResponse } from '../api/groupwareApproval'
import { GROUPWARE_DEFAULT } from './approvalDefaultTemplate'
import { buildApprovalRenderModel } from './approvalRenderModel'
import { DocumentRenderer } from './DocumentRenderer'
import type { TemplateEnvelope } from './templateSchema'
import { ApprovalDocView } from './ApprovalDocView'

const mocks = vi.hoisted(() => ({
  getGroupwareApproval: vi.fn(),
  listApprovalAttachments: vi.fn(),
  findActiveApprovalTemplate: vi.fn(),
  findActiveDocumentTemplate: vi.fn(),
}))

vi.mock('../api/groupwareApproval', () => ({ getGroupwareApproval: mocks.getGroupwareApproval }))
vi.mock('../api/groupwareApprovalAttachment', () => ({ listApprovalAttachments: mocks.listApprovalAttachments }))
vi.mock('../api/groupwareApprovalTemplate', () => ({ findActiveApprovalTemplate: mocks.findActiveApprovalTemplate }))
vi.mock('../api/documentTemplate', () => ({ findActiveDocumentTemplate: mocks.findActiveDocumentTemplate }))
vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }))

function approval(documentType: string | null): ApprovalLineAdminResponse {
  return {
    approvalId: 'approval-id',
    approvalNo: 'GW-REAL-001',
    requesterId: 'requester-id',
    requesterName: '작성자',
    title: '실 렌더링 회귀',
    content: '본문',
    templateId: null,
    templateName: null,
    documentType,
    fieldValues: {},
    status: 'APPROVED',
    steps: [],
  }
}

const activeLayout: TemplateEnvelope = {
  schemaVersion: 1,
  revision: 2,
  docType: 'GROUPWARE_REAL',
  name: '실 활성 양식',
  document: {
    paper: 'A4_PORTRAIT',
    bands: [
      { key: 'footer', kind: 'FOOTER', elements: [{ key: 'closing', type: 'CLOSING' }] },
      { key: 'header', kind: 'HEADER', elements: [{ key: 'title', type: 'TITLE' }, { key: 'approval', type: 'APPROVAL_GRID' }] },
      { key: 'body', kind: 'BODY', elements: [{ key: 'content', type: 'CONTENT_PARAGRAPHS' }] },
    ],
  },
}

function queryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnReconnect: false } } })
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
  mocks.listApprovalAttachments.mockResolvedValue([])
  mocks.findActiveApprovalTemplate.mockResolvedValue(null)
})

afterEach(() => cleanup())

describe('ApprovalDocView real DocumentRenderer route gate', () => {
  it('no active layout produces the same real DEFAULT renderer output', async () => {
    mocks.getGroupwareApproval.mockResolvedValue(approval(null))
    mocks.findActiveDocumentTemplate.mockResolvedValue(null)

    const rendered = renderView()

    await waitFor(() => expect(screen.getByLabelText('결재문서 내용')).toBeTruthy())
    expect(screen.getByText('실 렌더링 회귀')).toBeTruthy()
    expect(screen.getByLabelText('전자서명 결재란')).toBeTruthy()

    const model = buildApprovalRenderModel({
      approval: approval(null),
      templateFields: [],
      attachments: [],
      backTo: '/groupware/approvals/approval-id',
    })
    const expectedHtml = renderToStaticMarkup(
      <StaticRouter location="/">
        <DocumentRenderer template={GROUPWARE_DEFAULT} model={model} backTo="/groupware/approvals/approval-id" />
      </StaticRouter>,
    )
    const extractDocument = (html: string) => new DOMParser().parseFromString(html, 'text/html')
      .querySelector('.print-approval-doc')?.outerHTML
    const canonicalize = (html: string | undefined) => html
      ?.replace(/\s+/g, ' ')
      .replace(/:\s+/g, ':')
      .replace(/;\s+/g, ';')
      .replace(/;\s*"/g, '"')
      .replace(/rgb\(0, 0, 0\)/g, '#000')
      .replace(/0px/g, '0')
    expect(canonicalize(extractDocument(rendered.container.innerHTML)))
      .toBe(canonicalize(extractDocument(expectedHtml)))
  })

  it('active layout with sparse/reordered bands reaches the real renderer', async () => {
    mocks.getGroupwareApproval.mockResolvedValue(approval('GROUPWARE_REAL'))
    mocks.findActiveDocumentTemplate.mockResolvedValue(activeLayout)

    renderView()

    await waitFor(() => expect(screen.getByLabelText('결재문서 내용')).toBeTruthy())
    expect(screen.getByText('실 렌더링 회귀')).toBeTruthy()
    expect(mocks.findActiveDocumentTemplate).toHaveBeenCalledWith('GROUPWARE_REAL')
  })

  it.each([
    ['API error', () => mocks.findActiveDocumentTemplate.mockRejectedValue(new Error('offline'))],
    ['malformed', () => mocks.findActiveDocumentTemplate.mockResolvedValue(null)],
  ])('%s converges to DEFAULT renderer', async (_label, arrange) => {
    mocks.getGroupwareApproval.mockResolvedValue(approval('GROUPWARE_REAL'))
    arrange()

    renderView()

    await waitFor(() => expect(screen.getByLabelText('결재문서 내용')).toBeTruthy())
    expect(screen.getByText('실 렌더링 회귀')).toBeTruthy()
  })

  it('late active resolution is selected once and does not refetch on reconnect', async () => {
    let resolveLate!: (value: TemplateEnvelope | null) => void
    mocks.getGroupwareApproval.mockResolvedValue(approval('GROUPWARE_REAL'))
    mocks.findActiveDocumentTemplate.mockReturnValue(new Promise<TemplateEnvelope | null>((resolve) => {
      resolveLate = resolve
    }))

    const client = queryClient()
    renderView(client)
    expect(screen.getByText('불러오는 중...')).toBeTruthy()
    resolveLate(null)

    await waitFor(() => expect(screen.getByLabelText('결재문서 내용')).toBeTruthy())
    onlineManager.setOnline(false)
    onlineManager.setOnline(true)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mocks.findActiveDocumentTemplate).toHaveBeenCalledTimes(1)
  })
})
