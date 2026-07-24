// @vitest-environment jsdom

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CodefImportResultSummary, CodefImportScopeForm } from './CodefImportScopeForm'
import type { CodefImportResponse, CodefImportScope } from '../../api/codef'

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
const BANK_B = { ref: '신한 234-567', name: '신한운영', bankName: '신한은행', accountNumber: '234-567' }
const BANK_C = { ref: '우리 345-678', name: '우리운영', bankName: '우리은행', accountNumber: '345-678' }
const CARD_B = { ref: '법인카드-002', name: '운영카드', issuerName: '현대카드', cardNumber: '8888' }

function renderForm(
  onImported = vi.fn(async () => undefined),
  onToast: (toast: { type: 'error' | 'success'; message: string }) => void = () => undefined,
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <CodefImportScopeForm
        canCreate
        canUpdate
        initialFrom="2026-06-01"
        initialTo="2026-06-03"
        onToast={onToast}
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

  it('D-877-01 — 카드 필터에서 저장해도 계좌 3개와 카드 2개를 PUT·재진입 복원에 보존한다', async () => {
    const accounts = [BANK_A, BANK_B, BANK_C]
    const cards = [CARD_A, CARD_B]
    let savedScope: CodefImportScope | undefined
    listCodefBankAccountsMock.mockResolvedValue(accounts)
    listCodefCardsMock.mockResolvedValue(cards)
    listCodefLoansMock.mockResolvedValue([])
    loadCodefImportScopeMock.mockResolvedValue({
      connectedId: 'connected-main',
      accountRefs: [],
      cardRefs: [],
      loanRefs: [],
      defaultImportType: 'ALL',
      scopeMode: null,
    })
    saveCodefImportScopeMock.mockImplementation(async (payload: CodefImportScope) => {
      savedScope = payload
      return payload
    })

    renderForm()
    await screen.findByTestId('codef-bank-account-2')
    await screen.findByTestId('codef-card-1')

    fireEvent.click(screen.getByTestId('codef-bank-account-select-all'))
    fireEvent.click(screen.getByTestId('codef-card-select-all'))
    fireEvent.change(screen.getByTestId('codef-import-type'), { target: { value: 'CARD' } })
    await waitFor(() => expect((screen.getByTestId('codef-save-scope-button') as HTMLButtonElement).disabled).toBe(false))

    fireEvent.click(screen.getByTestId('codef-save-scope-button'))
    await waitFor(() => expect(saveCodefImportScopeMock).toHaveBeenCalledTimes(1))

    expect(saveCodefImportScopeMock.mock.calls[0]![0]).toMatchObject({
      accountRefs: [BANK_A.ref, BANK_B.ref, BANK_C.ref],
      cardRefs: [CARD_A.ref, CARD_B.ref],
    })
    expect(savedScope).toMatchObject({
      accountRefs: [BANK_A.ref, BANK_B.ref, BANK_C.ref],
      cardRefs: [CARD_A.ref, CARD_B.ref],
      loanRefs: [],
      defaultImportType: 'CARD',
      scopeMode: 'SELECTED',
    })

    cleanup()
    loadCodefImportScopeMock.mockResolvedValue(savedScope)
    renderForm()
    await screen.findAllByTestId('codef-selected-chip')
    fireEvent.change(screen.getByTestId('codef-import-type'), { target: { value: 'ALL' } })

    await waitFor(() => {
      expect((screen.getByTestId('codef-bank-account-0') as HTMLInputElement).checked).toBe(true)
      expect((screen.getByTestId('codef-bank-account-1') as HTMLInputElement).checked).toBe(true)
      expect((screen.getByTestId('codef-bank-account-2') as HTMLInputElement).checked).toBe(true)
      expect((screen.getByTestId('codef-card-0') as HTMLInputElement).checked).toBe(true)
      expect((screen.getByTestId('codef-card-1') as HTMLInputElement).checked).toBe(true)
    })
  })

  it('SOL-877-2 — 최초 저장 성공 뒤 미저장 안내와 복원 안내를 동시에 표시하지 않는다', async () => {
    listCodefBankAccountsMock.mockResolvedValue([BANK_A])
    listCodefCardsMock.mockResolvedValue([])
    listCodefLoansMock.mockResolvedValue([])
    loadCodefImportScopeMock.mockResolvedValue({
      connectedId: 'connected-main',
      accountRefs: [],
      cardRefs: [],
      loanRefs: [],
      defaultImportType: 'ALL',
      scopeMode: null,
    })
    const savedScope: CodefImportScope = {
      connectedId: 'connected-main',
      accountRefs: [BANK_A.ref],
      cardRefs: [],
      loanRefs: [],
      defaultImportType: 'BANK',
      scopeMode: 'SELECTED',
    }
    saveCodefImportScopeMock.mockResolvedValue(savedScope)
    const toasts: Array<{ type: 'error' | 'success'; message: string }> = []

    renderForm(vi.fn(async () => undefined), (toast) => toasts.push(toast))
    await screen.findByTestId('codef-bank-account-0')
    fireEvent.click(screen.getByTestId('codef-bank-account-0'))
    await waitFor(() => expect((screen.getByTestId('codef-save-scope-button') as HTMLButtonElement).disabled).toBe(false))

    fireEvent.click(screen.getByTestId('codef-save-scope-button'))
    await waitFor(() => expect(toasts).toContainEqual({ type: 'success', message: '가져오기 선택을 저장했습니다.' }))

    expect(screen.queryByText('저장된 선택이 없습니다. 필요한 항목을 선택한 뒤 저장하세요.')).toBeNull()
    expect(screen.getByText('저장된 선택을 복원했습니다. 그대로 가져오거나 항목을 바꿔 다시 저장할 수 있습니다.')).toBeTruthy()
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

  it('HIGH-4(R3) — 브랜치 B: 저장 scopeMode=SELECTED 로 재방문 후 화면에 보이지 않는 카테고리는 가져오기에 참여하지 않는다(#877 SONNET5 R1 — PM 실서버 재현 pin)', async () => {
    listCodefBankAccountsMock.mockResolvedValue([BANK_A])
    listCodefCardsMock.mockResolvedValue([CARD_A])
    listCodefLoansMock.mockResolvedValue([])
    // 저장된 SELECTED scope — 계좌 1건 + 카드 1건 선택, defaultImportType='CARD' 이라
    // 재방문 시 화면엔 카드 카테고리만 보이고 계좌 체크박스는 렌더되지 않는다(PM 이 실서버
    // 에서 재현한 "계좌3+카드2 로 저장 후 카드만 보이는 화면에서 가져오기" 구성을 최소
    // 조합으로 축약). 위 R2 BLOCKING-1 it.each 는 scopeMode='ALL'(branch A,
    // buildImportPayload 상단)만 커버한다. 이 테스트는 scopeMode='SELECTED'(branch B)를
    // 재방문 직후 어떤 상호작용(체크박스/타입 전환)도 없이(선택 그대로 = selectionDirty=false
    // 유지) 곧바로 가져오기를 눌러 정확히 그 경로를 탄다 — 기존 "item5(type seam)" 테스트는
    // 이 branch B 를 의도적으로 우회(dirty 강제)했고, "기존 빈-ref SELECTED" 테스트는 refs 가
    // 비어 애초에 가져오기가 잠겨 있었다.
    //
    // 종전엔 이 테스트 자체가 결함을 pin 하고 있었다: branch B가 restoredScope 의 원본 세
    // 배열을 type 필터 없이 그대로(type:'ALL') 보내는 것을 "정답"으로 단언했다 — 이 fixture
    // 라면 화면에 없는 accountRefs=[BANK_A.ref] 가 그대로 새어나갔을 것이다. PM 이 실서버에서
    // 확정한 결함(카드 범위로 저장 직후 가져오기 시 화면에 없는 계좌 거래 15건이 입출금
    // 내역에 적재됨)이 바로 이 동작이었다. 새 불변식(I-1: 화면이 보여주지 않은 카테고리는
    // 가져오기 실행에 참여하지 않는다)에 맞춰 type 은 현재 화면 범위(CARD)를, accountRefs 는
    // 빈 배열을 기대하도록 갱신한다. 이 테스트의 원래 목적(branch B 코드 경로 커버 — 위
    // 문단)은 그대로 유지된다: 여전히 restoredScope 존재·미더티 상태에서 상호작용 없이 즉시
    // 가져오기를 누르는 시나리오다.
    loadCodefImportScopeMock.mockResolvedValue({
      connectedId: 'connected-main',
      accountRefs: [BANK_A.ref],
      cardRefs: [CARD_A.ref],
      loanRefs: [],
      defaultImportType: 'CARD',
      scopeMode: 'SELECTED',
    })
    importScopedCodefMock.mockResolvedValue(baseResult)

    renderForm()
    await waitFor(() => expect((screen.getByTestId('codef-import-button') as HTMLButtonElement).disabled).toBe(false))
    // 화면엔 카드 카테고리만 보인다 — 계좌 체크박스는 아예 렌더되지 않는다(I-1 전제 조건).
    expect(screen.queryByTestId('codef-bank-account-0')).toBeNull()
    expect(screen.getByTestId('codef-card-0')).toBeTruthy()

    fireEvent.click(screen.getByTestId('codef-import-button'))

    await waitFor(() => expect(importScopedCodefMock).toHaveBeenCalledTimes(1))
    // 핵심 단언 — branch B는 저장 여부와 무관하게 현재 화면 범위(type)로 필터링된 선택만
    // 실행 계약에 명시한다. 화면에 없는 계좌(BANK_A)는 accountRefs 에 나타나지 않는다.
    expect(importScopedCodefMock.mock.calls[0]![0]).toMatchObject({
      type: 'CARD',
      scopeMode: 'SELECTED',
      accountRefs: [],
      cardRefs: [CARD_A.ref],
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
    expect(await screen.findByText('저장된 선택이 없습니다. 필요한 항목을 선택한 뒤 저장하세요.')).toBeTruthy()
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
    const selectedChip = await screen.findByTestId('codef-selected-chip')
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
