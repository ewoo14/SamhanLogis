// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import type { Journal } from '../api/accounting'

const mocks = vi.hoisted(() => ({
  getJournal: vi.fn(),
  postJournal: vi.fn(),
  reverseJournal: vi.fn(),
  isMobile: vi.fn(() => false),
  permissions: {} as Record<string, boolean>,
}))

vi.mock('@samhan/design-system', () => ({
  safeActorName: (value: string | null | undefined) => value === 'system' ? '시스템' : value,
  Button: ({ children, variant: _variant, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  DataTable: ({ rows, columns, emptyMessage, rowKey, rowClassName, tableLayout, className }: any) => (
    <div className={className}>
      <table>
        <colgroup>
          {columns.map((column: any) => (
            <col key={column.key} style={column.width ? { width: column.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column: any) => (
              <th
                key={column.key}
                style={column.width ? { width: column.width } : undefined}
                data-align={column.headerAlign ?? column.align ?? 'left'}
                data-table-layout={tableLayout}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length}>{emptyMessage}</td></tr>
          ) : rows.map((row: any) => (
            <tr key={rowKey ? rowKey(row) : row.id} className={rowClassName?.(row)}>
              {columns.map((column: any) => (
                <td
                  key={column.key}
                  data-label={column.header}
                  data-align={column.align ?? 'left'}
                >
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ),
  JournalStatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
  Spinner: ({ label }: { label?: string }) => <div role="status">{label}</div>,
}))

vi.mock('../api/accounting', () => ({
  getJournal: mocks.getJournal,
  postJournal: mocks.postJournal,
  reverseJournal: mocks.reverseJournal,
}))

vi.mock('../components/collab/JournalCollaborationPanel', () => ({
  JournalCollaborationPanel: () => <div data-testid="journal-collab-panel" />,
}))

vi.mock('../components/common/MobileActionSheet', () => ({
  MobileActionSheet: ({ children, open }: { children: React.ReactNode; open: boolean }) => (
    open ? <div>{children}</div> : null
  ),
}))

vi.mock('../components/common/MobileCollapsible', () => ({
  MobileCollapsible: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <section aria-label={title}>{children}</section>
  ),
}))

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }))
vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({
    canAccess: (pageCode: string, action: string) =>
      mocks.permissions[`${pageCode}:${action}`] ?? true,
  }),
}))
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: mocks.isMobile }))

import { JournalDetailPage } from './JournalDetailPage'

function makeJournal(overrides: Partial<Journal> = {}): Journal {
  return {
    id: 'journal-1',
    journalNo: '2026/07/03-1',
    journalDate: '2026-07-03',
    status: 'POSTED',
    sourceType: 'MANUAL',
    description: '수기 분개',
    totalDebit: '1000',
    totalCredit: '1000',
    createdByName: '오병승',
    createdAt: '2026-07-03T09:00:00+09:00',
    postedAt: '2026-07-03T09:10:00+09:00',
    reversedAt: null,
    reverseReason: null,
    version: 1,
    lines: [
      {
        id: 'line-1',
        lineNo: 1,
        accountCode: '102',
        accountName: '보통예금',
        debit: '1000',
        credit: '0',
        partnerName: '테스트 거래처',
        note: '메모',
        memo: '메모',
      },
      {
        id: 'line-2',
        lineNo: 2,
        accountCode: '110',
        accountName: '외상매출금',
        debit: '0',
        credit: '1000',
        partnerName: '테스트 거래처',
        note: '메모',
        memo: '메모',
      },
    ],
    ...overrides,
  }
}

// 실 이동 대상 :id 를 data-attribute 로 노출 — 텍스트("입금보고서 상세 라우트")는 기존 단언과
// 호환 유지하면서, cashReceiptId(맞음) vs sourceRefId(역분개 원분개 UUID, 틀림) 로 실제로 이동했는지
// 회귀 테스트가 구분할 수 있게 한다 (#771).
function CashReceiptDetailProbe() {
  const params = useParams<{ id: string }>()
  return (
    <div data-testid="cash-receipt-detail-probe" data-cash-receipt-id={params.id}>
      입금보고서 상세 라우트
    </div>
  )
}

