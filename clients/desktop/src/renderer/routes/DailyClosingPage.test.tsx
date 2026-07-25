// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { DailyClosing } from '../api/accounting'

vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({ canAccess: () => true, isLoading: false }),
}))
vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }))

const listDailyClosingsMock = vi.fn()
const createDailyClosingMock = vi.fn()
vi.mock('../api/accounting', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/accounting')>()
  return {
    ...actual,
    listDailyClosings: (...args: unknown[]) => listDailyClosingsMock(...args),
    createDailyClosing: (...args: unknown[]) => createDailyClosingMock(...args),
    reverseDailyClosing: vi.fn(),
  }
})

// [#825 R1] 실행 거래처 PartnerAutocomplete 검색 — activeOnly 파라미터·payload 단언용.
const searchPartnersMock = vi.fn()
vi.mock('../api/partnerApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/partnerApi')>()
  return {
    ...actual,
    searchPartners: (...args: unknown[]) => searchPartnersMock(...args),
  }
})

const getDailyClosingDetailMock = vi.fn()
vi.mock('../api/closingApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/closingApi')>()
  return {
    ...actual,
    getDailyClosingDetail: (...args: unknown[]) => getDailyClosingDetailMock(...args),
  }
})

import { DAILY_CLOSING_LIST_COLUMN_KEYS, DailyClosingPage } from './DailyClosingPage'

// BE 계약 충실 픽스처 — DiscountRevalidator.Status + ModelTokenExtractor.extractModelTokenOrNull:
//   verified ∈ {true,false} ⟺ status=VERIFIED (판정 완료·실 모델품목만 도달)
//   verified = null          ⟺ status ∈ {NOT_FOUND, AMBIGUOUS, MISSING_REFERENT, NOT_MEASURABLE, OUT_OF_SCOPE}
//   modelName = 실 모델코드(정규식 매치)만·운임/서비스 등 미매치는 null → FE '—'
// 문서번호 리터럴은 표준 yyyy/MM/dd-N (mock.test.ts 형식 계약).
const detailFixture = {
  date: '2026-07-13',
  totalTaxInvoiceCount: 1,
  totalSupply: '110000',
  totalVat: '11000',
  totalAmount: '121000',
  totalDiscount: '0',
  taxInvoices: [
    {
      taxInvoiceNo: '2026/07/13-1',
      salesSlipNo: '2026/07/13-2',
      sourceSlipNo: '2026/07/13-3',
      bizNo: '1234567890',
      partnerName: '삼한테스트',
      supplyAmount: '110000',
      vatAmount: '11000',
      totalAmount: '121000',
    },
  ],
  productSummaries: [
    // VERIFIED · verified=true · 모델품목 → 확인 배지, 사유 '—', 모델 실토큰
    {
      productName: 'AM160NXVHHH1 [상업멀티]',
      modelName: 'AM160NXVHHH1',
      quantity: 1,
      supplyAmount: 500000,
      releasePrice: 1000000,
      deliveryPrice: 700000,
      expectedRate: 45,
      actualRate: 45,
      verified: true,
      revalidationStatus: 'VERIFIED',
    },
    // VERIFIED · verified=false(과충전·불일치) · 모델품목 → 불일치 배지, 사유 '—', 음수율 빨강
    {
      productName: 'AM320NXVHHH1 [상업멀티]',
      modelName: 'AM320NXVHHH1',
      quantity: 1,
      supplyAmount: 1050000,
      releasePrice: 1000000,
      deliveryPrice: 700000,
      expectedRate: 0,
      actualRate: -5,
      verified: false,
      revalidationStatus: 'VERIFIED',
    },
    // NOT_FOUND · verified=null · 서비스품목(모델 미매치) → 판정불가, 사유 '미등록', 모델 '—'
    {
      productName: '미등록서비스품목',
      modelName: null,
      quantity: 1,
      supplyAmount: 100000,
      releasePrice: null,
      deliveryPrice: null,
      expectedRate: null,
      actualRate: null,
      verified: null,
      revalidationStatus: 'NOT_FOUND',
    },
    // AMBIGUOUS · verified=null(referent 는 전달되나 rate/verified 전부 null) → 판정불가, 사유 '모호'
    {
      productName: '중복매칭품목',
      modelName: null,
      quantity: 1,
      supplyAmount: 200000,
      releasePrice: 900000,
      deliveryPrice: 600000,
      expectedRate: null,
      actualRate: null,
      verified: null,
      revalidationStatus: 'AMBIGUOUS',
    },
    // MISSING_REFERENT · verified=null → 판정불가, 사유 '정가결측'
    {
      productName: '정가결측품목',
      modelName: null,
      quantity: 1,
      supplyAmount: 150000,
      releasePrice: null,
      deliveryPrice: null,
      expectedRate: null,
      actualRate: null,
      verified: null,
      revalidationStatus: 'MISSING_REFERENT',
    },
    // NOT_MEASURABLE · verified=null(수량 0 등 판정불가) → 판정불가, 사유 '측정불가'
    {
      productName: '측정불가품목',
      modelName: null,
      quantity: 0,
      supplyAmount: 0,
      releasePrice: 800000,
      deliveryPrice: 500000,
      expectedRate: 45,
      actualRate: null,
      verified: null,
      revalidationStatus: 'NOT_MEASURABLE',
    },
    // OUT_OF_SCOPE · verified=null(세트의존 등) → 판정불가, 사유 '대상외'
    {
      productName: 'AC 세트품목',
      modelName: null,
      quantity: 1,
      supplyAmount: 300000,
      releasePrice: 700000,
      deliveryPrice: 500000,
      expectedRate: null,
      actualRate: 30,
      verified: null,
      revalidationStatus: 'OUT_OF_SCOPE',
    },
  ],
}

