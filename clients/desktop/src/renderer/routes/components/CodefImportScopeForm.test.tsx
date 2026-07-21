// @vitest-environment jsdom

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CodefImportResultSummary, CodefImportScopeForm } from './CodefImportScopeForm'
import type { CodefImportResponse } from '../../api/codef'

const listCodefBankAccountsMock = vi.fn()
const listCodefCardsMock = vi.fn()
const listCodefLoansMock = vi.fn()
const loadCodefImportScopeMock = vi.fn()
const saveCodefImportScopeMock = vi.fn()
const importScopedCodefMock = vi.fn()
vi.mock('../../api/codef', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/codef')>()
  return {
    ...actual,
    listCodefBankAccounts: (...args: unknown[]) => listCodefBankAccountsMock(...args),
    listCodefCards: (...args: unknown[]) => listCodefCardsMock(...args),
    listCodefLoans: (...args: unknown[]) => listCodefLoansMock(...args),
    loadCodefImportScope: (...args: unknown[]) => loadCodefImportScopeMock(...args),
    saveCodefImportScope: (...args: unknown[]) => saveCodefImportScopeMock(...args),
    importScopedCodef: (...args: unknown[]) => importScopedCodefMock(...args),
  }
})

const baseResult: CodefImportResponse = {
  fetchedCount: 10,
  importedCount: 7,
  duplicateSkippedCount: 1,
  matchedCount: 5,
  staleSkippedCount: 0,
  staleNormalizedNames: [],
  unavailableSkippedCount: 0,
  unavailableNames: [],
}

afterEach(() => {
  cleanup()
})

describe('CodefImportResultSummary 보류 경고 (#810 R3 계약 pin)', () => {
  it('보류가 없으면 요약만 표시하고 경고 배너를 렌더하지 않는다', () => {
    render(<CodefImportResultSummary result={baseResult} />)
    expect(screen.getByTestId('codef-import-result')).toBeTruthy()
    expect(screen.queryByTestId('codef-stale-warning')).toBeNull()
    expect(screen.queryByTestId('codef-unavailable-warning')).toBeNull()
  })

  it('unavailable(일시장애)은 role=status 재시도 안내로 표시하고 대상 이름을 노출한다', () => {
    render(
      <CodefImportResultSummary
        result={{ ...baseResult, unavailableSkippedCount: 2, unavailableNames: ['삼한상사', '강남에어'] }}
      />,
    )
    const banner = screen.getByTestId('codef-unavailable-warning')
    expect(banner.getAttribute('role')).toBe('status')
    expect(banner.textContent).toContain('거래처 조회 일시 장애로 2건 매칭 보류')
    expect(banner.textContent).toContain('잠시 후 다시 가져오기 하세요')
    expect(banner.textContent).toContain('대상: 삼한상사, 강남에어')
    expect(screen.queryByTestId('codef-stale-warning')).toBeNull()
  })

  it('stale(영구·재선택)과 unavailable(일시·재시도)이 함께면 두 경고를 구분해 동시 표시한다', () => {
    render(
      <CodefImportResultSummary
        result={{
          ...baseResult,
          staleSkippedCount: 1,
          staleNormalizedNames: ['옛거래처'],
          unavailableSkippedCount: 3,
          unavailableNames: ['새거래처'],
        }}
      />,
    )
    const stale = screen.getByTestId('codef-stale-warning')
    const unavailable = screen.getByTestId('codef-unavailable-warning')
    expect(stale.getAttribute('role')).toBe('alert')
    expect(unavailable.getAttribute('role')).toBe('status')
    expect(stale.textContent).toContain('거래처 조회가 확인되지 않아 1건을 보류했습니다')
    expect(stale.textContent).toContain('대상: 옛거래처')
    expect(unavailable.textContent).toContain('거래처 조회 일시 장애로 3건 매칭 보류')
    expect(unavailable.textContent).toContain('대상: 새거래처')
  })
})

const BANK_A = { ref: '국민 123-456', name: '국민운영', bankName: '국민은행', accountNumber: '123-456' }
const CARD_A = { ref: '법인카드-001', name: '물류카드', issuerName: '신한카드', cardNumber: '9999' }

function renderForm(onImported = vi.fn(async () => undefined)) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <CodefImportScopeForm
        canCreate
        canUpdate
        initialFrom="2026-06-01"
        initialTo="2026-06-03"
        onToast={() => undefined}
        onImported={onImported}
      />
    </QueryClientProvider>,
  )
}

