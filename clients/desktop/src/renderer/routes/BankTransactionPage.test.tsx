// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'
import { AxiosError } from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BankTransactionRow } from '../api/accounting'

vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({ canAccess: () => true, isLoading: false }),
}))
vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }))

const listBankTransactionsMock = vi.fn()
const listBankTransactionFilterLabelsMock = vi.fn()
const loadBankTransactionFilterPreferencesMock = vi.fn()
vi.mock('../api/accounting', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/accounting')>()
  return {
    ...actual,
    listBankTransactions: (...args: unknown[]) => listBankTransactionsMock(...args),
    listBankTransactionFilterLabels: (...args: unknown[]) => listBankTransactionFilterLabelsMock(...args),
    loadBankTransactionFilterPreferences: (...args: unknown[]) => loadBankTransactionFilterPreferencesMock(...args),
  }
})

// CodefImportScopeForm 는 별도 api/codef 모듈을 쓴다 — 실 apiClient 호출은 테스트 서버가 없어
// reject 되지만, 그 하위 폼 자체의 에러 처리는 본 테스트 범위가 아니므로 그대로 둔다.

import {
  BANK_TRANSACTION_LIST_COLUMN_KEYS,
  partnerMatchEvidence,
  partnerValueOf,
  BankTransactionPage,
} from './BankTransactionPage'