// 매입 픽스처 — verified 행 + null-verdict 행(참고 마커가 verified 무관 전 행 노출 검증).
const purchaseDetailFixture = {
  ...detailFixture,
  productSummaries: [
    detailFixture.productSummaries[0], // verified=true
    detailFixture.productSummaries[1], // verified=false (불일치)
    detailFixture.productSummaries[2], // verified=null (NOT_FOUND)
  ],
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <DailyClosingPage />
    </QueryClientProvider>,
  )
}

/**
 * '전체' TagChip 의 실제 클릭 가능 영역(role="button" 내부 wrapper)을 클릭한다.
 *
 * <p>TagChip 은 ARIA 중첩(role="button" 안에 실제 <button> 중첩) 회피를 위해 role="button"
 * /onClick 을 outer testid span 이 아닌 내부 wrapper 에 둔다(#825 슬5 R1). 실 브라우저는
 * 좌표 기반 hit-test 라 outer span 중앙 클릭이 자연히 내부 wrapper 에 도달하지만, RTL
 * `fireEvent.click` 은 좌표 hit-test 없이 지정 노드에 직접 이벤트를 디스패치하고 이벤트는
 * 조상으로만 버블링되므로 outer(비대화형) span 클릭은 내부(inner pressable)에 도달하지
 * 않는다 — 반드시 내부 wrapper 를 직접 타깃해야 한다.
 */
function clickAllChip(testId: string): void {
  const chip = screen.getByTestId(testId)
  const pressable = chip.querySelector('[role="button"]')
  if (!pressable) throw new Error(`${testId} 내부에 role=button wrapper 를 찾을 수 없음`)
  fireEvent.click(pressable)
}

function rowOf(label: string): HTMLElement {
  const cell = screen.getByText(label)
  const tr = cell.closest('tr')
  if (!tr) throw new Error(`행을 찾을 수 없음: ${label}`)
  return tr as HTMLElement
}

afterEach(() => {
  cleanup()
  listDailyClosingsMock.mockReset()
  getDailyClosingDetailMock.mockReset()
  createDailyClosingMock.mockReset()
  searchPartnersMock.mockReset()
})

const emptyPage = {
  content: [],
  totalElements: 0,
  totalPages: 0,
  number: 0,
  size: 20,
  first: true,
  last: true,
}

