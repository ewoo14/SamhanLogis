// @vitest-environment jsdom
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { GroupwareApprovalDetailPage } from './GroupwareApprovalDetailPage'

const { approvalMock, attachmentsMock } = vi.hoisted(() => ({
  approvalMock: vi.fn(),
  attachmentsMock: vi.fn(),
}))

vi.mock('../api/groupwareApproval', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/groupwareApproval')>()),
  getGroupwareApproval: approvalMock,
}))

vi.mock('../api/groupwareApprovalAttachment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/groupwareApprovalAttachment')>()),
  listApprovalAttachments: attachmentsMock,
}))

vi.mock('../api/groupwareApprovalTemplate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/groupwareApprovalTemplate')>()),
  findActiveApprovalTemplate: vi.fn().mockResolvedValue(null),
}))

vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({ canAccess: () => false }),
}))

vi.mock('../hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}))

vi.mock('../hooks/usePageTitle', () => ({
  usePageTitle: () => undefined,
}))

const approval = {
  approvalId: 'approval-1',
  approvalNo: 'GW-2026-001',
  requesterId: 'requester-1',
  requesterName: '작성자',
  title: '정산서 참조 상세 회귀',
  content: null,
  templateId: null,
  templateName: null,
  documentType: null,
  documentTemplateDefaultPinned: false,
  fieldValues: {},
  status: 'PENDING',
  steps: [],
}

const settlementAttachment = {
  id: 'settlement-attachment',
  attachmentType: 'SLIP_REF',
  label: null,
  displayOrder: 1,
  refSlipNo: null,
  refSlipType: null,
  refPartnerCode: null,
  refPartnerName: null,
  refPeriod: null,
  refDocType: 'SALES_COMMISSION_SETTLEMENT',
  refDocNo: '2026/08/11-1',
  refDocLabel: 'CONFIRMED',
  fileName: null,
  contentType: null,
  fileSize: null,
  downloadUrl: null,
}

function renderDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/groupware/approvals/approval-1']}>
        <Routes>
          <Route path="/groupware/approvals/:id" element={<GroupwareApprovalDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  approvalMock.mockReset()
  attachmentsMock.mockReset()
})

describe('정산서 SLIP_REF 상세 소비자', () => {
  it('S4 route가 없으면 정산서 번호를 href="#" 죽은 링크로 렌더하지 않는다', async () => {
    approvalMock.mockResolvedValue(approval)
    attachmentsMock.mockResolvedValue([settlementAttachment])

    renderDetail()

    await waitFor(() => expect(screen.getByText('영업수수료 정산서')).toBeTruthy())
    expect(screen.getByText('2026/08/11-1')).toBeTruthy()
    expect(screen.queryByRole('link', { name: '2026/08/11-1' })).toBeNull()
  })
})
