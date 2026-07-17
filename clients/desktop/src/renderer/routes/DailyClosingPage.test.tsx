// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

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

import { DailyClosingPage } from './DailyClosingPage'

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
})