describe('DailyClosingPage 모델별 재검증', () => {
  it('매출 조회에서 확인/불일치/판정불가 배지·6종 사유·0/null/음수 할인율·모델 실값을 BE 계약대로 렌더한다', async () => {
    listDailyClosingsMock.mockResolvedValue(emptyPage)
    getDailyClosingDetailMock.mockResolvedValue(detailFixture)

    renderPage()

    await screen.findByText('모델별 재검증')

    // 새니티체크 캡션(집계단위 오해 방지)·매출엔 참고 배너 없음
    expect(screen.getByText(/모델·일 합계 평균 기준 새니티 체크/)).toBeTruthy()
    expect(screen.queryByRole('note')).toBeNull()

    // 확인 배지(verified=true) — VERIFIED 행 스코프. 사유 컬럼이 '—' 라 행 내 '확인' 텍스트는
    // 배지 1개뿐(사유='확인' 자기모순 회귀 시 2개가 되어 실패 = genuine 고정).
    const verifiedRow = rowOf('AM160NXVHHH1 [상업멀티]')
    expect(screen.getByRole('columnheader', { name: '모델' })).toBeTruthy()
    expect(within(verifiedRow).getByText('AM160NXVHHH1')).toBeTruthy() // 모델 실토큰
    expect(within(verifiedRow).getAllByText('확인').length).toBe(1)
    // 매출은 '참고' 마커 없음(매입 전용)
    expect(within(verifiedRow).queryByText('참고')).toBeNull()
    // 기대율·할인율 둘 다 45%(2셀)·모두 비음수라 빨강 아님(회귀 가드)
    const rates45 = within(verifiedRow).getAllByText('45%')
    expect(rates45.length).toBe(2)
    rates45.forEach((el) => expect(el.getAttribute('style') ?? '').not.toContain('state-danger'))
    // VERIFIED 행 사유 = '—'(배지가 판정 전달·자기모순 방지)
    expect(within(verifiedRow).getByText('—')).toBeTruthy()

    // 불일치 배지(verified=false) — 모델품목, 사유 '—', 음수율 빨강
    const mismatchRow = rowOf('AM320NXVHHH1 [상업멀티]')
    expect(within(mismatchRow).getByText('AM320NXVHHH1')).toBeTruthy() // 모델 실토큰
    expect(within(mismatchRow).getByText('불일치')).toBeTruthy()
    const negativeRate = within(mismatchRow).getByText('-5%')
    expect(negativeRate.getAttribute('style')).toContain('color: var(--state-danger)')
    expect(within(mismatchRow).getByText('0%')).toBeTruthy() // expectedRate 0 = '0%'(유효 무할인)

    // 판정불가 배지 = 5개 null-verdict 행(NOT_FOUND/AMBIGUOUS/MISSING_REFERENT/NOT_MEASURABLE/OUT_OF_SCOPE)
    expect(screen.getAllByText('판정불가').length).toBe(5)

    // 6종 사유 라벨 — null-verdict 5종 + VERIFIED 는 사유 '—'
    expect(within(rowOf('미등록서비스품목')).getByText('미등록')).toBeTruthy()
    expect(within(rowOf('중복매칭품목')).getByText('모호')).toBeTruthy()
    expect(within(rowOf('정가결측품목')).getByText('정가결측')).toBeTruthy()
    expect(within(rowOf('측정불가품목')).getByText('측정불가')).toBeTruthy()
    expect(within(rowOf('AC 세트품목')).getByText('대상외')).toBeTruthy()

    // 서비스품목(모델 미매치) → 모델 셀 '—'(null 폴백) + null referent '—'
    const notFoundRow = rowOf('미등록서비스품목')
    // modelName null + release/delivery/expected/actual null = 5개 '—'
    expect(within(notFoundRow).getAllByText('—').length).toBeGreaterThanOrEqual(5)
  })

  it('매입 조회에서는 재검증 테이블과 참고 배너·참고 마커·모델 실값을 렌더하고 기존 상세 전표는 유지한다', async () => {
    listDailyClosingsMock.mockResolvedValue(emptyPage)
    getDailyClosingDetailMock.mockImplementation((_date, kind) =>
      Promise.resolve(kind === 'PURCHASE' ? purchaseDetailFixture : detailFixture),
    )

    renderPage()

    fireEvent.click(screen.getByRole('button', { name: '매출전표' }))
    fireEvent.click(screen.getByRole('radio', { name: '매입' }))

    await waitFor(() => {
      expect(getDailyClosingDetailMock).toHaveBeenLastCalledWith(
        expect.any(String),
        'PURCHASE',
        'PURCHASE_SLIP',
      )
    })

    // 기존 taxInvoices 상세는 유지(표준 문서번호)
    expect(await screen.findByText('2026/07/13-1')).toBeTruthy()
    expect(await screen.findByText('모델별 재검증')).toBeTruthy()
    // 참고 배너 = 판매기준 참고용 + 집계단위 캐비엇 병기
    const banner = screen.getByRole('note')
    expect(banner.textContent).toContain('매입 재검증은')
    expect(banner.textContent).toContain('정식 매입단가 감사가 아닙니다')
    expect(banner.textContent).toContain('개별 라인 단위 판정이 아닙니다')
    // 매입은 SALES 새니티 캡션(별도 <p>) 미표시(배너로 대체)
    expect(screen.queryByText(/^모델·일 합계 평균 기준 새니티 체크입니다\./)).toBeNull()

    // 모델 실값 + 확인 배지 + 참고 마커(verified 행)
    const verifiedRow = rowOf('AM160NXVHHH1 [상업멀티]')
    expect(screen.getByRole('columnheader', { name: '모델' })).toBeTruthy()
    expect(within(verifiedRow).getByText('AM160NXVHHH1')).toBeTruthy()
    expect(within(verifiedRow).getByText('확인')).toBeTruthy()
    expect(within(verifiedRow).getByText('참고')).toBeTruthy()

    // 참고 마커는 verified 무관 — null-verdict 행에도 노출
    const nullVerdictRow = rowOf('미등록서비스품목')
    expect(within(nullVerdictRow).getByText('판정불가')).toBeTruthy()
    expect(within(nullVerdictRow).getByText('참고')).toBeTruthy()

    // 참고 마커는 verified 무관 — false(불일치) 행에도 노출
    const mismatchRow = rowOf('AM320NXVHHH1 [상업멀티]')
    expect(within(mismatchRow).getByText('불일치')).toBeTruthy()
    expect(within(mismatchRow).getByText('참고')).toBeTruthy()
  })

  it('통합(ALL) 조회에서는 상세 안내문만 표시하고 재검증 테이블은 렌더하지 않는다', async () => {
    listDailyClosingsMock.mockResolvedValue(emptyPage)
    getDailyClosingDetailMock.mockResolvedValue(detailFixture)

    renderPage()

    fireEvent.click(screen.getByRole('radio', { name: '통합' }))

    await waitFor(() => {
      expect(screen.getByText(/통합 조회에서는 이력만 표시합니다/)).toBeTruthy()
    })
    expect(screen.queryByText('모델별 재검증')).toBeNull()
    // ALL 은 detailQuery `enabled: closingKind !== 'ALL'` → 상세 조회 억제.
    // 어떤 호출도 ALL 시그니처(kind/source=undefined)로 발생하지 않는다.
    expect(getDailyClosingDetailMock).not.toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      undefined,
    )
  })
})

/**
 * [#825 R1] 일마감 실행 거래처 payload 계약.
 *
 * <p>in-process Playwright mock 은 POST /accounting/daily-closings 응답을 정적 목록에
 * 반영하지 않아 E2E 에서 payload partnerCode 를 관측할 수 없다 (ac-4 spec 주석 참조).
 * 여기서 자동완성 선택 → 마감 실행 → createDailyClosing 호출 payload 를 직접 단언한다.
 */