function renderPage(journal: Journal) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  mocks.getJournal.mockResolvedValue(journal)
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/accounting/journals/journal-1']}>
        <Routes>
          <Route path="/accounting/journals/:id" element={<JournalDetailPage />} />
          <Route path="/accounting/admin/cash-receipts" element={<div>현금 입금 관리 라우트</div>} />
          <Route path="/accounting/admin/cash-receipts/:id" element={<CashReceiptDetailProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  mocks.permissions = {}
  mocks.isMobile.mockReturnValue(false)
})

describe('JournalDetailPage 역분개 액션 가드', () => {
  it('CASH_RECEIPT POSTED 분개는 역분개 버튼을 숨기고 입금보고서 경유 안내를 노출한다', async () => {
    renderPage(makeJournal({
      sourceType: 'CASH_RECEIPT',
      description: '입금보고서 확정 2026/07/03-1',
    }))

    await screen.findByText('입금보고서 자동 분개는 원천 입금보고서 취소/수정 시 역분개가 자동 게시됩니다.')
    expect(screen.queryByRole('button', { name: '역분개' })).toBeNull()
    expect(screen.queryByRole('button', { name: '현금 입금 관리 메뉴에서 조회' })).toBeNull()
  })

  it('CASH_RECEIPT POSTED 분개에 sourceRefId만 있으면 상세 직접 이동 링크를 노출하지 않는다', async () => {
    const journal = makeJournal({
      sourceType: 'CASH_RECEIPT',
      description: '입금보고서 확정 2026/07/03-1',
    })
    ;(journal as Journal & { sourceRefId: string }).sourceRefId = '00000000-0000-4000-8000-000000000717'

    renderPage(journal)

    await screen.findByText('입금보고서 자동 분개는 원천 입금보고서 취소/수정 시 역분개가 자동 게시됩니다.')
    expect(screen.queryByRole('button', { name: '현금 입금 관리 메뉴에서 조회' })).toBeNull()
    expect(screen.queryByRole('button', { name: /입금보고서 .* 보기/ })).toBeNull()
  })

  it('CASH_RECEIPT POSTED 분개에 sourceRefId와 cashReceiptSlipNo가 있으면 전표번호 버튼으로 입금보고서 상세로 이동한다', async () => {
    const journal = makeJournal({
      sourceType: 'CASH_RECEIPT',
      description: '입금보고서 확정 2026/07/03-1',
      sourceRefId: '00000000-0000-4000-8000-000000000717',
      cashReceiptId: '00000000-0000-4000-8000-000000000717',
      cashReceiptSlipNo: '2026/07/03-1',
    })

    renderPage(journal)

    const cashReceiptButton = await screen.findByRole('button', { name: '입금보고서 2026/07/03-1 보기' })
    expect(cashReceiptButton.getAttribute('title')).toContain('원천 입금보고서 2026/07/03-1 상세로 이동합니다.')
    expect(cashReceiptButton.textContent).not.toContain('00000000')
    cashReceiptButton.click()
    expect(await screen.findByText('입금보고서 상세 라우트')).not.toBeNull()
  })

  it('CASH_RECEIPT 역분개(REVERSAL) 분개는 cashReceiptId(원천 CashReceipt)로 이동하고 sourceRefId(원분개 UUID)로는 이동하지 않는다 (#771)', async () => {
    // 역분개 특유의 이중 의미 — sourceRefId 는 원분개 Journal UUID (CashReceipt UUID 아님, BE
    // Journal.sourceRefId 주석 참고). cashReceiptId 는 원분개와 동일한 CashReceipt 를 가리켜야 한다.
    const journal = makeJournal({
      sourceType: 'CASH_RECEIPT',
      status: 'POSTED',
      description: '[역분개] 2026/07/03-1 입금보고서 확정 2026/07/03-1',
      sourceRefId: '00000000-0000-4000-8000-000000000772',
      cashReceiptId: '00000000-0000-4000-8000-000000000717',
      cashReceiptSlipNo: '2026/07/03-1',
    })

    renderPage(journal)

    const cashReceiptButton = await screen.findByRole('button', { name: '입금보고서 2026/07/03-1 보기' })
    cashReceiptButton.click()

    const probe = await screen.findByTestId('cash-receipt-detail-probe')
    expect(probe.getAttribute('data-cash-receipt-id')).toBe('00000000-0000-4000-8000-000000000717')
    expect(probe.getAttribute('data-cash-receipt-id')).not.toBe('00000000-0000-4000-8000-000000000772')
  })

  it('분개 수정 권한이 없어도 입금보고서 view 권한과 상세 경로가 있으면 전표번호 링크를 노출한다', async () => {
    mocks.permissions['accounting.journals:update'] = false
    mocks.permissions['accounting.cash-receipts:view'] = true
    const journal = makeJournal({
      sourceType: 'CASH_RECEIPT',
      description: '입금보고서 확정 2026/07/03-1',
      sourceRefId: '00000000-0000-4000-8000-000000000717',
      cashReceiptId: '00000000-0000-4000-8000-000000000717',
      cashReceiptSlipNo: '2026/07/03-1',
    })

    renderPage(journal)

    const cashReceiptButton = await screen.findByRole('button', { name: '입금보고서 2026/07/03-1 보기' })
    expect(cashReceiptButton.textContent).not.toContain('00000000')
    expect(screen.queryByRole('button', { name: '역분개' })).toBeNull()
  })

  it('모바일 입금보고서 링크는 주요 CTA가 아니라 더보기 보조 액션으로 렌더한다', async () => {
    mocks.isMobile.mockReturnValue(true)
    mocks.permissions['accounting.journals:update'] = false
    mocks.permissions['accounting.cash-receipts:view'] = true
    const journal = makeJournal({
      sourceType: 'CASH_RECEIPT',
      description: '입금보고서 확정 2026/07/03-1',
      sourceRefId: '00000000-0000-4000-8000-000000000717',
      cashReceiptId: '00000000-0000-4000-8000-000000000717',
      cashReceiptSlipNo: '2026/07/03-1',
    })

    renderPage(journal)

    await screen.findByText('2026/07/03-1')
    expect(screen.queryByRole('button', { name: '입금보고서 2026/07/03-1 보기' })).toBeNull()

    screen.getByRole('button', { name: '더보기' }).click()

    const cashReceiptButton = await screen.findByRole('button', { name: '입금보고서 2026/07/03-1 보기' })
    expect(cashReceiptButton.classList.contains('mobile-more-sheet-item')).toBe(true)
    expect(cashReceiptButton.classList.contains('mobile-action-primary')).toBe(false)
  })

  it('MANUAL POSTED 분개는 역분개 버튼을 노출한다', async () => {
    renderPage(makeJournal({ sourceType: 'MANUAL' }))

    const reverseButton = await screen.findByRole('button', { name: '역분개' })
    expect((reverseButton as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByRole('button', { name: '현금 입금 관리 메뉴에서 조회' })).toBeNull()
  })
})

describe('JournalDetailPage 라인 테이블', () => {
  it('데스크톱 라인 테이블 헤더와 합계행을 고정 순서로 렌더한다', async () => {
    const view = renderPage(makeJournal({
      totalDebit: '1000',
      totalCredit: '1000',
    }))

    await screen.findByText('2026/07/03-1')

    const table = view.container.querySelector('table')
    expect(table).not.toBeNull()
    const headers = Array.from(table!.querySelectorAll('thead th')).map((th) => th.textContent)
    expect(headers).toEqual(['#', '계정과목', '거래처', '차변', '대변', '메모'])
    expect(table!.closest('.journal-detail-table-scroll')).not.toBeNull()
    expect(table!.parentElement?.classList.contains('journal-detail-line-table')).toBe(true)
    // #714 회귀 가드 — 6열 전부 명시 고정폭이어야 한다(메모 열만 단건 검증하면 다른 열이 width
    // 미지정(auto)으로 되돌아가는 회귀를 놓친다). width 미지정 열이 하나라도 있으면 좁은 폭
    // 컨테이너에서 그 열이 압축 소실된다(#711 QA 라운드 실측: 메모 width 미지정 시 1024px 서
    // 20px 압축·헤더 "메"만 가시 — 이슈 #714). jsdom 은 실 레이아웃을 계산하지 않으므로 여기서는
    // 폭 스펙 자체의 구조적 존재를 고정하고, 실 압축 여부는 real-qa 1024px 케이스가 담당한다.
    const colWidths = Array.from(
      table!.querySelectorAll<HTMLTableColElement>('colgroup col'),
    ).map((col) => col.style.width)
    expect(colWidths).toEqual(['40px', '160px', '260px', '110px', '110px', '180px'])

    const bodyRows = table!.querySelectorAll('tbody tr')
    // 라인 2건(픽스처) + 합계행 1건 = 3행 — 합계 sentinel 만 남고 라인이 누락되는 회귀도 잡아낸다.
    expect(bodyRows.length).toBe(3)

    // 값-라벨 배정(열 교체 swap) 회귀 고정(Opus 재검 MED) — 비대칭 픽스처(line-1 차변만·line-2
    // 대변만)로 차변/대변 셀이 각각 올바른 열에 배정됐는지 직접 단언한다.
    const line1Cells = bodyRows.item(0).querySelectorAll('td')
    expect(line1Cells.item(3).textContent).toBe('1,000')
    expect(line1Cells.item(4).textContent).toBe('—')
    const line2Cells = bodyRows.item(1).querySelectorAll('td')
    expect(line2Cells.item(3).textContent).toBe('—')
    expect(line2Cells.item(4).textContent).toBe('1,000')

    const totalRow = bodyRows.item(bodyRows.length - 1)
    const totalCells = totalRow.querySelectorAll('td')
    expect(totalRow.classList.contains('journal-total-row')).toBe(true)
    expect(within(totalRow as HTMLElement).getByText('합계')).not.toBeNull()
    expect(totalCells.item(3).textContent).toBe('1,000')
    expect(totalCells.item(4).textContent).toBe('1,000')
  })

  it('라인 0건 분개는 합계행 없이 테이블 emptyMessage 를 렌더한다', async () => {
    const view = renderPage(makeJournal({
      totalDebit: '0',
      totalCredit: '0',
      lines: [],
    }))

    await screen.findByText('2026/07/03-1')

    const table = view.container.querySelector('table')
    expect(table).not.toBeNull()
    expect(table!.querySelector('.journal-total-row')).toBeNull()
    expect(within(table as HTMLElement).getByText('라인이 없습니다.')).not.toBeNull()
  })

  it('셀 말줄임 title 은 실제 값에만 부여하고 빈 값 표시는 제외한다', async () => {
    const view = renderPage(makeJournal({
      lines: [
        {
          id: 'line-empty',
          lineNo: 1,
          accountCode: '102',
          accountName: null,
          debit: '1000',
          credit: '0',
          partnerName: '',
          note: null,
          memo: '',
        },
        {
          id: 'line-value',
          lineNo: 2,
          accountCode: '110',
          accountName: '외상매출금',
          debit: '0',
          credit: '1000',
          partnerName: '테스트 거래처',
          note: '긴 메모',
          memo: '긴 메모',
        },
      ],
    }))

    await screen.findByText('2026/07/03-1')

    const table = view.container.querySelector('table')
    expect(table).not.toBeNull()
    const bodyRows = table!.querySelectorAll('tbody tr')

    const ellipsisCells = Array.from(
      view.container.querySelectorAll<HTMLElement>('.journal-cell-ellipsis'),
    )
    const emptyDisplay = ellipsisCells.find((cell) => cell.textContent === '—')
    // 거래처 컬럼 명시 스코프(행 인덱스 0=line-empty + data-label, Opus 재검 nit) — 메모(note)
    // 컬럼도 동일 라인에서 빈 문자열('')을 렌더해 textContent 전역 검색은 어느 셀을 잡았는지
    // 모호(디버깅 불명확) — 실패 시 즉시 대상 셀을 특정할 수 있도록 명시 스코프한다.
    const blankDisplay = bodyRows.item(0).querySelector<HTMLElement>(
      'td[data-label="거래처"] .journal-cell-ellipsis',
    )
    const valueDisplay = ellipsisCells.find((cell) => cell.textContent === '외상매출금')

    expect(emptyDisplay?.getAttribute('title')).toBeNull()
    expect(blankDisplay?.textContent).toBe('')
    expect(blankDisplay?.getAttribute('title')).toBeNull()
    expect(valueDisplay?.getAttribute('title')).toBe('외상매출금')
  })
})

describe('JournalDetailPage 모바일 합계 카드', () => {
  it('모바일 라인 카드의 계정명이 없으면 데스크톱과 같은 빈 값 표시를 렌더한다', async () => {
    mocks.isMobile.mockReturnValue(true)
    renderPage(makeJournal({
      lines: [
        {
          id: 'line-empty-account',
          lineNo: 1,
          accountCode: '102',
          accountName: null,
          debit: '1000',
          credit: '0',
          partnerName: '테스트 거래처',
          note: '메모',
          memo: '메모',
        },
      ],
    }))

    await screen.findByText('2026/07/03-1')

    const lines = screen.getByTestId('journal-mobile-lines')
    const firstCard = lines.querySelector<HTMLElement>('.mobile-item-card')
    const accountName = firstCard?.querySelector<HTMLElement>('.mobile-item-name')
    expect(firstCard).not.toBeNull()
    expect(accountName?.textContent).toBe('—')
    expect(within(firstCard!).queryByText('계정과목')).toBeNull()
  })

  it('라인 0건이면 모바일 합계 카드를 렌더하지 않는다', async () => {
    mocks.isMobile.mockReturnValue(true)
    renderPage(makeJournal({
      totalDebit: '0',
      totalCredit: '0',
      lines: [],
    }))

    await screen.findByText('2026/07/03-1')

    expect(screen.queryByTestId('journal-mobile-total')).toBeNull()
    expect(screen.queryByText('합계')).toBeNull()
  })

  it('라인 1건 이상이면 합계 카드에 차변/대변을 분리된 값으로 렌더한다(결합 문자열 폐기)', async () => {
    mocks.isMobile.mockReturnValue(true)
    renderPage(makeJournal({
      totalDebit: '1207338853',
      totalCredit: '1207338853',
    }))

    await screen.findByText('2026/07/03-1')

    const totalCard = screen.getByTestId('journal-mobile-total')
    expect(within(totalCard).getByText('합계')).not.toBeNull()
    expect(within(totalCard).getByText('차변')).not.toBeNull()
    expect(within(totalCard).getByText('대변')).not.toBeNull()
    // 차변/대변이 각자 별개 노드에 렌더 — 10자리 금액 결합 문자열("X / Y")은 더 이상 존재하지 않는다.
    expect(within(totalCard).getAllByText('1,207,338,853')).toHaveLength(2)
    expect(within(totalCard).queryByText('1,207,338,853 / 1,207,338,853')).toBeNull()
  })
})
