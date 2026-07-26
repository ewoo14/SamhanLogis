// @vitest-environment jsdom
import React from 'react'
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { StaticRouter } from 'react-router-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApprovalLineAdminResponse } from '../api/groupwareApproval'
import type { ApprovalAttachment } from '../api/groupwareApprovalAttachment'
import type * as GroupwareApprovalAttachmentModule from '../api/groupwareApprovalAttachment'
import { GROUPWARE_DEFAULT } from './approvalDefaultTemplate'
import { buildApprovalRenderModel } from './approvalRenderModel'
import { DocumentRenderer } from './DocumentRenderer'
import type { TemplateEnvelope } from './templateSchema'
import { ApprovalDocView } from './ApprovalDocView'
import { flushZeroDelayTasks } from '../test-utils/flush'

const mocks = vi.hoisted(() => ({
  getGroupwareApproval: vi.fn(),
  listApprovalAttachments: vi.fn(),
  findActiveApprovalTemplate: vi.fn(),
  findActiveDocumentTemplate: vi.fn(),
}))

vi.mock('../api/groupwareApproval', () => ({ getGroupwareApproval: mocks.getGroupwareApproval }))
// 첨부 라벨/타입 상수(APPROVAL_ATTACHMENT_TYPE_LABEL 등)는 실제 export 를 보존해야 한다
// (비어 있지 않은 첨부를 렌더 모델로 투영할 때 사용됨).
vi.mock('../api/groupwareApprovalAttachment', async (importOriginal) => {
  const actual = await importOriginal<typeof GroupwareApprovalAttachmentModule>()
  return { ...actual, listApprovalAttachments: mocks.listApprovalAttachments }
})
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

/** 첨부표(ATTACHMENT_TABLE) 유무를 육안으로 구분하기 위한 비어 있지 않은 첨부 1건. */
function attachmentList(): ApprovalAttachment[] {
  return [{
    id: 'att-1',
    attachmentType: 'FILE',
    label: '증빙 파일',
    displayOrder: 0,
    refSlipNo: null,
    refSlipType: null,
    refPartnerCode: null,
    refPartnerName: null,
    refPeriod: null,
    refDocType: null,
    refDocNo: null,
    refDocLabel: null,
    fileName: 'evidence.pdf',
    contentType: 'application/pdf',
    fileSize: 1024,
    downloadUrl: null,
  }]
}

/** META_ROWS(문서번호)·FIELD_TABLE·ATTACHMENT_TABLE 를 생략한 비기본 활성 레이아웃. */
const sparseLayout: TemplateEnvelope = {
  schemaVersion: 1,
  revision: 2,
  docType: 'GROUPWARE_REAL',
  name: '실 활성 양식(sparse)',
  document: {
    paper: 'A4_PORTRAIT',
    bands: [
      { key: 'footer', kind: 'FOOTER', elements: [{ key: 'closing', type: 'CLOSING' }] },
      { key: 'header', kind: 'HEADER', elements: [{ key: 'title', type: 'TITLE' }, { key: 'approval', type: 'APPROVAL_GRID' }] },
      { key: 'body', kind: 'BODY', elements: [{ key: 'content', type: 'CONTENT_PARAGRAPHS' }] },
    ],
  },
}

/** 첨부표를 본문보다 앞에 배치한 재정렬 활성 레이아웃(META_ROWS 포함). */
const reorderedLayout: TemplateEnvelope = {
  schemaVersion: 1,
  revision: 3,
  docType: 'GROUPWARE_REAL',
  name: '실 활성 양식(reordered)',
  document: {
    paper: 'A4_PORTRAIT',
    bands: [
      {
        key: 'header',
        kind: 'HEADER',
        elements: [{ key: 'title', type: 'TITLE' }, { key: 'meta', type: 'META_ROWS' }, { key: 'approval', type: 'APPROVAL_GRID' }],
      },
      {
        key: 'body',
        kind: 'BODY',
        elements: [{ key: 'attachments', type: 'ATTACHMENT_TABLE' }, { key: 'content', type: 'CONTENT_PARAGRAPHS' }],
      },
      { key: 'footer', kind: 'FOOTER', elements: [{ key: 'closing', type: 'CLOSING' }] },
    ],
  },
}

const detailLayout: TemplateEnvelope = {
  schemaVersion: 2,
  revision: 1,
  docType: 'GROUPWARE_REAL_DETAIL',
  name: '실 DETAIL 양식',
  document: {
    paper: 'A4_PORTRAIT',
    bands: [
      { key: 'header', kind: 'HEADER', elements: [{ key: 'title', type: 'TITLE' }, { key: 'approval', type: 'APPROVAL_GRID' }] },
      { key: 'body', kind: 'BODY', elements: [{ key: 'detail', type: 'DETAIL', repeatBinding: 'body.lineItems', columns: ['productName', 'quantity'] }] },
      { key: 'footer', kind: 'FOOTER', elements: [{ key: 'closing', type: 'CLOSING' }] },
    ],
  },
}

/** 구조 위반(빈 bands) — API 가 정규화를 못 하고 malformed 를 넘겼을 때의 컴포넌트 자체 fallback 검증용. */
const brokenEnvelope: TemplateEnvelope = {
  schemaVersion: 1,
  revision: 1,
  docType: 'GROUPWARE_REAL',
  name: '구조 위반 양식',
  document: { paper: 'A4_PORTRAIT', bands: [] },
}