describe('DailyClosingPage 일마감 실행 거래처 payload (#825 R1)', () => {
  it('자동완성 선택 거래처의 partnerCode 가 실행 payload 로 전송되고, 검색은 activeOnly 로 호출된다', async () => {
    listDailyClosingsMock.mockResolvedValue(emptyPage)
    getDailyClosingDetailMock.mockResolvedValue(detailFixture)
    createDailyClosingMock.mockResolvedValue({
      closingDate: '2026-07-17',
      partnerCode: '1234567890',
      closingKind: 'SALES',
      sourceKind: 'TAX_INVOICE',
      isLocked: true,
      lockedAt: '2026-07-17T10:00:00+09:00',
      lockedBy: 'user-001',
      description: null,
      totalSupply: '0',
      totalVat: '0',
      totalAmount: '0',
    })
    searchPartnersMock.mockResolvedValue([
      { partnerCode: '1234567890', name: '엘에이시스템에어', bizNo: '123-45-67890' },
    ])

    renderPage()

    // 실행 거래처 자동완성 — 검색 → 후보 → 마우스다운 선택
    const partnerInput = await screen.findByTestId('daily-closing-exec-partner')
    fireEvent.focus(partnerInput)
    fireEvent.change(partnerInput, { target: { value: '엘에이' } })

    // 접근성 이름은 하이라이트 chunk(<mark>엘에이</mark><span>시스템에어</span>) 경계에
    // jsdom(dom-accessibility-api)이 공백을 삽입할 수 있어 연속 문자열 매칭이 깨진다 —
    // 단일 chunk(matched '엘에이')로 매칭한다 (네이티브 select 의 매출/매입 option 과 비충돌).
    const option = await screen.findByRole('option', { name: /엘에이/ })
    fireEvent.mouseDown(option)
    expect((partnerInput as HTMLInputElement).value).toBe('엘에이시스템에어')

    // 검색 호출은 activeOnly(status=ACTIVE 파라미터 경로)로 이뤄져야 한다
    expect(searchPartnersMock).toHaveBeenCalledWith('엘에이', { activeOnly: true })

    // 마감 실행 → payload 에 선택 거래처 partnerCode 반영
    fireEvent.click(screen.getByTestId('daily-closing-exec-button'))
    await waitFor(() => expect(createDailyClosingMock).toHaveBeenCalledTimes(1))
    expect(createDailyClosingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        partnerCode: '1234567890',
        closingKind: 'SALES',
        sourceKind: 'TAX_INVOICE',
        closingDate: expect.any(String),
      }),
    )
  })

  /**
   * [#825 CM6] AsyncAutocomplete 는 빈 입력 blur 에서 onChange(null) 을 발화하지 않는다
   * (blur 게이트 원칙) — 입력만 지우고 실행하면 이전 execPartner.partnerCode 로 오범위
   * 마감된다. 명시 '해제' 버튼(BankTransactionPage 선례)이 선택을 실제로 비우고,
   * 이후 실행 payload 에 partnerCode 가 실리지 않아야 한다 (전체 마감).
   */
  it("선택 후 '해제' 버튼으로 거래처를 비우면 실행 payload 에 partnerCode 가 없다", async () => {
    listDailyClosingsMock.mockResolvedValue(emptyPage)
    getDailyClosingDetailMock.mockResolvedValue(detailFixture)
    createDailyClosingMock.mockResolvedValue({
      closingDate: '2026-07-18',
      partnerCode: null,
      closingKind: 'SALES',
      sourceKind: 'TAX_INVOICE',
      isLocked: true,
      lockedAt: '2026-07-18T10:00:00+09:00',
      lockedBy: 'user-001',
      description: null,
      totalSupply: '0',
      totalVat: '0',
      totalAmount: '0',
    })
    searchPartnersMock.mockResolvedValue([
      { partnerCode: '1234567890', name: '엘에이시스템에어', bizNo: '123-45-67890' },
    ])

    renderPage()

    // 선택 전에는 해제 버튼이 없다 (조건부 affordance)
    const partnerInput = await screen.findByTestId('daily-closing-exec-partner')
    expect(screen.queryByTestId('daily-closing-exec-partner-clear')).toBeNull()

    fireEvent.focus(partnerInput)
    fireEvent.change(partnerInput, { target: { value: '엘에이' } })
    const option = await screen.findByRole('option', { name: /엘에이/ })
    fireEvent.mouseDown(option)
    expect((partnerInput as HTMLInputElement).value).toBe('엘에이시스템에어')

    // 해제 → 선택 표시가 비워지고 버튼도 사라진다
    fireEvent.click(screen.getByTestId('daily-closing-exec-partner-clear'))
    expect((partnerInput as HTMLInputElement).value).toBe('')
    expect(screen.queryByTestId('daily-closing-exec-partner-clear')).toBeNull()

    // 해제 후에는 전체 칩을 명시적으로 선택해야 실행할 수 있다.
    clickAllChip('daily-closing-all-chip')
    fireEvent.click(screen.getByTestId('daily-closing-exec-button'))
    await waitFor(() => expect(createDailyClosingMock).toHaveBeenCalledTimes(1))
    const payload = createDailyClosingMock.mock.calls[0]![0] as { partnerCode?: string }
    expect(payload.partnerCode).toBeUndefined()
  })
})