describe('CodefImportScopeForm — #825 슬5 R1 BLOCKING#1/H-4/item5 회귀', () => {
  afterEach(() => {
    cleanup()
    listCodefBankAccountsMock.mockReset()
    listCodefCardsMock.mockReset()
    listCodefLoansMock.mockReset()
    loadCodefImportScopeMock.mockReset()
    saveCodefImportScopeMock.mockReset()
    importScopedCodefMock.mockReset()
  })

  it('H-4 — 저장 scopeMode=ALL 로 재방문하면 미선택이 아닌 전체로 복원된다(refs=[] 를 미저장과 혼동하지 않음)', async () => {
    listCodefBankAccountsMock.mockResolvedValue([BANK_A])
    listCodefCardsMock.mockResolvedValue([CARD_A])
    listCodefLoansMock.mockResolvedValue([])
    // ALL 로 저장된 scope — refs 는 설계상 비어 있고 scopeMode 만이 유일한 신호다.
    loadCodefImportScopeMock.mockResolvedValue({
      connectedId: 'connected-main',
      accountRefs: [],
      cardRefs: [],
      loanRefs: [],
      defaultImportType: 'ALL',
      scopeMode: 'ALL',
    })

    renderForm()

    // 종전 결함: refs=[] 만 보고 '미저장'으로 오판 → 힌트가 나타나고 저장/가져오기가 잠김.
    // fix 후에는 scopeMode='ALL' 을 그대로 신뢰해 잠금 없이 복원되어야 한다. 저장 버튼이
    // 활성화되는 시점 = 4개 쿼리(계좌/카드/대출/scope) 모두 resolve + 복원 useEffect 완료.
    await waitFor(() => expect((screen.getByTestId('codef-save-scope-button') as HTMLButtonElement).disabled).toBe(false))
    expect(screen.queryByTestId('codef-scope-hint')).toBeNull()
    expect((screen.getByTestId('codef-import-button') as HTMLButtonElement).disabled).toBe(false)
    const allChipPressable = screen.getByTestId('codef-all-scope-chip').querySelector('[role="button"]')
    expect(allChipPressable?.getAttribute('aria-pressed')).toBe('true')
  })

  it('scopeMode=null(한 번도 저장한 적 없음)이면 미선택으로 초기화되어 잠긴다', async () => {
    listCodefBankAccountsMock.mockResolvedValue([BANK_A])
    listCodefCardsMock.mockResolvedValue([CARD_A])
    listCodefLoansMock.mockResolvedValue([])
    loadCodefImportScopeMock.mockResolvedValue({
      connectedId: 'connected-main',
      accountRefs: [],
      cardRefs: [],
      loanRefs: [],
      defaultImportType: 'ALL',
      scopeMode: null,
    })

    renderForm()

    const hint = await screen.findByTestId('codef-scope-hint')
    expect(hint.getAttribute('role')).toBe('status')
    expect((screen.getByTestId('codef-save-scope-button') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('codef-import-button') as HTMLButtonElement).disabled).toBe(true)
  })

  it('item5(type seam) — SELECTED 인데 type 전환으로 보이는 카테고리 선택이 0건이어도 refs 를 생략하지 않는다(서버 전수 열거로 새지 않음)', async () => {
    listCodefBankAccountsMock.mockResolvedValue([BANK_A])
    listCodefCardsMock.mockResolvedValue([CARD_A])
    listCodefLoansMock.mockResolvedValue([])
    // 저장된 SELECTED scope — 계좌만 선택, 카드는 선택 없음.
    loadCodefImportScopeMock.mockResolvedValue({
      connectedId: 'connected-main',
      accountRefs: [BANK_A.ref],
      cardRefs: [],
      loanRefs: [],
      defaultImportType: 'BANK',
      scopeMode: 'SELECTED',
    })
    importScopedCodefMock.mockResolvedValue({
      fetchedCount: 0, importedCount: 0, duplicateSkippedCount: 0, matchedCount: 0,
      staleSkippedCount: 0, staleNormalizedNames: [], unavailableSkippedCount: 0, unavailableNames: [],
    })

    renderForm()
    // 복원된 defaultImportType='BANK' 라 초기 type 은 BANK — 계좌 카테고리만 먼저 보인다.
    // 저장/가져오기 버튼이 활성화되는 시점 = 복원 useEffect 완료(scopeMode='SELECTED' 반영).
    await waitFor(() => expect((screen.getByTestId('codef-import-button') as HTMLButtonElement).disabled).toBe(false))
    await waitFor(() => expect(screen.getByTestId('codef-bank-account-select-all')).not.toBeNull())

    // 저장된 선택 그대로(restoredScope && !selectionDirty)면 explicit-empty triple 로
    // "저장 선택 사용"에 위임하므로, 이 seam 을 노출하려면 먼저 selectionDirty 를 만든다
    // (계좌 전체선택 체크박스를 껐다 다시 켜서 원복 — refs 는 동일해도 dirty=true 확정).
    fireEvent.click(screen.getByTestId('codef-bank-account-select-all'))
    fireEvent.click(screen.getByTestId('codef-bank-account-select-all'))

    // type 을 CARD 로 전환 — 화면엔 카드 카테고리만 보이고, 저장된 선택 중 카드는 0건이다.
    fireEvent.change(screen.getByTestId('codef-import-type'), { target: { value: 'CARD' } })
    await waitFor(() => expect((screen.getByTestId('codef-import-button') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByTestId('codef-import-button'))

    await waitFor(() => expect(importScopedCodefMock).toHaveBeenCalled())
    const payload = importScopedCodefMock.mock.calls[0]![0] as {
      type: string
      accountRefs?: string[]
      cardRefs?: string[]
      loanRefs?: string[]
    }
    // 핵심 단언 — 종전에는 카드 0건이면 refs 키 자체를 생략해 BE 가 "전체 미지정(null)"으로
    // 해석해 서버 전수 열거로 샜다. fix 후에는 cardRefs:[] 를 explicit 하게 보내 "0건"이
    // 그대로 "0건"으로 실행되어야 한다(화면=SELECTED·0개 ⟺ 실행=0개).
    expect(payload.type).toBe('CARD')
    expect(payload.cardRefs).toEqual([])
    expect(payload.accountRefs).toEqual([])
  })
})