const extractDocument = (html: string) =>
  new DOMParser().parseFromString(html, 'text/html').querySelector('.print-approval-doc')?.outerHTML
const canonicalize = (html: string | undefined) => html
  ?.replace(/\s+/g, ' ')
  .replace(/:\s+/g, ':')
  .replace(/;\s+/g, ';')
  .replace(/;\s*"/g, '"')
  .replace(/rgb\(0, 0, 0\)/g, '#000')
  .replace(/0px/g, '0')

/** 현재 DEFAULT 레이아웃으로 실제 DocumentRenderer 를 렌더한 골든 HTML. */
function defaultGoldenHtml(approvalInput: ApprovalLineAdminResponse, attachments: ApprovalAttachment[]): string {
  const model = buildApprovalRenderModel({
    approval: approvalInput,
    templateFields: [],
    attachments,
    backTo: '/groupware/approvals/approval-id',
  })
  return renderToStaticMarkup(
    <StaticRouter location="/">
      <DocumentRenderer template={GROUPWARE_DEFAULT} model={model} backTo="/groupware/approvals/approval-id" />
    </StaticRouter>,
  )
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

    const expectedHtml = defaultGoldenHtml(approval(null), [])
    expect(canonicalize(extractDocument(rendered.container.innerHTML)))
      .toBe(canonicalize(extractDocument(expectedHtml)))
  })

  it('active sparse layout is actually applied — omits 문서번호 and 첨부표', async () => {
    mocks.getGroupwareApproval.mockResolvedValue(approval('GROUPWARE_REAL'))
    mocks.listApprovalAttachments.mockResolvedValue(attachmentList())
    mocks.findActiveDocumentTemplate.mockResolvedValue(sparseLayout)

    const rendered = renderView()

    await waitFor(() => expect(screen.getByLabelText('결재문서 내용')).toBeTruthy())
    expect(screen.getByText('실 렌더링 회귀')).toBeTruthy()
    // 활성 레이아웃이 실제로 반영되면 META_ROWS 생략 → 문서번호 라벨 부재,
    // ATTACHMENT_TABLE 생략 → 첨부표 부재. fix 전(항상 DEFAULT)에는 둘 다 렌더되어 실패한다.
    expect(screen.queryByText('문서번호')).toBeNull()
    expect(screen.queryByLabelText('결재문서 첨부')).toBeNull()
    // 동일 입력의 DEFAULT 골든(첨부·문서번호 포함)과는 반드시 달라야 한다.
    const goldenHtml = defaultGoldenHtml(approval('GROUPWARE_REAL'), attachmentList())
    expect(canonicalize(extractDocument(rendered.container.innerHTML)))
      .not.toBe(canonicalize(extractDocument(goldenHtml)))
    expect(mocks.findActiveDocumentTemplate).toHaveBeenCalledWith('GROUPWARE_REAL')
  })

  it('active reordered layout renders 첨부 section before 내용 section', async () => {
    mocks.getGroupwareApproval.mockResolvedValue(approval('GROUPWARE_REAL'))
    mocks.listApprovalAttachments.mockResolvedValue(attachmentList())
    mocks.findActiveDocumentTemplate.mockResolvedValue(reorderedLayout)

    renderView()

    const attachmentsSection = await screen.findByLabelText('결재문서 첨부')
    const contentSection = screen.getByLabelText('결재문서 내용')
    // 재정렬 반영 시 본문(CONTENT_PARAGRAPHS)이 첨부(ATTACHMENT_TABLE)를 뒤따른다.
    // fix 전 DEFAULT 순서(본문→첨부)에서는 이 관계가 성립하지 않아 실패한다.
    expect(
      attachmentsSection.compareDocumentPosition(contentSection) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('실제 ApprovalDocView route의 DETAIL 원천 부재는 사용자 안내로 드러난다', async () => {
    mocks.getGroupwareApproval.mockResolvedValue(approval('GROUPWARE_REAL_DETAIL'))
    mocks.findActiveDocumentTemplate.mockResolvedValue(detailLayout)

    renderView()

    await waitFor(() => expect(screen.getByTestId('document-template-detail-layer')).toBeTruthy())
    expect(screen.getByText('품목 원천이 연결되지 않은 결재문서입니다.')).toBeTruthy()
    expect(screen.queryByText('데이터가 없습니다.')).toBeNull()
  })

  it.each([
    ['API error', () => mocks.findActiveDocumentTemplate.mockRejectedValue(new Error('offline'))],
    ['null(active 없음/normalize된 malformed)', () => mocks.findActiveDocumentTemplate.mockResolvedValue(null)],
    ['구조 위반 envelope(컴포넌트 자체 fallback)', () => mocks.findActiveDocumentTemplate.mockResolvedValue(brokenEnvelope)],
  ])('%s converges to the DEFAULT renderer golden byte-for-byte', async (_label, arrange) => {
    mocks.getGroupwareApproval.mockResolvedValue(approval('GROUPWARE_REAL'))
    arrange()

    const rendered = renderView()

    await waitFor(() => expect(screen.getByLabelText('결재문서 내용')).toBeTruthy())
    const goldenHtml = defaultGoldenHtml(approval('GROUPWARE_REAL'), [])
    expect(canonicalize(extractDocument(rendered.container.innerHTML)))
      .toBe(canonicalize(extractDocument(goldenHtml)))
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
    await flushZeroDelayTasks()
    expect(mocks.findActiveDocumentTemplate).toHaveBeenCalledTimes(1)
  })
})