/**
 * [#825 재수렴 CM-b·#4] 일마감 실행 거래처 미확정 draft 가드.
 *
 * <p>AsyncAutocomplete 는 목록 선택 전까지 onChange 미발화 — 거래처명을 타이핑만 한 채
 * '마감 실행'을 누르면 draft 가 무시되고 전체(null)/이전 선택 범위로 마감된다(오범위).
 * [#4] 역방향도 동일 root — 선택(P1) 후 재포커스로 표시가 비워져도(draft='') 선택은
 * 잔존하므로, 빈 입력을 보고 실행하면 전체 마감 의도가 P1 마감으로 뒤집힌다.
 * 실행 시점 입력 표시값과 확정 선택의 불일치(빈 draft 포함)를 차단 + 안내하고,
 * 목록 선택 확정/'해제' 로 정합이 회복되면 실행이 통과됨을 고정한다.
 * 안내문은 '입력을 비운 뒤 실행' 을 유도하지 않는다(입력 비우기 ≠ 선택 해제 — #4 유도 문구 금지).
 */
describe('DailyClosingPage 일마감 실행 미확정 draft 가드 (#825 재수렴 CM-b·#4)', () => {
  const execSuccessFixture = {
    closingDate: '2026-07-18',
    partnerCode: '1234567890',
    closingKind: 'SALES',
    sourceKind: 'TAX_INVOICE',
    isLocked: true,
    lockedAt: '2026-07-18T10:00:00+09:00',
    lockedBy: 'user-001',
    description: null,
    totalSupply: '0',
    totalVat: '0',
    totalAmount: '0',
  }

  it('미선택 draft 타이핑 상태로 실행하면 차단 + 안내를 표시하고 마감 API 를 호출하지 않는다 — 목록 선택 확정 후 재실행은 통과', async () => {
    listDailyClosingsMock.mockResolvedValue(emptyPage)
    getDailyClosingDetailMock.mockResolvedValue(detailFixture)
    createDailyClosingMock.mockResolvedValue(execSuccessFixture)
    searchPartnersMock.mockResolvedValue([
      { partnerCode: '1234567890', name: '엘에이시스템에어', bizNo: '123-45-67890' },
    ])

    renderPage()

    // 타이핑만 — 후보가 뜨지만 선택하지 않는다 (draft 상태)
    const partnerInput = await screen.findByTestId('daily-closing-exec-partner')
    fireEvent.focus(partnerInput)
    fireEvent.change(partnerInput, { target: { value: '엘에이' } })
    await screen.findByRole('option', { name: /엘에이/ })

    // 실행 → 차단: createDailyClosing 미호출 + role=alert 안내 표시.
    // [#4] 확정 선택이 없는 변형은 '해제' 버튼 미노출 상태라 목록 선택만 안내하고,
    // "입력을 비운 뒤 실행" 유도 문구(빈 입력=전체 마감 오인 → P1 오범위 유발)는 금지.
    expect(screen.getByTestId('daily-closing-exec-button').hasAttribute('disabled')).toBe(true)
    expect(screen.getByTestId('daily-closing-scope-hint').textContent)
      .toContain("'전체' 칩을 선택하세요")
    expect(createDailyClosingMock).not.toHaveBeenCalled()

    // 목록에서 선택해 확정 → 안내 즉시 소거(onChange 소거 경로)
    fireEvent.mouseDown(screen.getByRole('option', { name: /엘에이/ }))
    expect((partnerInput as HTMLInputElement).value).toBe('엘에이시스템에어')
    expect(screen.queryByTestId('daily-closing-exec-partner-draft-error')).toBeNull()

    // 재실행 → 통과 + 확정 선택의 partnerCode 로 마감
    fireEvent.click(screen.getByTestId('daily-closing-exec-button'))
    await waitFor(() => expect(createDailyClosingMock).toHaveBeenCalledTimes(1))
    expect(createDailyClosingMock).toHaveBeenCalledWith(
      expect.objectContaining({ partnerCode: '1234567890' }),
    )
  })

  it('선택(P1) 후 다른 거래처명을 타이핑 중(미확정) 실행하면 이전 선택(P1) 오범위 마감을 차단한다', async () => {
    listDailyClosingsMock.mockResolvedValue(emptyPage)
    getDailyClosingDetailMock.mockResolvedValue(detailFixture)
    createDailyClosingMock.mockResolvedValue(execSuccessFixture)
    searchPartnersMock.mockResolvedValue([
      { partnerCode: '1234567890', name: '엘에이시스템에어', bizNo: '123-45-67890' },
    ])

    renderPage()

    // P1 선택 확정
    const partnerInput = await screen.findByTestId('daily-closing-exec-partner')
    fireEvent.focus(partnerInput)
    fireEvent.change(partnerInput, { target: { value: '엘에이' } })
    fireEvent.mouseDown(await screen.findByRole('option', { name: /엘에이/ }))
    expect((partnerInput as HTMLInputElement).value).toBe('엘에이시스템에어')

    // 재포커스 후 다른 거래처명 draft 타이핑 (선택 미확정)
    fireEvent.focus(partnerInput)
    fireEvent.change(partnerInput, { target: { value: '강남에어' } })

    // 실행 → 차단: P1('1234567890') 범위로 조용히 마감되지 않는다.
    // 이전 확정 선택 잔존 변형은 목록 재선택 + '해제'(전체 마감) 두 경로를 안내한다.
    fireEvent.click(screen.getByTestId('daily-closing-exec-button'))
    const draftError = await screen.findByTestId('daily-closing-exec-partner-draft-error')
    expect(draftError.textContent).toContain('목록에서 선택하거나')
    expect(draftError.textContent).toContain("'해제' 버튼")
    expect(draftError.textContent).not.toContain('입력을 비운 뒤')
    expect(createDailyClosingMock).not.toHaveBeenCalled()
  })

  /**
   * [#825 재수렴 #4] 빈 draft + 확정 선택(P1) 잔존 — 구 가드({@code typedDraft !== ''}
   * 선행 조건)는 빈 draft 를 무조건 통과시켜, 재포커스로 입력이 비워진 화면(사용자는
   * 전체 마감 의도)에서 P1 오범위 마감이 실행됐다. 빈 draft 라도 확정 선택과 다르면
   * 차단하고 '해제' 버튼을 안내하며, '해제' 후 재실행은 전체 마감으로 통과함을 고정한다.
   */
  it("선택(P1) 후 재포커스로 입력이 비워진 채(빈 draft) 실행하면 P1 잔존 오범위 마감을 차단하고 '해제' 를 안내한다 — '해제' 후 재실행은 전체 마감 통과", async () => {
    listDailyClosingsMock.mockResolvedValue(emptyPage)
    getDailyClosingDetailMock.mockResolvedValue(detailFixture)
    createDailyClosingMock.mockResolvedValue(execSuccessFixture)
    searchPartnersMock.mockResolvedValue([
      { partnerCode: '1234567890', name: '엘에이시스템에어', bizNo: '123-45-67890' },
    ])

    renderPage()

    // P1 선택 확정
    const partnerInput = await screen.findByTestId('daily-closing-exec-partner')
    fireEvent.focus(partnerInput)
    fireEvent.change(partnerInput, { target: { value: '엘에이' } })
    fireEvent.mouseDown(await screen.findByRole('option', { name: /엘에이/ }))
    expect((partnerInput as HTMLInputElement).value).toBe('엘에이시스템에어')

    // 재포커스 — AsyncAutocomplete 가 draft 를 '' 로 초기화해 표시가 비워진다 (선택은 잔존)
    fireEvent.focus(partnerInput)
    expect((partnerInput as HTMLInputElement).value).toBe('')

    // 실행 → 차단: 빈 입력(전체 마감 의도)인데 P1 범위로 조용히 마감되지 않는다.
    // 안내는 잔존 선택(P1 상호)을 드러내고 '해제' 버튼을 유도한다 — 입력 비우기 안내 금지.
    fireEvent.click(screen.getByTestId('daily-closing-exec-button'))
    const draftError = await screen.findByTestId('daily-closing-exec-partner-draft-error')
    expect(draftError.getAttribute('role')).toBe('alert')
    expect(draftError.textContent).toContain('엘에이시스템에어')
    expect(draftError.textContent).toContain("'해제' 버튼")
    expect(draftError.textContent).not.toContain('입력을 비운 뒤')
    expect(createDailyClosingMock).not.toHaveBeenCalled()

    // '해제' 로 선택을 실제로 지우면 전체 칩을 명시적으로 선택해야 재실행할 수 있다.
    fireEvent.click(screen.getByTestId('daily-closing-exec-partner-clear'))
    expect(screen.queryByTestId('daily-closing-exec-partner-draft-error')).toBeNull()
    clickAllChip('daily-closing-all-chip')
    fireEvent.click(screen.getByTestId('daily-closing-exec-button'))
    await waitFor(() => expect(createDailyClosingMock).toHaveBeenCalledTimes(1))
    const payload = createDailyClosingMock.mock.calls[0]![0] as { partnerCode?: string }
    expect(payload.partnerCode).toBeUndefined()
  })
})

