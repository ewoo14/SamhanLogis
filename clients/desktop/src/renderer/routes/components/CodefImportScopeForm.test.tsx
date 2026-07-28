// @vitest-environment jsdom

import React from 'react'
import { AxiosError } from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CodefImportResultSummary, CodefImportScopeForm } from './CodefImportScopeForm'
import type { CodefImportResponse, CodefImportScope } from '../../api/codef'
import { flushZeroDelayTasks } from '../../test-utils/flush'

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
  listCodefBankAccountsMock.mockReset()
  listCodefCardsMock.mockReset()
  listCodefLoansMock.mockReset()
  loadCodefImportScopeMock.mockReset()
  saveCodefImportScopeMock.mockReset()
  importScopedCodefMock.mockReset()
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
type ScopeWithVersion = CodefImportScope & { version: number | null }

function renderForm(
  onImported = vi.fn(async () => undefined),
  onToast: (toast: { type: 'error' | 'success'; message: string }) => void = () => undefined,
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return render(
    <QueryClientProvider client={queryClient}>
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

  it('CODEF 낙관적 잠금 — 조회 버전을 저장 요청에 싣고 성공 응답 버전으로 다음 저장을 이어간다', async () => {
    listCodefBankAccountsMock.mockResolvedValue([BANK_A, BANK_B])
    listCodefCardsMock.mockResolvedValue([])
    listCodefLoansMock.mockResolvedValue([])
    loadCodefImportScopeMock.mockResolvedValue({
      connectedId: 'connected-main',
      accountRefs: [BANK_A.ref],
      cardRefs: [],
      loanRefs: [],
      defaultImportType: 'BANK',
      scopeMode: 'SELECTED',
      version: 0,
    } satisfies ScopeWithVersion)
    saveCodefImportScopeMock
      .mockResolvedValueOnce({
        connectedId: 'connected-main',
        accountRefs: [BANK_A.ref],
        cardRefs: [],
        loanRefs: [],
        defaultImportType: 'BANK',
        scopeMode: 'SELECTED',
        version: 1,
      } satisfies ScopeWithVersion)
      .mockResolvedValueOnce({
        connectedId: 'connected-main',
        accountRefs: [BANK_A.ref, BANK_B.ref],
        cardRefs: [],
        loanRefs: [],
        defaultImportType: 'BANK',
        scopeMode: 'SELECTED',
        version: 2,
      } satisfies ScopeWithVersion)

    renderForm()
    await waitFor(() => expect((screen.getByTestId('codef-save-scope-button') as HTMLButtonElement).disabled).toBe(false))
    // #950 R3 flake 흡수 — 이 대기는 accounts/cards/loans/scope 4개 쿼리가 각기 다른
    // 마이크로태스크에서 resolve되고, 그 뒤를 잇는 복원 useEffect·react-query 알림이 React
    // 스케줄러(MessageChannel 매크로태스크)를 거쳐 커밋되는 다단 비동기 경계 위에 서 있다.
    // "disabled=false"를 확인한 시점에도 같은 매크로태스크 큐에 아직 배출되지 않은 후속
    // 커밋이 남아 있을 수 있어(test-utils/flush.ts의 #933 분석과 동일 계열 경계 — 그 큐
    // 배출 순서는 격리 실행과 전체 스위트 동시 실행에서 달라질 수 있다), 클릭 전에 그 큐를
    // 결정적으로 비워 지금 읽은 disabled=false가 이후 취소되지 않을 안정 상태임을 보장한다.
    await flushZeroDelayTasks()

    fireEvent.click(screen.getByTestId('codef-save-scope-button'))
    // 저장 스파이 호출 자체가 mutate() 호출 직후 마이크로태스크를 몇 틱 더 거쳐야 관측된다
    // (RED 조사에서 클릭 직후 동기적으로는 calls.length===0임을 실측). 전체 스위트 동시
    // 실행처럼 스케줄링 지연이 커지는 환경에서도 이 관측 자체는 무너지지 않도록(assert가
    // 검증하는 낙관적 잠금 계약은 그대로 두고) 대기 한도만 넉넉히 잡는다.
    await waitFor(() => expect(saveCodefImportScopeMock).toHaveBeenCalledTimes(1), { timeout: 5000 })
    expect(saveCodefImportScopeMock.mock.calls[0]![0]).toMatchObject({ version: 0 })

    fireEvent.click(screen.getByTestId('codef-bank-account-1'))
    // 체크박스 클릭의 setSelection/setScopeMode 커밋이 저장 버튼 재계산에 반영됐음을 다음
    // 클릭 전에 보장한다 — 위와 동일한 이유(대기 조건 부재가 아니라 상태 갱신 타이밍).
    await flushZeroDelayTasks()
    fireEvent.click(screen.getByTestId('codef-save-scope-button'))
    await waitFor(() => expect(saveCodefImportScopeMock).toHaveBeenCalledTimes(2), { timeout: 5000 })
    expect(saveCodefImportScopeMock.mock.calls[1]![0]).toMatchObject({ version: 1 })
  })

  it('CODEF 낙관적 잠금 — 충돌해도 내 화면 선택은 그대로 두고 서버 최신은 배너로만 안내한다(F1 root fix)', async () => {
    listCodefBankAccountsMock.mockResolvedValue([BANK_A, BANK_B])
    listCodefCardsMock.mockResolvedValue([])
    listCodefLoansMock.mockResolvedValue([])
    const staleScope = {
      connectedId: 'connected-main',
      accountRefs: [BANK_A.ref],
      cardRefs: [],
      loanRefs: [],
      defaultImportType: 'BANK' as const,
      scopeMode: 'SELECTED' as const,
      version: 0,
    } satisfies ScopeWithVersion
    const latestScope = {
      ...staleScope,
      accountRefs: [BANK_A.ref, BANK_B.ref],
      version: 1,
    } satisfies ScopeWithVersion
    loadCodefImportScopeMock
      .mockResolvedValueOnce(staleScope)
      .mockResolvedValueOnce(latestScope)
    saveCodefImportScopeMock.mockRejectedValueOnce(new AxiosError(
      '충돌',
      'ERR_BAD_REQUEST',
      undefined,
      undefined,
      {
        status: 409,
        statusText: 'Conflict',
        headers: {},
        config: {},
        data: {
          success: false,
          code: 'CODEF_SCOPE_OPTIMISTIC_LOCK_CONFLICT',
          message: '다른 화면에서 가져오기 선택이 변경되었습니다. 최신 선택을 확인한 뒤 다시 저장해 주세요.',
          data: null,
        },
      },
    ))

    renderForm()
    await waitFor(() => expect((screen.getByTestId('codef-save-scope-button') as HTMLButtonElement).disabled).toBe(false))
    // 사용자는 아무것도 바꾸지 않고(추가 체크 없음) 곧바로 재저장을 누른다 — 그 사이 다른 탭이
    // 먼저 BANK_B 를 추가해 저장했다.
    fireEvent.click(screen.getByTestId('codef-save-scope-button'))

    await waitFor(() => expect(loadCodefImportScopeMock).toHaveBeenCalledTimes(2))
    expect(screen.getByTestId('codef-scope-conflict').textContent).toContain('다른 화면에서 가져오기 선택이 변경되었습니다')
    expect(screen.getByTestId('codef-scope-conflict').textContent).toContain('신한운영')

    // F1 — 종전엔 여기서 서버의 BANK_B 를 자동으로 체크해 "adopt" 하는 것을 정답으로
    // 단언했다. 그 단언이 틀렸다: PM 이 금지한 건 "자동 합집합 병합"(사용자가 해제한 남의
    // 항목이 되살아나는 것)이지 "서버가 무엇을 가졌는지 보여주는 것"이 아니다. 내 화면
    // (BANK_A만 선택)은 마지막으로 내가 확인한 상태 그대로 남아야 하고, BANK_B 는 배너에서
    // "정보"로만 보여준다 — 체크박스를 대신 켜지 않는다.
    expect((screen.getByTestId('codef-bank-account-0') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByTestId('codef-bank-account-1') as HTMLInputElement).checked).toBe(false)
    // 충돌 뒤 일반 저장은 서버 항목을 조용히 지울 수 있으므로 잠기고, 배너의 명시 버튼이
    // K5 재저장 경로가 된다.
    expect((screen.getByTestId('codef-save-scope-button') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('codef-scope-overwrite-button')).toBeTruthy()
  })

  it('F1 — 409 충돌이 사용자의 미저장 추가 선택을 화면에서 지우지 않는다(자동 병합 아님 — 내 선택 보존)', async () => {
    listCodefBankAccountsMock.mockResolvedValue([BANK_A, BANK_B, BANK_C])
    listCodefCardsMock.mockResolvedValue([CARD_A, CARD_B])
    listCodefLoansMock.mockResolvedValue([])
    loadCodefImportScopeMock
      .mockResolvedValueOnce({
        connectedId: 'connected-main', accountRefs: [BANK_A.ref], cardRefs: [], loanRefs: [],
        defaultImportType: 'ALL', scopeMode: 'SELECTED', version: 0,
      } satisfies ScopeWithVersion)
      .mockResolvedValueOnce({
        // 다른 탭이 먼저 저장한 최신 — 내가 방금 고른 것과는 다른 조합(내 캐시엔 없는 ref).
        connectedId: 'connected-main', accountRefs: ['신한 000-000'], cardRefs: [], loanRefs: [],
        defaultImportType: 'ALL', scopeMode: 'SELECTED', version: 1,
      } satisfies ScopeWithVersion)
    saveCodefImportScopeMock.mockRejectedValueOnce(new AxiosError(
      '충돌', 'ERR_BAD_REQUEST', undefined, undefined,
      {
        status: 409, statusText: 'Conflict', headers: {}, config: {},
        data: { success: false, code: 'CODEF_SCOPE_OPTIMISTIC_LOCK_CONFLICT', message: '충돌', data: null },
      },
    ))

    renderForm()
    await screen.findByTestId('codef-bank-account-2')
    await screen.findByTestId('codef-card-1')

    // 복원된 국민(BANK_A) 외에 계좌 2개 + 카드 2개를 추가로 체크한다(미저장) — 브리프의
    // "계좌 3 + 카드 2" 시나리오를 이 fixture 로 재현한다.
    fireEvent.click(screen.getByTestId('codef-bank-account-1'))
    fireEvent.click(screen.getByTestId('codef-bank-account-2'))
    fireEvent.click(screen.getByTestId('codef-card-0'))
    fireEvent.click(screen.getByTestId('codef-card-1'))
    await waitFor(() => expect((screen.getByTestId('codef-save-scope-button') as HTMLButtonElement).disabled).toBe(false))

    fireEvent.click(screen.getByTestId('codef-save-scope-button'))
    await screen.findByTestId('codef-scope-conflict')

    // 방금 고른 5개(1 복원 + 4 추가) 전부가 화면에 그대로 남아 있어야 한다 — 서버의 다른
    // 선택으로 대체되지 않는다(K1).
    expect((screen.getByTestId('codef-bank-account-0') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByTestId('codef-bank-account-1') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByTestId('codef-bank-account-2') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByTestId('codef-card-0') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByTestId('codef-card-1') as HTMLInputElement).checked).toBe(true)
  })

  it('F2 — 라벨 해석이 전부 실패해도 "선택 항목이 없습니다"라고 말하지 않는다(무음 유실 재발 방지)', async () => {
    listCodefBankAccountsMock.mockResolvedValue([BANK_A])
    listCodefCardsMock.mockResolvedValue([])
    listCodefLoansMock.mockResolvedValue([])
    loadCodefImportScopeMock
      .mockResolvedValueOnce({
        connectedId: 'connected-main', accountRefs: [BANK_A.ref], cardRefs: [], loanRefs: [],
        defaultImportType: 'BANK', scopeMode: 'SELECTED', version: 0,
      } satisfies ScopeWithVersion)
      .mockResolvedValueOnce({
        // 서버 최신엔 계좌 2건이 있지만, 이 화면 캐시(목록)엔 없는 ref 들이다(라벨 해석 불가 —
        // 예: 목록 조회 장애, 또는 상대가 방금 등록한 신규 계좌).
        connectedId: 'connected-main',
        accountRefs: ['알수없는-001', '알수없는-002'],
        cardRefs: [], loanRefs: [],
        defaultImportType: 'BANK', scopeMode: 'SELECTED', version: 1,
      } satisfies ScopeWithVersion)
    saveCodefImportScopeMock.mockRejectedValueOnce(new AxiosError(
      '충돌', 'ERR_BAD_REQUEST', undefined, undefined,
      {
        status: 409, statusText: 'Conflict', headers: {}, config: {},
        data: { success: false, code: 'CODEF_SCOPE_OPTIMISTIC_LOCK_CONFLICT', message: '충돌', data: null },
      },
    ))

    renderForm()
    await waitFor(() => expect((screen.getByTestId('codef-save-scope-button') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByTestId('codef-save-scope-button'))

    const banner = await screen.findByTestId('codef-scope-conflict')
    // 서버엔 실제로 2건이 있다 — "없습니다"는 사실이 아니다(K2).
    expect(banner.textContent).not.toContain('선택 항목이 없습니다')
    expect(banner.textContent).toContain('2건')
    expect(banner.textContent).toMatch(/확인하지 못했습니다|확인할 수 없습니다/)
  })

  it('F2 — 일부만 해석되면 해석된 이름은 보여주고 나머지는 "확인 불가"로 남긴다(부분 오보 방지)', async () => {
    listCodefBankAccountsMock.mockResolvedValue([BANK_A, BANK_B])
    listCodefCardsMock.mockResolvedValue([])
    listCodefLoansMock.mockResolvedValue([])
    loadCodefImportScopeMock
      .mockResolvedValueOnce({
        connectedId: 'connected-main', accountRefs: [BANK_A.ref], cardRefs: [], loanRefs: [],
        defaultImportType: 'BANK', scopeMode: 'SELECTED', version: 0,
      } satisfies ScopeWithVersion)
      .mockResolvedValueOnce({
        connectedId: 'connected-main',
        accountRefs: [BANK_B.ref, '신규-미등록-계좌'],
        cardRefs: [], loanRefs: [],
        defaultImportType: 'BANK', scopeMode: 'SELECTED', version: 1,
      } satisfies ScopeWithVersion)
    saveCodefImportScopeMock.mockRejectedValueOnce(new AxiosError(
      '충돌', 'ERR_BAD_REQUEST', undefined, undefined,
      {
        status: 409, statusText: 'Conflict', headers: {}, config: {},
        data: { success: false, code: 'CODEF_SCOPE_OPTIMISTIC_LOCK_CONFLICT', message: '충돌', data: null },
      },
    ))

    renderForm()
    await waitFor(() => expect((screen.getByTestId('codef-save-scope-button') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByTestId('codef-save-scope-button'))

    const banner = await screen.findByTestId('codef-scope-conflict')
    expect(banner.textContent).toContain('신한운영')
    expect(banner.textContent).toMatch(/외 1건|1건\(이름 확인 불가\)/)
    expect(banner.textContent).not.toContain('선택 항목이 없습니다')
  })

  it('F4 — 동시 편집이 없는데(baseline 미확인) "다른 화면에서 변경되었습니다"라고 말하지 않는다', async () => {
    listCodefBankAccountsMock.mockResolvedValue([BANK_A, BANK_B])
    listCodefCardsMock.mockResolvedValue([])
    listCodefLoansMock.mockResolvedValue([])
    // 최초 scope 조회가 실패한다 — retry:false 이고 전역 refetchOnWindowFocus:false 라
    // restoredApplied 는 끝내 true 가 되지 않는다(F4 의 실제 원인 재현).
    loadCodefImportScopeMock
      .mockRejectedValueOnce(new Error('일시적 네트워크 오류'))
      .mockResolvedValueOnce({
        connectedId: 'connected-main', accountRefs: [BANK_B.ref], cardRefs: [], loanRefs: [],
        defaultImportType: 'BANK', scopeMode: 'SELECTED', version: 3,
      } satisfies ScopeWithVersion)
    saveCodefImportScopeMock.mockRejectedValueOnce(new AxiosError(
      '충돌', 'ERR_BAD_REQUEST', undefined, undefined,
      {
        status: 409, statusText: 'Conflict', headers: {}, config: {},
        data: { success: false, code: 'CODEF_SCOPE_OPTIMISTIC_LOCK_CONFLICT', message: '충돌', data: null },
      },
    ))

    renderForm()
    // 목록은 정상 로드된다 — scopeMode 는 null 로 남으므로(복원 실패) 사용자가 직접 고른다.
    await screen.findByTestId('codef-bank-account-0')
    fireEvent.click(screen.getByTestId('codef-bank-account-0'))
    await waitFor(() => expect((screen.getByTestId('codef-save-scope-button') as HTMLButtonElement).disabled).toBe(false))

    fireEvent.click(screen.getByTestId('codef-save-scope-button'))
    const banner = await screen.findByTestId('codef-scope-conflict')

    // 단일 사용자·단일 탭·동시 편집 없음 — "다른 화면에서" 는 사실이 아니다(K3).
    expect(banner.textContent).not.toContain('다른 화면에서')
    expect(banner.textContent).toContain('확인하지 못했습니다')
    expect(banner.textContent).toContain('신한운영')
    // F1 은 이 시나리오에서도 유지된다 — 내가 고른 BANK_A 는 그대로 남는다.
    expect((screen.getByTestId('codef-bank-account-0') as HTMLInputElement).checked).toBe(true)
  })

  it('F5 — 재조회가 실패해도 저장 거부 사실을 한국어로 먼저 전달한다(영문 원문 노출 금지)', async () => {
    listCodefBankAccountsMock.mockResolvedValue([BANK_A])
    listCodefCardsMock.mockResolvedValue([])
    listCodefLoansMock.mockResolvedValue([])
    loadCodefImportScopeMock
      .mockResolvedValueOnce({
        connectedId: 'connected-main', accountRefs: [BANK_A.ref], cardRefs: [], loanRefs: [],
        defaultImportType: 'BANK', scopeMode: 'SELECTED', version: 0,
      } satisfies ScopeWithVersion)
      // 충돌 핸들러의 재조회 자체가 네트워크 단절로 실패한다 — 실제 axios 가 던지는 모양
      // (response 없음, message="Network Error")을 그대로 재현한다.
      .mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK'))
    saveCodefImportScopeMock.mockRejectedValueOnce(new AxiosError(
      '충돌', 'ERR_BAD_REQUEST', undefined, undefined,
      {
        status: 409, statusText: 'Conflict', headers: {}, config: {},
        data: { success: false, code: 'CODEF_SCOPE_OPTIMISTIC_LOCK_CONFLICT', message: '충돌', data: null },
      },
    ))
    const toasts: Array<{ type: 'error' | 'success'; message: string }> = []

    renderForm(vi.fn(async () => undefined), (toast) => toasts.push(toast))
    await waitFor(() => expect((screen.getByTestId('codef-save-scope-button') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByTestId('codef-save-scope-button'))

    await waitFor(() => expect(toasts.some((t) => t.type === 'error')).toBe(true))
    const toast = toasts.find((t) => t.type === 'error')!
    // K4 — 거부됐다는 사실이 항상 먼저 전달된다.
    expect(toast.message).toContain('거부')
    // 한국어 의무 — axios 영문 원문이 새지 않는다.
    expect(toast.message).not.toContain('Network Error')
    // 재조회가 실패했으므로 배너는 최신 항목을 말하지 않고 확인 불가 사실만 말한다(L1).
    const banner = screen.getByTestId('codef-scope-conflict')
    expect(banner.textContent).toContain('최신 선택을 확인하지 못했습니다')
    expect(banner.textContent).not.toContain('Network Error')
    // F1 — 재조회 실패로도 내가 고른 선택은 그대로 남는다.
    expect((screen.getByTestId('codef-bank-account-0') as HTMLInputElement).checked).toBe(true)
  })

  it('F6 — 전체 범위 잠금 힌트가 해제 방법(칩 ✕)을 안내한다', async () => {
    listCodefBankAccountsMock.mockResolvedValue([BANK_A])
    listCodefCardsMock.mockResolvedValue([CARD_A])
    listCodefLoansMock.mockResolvedValue([])
    // scopeMode:null 초기 fixture 는 로컬 초기값(null)과 같아 "복원 완료" 신호가 없다 —
    // 클릭이 비동기 복원 effect 와 경합해 되돌아가는 flaky 를 겪었다(SELECTED 로 바꿔
    // canSave 활성화를 복원 완료 신호로 삼는다).
    loadCodefImportScopeMock.mockResolvedValue({
      connectedId: 'connected-main', accountRefs: [BANK_A.ref], cardRefs: [], loanRefs: [],
      defaultImportType: 'BANK', scopeMode: 'SELECTED', version: 0,
    } satisfies ScopeWithVersion)

    renderForm()
    await waitFor(() => expect((screen.getByTestId('codef-save-scope-button') as HTMLButtonElement).disabled).toBe(false))

    // TagChip 은 onClick+role="button" 조합(pressable chip)일 때 핸들러를 내부
    // role="button" 자식 span 에 붙이고 바깥 testid span 에는 붙이지 않는다(TagChip.tsx:99-114)
    // — 바깥을 클릭하면 버블링 방향이 반대라 핸들러가 걸리지 않는다.
    const allChipPressable = screen.getByTestId('codef-all-scope-chip').querySelector('[role="button"]')
    fireEvent.click(allChipPressable as Element)

    const hint = await screen.findByText(/개별 항목 선택은 비활성화/)
    expect(hint.textContent).toMatch(/✕/)
    expect(hint.textContent).toContain('해제')
  })

  it('F6 — 충돌 후에도 화면 잠금은 서버 최신이 아닌 내 화면의 현재 범위를 따른다', async () => {
    listCodefBankAccountsMock.mockResolvedValue([BANK_A])
    listCodefCardsMock.mockResolvedValue([])
    listCodefLoansMock.mockResolvedValue([])
    loadCodefImportScopeMock
      .mockResolvedValueOnce({
        connectedId: 'connected-main', accountRefs: [BANK_A.ref], cardRefs: [], loanRefs: [],
        defaultImportType: 'BANK', scopeMode: 'SELECTED', version: 0,
      } satisfies ScopeWithVersion)
      .mockResolvedValueOnce({
        // 다른 화면이 먼저 '전체'로 저장 — 서버 최신은 ALL 이다.
        connectedId: 'connected-main', accountRefs: [], cardRefs: [], loanRefs: [],
        defaultImportType: 'ALL', scopeMode: 'ALL', version: 1,
      } satisfies ScopeWithVersion)
    saveCodefImportScopeMock.mockRejectedValueOnce(new AxiosError(
      '충돌', 'ERR_BAD_REQUEST', undefined, undefined,
      {
        status: 409, statusText: 'Conflict', headers: {}, config: {},
        data: { success: false, code: 'CODEF_SCOPE_OPTIMISTIC_LOCK_CONFLICT', message: '충돌', data: null },
      },
    ))

    renderForm()
    await waitFor(() => expect((screen.getByTestId('codef-save-scope-button') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByTestId('codef-save-scope-button'))

    const banner = await screen.findByTestId('codef-scope-conflict')
    expect(banner.textContent).toContain('전체')
    // 서버 최신이 ALL 이어도, 내 화면은 여전히 SELECTED(계좌 1건 체크)다 — 강제로 잠기지
    // 않는다(F1 의 부작용으로 F6 의 체크박스 강제잠금 트리거 자체가 사라짐).
    expect((screen.getByTestId('codef-bank-account-0') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByTestId('codef-bank-account-0') as HTMLInputElement).disabled).toBe(false)
  })

  it('F7 — 미변경 재저장이 충돌해도 상반된 안내(다시 선택 vs 그대로 가져와도 됨)가 동시에 뜨지 않는다', async () => {
    listCodefBankAccountsMock.mockResolvedValue([BANK_A, BANK_B])
    listCodefCardsMock.mockResolvedValue([])
    listCodefLoansMock.mockResolvedValue([])
    loadCodefImportScopeMock
      .mockResolvedValueOnce({
        connectedId: 'connected-main', accountRefs: [BANK_A.ref], cardRefs: [], loanRefs: [],
        defaultImportType: 'BANK', scopeMode: 'SELECTED', version: 0,
      } satisfies ScopeWithVersion)
      .mockResolvedValueOnce({
        connectedId: 'connected-main', accountRefs: [BANK_A.ref, BANK_B.ref], cardRefs: [], loanRefs: [],
        defaultImportType: 'BANK', scopeMode: 'SELECTED', version: 1,
      } satisfies ScopeWithVersion)
    saveCodefImportScopeMock.mockRejectedValueOnce(new AxiosError(
      '충돌', 'ERR_BAD_REQUEST', undefined, undefined,
      {
        status: 409, statusText: 'Conflict', headers: {}, config: {},
        data: { success: false, code: 'CODEF_SCOPE_OPTIMISTIC_LOCK_CONFLICT', message: '충돌', data: null },
      },
    ))

    renderForm()
    // 복원된 선택 그대로(변경 없음 = selectionDirty=false 유지) 곧바로 재저장을 누른다.
    await waitFor(() => expect((screen.getByTestId('codef-save-scope-button') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByTestId('codef-save-scope-button'))

    await screen.findByTestId('codef-scope-conflict')
    expect(screen.queryByText('저장된 선택을 복원했습니다. 그대로 가져오거나 항목을 바꿔 다시 저장할 수 있습니다.')).toBeNull()
  })

  it('L1 — 두 번째 충돌 재조회가 실패하면 첫 번째 서버 스냅샷을 최신 상태처럼 계속 보여주지 않는다', async () => {
    listCodefBankAccountsMock.mockResolvedValue([BANK_A, BANK_B, BANK_C])
    listCodefCardsMock.mockResolvedValue([])
    listCodefLoansMock.mockResolvedValue([])
    const staleScope = {
      connectedId: 'connected-main', accountRefs: [BANK_A.ref], cardRefs: [], loanRefs: [],
      defaultImportType: 'BANK' as const, scopeMode: 'SELECTED' as const, version: 0,
    } satisfies ScopeWithVersion
    const firstLatestScope = {
      ...staleScope, accountRefs: [BANK_A.ref, BANK_B.ref], version: 1,
    } satisfies ScopeWithVersion
    loadCodefImportScopeMock
      .mockResolvedValueOnce(staleScope)
      .mockResolvedValueOnce(firstLatestScope)
      .mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK'))
    const conflict = new AxiosError(
      '충돌',
      'ERR_BAD_REQUEST',
      undefined,
      undefined,
      {
        status: 409,
        statusText: 'Conflict',
        headers: {},
        config: {},
        data: { success: false, code: 'CODEF_SCOPE_OPTIMISTIC_LOCK_CONFLICT', message: '충돌', data: null },
      },
    )
    saveCodefImportScopeMock.mockRejectedValueOnce(conflict).mockRejectedValueOnce(conflict)

    renderForm()
    await waitFor(() => expect((screen.getByTestId('codef-save-scope-button') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByTestId('codef-save-scope-button'))
    const firstConflict = await screen.findByTestId('codef-scope-conflict')
    expect(firstConflict.textContent).toContain('신한운영')

    // 첫 충돌의 서버 상태를 확인한 뒤 명시적으로 다시 저장해 두 번째 충돌을 만든다.
    fireEvent.click(screen.getByTestId('codef-scope-overwrite-button'))
    await waitFor(() => expect(saveCodefImportScopeMock).toHaveBeenCalledTimes(2))

    const secondConflict = await screen.findByTestId('codef-scope-conflict')
    expect(secondConflict.textContent).toContain('최신 선택을 확인하지 못했습니다')
    expect(secondConflict.textContent).not.toContain('신한운영')
    expect(secondConflict.textContent).not.toContain('우리운영')
    // 재조회 실패는 화면의 내 선택을 지우는 사유가 아니다(K1).
    expect((screen.getByTestId('codef-bank-account-0') as HTMLInputElement).checked).toBe(true)
  })

  it('L2 — fresh 캐시로 재진입해도 재조회가 끝난 최신 version을 저장 기준으로 사용한다', async () => {
    listCodefBankAccountsMock.mockResolvedValue([BANK_A])
    listCodefCardsMock.mockResolvedValue([])
    listCodefLoansMock.mockResolvedValue([])
    const cachedScope = {
      connectedId: 'connected-main', accountRefs: [BANK_A.ref], cardRefs: [], loanRefs: [],
      defaultImportType: 'BANK' as const, scopeMode: 'SELECTED' as const, version: 0,
    } satisfies ScopeWithVersion
    const freshScope = { ...cachedScope, version: 1 } satisfies ScopeWithVersion
    loadCodefImportScopeMock.mockResolvedValueOnce(cachedScope).mockResolvedValueOnce(freshScope)
    saveCodefImportScopeMock.mockResolvedValue(freshScope)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 5 * 60 * 1000 } },
    })

    renderForm(vi.fn(async () => undefined), () => undefined, queryClient)
    await waitFor(() => expect(loadCodefImportScopeMock).toHaveBeenCalledTimes(1))
    cleanup()

    renderForm(vi.fn(async () => undefined), () => undefined, queryClient)
    await waitFor(() => expect(loadCodefImportScopeMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect((screen.getByTestId('codef-save-scope-button') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByTestId('codef-save-scope-button'))

    await waitFor(() => expect(saveCodefImportScopeMock).toHaveBeenCalledTimes(1))
    expect(saveCodefImportScopeMock.mock.calls[0]![0]).toMatchObject({ version: 1 })
  })

  it('L3 — 충돌 후 일반 저장은 서버 항목 삭제를 실행하지 않고 명시 저장으로만 K5를 통과한다', async () => {
    listCodefBankAccountsMock.mockResolvedValue([BANK_A, BANK_B])
    listCodefCardsMock.mockResolvedValue([])
    listCodefLoansMock.mockResolvedValue([])
    const staleScope = {
      connectedId: 'connected-main', accountRefs: [BANK_A.ref], cardRefs: [], loanRefs: [],
      defaultImportType: 'BANK' as const, scopeMode: 'SELECTED' as const, version: 0,
    } satisfies ScopeWithVersion
    const latestScope = {
      ...staleScope, accountRefs: [BANK_A.ref, BANK_B.ref], version: 1,
    } satisfies ScopeWithVersion
    const savedScope = { ...staleScope, version: 2 } satisfies ScopeWithVersion
    loadCodefImportScopeMock.mockResolvedValueOnce(staleScope).mockResolvedValueOnce(latestScope)
    const conflict = new AxiosError(
      '충돌',
      'ERR_BAD_REQUEST',
      undefined,
      undefined,
      {
        status: 409,
        statusText: 'Conflict',
        headers: {},
        config: {},
        data: { success: false, code: 'CODEF_SCOPE_OPTIMISTIC_LOCK_CONFLICT', message: '충돌', data: null },
      },
    )
    saveCodefImportScopeMock.mockRejectedValueOnce(conflict).mockResolvedValueOnce(savedScope)

    renderForm()
    await waitFor(() => expect((screen.getByTestId('codef-save-scope-button') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByTestId('codef-save-scope-button'))
    await screen.findByTestId('codef-scope-conflict')

    // 아무것도 바꾸지 않은 일반 저장은 PUT하지 않아야 한다.
    fireEvent.click(screen.getByTestId('codef-save-scope-button'))
    await flushZeroDelayTasks()
    expect(saveCodefImportScopeMock).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('codef-scope-conflict').textContent).toContain('지워질 수 있습니다')

    // 사용자가 결과를 읽고 명시 버튼을 누르면 같은 화면 선택으로 다시 저장할 수 있다(K5).
    fireEvent.click(screen.getByTestId('codef-scope-overwrite-button'))
    await waitFor(() => expect(saveCodefImportScopeMock).toHaveBeenCalledTimes(2))
    expect(saveCodefImportScopeMock.mock.calls[1]![0]).toMatchObject({
      version: 1,
      accountRefs: [BANK_A.ref],
    })
    await waitFor(() => expect(screen.queryByTestId('codef-scope-conflict')).toBeNull())
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
      version: 0,
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
    // #950 R3-2 flake 흡수 — 첫 flake(§9)와 같은 근본 원인 계열(비동기 경계 위에서 disabled=
    // false를 확인한 시점과 그 값에 기대어 행동하는 시점 사이에 아직 배출되지 않은 스케줄러
    // 작업이 남아 있을 수 있음)이 검증됐다. react-query useMutation 훅은 매 렌더마다
    // useEffect(패시브, 렌더와 비동기적으로 분리)로 observer.setOptions()를 호출하고,
    // mutation이 아직 pending이면 그 최신 mutationFn 클로저를 활성 mutation에 즉시 전파한다
    // (node_modules/@tanstack/query-core mutationObserver.js:44-46 실측 확인). 클릭 전
    // 이 경계를 결정적으로 비워 restoredScope/scopeMode/type 복원이 완전히 정착된 뒤에만
    // 클릭이 나가도록 보장한다 — 원인이 100% 동일하다고 단정하지 않되, 검증된 동일 계열의
    // 경계를 닫는 조치다(dev-report §10 참고).
    await flushZeroDelayTasks()
    // 화면엔 카드 카테고리만 보인다 — 계좌 체크박스는 아예 렌더되지 않는다(I-1 전제 조건).
    expect(screen.queryByTestId('codef-bank-account-0')).toBeNull()
    expect(screen.getByTestId('codef-card-0')).toBeTruthy()

    fireEvent.click(screen.getByTestId('codef-import-button'))

    await waitFor(() => expect(importScopedCodefMock).toHaveBeenCalledTimes(1), { timeout: 5000 })
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

  it('미선택 안내는 전체 칩과 계좌·카드·대출 개별 선택 경로를 함께 안내한다', async () => {
    listCodefBankAccountsMock.mockResolvedValue([BANK_A])
    listCodefCardsMock.mockResolvedValue([CARD_A])
    listCodefLoansMock.mockResolvedValue([])
    loadCodefImportScopeMock.mockResolvedValue({
      connectedId: 'connected-main', accountRefs: [], cardRefs: [], loanRefs: [],
      defaultImportType: 'ALL', scopeMode: null,
    })

    renderForm()

    const hint = await screen.findByTestId('codef-scope-hint')
    expect(hint.textContent).toContain("전체로 처리하려면 '전체' 칩을 선택하세요.")
    expect(hint.textContent).toContain('특정 항목만 처리하려면 계좌·카드·대출 항목을 선택하세요.')
  })

  it('전체 범위 칩은 Enter와 Space로 켜고 끄는 왕복 조작이 된다', async () => {
    listCodefBankAccountsMock.mockResolvedValue([BANK_A])
    listCodefCardsMock.mockResolvedValue([CARD_A])
    listCodefLoansMock.mockResolvedValue([])
    loadCodefImportScopeMock.mockResolvedValue({
      connectedId: 'connected-main', accountRefs: [], cardRefs: [], loanRefs: [],
      defaultImportType: 'ALL', scopeMode: null,
    })

    renderForm()

    await waitFor(() => expect((screen.getByTestId('codef-bank-account-0') as HTMLInputElement).disabled).toBe(false))
    const pressable = (await screen.findByTestId('codef-all-scope-chip')).querySelector('[role="button"]')
    expect(pressable).not.toBeNull()
    fireEvent.keyDown(pressable as Element, { key: 'Enter' })
    await waitFor(() => expect(pressable?.getAttribute('aria-pressed')).toBe('true'))
    fireEvent.keyDown(pressable as Element, { key: 'Enter' })
    await waitFor(() => expect(pressable?.getAttribute('aria-pressed')).toBe('false'))
    expect(screen.getByTestId('codef-scope-hint')).toBeTruthy()

    fireEvent.keyDown(pressable as Element, { key: ' ' })
    await waitFor(() => expect(pressable?.getAttribute('aria-pressed')).toBe('true'))
    fireEvent.keyDown(pressable as Element, { key: ' ' })
    await waitFor(() => expect(pressable?.getAttribute('aria-pressed')).toBe('false'))
    expect(screen.getByTestId('codef-scope-hint')).toBeTruthy()
  })

  it('R1-1(#950) — 저장된 전체가 dirty 해진 뒤 개별 항목을 고르면 가져오기 잠금 사유가 화면에 남고 aria-describedby 는 실재하는 id만 가리킨다', async () => {
    // 재현 — 개발책임자 R1 브리핑 4단계 그대로: ①전체 저장(=scopeMode:'ALL' 복원) →
    // ②전체 칩을 다시 눌러 해제(scopeMode:null, restoredScope 는 여전히 ALL이라 dirty) →
    // ③계좌 목록에서 1건 체크(scopeMode:'SELECTED' 로 전환). 저장까지 왕복하지 않고
    // "이미 저장된 ALL" 을 mount 복원으로 준비해 같은 클라이언트 상태를 결정적으로 만든다
    // (H-4 기존 테스트와 동일 관행 — savedAllScopeDirty 는 restoredScope.scopeMode 와
    // selectionDirty 만으로 계산되어 저장 왕복 여부와 무관하다).
    listCodefBankAccountsMock.mockResolvedValue([BANK_A])
    listCodefCardsMock.mockResolvedValue([])
    listCodefLoansMock.mockResolvedValue([])
    loadCodefImportScopeMock.mockResolvedValue({
      connectedId: 'connected-main',
      accountRefs: [],
      cardRefs: [],
      loanRefs: [],
      defaultImportType: 'ALL',
      scopeMode: 'ALL',
      version: 3,
    } satisfies ScopeWithVersion)

    renderForm()
    await waitFor(() => expect((screen.getByTestId('codef-save-scope-button') as HTMLButtonElement).disabled).toBe(false))
    const pressable = screen.getByTestId('codef-all-scope-chip').querySelector('[role="button"]') as HTMLElement
    expect(pressable.getAttribute('aria-pressed')).toBe('true')

    // ② 전체 칩을 다시 눌러 해제한다.
    fireEvent.click(pressable)
    await waitFor(() => expect(pressable.getAttribute('aria-pressed')).toBe('false'))

    // ③ 계좌 목록에서 1건을 체크한다.
    fireEvent.click(screen.getByTestId('codef-bank-account-0'))
    await waitFor(() => expect((screen.getByTestId('codef-bank-account-0') as HTMLInputElement).checked).toBe(true))

    const importButton = screen.getByTestId('codef-import-button') as HTMLButtonElement
    // savedAllScopeDirty 는 scopeMode 값과 무관해 계속 가져오기를 잠근다 — 이 자체는
    // 버그가 아니다(의도된 게이트). 버그는 "그 이유가 화면에 없다" + "가리키는 id가 없다".
    expect(importButton.disabled).toBe(true)
    const describedBy = importButton.getAttribute('aria-describedby')
    expect(describedBy, 'R1-1 문제2 — 가져오기 버튼에 aria-describedby 가 아예 없음').toBeTruthy()
    for (const id of (describedBy ?? '').split(' ').filter(Boolean)) {
      expect(document.getElementById(id), `R1-1 문제2 — aria-describedby 대상 id가 DOM에 없음: ${id}`).not.toBeNull()
    }
    // R1-1 문제1 — 비활성 사유(저장된 전체가 아직 반영되지 않았다는 사실)를 설명하는 문구가
    // scopeMode==='SELECTED' 로 바뀐 뒤에도 화면 어딘가에 실제로 보여야 한다.
    expect(
      screen.queryByText('저장된 전체 범위의 유형을 바꾸려면 먼저 저장하세요.'),
      'R1-1 문제1 — 가져오기가 잠긴 이유가 화면 어디에도 보이지 않음',
    ).not.toBeNull()
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

describe('CodefImportScopeForm — 재수렴 R4 (N-1~N-4, 0c91acc42 관련 도달 가능 결함)', () => {
  // 🔒 개발책임자 바운드 결정(2026-07-25, PR #925 — "UX 기제 2개 되돌리고 머지") — 이
  // describe 블록이 검증하던 N-1~N-4 중 N-2(확인 창의 사용자 입력이 서버 값으로 대체되지
  // 않아야 한다)와 N-4/N7(화면 선택이 서버 선택을 포괄하면 삭제 경고 없이 일반 저장을 다시
  // 연다)는 이후 라운드에서 각각 A-1(무음 데이터 파괴)과 A-2/B-1(거짓 안심 + 무음 삭제)의
  // 원인으로 확인되어 되돌려졌다(rA-closing a1/a2/a3 실측). 아래 두 테스트('N-1' 제목의
  // 후반부, 'N-4 되돌림')는 그 되돌린 거동을 단정하도록 갱신했다 — N-1(재진입 잠금)과
  // N-3(latest=null 재확인)는 그대로 닫혀 있고 갱신되지 않았다.
  afterEach(() => {
    cleanup()
    listCodefBankAccountsMock.mockReset()
    listCodefCardsMock.mockReset()
    listCodefLoansMock.mockReset()
    loadCodefImportScopeMock.mockReset()
    saveCodefImportScopeMock.mockReset()
    importScopedCodefMock.mockReset()
  })

  it('N-1 — 재진입 확인 미완료 창은 계속 잠긴다(유지) — 확인 성공 후에는 서버 값이 화면에 반영된다(N-2 되돌림, 개발책임자 바운드 결정)', async () => {
    listCodefBankAccountsMock.mockResolvedValue([BANK_A, BANK_B, BANK_C])
    listCodefCardsMock.mockResolvedValue([])
    listCodefLoansMock.mockResolvedValue([])
    importScopedCodefMock.mockResolvedValue(baseResult)
    const firstLoad = {
      connectedId: 'connected-main', accountRefs: [BANK_A.ref], cardRefs: [], loanRefs: [],
      defaultImportType: 'BANK' as const, scopeMode: 'SELECTED' as const, version: 3,
    } satisfies ScopeWithVersion
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    loadCodefImportScopeMock.mockResolvedValueOnce(firstLoad)
    renderForm(vi.fn(async () => undefined), () => undefined, queryClient)
    await waitFor(() => expect((screen.getByTestId('codef-import-button') as HTMLButtonElement).disabled).toBe(false))
    cleanup()

    // 재진입 — GET 이 아직 응답하지 않는다(평범한 메뉴 이동 직후의 "확인 중" 창을 재현한다).
    let resolveReentry!: (value: ScopeWithVersion) => void
    loadCodefImportScopeMock.mockImplementationOnce(() => new Promise((resolve) => { resolveReentry = resolve }))
    renderForm(vi.fn(async () => undefined), () => undefined, queryClient)

    // 계좌 목록은 캐시로 즉시 그려진다 — 그러나 범위 확인(GET)은 아직 끝나지 않았다.
    await screen.findByTestId('codef-bank-account-2')

    // 브리프 재현 — 확인 미완료인데 화면이 "미저장"으로 보이면 안 되고(N1), 가져오기 버튼이
    // 이 순간 활성이면 안 된다(N3 — canSaveWithoutConflict 에만 있고 canImport 에는 없던
    // !scopeQuery.isFetching 가드 누락의 직접 재현). 이 잠금은 개발책임자 바운드 결정
    // (2026-07-25) 이후에도 그대로 유지된다(Z3) — scopeConfirmedThisMount/
    // scopeBaselineUnconfirmed 는 되돌린 대상이 아니다.
    expect(screen.queryByTestId('codef-scope-hint')).toBeNull()
    expect(screen.getByTestId('codef-scope-confirming')).toBeTruthy()
    expect((screen.getByTestId('codef-import-button') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('codef-save-scope-button') as HTMLButtonElement).disabled).toBe(true)

    // 사용자가 확인이 끝나기 전에 우리은행(3번째)을 체크한다(N-1 리포트의 "우리은행 체크" 재현).
    fireEvent.click(screen.getByTestId('codef-bank-account-2'))
    // N3 — 체크해도 여전히 잠긴다(화면이 사실과 다른 상태에서 실 데이터를 쓰지 않는다).
    expect((screen.getByTestId('codef-import-button') as HTMLButtonElement).disabled).toBe(true)

    // 이제 재진입 GET 이 도착한다(서버는 여전히 국민만 저장돼 있다 — version 3, 변경 없음).
    resolveReentry(firstLoad)
    await waitFor(() => expect(screen.queryByTestId('codef-scope-confirming')).toBeNull())

    // 🔒 개발책임자 바운드 결정(2026-07-25, PR #925) — 종전 N2 root fix(05b8c9e5a)는 여기서
    // "확인 전 사용자가 체크한 우리은행이 서버 값(국민)으로 대체되지 않는다"를 정답으로
    // 단언했다. 그 보존 로직(selectionDirty 조기 반환)이 바로 A-1 무음 데이터 파괴의
    // 원인이었다 — 재확인이 성공한 뒤에도 서버 선택을 화면에 드러내지 않은 채 baseVersion
    // 만 최신으로 앞당겨, 뒤이은 저장이 409 없이 200 OK 로 성공하며 서버에 실제로 저장돼
    // 있던 선택을 조용히 지웠다(rA-closing a1-03/a1-04 실측: PUT version=9 200 OK 로 국민
    // 계좌 소거 + defaultImportType BANK→ALL 동반 유실). 개발책임자가 이 UX 기제를
    // 되돌리기로 결정했다: 확인이 성공하면 항상 서버 값(국민)이 화면에 그대로 반영된다 —
    // 확인 창에서의 미저장 클릭(우리)은 사라질 수 있다(가시적·비파괴 UX 불편이나, 그
    // 창에서는 저장·가져오기가 이미 scopeBaselineUnconfirmed 로 잠겨 있어 안전하다). 이
    // assertion 을 다시 "우리 유지"로 고치지 말 것 — 그게 A-1 을 재발시킨다.
    expect((screen.getByTestId('codef-bank-account-0') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByTestId('codef-bank-account-2') as HTMLInputElement).checked).toBe(false)
    await waitFor(() => expect((screen.getByTestId('codef-import-button') as HTMLButtonElement).disabled).toBe(false))

    // 가져오기는 이제 화면에 반영된 값(=서버가 확인해 준 국민 계좌)으로 나간다.
    fireEvent.click(screen.getByTestId('codef-import-button'))
    await waitFor(() => expect(importScopedCodefMock).toHaveBeenCalledTimes(1))
    expect(importScopedCodefMock.mock.calls[0]![0]).toMatchObject({ accountRefs: [BANK_A.ref] })
  })

  it('N-2 — 재진입 재조회 실패를 확인 실패로 정직하게 안내하고 저장·가져오기를 잠그며, 다시 확인으로 회복한다', async () => {
    listCodefBankAccountsMock.mockResolvedValue([BANK_A])
    listCodefCardsMock.mockResolvedValue([])
    listCodefLoansMock.mockResolvedValue([])
    const saved = {
      connectedId: 'connected-main', accountRefs: [BANK_A.ref], cardRefs: [], loanRefs: [],
      defaultImportType: 'BANK' as const, scopeMode: 'SELECTED' as const, version: 3,
    } satisfies ScopeWithVersion
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    loadCodefImportScopeMock.mockResolvedValueOnce(saved)
    renderForm(vi.fn(async () => undefined), () => undefined, queryClient)
    await waitFor(() => expect((screen.getByTestId('codef-save-scope-button') as HTMLButtonElement).disabled).toBe(false))
    cleanup()

    // 재진입 — GET 이 실패한다(서비스 일시 장애·게이트웨이 5xx·타임아웃). 캐시엔 이전
    // 성공값(version 3, 국민 저장)이 남아 있다 — react-query 는 error 액션에서도 data 를
    // 지우지 않는다(query.js:375-389).
    loadCodefImportScopeMock.mockRejectedValueOnce(new Error('일시적 네트워크 오류'))
    renderForm(vi.fn(async () => undefined), () => undefined, queryClient)

    const unconfirmed = await screen.findByTestId('codef-scope-unconfirmed')
    expect(unconfirmed.textContent).toContain('확인하지 못했습니다')
    // K3/N4 — 아무도 바꾸지 않았는데 "다른 화면에서 변경되었습니다"로 잘못 귀인하지 않는다.
    expect(unconfirmed.textContent).not.toContain('다른 화면에서')
    expect((screen.getByTestId('codef-save-scope-button') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('codef-import-button') as HTMLButtonElement).disabled).toBe(true)
    // N1 — 저장된 선택이 없다고 거짓으로 말하지 않는다(캐시엔 실제로 저장값이 있다).
    expect(screen.queryByText('저장된 선택이 없습니다. 필요한 항목을 선택한 뒤 저장하세요.')).toBeNull()
    expect(screen.queryByTestId('codef-scope-hint')).toBeNull()

    // N5 — 다시 확인 버튼으로 회복할 수 있다(낡은 버전으로 영원히 재시도하는 게 아니라
    // 진짜 재확인 경로가 있다).
    loadCodefImportScopeMock.mockResolvedValueOnce(saved)
    fireEvent.click(screen.getByTestId('codef-scope-reconfirm-button'))
    await waitFor(() => expect(screen.queryByTestId('codef-scope-unconfirmed')).toBeNull())
    await waitFor(() => expect((screen.getByTestId('codef-save-scope-button') as HTMLButtonElement).disabled).toBe(false))
    expect((screen.getByTestId('codef-bank-account-0') as HTMLInputElement).checked).toBe(true)
  })

  it('N-3 — latest=null 재시도는 매번 최신을 다시 확인해야 하고, 낡은 버전으로 맹목적 PUT을 반복하지 않는다', async () => {
    listCodefBankAccountsMock.mockResolvedValue([BANK_A, BANK_B])
    listCodefCardsMock.mockResolvedValue([])
    listCodefLoansMock.mockResolvedValue([])
    const staleScope = {
      connectedId: 'connected-main', accountRefs: [BANK_A.ref], cardRefs: [], loanRefs: [],
      defaultImportType: 'BANK' as const, scopeMode: 'SELECTED' as const, version: 0,
    } satisfies ScopeWithVersion
    const latestScope = {
      ...staleScope, accountRefs: [BANK_A.ref, BANK_B.ref], version: 1,
    } satisfies ScopeWithVersion
    const conflict = new AxiosError(
      '충돌', 'ERR_BAD_REQUEST', undefined, undefined,
      {
        status: 409, statusText: 'Conflict', headers: {}, config: {},
        data: { success: false, code: 'CODEF_SCOPE_OPTIMISTIC_LOCK_CONFLICT', message: '충돌', data: null },
      },
    )
    loadCodefImportScopeMock
      .mockResolvedValueOnce(staleScope) // ① 최초 로드
      .mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK')) // ② 충돌 자동 재조회 실패
      .mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK')) // ③ 수동 재확인 1회차 실패
      .mockResolvedValueOnce(latestScope) // ④ 수동 재확인 2회차 성공
    saveCodefImportScopeMock
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({ ...latestScope, version: 2 })

    renderForm()
    await waitFor(() => expect((screen.getByTestId('codef-save-scope-button') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByTestId('codef-save-scope-button'))
    await screen.findByTestId('codef-scope-conflict')

    // latest=null 이므로 예전의 "현재 화면 선택으로 다시 저장"(낡은 버전으로 재PUT) 버튼이
    // 아니라 재확인 버튼이어야 한다(N5 — 성공 가능성 없는 버튼을 활성으로 제시하지 않는다).
    expect(screen.queryByTestId('codef-scope-overwrite-button')).toBeNull()
    const recheckButton = screen.getByTestId('codef-scope-conflict-reconfirm-button')

    fireEvent.click(recheckButton)
    await waitFor(() => expect(loadCodefImportScopeMock).toHaveBeenCalledTimes(3))
    // 재확인이 또 실패해도 PUT 은 시도조차 되지 않는다 — 예전 버그는 여기서 낡은 version=0
    // 으로 맹목적 재PUT 을 반복해 영원히 409 를 받았다.
    expect(saveCodefImportScopeMock).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('codef-scope-overwrite-button')).toBeNull()

    fireEvent.click(screen.getByTestId('codef-scope-conflict-reconfirm-button'))
    await waitFor(() => expect(loadCodefImportScopeMock).toHaveBeenCalledTimes(4))
    const overwriteButton = await screen.findByTestId('codef-scope-overwrite-button')
    fireEvent.click(overwriteButton)
    await waitFor(() => expect(saveCodefImportScopeMock).toHaveBeenCalledTimes(2))
    expect(saveCodefImportScopeMock.mock.calls[1]![0]).toMatchObject({ version: 1 })
    await waitFor(() => expect(screen.queryByTestId('codef-scope-conflict')).toBeNull())
  })

  it('N-4 되돌림 — 화면 선택이 서버 선택을 포괄해도 일반 저장은 계속 잠기고 명시 덮어쓰기(K5)로만 진행한다(개발책임자 바운드 결정)', async () => {
    listCodefBankAccountsMock.mockResolvedValue([BANK_A, BANK_B, BANK_C])
    listCodefCardsMock.mockResolvedValue([])
    listCodefLoansMock.mockResolvedValue([])
    const staleScope = {
      connectedId: 'connected-main', accountRefs: [BANK_A.ref], cardRefs: [], loanRefs: [],
      defaultImportType: 'BANK' as const, scopeMode: 'SELECTED' as const, version: 0,
    } satisfies ScopeWithVersion
    // 서버 최신 = 국민(BANK_A) + 우리(BANK_C) — 다른 화면이 우리를 추가해 저장했다.
    const latestScope = {
      ...staleScope, accountRefs: [BANK_A.ref, BANK_C.ref], version: 1,
    } satisfies ScopeWithVersion
    loadCodefImportScopeMock.mockResolvedValueOnce(staleScope).mockResolvedValueOnce(latestScope)
    const conflict = new AxiosError(
      '충돌', 'ERR_BAD_REQUEST', undefined, undefined,
      {
        status: 409, statusText: 'Conflict', headers: {}, config: {},
        data: { success: false, code: 'CODEF_SCOPE_OPTIMISTIC_LOCK_CONFLICT', message: '충돌', data: null },
      },
    )
    saveCodefImportScopeMock
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({ ...latestScope, accountRefs: [BANK_A.ref, BANK_C.ref, BANK_B.ref], version: 2 })

    renderForm()
    await waitFor(() => expect((screen.getByTestId('codef-save-scope-button') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByTestId('codef-save-scope-button'))
    const banner = await screen.findByTestId('codef-scope-conflict')
    expect(banner.textContent).toContain('지워질 수 있습니다')
    expect((screen.getByTestId('codef-save-scope-button') as HTMLButtonElement).disabled).toBe(true)

    // 사용자가 서버의 우리(BANK_C)를 화면에 추가하고, 신한(BANK_B)도 함께 추가해 화해한다 —
    // 이제 화면(국민+신한+우리) ⊇ 서버(국민+우리)라 실제로 저장해도 지워질 항목은 없다.
    fireEvent.click(screen.getByTestId('codef-bank-account-2'))
    fireEvent.click(screen.getByTestId('codef-bank-account-1'))
    await waitFor(() => expect((screen.getByTestId('codef-bank-account-1') as HTMLInputElement).checked).toBe(true))

    // 🔒 개발책임자 바운드 결정(2026-07-25, PR #925) — 종전 N7 root fix(05b8c9e5a)는 여기서
    // "포괄하므로 경고 제거 + 일반 저장 재활성"을 정답으로 단언했다. 그 "포괄" 판정
    // (scopeCoversLatest)이 scopeMode='ALL' 화면을 무조건 포괄로 보고 defaultImportType 을
    // 비교하지 않아, 실제로는 서버 refs 를 비우거나 defaultImportType 을 무음 확대하는
    // 저장을 "삭제되지 않습니다"라며 안전하다고 잘못 안심시켰다(A-2/B-1, rA-closing a2·a3
    // 실측: PUT accountRefs=[] 인데 배너는 "삭제되지 않습니다", CARD 로 좁혀진 서버 값이
    // ALL 로 무음 확대). 개발책임자가 이 기제를 되돌리기로 결정했다: 포괄 여부와 무관하게
    // 충돌 배너가 떠 있는 한 일반 저장은 항상 잠기고 경고 문구도 그대로 남는다 — 명시적
    // "현재 화면 선택으로 덮어쓰기" 버튼(K5)만이 유일한 진행 경로다(클릭 1회 추가는 감수한
    // 대가). 이 assertion 을 다시 "포괄하면 잠금 해제"로 고치지 말 것 — 그게 A-2/B-1 을
    // 재발시킨다.
    expect((screen.getByTestId('codef-save-scope-button') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('codef-scope-conflict').textContent).toContain('지워질 수 있습니다')
    const overwriteButton = screen.getByTestId('codef-scope-overwrite-button') as HTMLButtonElement
    expect(overwriteButton).toBeTruthy()
    expect(overwriteButton.disabled).toBe(false)

    // 명시 버튼(K5)으로 진행하면 화해된 화면 선택(국민+신한+우리) 그대로 저장된다.
    fireEvent.click(overwriteButton)
    await waitFor(() => expect(saveCodefImportScopeMock).toHaveBeenCalledTimes(2))
    expect(saveCodefImportScopeMock.mock.calls[1]![0]).toMatchObject({ version: 1 })
    expect(saveCodefImportScopeMock.mock.calls[1]![0].accountRefs).toEqual(
      expect.arrayContaining([BANK_A.ref, BANK_B.ref, BANK_C.ref]),
    )
    await waitFor(() => expect(screen.queryByTestId('codef-scope-conflict')).toBeNull())
  })
})
