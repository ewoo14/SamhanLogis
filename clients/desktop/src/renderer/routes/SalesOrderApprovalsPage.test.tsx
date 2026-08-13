// @vitest-environment jsdom
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SalesOrderApprovalsPage } from './SalesOrderApprovalsPage'

const mocks = vi.hoisted(() => ({
  listPartnerApprovals: vi.fn(),
  previewPartnerAccess: vi.fn(),
  resetPartnerPassword: vi.fn(),
  updatePartnerApprovalStatus: vi.fn(),
  canAccess: vi.fn(),
}))

vi.mock('../api/sales', () => ({
  PARTNER_APPROVAL_STATUS_LABEL: {
    UNAPPROVED: '미승인', APPROVED: '승인', PASSWORD_RESET_PENDING: '비밀번호 재설정 대기',
    PASSWORD_ERROR: '비밀번호 오류', ACCESS_DENIED: '접근제한', LONG_PENDING: '장기미발주',
  },
  listPartnerApprovals: mocks.listPartnerApprovals,
  previewPartnerAccess: mocks.previewPartnerAccess,
  resetPartnerPassword: mocks.resetPartnerPassword,
  updatePartnerApprovalStatus: mocks.updatePartnerApprovalStatus,
}))
vi.mock('../hooks/usePermissions', () => ({ usePermissions: () => ({ canAccess: mocks.canAccess }) }))
vi.mock('../stores/pageTitle', () => ({ usePageTitleStore: (selector: (s: { setPageTitle: () => void }) => unknown) => selector({ setPageTitle: vi.fn() }) }))
vi.mock('../components/sales/SalesSubNav', () => ({ SalesSubNav: () => <nav>영업 메뉴</nav> }))
vi.mock('../components/audit/AuditOverlaySection', () => ({ AuditInfoBanner: () => <div>감사 안내</div> }))
vi.mock('@samhan/design-system', () => ({
  DataTable: ({ rows }: { rows: Array<{ partnerName: string }> }) => <div>{rows.map((row) => <span key={row.partnerName}>{row.partnerName}</span>)}</div>,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('주문서 승인 보류 미리보기 렌더', () => {
  it('/access-preview/report 응답의 보류 건수와 원천을 화면에 표시한다', async () => {
    mocks.canAccess.mockReturnValue(true)
    mocks.listPartnerApprovals.mockResolvedValue({ content: [], totalElements: 0 })
    mocks.previewPartnerAccess.mockResolvedValue({
      candidates: [],
      deferred: true,
      deferredPartnerCount: 2,
      deferredSources: ['ORDER', 'SHIPMENT'],
    })

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <SalesOrderApprovalsPage />
      </QueryClientProvider>,
    )

    expect((await screen.findByRole('alert')).textContent).toContain('2건의 판정이 보류되었습니다.')
    expect(screen.getByRole('alert').textContent).toContain('(ORDER, SHIPMENT)')
  })
})