describe('DailyClosingPage committed partnerCode 계약 (#840)', () => {
  it('동명 P1/P2에서 미선택 실행은 0회이고 P2 명시 선택만 P2 partnerCode를 payload로 보낸다', async () => {
    const p1 = { partnerCode: 'P1-DAILY', name: '동일상호', bizNo: '111-11-11111' }
    const p2 = { partnerCode: 'P2-DAILY', name: '동일상호', bizNo: '222-22-22222' }
    listDailyClosingsMock.mockResolvedValue(emptyPage)
    getDailyClosingDetailMock.mockResolvedValue(detailFixture)
    createDailyClosingMock.mockResolvedValue({
      closingDate: '2026-07-19',
      partnerCode: p2.partnerCode,
      closingKind: 'SALES',
      sourceKind: 'TAX_INVOICE',
      isLocked: true,
      lockedAt: '2026-07-19T10:00:00+09:00',
      lockedBy: 'user-001',
      description: null,
      totalSupply: '0',
      totalVat: '0',
      totalAmount: '0',
    })
    searchPartnersMock.mockImplementation((query: string) =>
      Promise.resolve(query.includes('P2') ? [p2] : [p1]),
    )

    renderPage()
    const input = await screen.findByTestId('daily-closing-exec-partner')
    const partnerOption = () => screen.getAllByRole('option').find((candidate) => candidate.tagName === 'LI')!
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'P1' } })
    await waitFor(() => expect(partnerOption().textContent).toContain(p1.partnerCode))

    // 후보를 보기만 한 상태는 이름이 같아도 확정이 아니므로 실행하지 않는다.
    fireEvent.click(screen.getByTestId('daily-closing-exec-button'))
    expect(createDailyClosingMock).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: 'P2' } })
    await waitFor(() => expect(partnerOption().textContent).toContain(p2.partnerCode))
    fireEvent.mouseDown(partnerOption())
    await waitFor(() => expect(input.value).toBe(p2.name))
    fireEvent.click(screen.getByTestId('daily-closing-exec-button'))
    await waitFor(() => expect(createDailyClosingMock).toHaveBeenCalledTimes(1))
    expect(createDailyClosingMock).toHaveBeenCalledWith(
      expect.objectContaining({ partnerCode: p2.partnerCode }),
    )
  })

  /**
   * [#840 R1 dim5 MED-1] 동명 divergence 실증 — 확정 판정이 이름이 아니라 getKey(partnerCode).
   *
   * <p>P1(코드A·상호X) 확정 선택 후 동일 상호 X 를 재입력(미선택 편집)하면 표시 입력값이 확정
   * 선택 라벨과 문자열이 '같다'. 구 name-equality 가드({@code typedDraft === confirmedLabel})라면
   * 이 상태가 확정으로 오판돼 P1 범위 마감이 통과했다. committed(getKey) 출력 계약은 편집
   * 순간부터 false 이므로 이름이 같아도 실행을 차단한다. 이 케이스는 가드를 name-equality 로
   * 되돌리면 RED 가 된다.
   */
  it('P1 확정 후 동일 상호 재입력(미선택)은 이름이 같아도 committed=false 로 실행을 차단한다 (동명 divergence)', async () => {
    // 동명(상호 동일·partnerCode 상이) fixture.
    const p1 = { partnerCode: 'P1-DAILY-DUP', name: '동일상호주식회사', bizNo: '111-11-11111' }
    const p2 = { partnerCode: 'P2-DAILY-DUP', name: '동일상호주식회사', bizNo: '222-22-22222' }
    listDailyClosingsMock.mockResolvedValue(emptyPage)
    getDailyClosingDetailMock.mockResolvedValue(detailFixture)
    createDailyClosingMock.mockResolvedValue({
      closingDate: '2026-07-19',
      partnerCode: p2.partnerCode,
      closingKind: 'SALES',
      sourceKind: 'TAX_INVOICE',
      isLocked: true,
      lockedAt: '2026-07-19T10:00:00+09:00',
      lockedBy: 'user-001',
      description: null,
      totalSupply: '0',
      totalVat: '0',
      totalAmount: '0',
    })
    // 코드('P1'/'P2') 검색은 각 1건, 상호명 재입력은 동명 2건(코드 상이) 후보를 노출한다.
    searchPartnersMock.mockImplementation((query: string) => {
      if (query.includes('P2')) return Promise.resolve([p2])
      if (query.includes('P1')) return Promise.resolve([p1])
      return Promise.resolve([p1, p2])
    })

    renderPage()
    const input = (await screen.findByTestId('daily-closing-exec-partner')) as HTMLInputElement
    const liOptions = () => screen.getAllByRole('option').filter((o) => o.tagName === 'LI')
    const firstLi = () => liOptions()[0]!

    // 1) P1 확정 선택 (코드로 검색 → 단건 선택)
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'P1' } })
    await waitFor(() => expect(firstLi().textContent).toContain(p1.partnerCode))
    fireEvent.mouseDown(firstLi())
    await waitFor(() => expect(input.value).toBe(p1.name))

    // 2) 동일 상호 재입력(미선택 편집) — 동명 P2(코드 상이) 후보가 함께 노출된다.
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: p1.name } })
    await waitFor(() => {
      const codes = liOptions().map((o) => o.textContent ?? '').join(' ')
      expect(codes).toContain(p1.partnerCode)
      expect(codes).toContain(p2.partnerCode)
    })
    // 핵심: 표시 입력값이 확정 선택 라벨과 문자열이 같다 — name-equality 였다면 통과했을 상태.
    expect(input.value).toBe(p1.name)

    // 3) 실행 → committed=false 로 차단(마감 API 미호출 + role=alert 안내).
    fireEvent.click(screen.getByTestId('daily-closing-exec-button'))
    const draftError = await screen.findByTestId('daily-closing-exec-partner-draft-error')
    expect(draftError.getAttribute('role')).toBe('alert')
    expect(createDailyClosingMock).not.toHaveBeenCalled()

    // 4) P2 명시 선택(같은 상호여도) → committed=true·payload 는 P2 partnerCode.
    fireEvent.change(input, { target: { value: 'P2' } })
    await waitFor(() => expect(firstLi().textContent).toContain(p2.partnerCode))
    fireEvent.mouseDown(firstLi())
    await waitFor(() => expect(input.value).toBe(p2.name))
    fireEvent.click(screen.getByTestId('daily-closing-exec-button'))
    await waitFor(() => expect(createDailyClosingMock).toHaveBeenCalledTimes(1))
    expect(createDailyClosingMock).toHaveBeenCalledWith(
      expect.objectContaining({ partnerCode: p2.partnerCode }),
    )
  })
})

