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

  /*
   * #825 슬5 R3 HIGH-5 — OPUS 4.8 R3 가 이 it.each 를 HEAD 무수정 상태에서 연속 4회 실행 중
   * 2회 RED(저장된 BANK 케이스가 "type":"ALL" 을 수신 — R2 fix 이전 값과 정확히 일치)를
   * 관측했으나, 이후 it.each 4회/describe 5회/전체파일 6회 = 15회 연속 green 으로도 재현하지
   * 못했다(genuine RED 로 확정도, 무마도 하지 않고 다음 라운드로 이월).
   *
   * SONNET5 R3 fix 라운드에서 재조사한 결과:
   * 1) 재현 시도 — 이 파일 단독 반복 10회 green(각 12/12) + 이 파일을 포함한 desktop 전체
   *    vitest 스위트(134 파일/1031 테스트)를 3개 프로세스로 동시 기동해 CPU 경합을 인위적으로
   *    유발한 상태에서 이 파일만 추가로 12회 더 반복 실행 — 전부 green(22회 연속, 3개 동시
   *    스위트 각 1031/1031 통과 포함). 어떤 조합으로도 재현하지 못했다.
   * 2) 코드 경로 분석 — branch A 페이로드의 type 필드(:330)는 상태변수 type 이 아닌
   *    restoredScope.defaultImportType 을 직접 읽는다. restoredScope/scopeMode/type 은
   *    전부 같은 useEffect 콜백 안에서 setState 되어 React 18 자동 배칭으로 **한 렌더에 함께
   *    커밋**된다 — 즉 "가져오기 버튼이 활성화된 렌더" 라면 그 시점에 restoredScope 도 이미
   *    같은 배치로 갱신돼 있어야 하며, 두 값이 같은 렌더 내에서 서로 다른 시점에 관측되는
   *    동기적 경쟁 창이 코드상 성립하지 않는다.
   * 3) 독립 근거 — R3 라이브 QA(§보충3, 실서버+DB 교차검증)가 BANK/CARD/LOAN/ALL 4조합
   *    전부 정확한 결과를 냈음을 이미 확증했다(제품 결함이면 라이브에서도 나타났어야 한다).
   *
   * 결론 — 재현 실패 + 배칭 분석 + 독립 라이브 검증 3가지가 모두 "제품 결함 아님" 을
   * 가리킨다. 다만 정확한 교차오염 메커니즘을 확정하지는 못했다(브리프가 요구하는 "원인
   * 규명"을 완전히 충족하지 못함 — 정직 고지). 테스트 자체는 이미 올바른 것을 올바르게
   * 단언하고 있어 로직을 바꾸지 않았다 — 근거 없는 재작성은 오히려 방어력을 흐릴 수 있다.
   * 재발 시 CI 실행 로그(워커 인덱스·동시 실행 파일 수)를 함께 남겨 재조사할 것.
   */
  it.each(['CARD', 'BANK', 'LOAN', 'ALL'] as const)(
    'R2 BLOCKING-1 — 저장된 %s+ALL 은 가져오기 type을 저장된 defaultImportType으로 유지하고 refs를 생략한다',
    async (defaultImportType) => {
      listCodefBankAccountsMock.mockResolvedValue([BANK_A])
      listCodefCardsMock.mockResolvedValue([CARD_A])
      listCodefLoansMock.mockResolvedValue([])
      loadCodefImportScopeMock.mockResolvedValue({
        connectedId: 'connected-main',
        accountRefs: [],
        cardRefs: [],
        loanRefs: [],
        defaultImportType,
        scopeMode: 'ALL',
      })
      importScopedCodefMock.mockResolvedValue(baseResult)

      renderForm()
      await waitFor(() => expect((screen.getByTestId('codef-import-button') as HTMLButtonElement).disabled).toBe(false))
      fireEvent.click(screen.getByTestId('codef-import-button'))

      await waitFor(() => expect(importScopedCodefMock).toHaveBeenCalledTimes(1))
      expect(importScopedCodefMock.mock.calls[0]![0]).toMatchObject({
        type: defaultImportType,
        scopeMode: 'ALL',
      })
      expect(importScopedCodefMock.mock.calls[0]![0]).not.toHaveProperty('accountRefs')
      expect(importScopedCodefMock.mock.calls[0]![0]).not.toHaveProperty('cardRefs')
      expect(importScopedCodefMock.mock.calls[0]![0]).not.toHaveProperty('loanRefs')
    },
  )

  it('HIGH-4(R3) — 브랜치 B: 저장 scopeMode=SELECTED 로 재방문 후 저장 refs를 실행 계약에 명시한다', async () => {
    listCodefBankAccountsMock.mockResolvedValue([BANK_A])
    listCodefCardsMock.mockResolvedValue([CARD_A])
    listCodefLoansMock.mockResolvedValue([])
    // 저장된 SELECTED scope — 계좌 1건 선택. 위 R2 BLOCKING-1 it.each 는 scopeMode='ALL'
    // (branch A, buildImportPayload:320-332)만 커버한다. 이 테스트는 scopeMode='SELECTED'
    // (branch B, :334-345)를 재방문 직후 어떤 상호작용(체크박스/타입 전환)도 없이(선택 그대로
    // = selectionDirty=false 유지) 곧바로 가져오기를 눌러 정확히 그 경로를 탄다 — 기존
    // "item5(type seam)" 테스트는 이 branch B 를 의도적으로 우회(dirty 강제)했고, "기존
    // 빈-ref SELECTED" 테스트는 refs 가 비어 애초에 가져오기가 잠겨 있었다.
    loadCodefImportScopeMock.mockResolvedValue({
      connectedId: 'connected-main',
      accountRefs: [BANK_A.ref],
      cardRefs: [],
      loanRefs: [],
      defaultImportType: 'BANK',
      scopeMode: 'SELECTED',
    })
    importScopedCodefMock.mockResolvedValue(baseResult)

    renderForm()
    await waitFor(() => expect((screen.getByTestId('codef-import-button') as HTMLButtonElement).disabled).toBe(false))

    fireEvent.click(screen.getByTestId('codef-import-button'))

    await waitFor(() => expect(importScopedCodefMock).toHaveBeenCalledTimes(1))
    // 핵심 단언 — branch B는 저장된 선택을 scopeMode=SELECTED와 세 배열로 함께 보낸다.
    expect(importScopedCodefMock.mock.calls[0]![0]).toMatchObject({
      type: 'ALL',
      scopeMode: 'SELECTED',
      accountRefs: [BANK_A.ref],
      cardRefs: [],
      loanRefs: [],
    })
  })

  it('저장된 ALL의 유형을 바꾼 뒤 저장하지 않으면 권위값 불일치로 가져오기를 잠근다', async () => {
    listCodefBankAccountsMock.mockResolvedValue([BANK_A])
    listCodefCardsMock.mockResolvedValue([CARD_A])
    listCodefLoansMock.mockResolvedValue([])
    loadCodefImportScopeMock.mockResolvedValue({
      connectedId: 'connected-main',
      accountRefs: [],
      cardRefs: [],
      loanRefs: [],
      defaultImportType: 'CARD',
      scopeMode: 'ALL',
    })

    renderForm()
    await waitFor(() => expect((screen.getByTestId('codef-import-button') as HTMLButtonElement).disabled).toBe(false))

    fireEvent.change(screen.getByTestId('codef-import-type'), { target: { value: 'BANK' } })

    expect((screen.getByTestId('codef-save-scope-button') as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByTestId('codef-import-button') as HTMLButtonElement).disabled).toBe(true)
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

  it('기존 빈-ref SELECTED 행은 복원 실패를 안내하고 저장·가져오기를 잠근다', async () => {
    listCodefBankAccountsMock.mockResolvedValue([BANK_A])
    listCodefCardsMock.mockResolvedValue([CARD_A])
    listCodefLoansMock.mockResolvedValue([])
    loadCodefImportScopeMock.mockResolvedValue({
      connectedId: 'connected-main',
      accountRefs: [],
      cardRefs: [],
      loanRefs: [],
      defaultImportType: 'ALL',
      scopeMode: 'SELECTED',
    })

    renderForm()

    const invalidHint = await screen.findByTestId('codef-restored-scope-invalid')
    expect(invalidHint.getAttribute('role')).toBe('alert')
    expect(invalidHint.textContent).toContain('다시 선택하거나')
    expect((screen.getByTestId('codef-save-scope-button') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('codef-import-button') as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByTestId('codef-bank-account-0'))
    await waitFor(() => expect((screen.getByTestId('codef-save-scope-button') as HTMLButtonElement).disabled).toBe(false))
  })

  it('canUpdate=false이면 전체 칩이 포커스 가능한 무반응 버튼으로 남지 않는다', async () => {
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

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <CodefImportScopeForm
          canCreate={false}
          canUpdate={false}
          initialFrom="2026-06-01"
          initialTo="2026-06-03"
          onToast={() => undefined}
          onImported={vi.fn(async () => undefined)}
        />
      </QueryClientProvider>,
    )

    const chip = await screen.findByTestId('codef-all-scope-chip')
    expect(chip.querySelector('[role="button"]')).toBeNull()
    expect(chip.getAttribute('role')).toBeNull()
    expect(chip.getAttribute('tabindex')).toBeNull()
    expect(chip.getAttribute('aria-disabled')).toBeNull()
    expect(chip.getAttribute('aria-pressed')).toBeNull()
    expect((screen.getByTestId('codef-import-type') as HTMLSelectElement).disabled).toBe(true)
  })

  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ] as const)('권한 조합 %s/%s에서 범위 조작은 UPDATE, 가져오기는 CREATE만 따른다', async (canCreate, canUpdate) => {
    listCodefBankAccountsMock.mockResolvedValue([BANK_A])
    listCodefCardsMock.mockResolvedValue([CARD_A])
    listCodefLoansMock.mockResolvedValue([])
    loadCodefImportScopeMock.mockResolvedValue({
      connectedId: 'connected-main', accountRefs: [BANK_A.ref], cardRefs: [], loanRefs: [],
      defaultImportType: 'BANK', scopeMode: 'SELECTED',
    })
    importScopedCodefMock.mockResolvedValue(baseResult)

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <CodefImportScopeForm
          canCreate={canCreate}
          canUpdate={canUpdate}
          initialFrom="2026-06-01"
          initialTo="2026-06-03"
          onToast={() => undefined}
          onImported={vi.fn(async () => undefined)}
        />
      </QueryClientProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('codef-import-button')).not.toBeNull())
    const allChip = screen.getByTestId('codef-all-scope-chip')
    const selectedCheckbox = await screen.findByTestId('codef-bank-account-0') as HTMLInputElement
    const selectedChip = screen.getByTestId('codef-selected-chip')
    expect(allChip.querySelector('[role="button"]') !== null).toBe(canUpdate)
    expect(selectedCheckbox.disabled).toBe(!canUpdate)
    expect(selectedChip.querySelector('button')).toBe(canUpdate ? selectedChip.querySelector('button') : null)
    expect((screen.getByTestId('codef-save-scope-button') as HTMLButtonElement).disabled).toBe(!canUpdate)
    expect((screen.getByTestId('codef-import-button') as HTMLButtonElement).disabled).toBe(!canCreate)
  })

  it('SELECTED 범위를 다른 빈 카테고리로 전환하면 실서버 400 조작을 활성화하지 않는다', async () => {
    listCodefBankAccountsMock.mockResolvedValue([BANK_A])
    listCodefCardsMock.mockResolvedValue([CARD_A])
    listCodefLoansMock.mockResolvedValue([])
    loadCodefImportScopeMock.mockResolvedValue({
      connectedId: 'connected-main', accountRefs: [BANK_A.ref], cardRefs: [], loanRefs: [],
      defaultImportType: 'BANK', scopeMode: 'SELECTED',
    })
    renderForm()
    await waitFor(() => expect((screen.getByTestId('codef-import-button') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.change(screen.getByTestId('codef-import-type'), { target: { value: 'CARD' } })
    await waitFor(() => expect((screen.getByTestId('codef-import-button') as HTMLButtonElement).disabled).toBe(true))
    expect(screen.getByTestId('codef-restored-scope-invalid').textContent).toContain('선택된 항목이 없습니다')
  })

  it('제4의 무표시 상태에서 범위만 바꾸어도 저장과 가져오기가 계속 잠긴다', async () => {
    listCodefBankAccountsMock.mockResolvedValue([BANK_A])
    listCodefCardsMock.mockResolvedValue([CARD_A])
    listCodefLoansMock.mockResolvedValue([])
    loadCodefImportScopeMock.mockResolvedValue({
      connectedId: 'connected-main', accountRefs: [], cardRefs: [], loanRefs: [],
      defaultImportType: 'ALL', scopeMode: 'SELECTED',
    })
    renderForm()
    await screen.findByTestId('codef-restored-scope-invalid')
    fireEvent.change(screen.getByTestId('codef-import-type'), { target: { value: 'CARD' } })
    expect((screen.getByTestId('codef-save-scope-button') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('codef-import-button') as HTMLButtonElement).disabled).toBe(true)
  })

  it('item5(type seam) — SELECTED 인데 type 전환으로 보이는 카테고리 선택이 0건이면 실행을 잠근다', async () => {
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

    // type 을 CARD 로 전환 — 화면엔 카드 카테고리만 보이고, 저장된 선택 중 카드는 0건이다.
    fireEvent.change(screen.getByTestId('codef-import-type'), { target: { value: 'CARD' } })
    await waitFor(() => expect((screen.getByTestId('codef-import-button') as HTMLButtonElement).disabled).toBe(true))
    expect(importScopedCodefMock).not.toHaveBeenCalled()
  })
})