function partnerLookupUnavailableError(): AxiosError {
  return new AxiosError('Request failed', undefined, undefined, undefined, {
    data: {
      success: false,
      code: 'PARTNER_IDENTITY_LOOKUP_UNAVAILABLE',
      message: '거래처 조회를 일시적으로 할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    },
    status: 502,
    statusText: 'Bad Gateway',
    headers: {},
    config: {} as never,
  })
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <BankTransactionPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const sampleTxnRow: BankTransactionRow = {
  transactedAt: '2026-07-24T09:00:00',
  txnType: 'DEPOSIT',
  amount: '250000',
  description: '삼한공조 입금건',
  bankAccountLabel: '국민 운영계좌',
  source: 'CODEF_BANK',
  externalRef: 'ref-1',
  matchStatus: 'UNREFLECTED',
}

afterEach(() => {
  cleanup()
  listBankTransactionsMock.mockReset()
  listBankTransactionFilterLabelsMock.mockReset()
  loadBankTransactionFilterPreferencesMock.mockReset()
})

describe('BankTransactionPage — partner lookup UNAVAILABLE (#831 R-1, PM 라이브QA 확증)', () => {
  it('502 응답 시 빈 표(입출금 거래가 없습니다) 대신 장애 안내를 렌더한다 (G1)', async () => {
    listBankTransactionFilterLabelsMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    loadBankTransactionFilterPreferencesMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    listBankTransactionsMock.mockRejectedValue(partnerLookupUnavailableError())
    renderPage()

    await waitFor(() => expect(screen.getByTestId('bank-transaction-error')).toBeTruthy())
    expect(screen.getByTestId('bank-transaction-error').textContent).toContain('거래처 조회를 일시적으로 할 수 없습니다')
    expect(screen.queryByText('입출금 거래가 없습니다')).toBeNull()
  })

  it('502 응답 시 입금/출금/건수 요약이 0 으로 표시되지 않는다 (G1 — PM 라이브QA: 316행 중 4건 매칭 실패로 312행까지 함께 사라짐)', async () => {
    listBankTransactionFilterLabelsMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    loadBankTransactionFilterPreferencesMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    listBankTransactionsMock.mockRejectedValue(partnerLookupUnavailableError())
    renderPage()

    await waitFor(() => expect(screen.getByTestId('bank-transaction-error')).toBeTruthy())
    expect(screen.queryByText(/0건/)).toBeNull()
    expect(screen.queryByText(/입금 —/)).toBeNull()
  })

  it('다시 시도 버튼 클릭 시 refetch 한다 (G2 — 재시도 경로)', async () => {
    listBankTransactionFilterLabelsMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    loadBankTransactionFilterPreferencesMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    listBankTransactionsMock.mockRejectedValue(partnerLookupUnavailableError())
    renderPage()

    await waitFor(() => expect(screen.getByTestId('bank-transaction-error')).toBeTruthy())
    const callsBefore = listBankTransactionsMock.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(listBankTransactionsMock.mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('정상 응답에서는 표와 요약이 그대로 나온다 (무회귀)', async () => {
    listBankTransactionFilterLabelsMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    loadBankTransactionFilterPreferencesMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    listBankTransactionsMock.mockResolvedValue([sampleTxnRow])
    renderPage()

    expect(await screen.findByText('삼한공조 입금건')).toBeTruthy()
    expect(screen.getByText(/입금 250,000/)).toBeTruthy()
    expect(screen.queryByTestId('bank-transaction-error')).toBeNull()
  })
})

const baseRow: BankTransactionRow = {
  transactedAt: '2026-07-17T09:00:00',
  txnType: 'DEPOSIT',
  amount: '1000',
  description: '입금',
  bankAccountLabel: '국민 운영계좌',
  source: 'CSV_IMPORT',
  externalRef: 'evidence-test',
  matchStatus: 'UNREFLECTED',
  matchedPartnerCode: 'P-0001',
  matchedPartnerName: '테스트 거래처',
}

describe('partnerValueOf 거래처코드/사업자번호 분리', () => {
  it('입출금 매칭에 사업자번호만 있을 때 거래처코드 슬롯으로 복사하지 않는다', () => {
    expect(partnerValueOf({
      ...baseRow,
      matchedPartnerCode: null,
      matchedBizNo: '1130710031',
      matchedPartnerName: '테스트 거래처',
    })).toEqual({
      partnerCode: '',
      name: '테스트 거래처',
      bizNo: '1130710031',
    })
  })
})

describe('BankTransactionPage 매칭근거 배지', () => {
  it.each([
    ['MANUAL', '수동'],
    ['DEPOSITOR_MAPPING', '자동·입금자명'],
    ['PARTNER_CODE_EXACT', '자동·코드일치'],
  ] as const)('근거 %s를 %s로 표시한다', (source, label) => {
    render(<>{partnerMatchEvidence({ ...baseRow, partnerMatchSource: source })}</>)
    expect(screen.getByText(label)).toBeTruthy()
  })

  it('입금자명 규칙 원본명을 tooltip으로 제공한다', () => {
    render(
      <>{partnerMatchEvidence({
        ...baseRow,
        partnerMatchSource: 'DEPOSITOR_MAPPING',
        appliedMappingRawName: '삼한상사',
      })}</>,
    )
    expect(screen.getByTitle("입금자명 '삼한상사' 규칙 적용")).toBeTruthy()
  })

  it('미매칭 근거가 null이면 배지를 렌더링하지 않는다', () => {
    const { container } = render(<>{partnerMatchEvidence({ ...baseRow, partnerMatchSource: null })}</>)
    expect(container.innerHTML).toBe('')
  })
})

describe('BankTransactionPage 열 계층화 (#897)', () => {
  it('상세 disclosure는 좁은 상세 셀이 아니라 표 밖 전폭 패널에 연결된다', async () => {
    listBankTransactionFilterLabelsMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    loadBankTransactionFilterPreferencesMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    listBankTransactionsMock.mockResolvedValue([{
      ...baseRow,
      externalRef: 'wide-detail-test',
      counterpartyAccount: '국민 123-456',
      cashReceiptSlipNo: '2026/07/04-11',
      partnerMatchSource: 'MANUAL',
    } satisfies BankTransactionRow])

    renderPage()

    const table = await screen.findByRole('table')
    const toggle = await screen.findByTestId('bank-transaction-detail-toggle-wide-detail-test')
    fireEvent.click(toggle)

    const panel = await screen.findByTestId('bank-transaction-detail-wide-detail-test')
    expect(table.contains(panel)).toBe(false)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(panel.textContent).toContain('국민 123-456')
    expect(panel.textContent).toContain('2026/07/04-11')
  })

  it('열 집합 상수는 화면 순서를 직접 표현하고 목록 필터의 뒤늦은 no-op가 아니다', () => {
    expect(BANK_TRANSACTION_LIST_COLUMN_KEYS).toEqual([
      'depositReceiptSelection',
      'transactedAt',
      'description',
      'matchedPartnerCode',
      'depositAmount',
      'withdrawalAmount',
      'balanceAfter',
      'source',
      'matchStatus',
      'detail',
    ])
  })

  it('목록은 핵심 열만 노출하고 상세 disclosure에서 감춘 원본 값을 실제로 확인한다', async () => {
    listBankTransactionFilterLabelsMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    loadBankTransactionFilterPreferencesMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    listBankTransactionsMock.mockResolvedValue([{
      ...baseRow,
      txnType: 'DEPOSIT',
      amount: '123000',
      balanceAfter: '456000',
      description: '입금 원문 적요',
      counterpartyName: '원문 거래처',
      counterpartyAccount: '국민 123-456',
      bankAccountLabel: '국민 운영계좌',
      source: 'CODEF_BANK',
      cardName: null,
      approvalId: null,
      loanName: null,
      partnerMatchSource: 'MANUAL',
      appliedMappingRawName: null,
    } satisfies BankTransactionRow])

    renderPage()

    const table = await screen.findByRole('table')
    await screen.findByText('입금 원문 적요')
    const headers = within(table).getAllByRole('columnheader').map((cell) => cell.textContent)
    expect(headers).toEqual([
      '선택',
      '거래일',
      '적요',
      '거래처',
      '입금',
      '출금',
      '잔액',
      '소스',
      '매칭상태',
      '상세',
    ])
    expect(within(table).queryByRole('columnheader', { name: '계좌/카드/대출' })).toBeNull()
    expect(within(table).queryByRole('columnheader', { name: '거래후잔액' })).toBeNull()

    const detailToggle = within(table).getByTestId('bank-transaction-detail-toggle-evidence-test')
    fireEvent.click(detailToggle)
    const details = screen.getByTestId('bank-transaction-detail-evidence-test')
    expect(details.textContent).toContain('국민 운영계좌')
    expect(details.textContent).toContain('국민 123-456')
    expect(details.textContent).toContain('계좌')
  })

  it('핵심 입금/출금 열과 매칭 조작 버튼은 좁은 화면에서도 DOM에 남는다', async () => {
    listBankTransactionFilterLabelsMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    loadBankTransactionFilterPreferencesMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    listBankTransactionsMock.mockResolvedValue([{
      ...baseRow,
      matchedPartnerCode: 'P-0001',
      matchedPartnerName: '테스트 거래처',
      partnerMatchSource: 'MANUAL',
    } satisfies BankTransactionRow])

    renderPage()

    const clearButton = await screen.findByRole('button', { name: '이 거래만 해제' })
    expect(clearButton).toBeTruthy()
    expect(clearButton.hasAttribute('disabled')).toBe(false)
    expect(screen.getByRole('columnheader', { name: '입금' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: '출금' })).toBeTruthy()
  })

  it('[머지 전 재수렴 R2] 계좌만 다른 두 행이 목록(상세를 열지 않고)에서 서로 다르게 렌더된다', async () => {
    listBankTransactionFilterLabelsMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    loadBankTransactionFilterPreferencesMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    // 리뷰 재현(#929 머지 전 재수렴)과 동일한 시그니처 — 날짜·적요·거래처·금액·잔액·소스·
    // 매칭상태가 전부 같고 계좌만 다른 두 행. 실측: "2026-06-03 09:00 | 미상 입금
    // 알수없는입금자 | | 99,000 | — | — | 계좌 | 미반영"가 13행 완전 동일했다.
    const sharedFields = {
      transactedAt: '2026-06-03T09:00:00',
      txnType: 'DEPOSIT' as const,
      amount: '99000',
      balanceAfter: null,
      description: '미상 입금',
      counterpartyName: '알수없는입금자',
      source: 'CODEF_BANK' as const,
      matchStatus: 'UNREFLECTED' as const,
    }
    listBankTransactionsMock.mockResolvedValue([
      { ...sharedFields, externalRef: 'dup-a', bankAccountLabel: '국민 123456-78-901234' },
      { ...sharedFields, externalRef: 'dup-b', bankAccountLabel: '신한 777-888' },
    ] satisfies BankTransactionRow[])

    renderPage()

    const table = await screen.findByRole('table')
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(3)) // 헤더 1 + 데이터 2
    const dataRows = within(table).getAllByRole('row').slice(1)
    const rowSignature = (row: HTMLElement) =>
      within(row).getAllByRole('cell')
        .map((cell) => cell.textContent?.trim() ?? '')
        .join('|')
    const [sigA, sigB] = dataRows.map(rowSignature)

    // 상세를 열지 않은 상태(C5) — 계좌만 다른 두 행이 완전히 동일하게 보이면 안 된다.
    expect(sigA, `계좌만 다른 두 행이 목록에서 완전히 동일하게 렌더됨: ${sigA}`).not.toBe(sigB)
    expect(dataRows[0]?.textContent).toContain('국민 123456-78-901234')
    expect(dataRows[1]?.textContent).toContain('신한 777-888')
  })

  it('[머지 전 재수렴 S1] 계좌·카드·대출 등 패널 필드가 같은 두 거래도 패널 안에서 서로 다른 거래로 식별된다', async () => {
    listBankTransactionFilterLabelsMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    loadBankTransactionFilterPreferencesMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    // 패널이 지금까지 렌더하던 필드(계좌·소스·카드·승인번호·대출명·전표·매칭근거·원문)를
    // 전부 동일하게 두고, 패널에 없던 필드(거래일·적요·거래처·금액)만 다르게 한다 —
    // 리뷰 실측("5행이 같은 패널")과 동일 구도.
    const sharedPanelFields = {
      bankAccountLabel: '국민 운영계좌',
      source: 'CODEF_BANK' as const,
      matchStatus: 'UNREFLECTED' as const,
      cardName: null,
      approvalId: null,
      loanName: null,
      cashReceiptSlipNo: null,
      partnerMatchSource: null,
      appliedMappingRawName: null,
    }
    const rowA: BankTransactionRow = {
      ...sharedPanelFields,
      transactedAt: '2026-07-20T09:00:00',
      txnType: 'DEPOSIT',
      amount: '111000',
      description: '적요A',
      counterpartyName: '거래처A',
      externalRef: 'panel-a',
    }
    const rowB: BankTransactionRow = {
      ...sharedPanelFields,
      transactedAt: '2026-07-21T10:00:00',
      txnType: 'DEPOSIT',
      amount: '222000',
      description: '적요B',
      counterpartyName: '거래처B',
      externalRef: 'panel-b',
    }
    listBankTransactionsMock.mockResolvedValue([rowA, rowB])

    renderPage()

    await screen.findByTestId('bank-transaction-detail-toggle-panel-a')
    fireEvent.click(screen.getByTestId('bank-transaction-detail-toggle-panel-a'))
    const panelA = await screen.findByTestId('bank-transaction-detail-panel-a')
    expect(panelA.textContent).toContain('적요A')
    expect(panelA.textContent).toContain('거래처A')
    expect(panelA.textContent).toContain('111,000')

    fireEvent.click(screen.getByTestId('bank-transaction-detail-toggle-panel-b'))
    const panelB = await screen.findByTestId('bank-transaction-detail-panel-b')
    expect(panelB.textContent, `패널이 서로 다른 거래를 구별하지 못함: ${panelB.textContent}`).toContain('적요B')
    expect(panelB.textContent).toContain('거래처B')
    expect(panelB.textContent).toContain('222,000')
    expect(panelB.textContent).not.toContain('적요A')
  })

  it('[머지 전 재수렴 S2] 패널 내부에 닫기 컨트롤이 있고, 펼친 행이 화면 표식을 유지한다', async () => {
    listBankTransactionFilterLabelsMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    loadBankTransactionFilterPreferencesMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    listBankTransactionsMock.mockResolvedValue([{
      ...baseRow,
      externalRef: 'close-test',
    } satisfies BankTransactionRow])

    renderPage()

    const toggle = await screen.findByTestId('bank-transaction-detail-toggle-close-test')
    fireEvent.click(toggle)
    const panel = await screen.findByTestId('bank-transaction-detail-close-test')

    // 펼친 행은 시각적 표식을 갖는다 — 패널이 화면 밖으로 스크롤돼도 되돌아왔을 때
    // 어느 행이 펼쳐진 상태인지 식별할 수 있다(리뷰 실측: 14행 전수 표식 없음).
    const rowEl = toggle.closest('tr')
    expect(rowEl?.className, `펼친 행에 시각 표식이 없음: ${rowEl?.className}`).toContain('bank-transaction-row-expanded')

    // 패널 안에 닫기 컨트롤이 있다 — 원행까지 스크롤해 올라가지 않아도 접을 수 있다
    // (리뷰 실측: 패널 내부 조작 컨트롤 0개).
    const closeButton = within(panel).getByRole('button', { name: /닫기/ })
    fireEvent.click(closeButton)
    await waitFor(() => expect(screen.queryByTestId('bank-transaction-detail-close-test')).toBeNull())
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(rowEl?.className).not.toContain('bank-transaction-row-expanded')
  })

  it('[#929 재수렴 T3] 선택 0건일 때 일괄 처리 바의 합산이 —원이 아니라 단위 없는 —로 표시된다', async () => {
    // [머지 전 재수렴 S5] fmtKrw 는 고쳤지만 같은 계약(0/null → '—')을 공유하는
    // formatCashReceiptAmount 호출부는 놓쳤다 — 선택 0건이면 totalAmount=0 이고
    // formatCashReceiptAmount(0) === '—' 뒤에 무조건 '원'을 붙여 '—원'이 됐다.
    listBankTransactionFilterLabelsMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    loadBankTransactionFilterPreferencesMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    listBankTransactionsMock.mockResolvedValue([])
    renderPage()

    const bulkBar = await screen.findByTestId('bank-transaction-bulk-bar')
    expect(within(bulkBar).queryByText(/—원/), `일괄바 합산에 단위 붙은 placeholder 잔존: ${bulkBar.textContent}`).toBeNull()
    // '합산' 뒤 정확히 단위 없는 '—' — '거래처' 열도 같은 '—' 를 렌더하므로(무관한 placeholder)
    // getByText('—') 단일 매치 단정 대신 '합산' 텍스트를 담은 span 을 직접 좁혀 확인한다.
    const amountSpan = Array.from(bulkBar.querySelectorAll('span'))
      .find((el) => el.textContent?.trim().startsWith('합산'))
    expect(amountSpan, '합산 span 을 찾을 수 없음').toBeTruthy()
    expect(amountSpan!.textContent).toBe('합산 —')
  })

  it('[#929 재수렴 T3] 상세 패널 머리글의 금액이 0원이면 —원이 아니라 —로 표시된다', async () => {
    listBankTransactionFilterLabelsMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    loadBankTransactionFilterPreferencesMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    listBankTransactionsMock.mockResolvedValue([{
      ...baseRow,
      externalRef: 'zero-amount-detail',
      amount: '0',
    } satisfies BankTransactionRow])
    renderPage()

    fireEvent.click(await screen.findByTestId('bank-transaction-detail-toggle-zero-amount-detail'))
    const panel = await screen.findByTestId('bank-transaction-detail-zero-amount-detail')
    const scopeHeader = within(panel).getByTestId('bank-transaction-detail-scope-zero-amount-detail')
    expect(scopeHeader.textContent, `상세 패널 머리글에 '—원' 잔존: ${scopeHeader.textContent}`).not.toContain('—원')
  })

  it('[#929 재수렴 T4] 재조회로 행 DOM 이 재생성돼도 닫기가 원래 토글 버튼으로 포커스를 되돌린다', async () => {
    // 쿼리 키(activeTab 포함)가 바뀌면 로딩 중 rows=[] 를 거쳐 행 DOM 이 전부
    // 언마운트되고 새 노드로 재생성된다 — lastToggleButtonRef 가 잡고 있던 노드는
    // detached 상태가 되어 focus()/scrollIntoView() 가 무동작이었다.
    listBankTransactionFilterLabelsMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    loadBankTransactionFilterPreferencesMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    const requeryRow: BankTransactionRow = {
      ...baseRow,
      externalRef: 'requery-test',
      matchStatus: 'UNREFLECTED',
    }
    listBankTransactionsMock.mockResolvedValue([requeryRow])
    renderPage()

    const toggleBefore = await screen.findByTestId('bank-transaction-detail-toggle-requery-test')
    fireEvent.click(toggleBefore)
    await screen.findByTestId('bank-transaction-detail-requery-test')

    // activeTab 은 transactionsQuery 의 queryKey 일부 — 탭 전환이 재조회를 유발한다.
    fireEvent.click(screen.getByRole('button', { name: '미반영', exact: true }))
    await waitFor(() => {
      const toggleAfter = screen.getByTestId('bank-transaction-detail-toggle-requery-test')
      expect(toggleAfter, '재조회 후에도 동일 DOM 노드 — 이 테스트 전제(재생성)가 재현되지 않음').not.toBe(toggleBefore)
    })
    const panel = await screen.findByTestId('bank-transaction-detail-requery-test')

    fireEvent.click(within(panel).getByRole('button', { name: /닫기/ }))

    await waitFor(() => {
      const liveToggle = screen.getByTestId('bank-transaction-detail-toggle-requery-test')
      expect(document.activeElement, '포커스가 body 로 소실됨(원행 토글로 복귀 실패)').toBe(liveToggle)
    })
  })

  it('[#929 재수렴 3차 V2] externalRef 가 중복인 행에서도 닫기가 클릭한 바로 그 행으로 복귀한다', async () => {
    // CARD/LOAN 소스는 (날짜, 순번) 기반 참조를 계좌마다 재사용한다(리뷰 실측: 기본 화면
    // 28행 중 10그룹 24행이 externalRef 중복, DB 실측 최대 12행). data-testid 가
    // externalRef 단독으로만 만들어지면 두 행이 같은 testid 를 공유한다 — 닫기가
    // document 순서상 첫 매치(1번째 행)로 복귀하면 실제 클릭한 2번째 행과 어긋난다.
    listBankTransactionFilterLabelsMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    loadBankTransactionFilterPreferencesMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    const dupExternalRef = 'CARD-2026-07-03-001'
    const rowFirst: BankTransactionRow = {
      ...baseRow,
      externalRef: dupExternalRef,
      bankAccountLabel: '삼한 법인카드 1111',
      amount: '30000',
      description: '적요-첫번째',
    }
    const rowTarget: BankTransactionRow = {
      ...baseRow,
      externalRef: dupExternalRef,
      bankAccountLabel: '삼한 법인카드 3333',
      amount: '50000',
      description: '적요-대상',
    }
    listBankTransactionsMock.mockResolvedValue([rowFirst, rowTarget])

    renderPage()

    const toggles = await screen.findAllByTestId(`bank-transaction-detail-toggle-${dupExternalRef}`)
    expect(toggles, 'externalRef 중복 전제(2행)가 재현되지 않음').toHaveLength(2)
    const targetToggle = toggles[1] // 2번째(대상) 행 — 첫 번째가 아니라 이 행을 클릭한다.

    fireEvent.click(targetToggle)
    const panel = await screen.findByTestId(`bank-transaction-detail-${dupExternalRef}`)
    expect(panel.textContent, `2번째(대상) 행의 패널이 열리지 않음: ${panel.textContent}`).toContain('적요-대상')

    fireEvent.click(within(panel).getByRole('button', { name: /닫기/ }))

    await waitFor(() => {
      const active = document.activeElement as HTMLButtonElement | null
      expect(
        active,
        `포커스가 클릭한 2번째 행이 아니라 다른 요소로 감: ${active?.dataset?.testid ?? active?.tagName}`,
      ).toBe(targetToggle)
    })
  })

  it('[#929 재수렴 4차 R-1] aria-controls 는 존재하는 요소만 가리킨다 (기본 화면·개방 후 모두)', async () => {
    // 패널은 열린 1행에만 렌더된다(BankTransactionPage.tsx: expandedRow ? <Panel/> : null).
    // 그런데 토글은 행마다 렌더되며 전부 aria-controls 로 패널 id 를 선언한다 —
    // 닫힌 행의 aria-controls 는 존재하지 않는 id 를 가리키고(dangling), externalRef 가
    // 중복인 행에서는 "남이 연 패널"을 자기 것으로 선언한다(리뷰 실측 [D4]).
    // 레포 정본 패턴은 AsyncAutocomplete.tsx:527 `aria-controls={hasListbox ? listId : undefined}`.
    listBankTransactionFilterLabelsMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    loadBankTransactionFilterPreferencesMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    const dupExternalRef = 'CARD-2026-07-03-777'
    const rows: BankTransactionRow[] = [
      { ...baseRow, externalRef: dupExternalRef, bankAccountLabel: '삼한 법인카드 1111', amount: '30000', description: '적요-첫번째' },
      { ...baseRow, externalRef: dupExternalRef, bankAccountLabel: '삼한 법인카드 3333', amount: '50000', description: '적요-대상' },
      { ...baseRow, externalRef: 'REF-UNIQUE-1', bankAccountLabel: '국민 운영계좌', amount: '70000', description: '적요-단독' },
    ]
    listBankTransactionsMock.mockResolvedValue(rows)

    renderPage()
    await screen.findAllByTestId(`bank-transaction-detail-toggle-${dupExternalRef}`)

    const danglingOf = () =>
      Array.from(document.querySelectorAll('[aria-controls]'))
        .map((el) => ({ el, id: el.getAttribute('aria-controls') as string }))
        .filter(({ id }) => document.getElementById(id) === null)
        .map(({ el, id }) => `${el.getAttribute('data-testid') ?? el.tagName}->#${id}`)

    // (1) 기본 화면 — 패널이 하나도 없으므로 aria-controls 가 있으면 전부 dangling 이다.
    expect(danglingOf(), `기본 화면 dangling aria-controls: ${danglingOf().join(', ')}`).toEqual([])

    // (2) 한 행을 연 뒤 — 열린 행 외의 토글은 존재하는 패널을 가리켜서도 안 된다.
    const toggles = await screen.findAllByTestId(`bank-transaction-detail-toggle-${dupExternalRef}`)
    fireEvent.click(toggles[1])
    await screen.findByRole('region', { name: /적요-대상 상세/ })

    expect(danglingOf(), `개방 후 dangling aria-controls: ${danglingOf().join(', ')}`).toEqual([])

    const collapsedPointingAtSomePanel = Array.from(
      document.querySelectorAll('button[aria-expanded="false"][aria-controls]'),
    ).map((el) => `${el.getAttribute('data-row-key')}->#${el.getAttribute('aria-controls')}`)
    expect(
      collapsedPointingAtSomePanel,
      `닫힌 토글이 남의 패널을 자기 것으로 선언함: ${collapsedPointingAtSomePanel.join(', ')}`,
    ).toEqual([])
  })

  it('소스·매칭상태 열은 기존 탭별 조건부 표시 규칙을 유지한다', async () => {
    listBankTransactionFilterLabelsMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    loadBankTransactionFilterPreferencesMock.mockResolvedValue({ accountLabels: [], cardLabels: [] })
    listBankTransactionsMock.mockResolvedValue([baseRow])

    renderPage()

    let table = await screen.findByRole('table')
    expect(within(table).getByRole('columnheader', { name: '소스' })).toBeTruthy()
    expect(within(table).getByRole('columnheader', { name: '매칭상태' })).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: '계좌' }))
    table = await screen.findByRole('table')
    await waitFor(() => expect(within(table).queryByRole('columnheader', { name: '소스' })).toBeNull())
    expect(within(table).getByRole('columnheader', { name: '매칭상태' })).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: '전체' }))
    fireEvent.click(screen.getByRole('button', { name: '미반영', exact: true }))
    table = await screen.findByRole('table')
    await waitFor(() => expect(within(table).queryByRole('columnheader', { name: '매칭상태' })).toBeNull())
    expect(within(table).getByRole('columnheader', { name: '소스' })).toBeTruthy()
  })
})