describe('DailyClosingPage 열 계층화 (#897)', () => {
  it('전체 마감과 거래처 마감은 목록·상세·역마감 대상이 각각 다르게 식별된다', async () => {
    listDailyClosingsMock.mockResolvedValue({
      ...emptyPage,
      content: [
        {
          closingKind: 'SALES',
          sourceKind: 'TAX_INVOICE',
          closingDate: '2020-01-02',
          bizNo: '',
          partnerCode: null,
          totalSupply: '100000',
          totalVat: '10000',
          totalAmount: '110000',
          slipCount: 1,
          isLocked: true,
          lockedAt: '2020-01-02T18:00:00+09:00',
          lockedBy: '개발책임자',
        },
        {
          closingKind: 'SALES',
          sourceKind: 'TAX_INVOICE',
          closingDate: '2020-01-02',
          bizNo: '2018100002',
          partnerCode: 'P0-6-C002',
          totalSupply: '200000',
          totalVat: '20000',
          totalAmount: '220000',
          slipCount: 2,
          isLocked: true,
          lockedAt: '2020-01-02T19:00:00+09:00',
          lockedBy: '개발책임자',
        },
      ] satisfies DailyClosing[],
    })
    getDailyClosingDetailMock.mockResolvedValue(detailFixture)

    renderPage()

    const table = await screen.findByTestId('daily-closing-list-table')
    const allRow = rowOf('전체 마감')
    const partnerRow = rowOf('거래처 P0-6-C002')
    expect(allRow).not.toBe(partnerRow)
    expect(allRow.textContent).toContain('부가세 10,000원')
    expect(partnerRow.textContent).toContain('부가세 20,000원')
    expect(allRow.textContent).toContain('마감 시각 2020-01-02 18:00')
    expect(partnerRow.textContent).toContain('마감 시각 2020-01-02 19:00')

    const allDetailButton = within(allRow).getByTestId(
      'daily-closing-detail-button-2020-01-02-ALL-SALES-TAX_INVOICE',
    )
    const partnerDetailButton = within(partnerRow).getByTestId(
      'daily-closing-detail-button-2020-01-02-P0-6-C002-SALES-TAX_INVOICE',
    )
    expect(allDetailButton).not.toBe(partnerDetailButton)
    expect(within(allRow).getByTestId('daily-closing-reverse-button-2020-01-02-ALL-SALES-TAX_INVOICE')).toBeTruthy()
    expect(within(partnerRow).getByTestId('daily-closing-reverse-button-2020-01-02-P0-6-C002-SALES-TAX_INVOICE')).toBeTruthy()

    fireEvent.click(allDetailButton)
    expect((await screen.findByTestId('daily-closing-selected-scope')).textContent).toContain('전체 마감')
    await waitFor(() => expect(screen.getByTestId('daily-closing-detail-button-2020-01-02-P0-6-C002-SALES-TAX_INVOICE')).toBeTruthy())
    fireEvent.click(screen.getByTestId('daily-closing-detail-button-2020-01-02-P0-6-C002-SALES-TAX_INVOICE'))
    expect((await screen.findByTestId('daily-closing-selected-scope')).textContent).toContain('P0-6-C002')
    expect(table).toBeTruthy()
  })

  it('일마감 열 집합 상수는 실제 7열의 순서를 직접 표현한다', () => {
    expect(DAILY_CLOSING_LIST_COLUMN_KEYS).toEqual([
      'closingDate',
      'kind',
      'scope',
      'slipCount',
      'amountSummary',
      'status',
      'actions',
    ])
  })

  it('목록은 핵심 열만 노출하고 상세 경로에서 감춘 금액·전표 값을 실제로 확인한다', async () => {
    listDailyClosingsMock.mockResolvedValue({
      ...emptyPage,
      content: [{
        closingKind: 'SALES',
        sourceKind: 'TAX_INVOICE',
        closingDate: '2026-07-13',
        bizNo: '1234567890',
        partnerCode: null,
        totalSupply: '110000',
        totalVat: '11000',
        totalAmount: '121000',
        slipCount: 1,
        isLocked: true,
        lockedAt: '2026-07-13T18:00:00+09:00',
        lockedBy: '개발책임자',
      } satisfies DailyClosing],
    })
    getDailyClosingDetailMock.mockResolvedValue(detailFixture)

    renderPage()

    const list = await screen.findByTestId('daily-closing-list-table')
    const table = within(list).getByRole('table')
    const headers = within(table).getAllByRole('columnheader').map((cell) => cell.textContent)
    expect(headers).toEqual(['마감일', '구분', '마감범위', '건수', '금액 합계', '마감상태', '작업'])
    expect(within(table).queryByRole('columnheader', { name: '거래처코드' })).toBeNull()
    expect(within(table).queryByRole('columnheader', { name: '공급가' })).toBeNull()
    expect(within(table).queryByRole('columnheader', { name: '마감 시각' })).toBeNull()

    fireEvent.click(within(table).getByRole('button', { name: '상세 보기' }))
    expect(await screen.findByText('2026/07/13-1')).toBeTruthy()
    expect(screen.getByText('삼한테스트')).toBeTruthy()
    const reverseButton = screen.getByTestId('daily-closing-reverse-button-2026-07-13-ALL-SALES-TAX_INVOICE')
    expect(reverseButton).toBeTruthy()
    expect(reverseButton.hasAttribute('disabled')).toBe(false)
  })
})
