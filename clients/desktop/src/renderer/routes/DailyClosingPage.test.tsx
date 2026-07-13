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
vi.mock('../api/accounting', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/accounting')>()
  return {
    ...actual,
    listDailyClosings: (...args: unknown[]) => listDailyClosingsMock(...args),
    createDailyClosing: vi.fn(),
    reverseDailyClosing: vi.fn(),
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

// BE 계약 충실 픽스처 — DiscountRevalidator.Status 계약:
//   verified ∈ {true,false} ⟺ status=VERIFIED (판정 완료)
//   verified = null          ⟺ status ∈ {NOT_FOUND, AMBIGUOUS, MISSING_REFERENT, NOT_MEASURABLE, OUT_OF_SCOPE}
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
    // VERIFIED · verified=true → 확인 배지, 사유 '—'
    {
      productName: 'AM160NXVHHH1 [상업멀티]',
      modelName: null,
      quantity: 1,
      supplyAmount: 500000,
      releasePrice: 1000000,
      deliveryPrice: 700000,
      expectedRate: 45,
      actualRate: 45,
      verified: true,
      revalidationStatus: 'VERIFIED',
    },
    // VERIFIED · verified=false(과충전·불일치) → 불일치 배지, 사유 '—', 음수율 빨강
    {
      productName: '과충전 모델',
      modelName: null,
      quantity: 1,
      supplyAmount: 1050000,
      releasePrice: 1000000,
      deliveryPrice: 700000,
      expectedRate: 0,
      actualRate: -5,
      verified: false,
      revalidationStatus: 'VERIFIED',
    },
    // NOT_FOUND · verified=null → 판정불가, 사유 '미등록'
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
  it('매출 조회에서 확인/불일치/판정불가 배지·6종 사유·0/null/음수 할인율을 BE 계약대로 렌더한다', async () => {
    listDailyClosingsMock.mockResolvedValue(emptyPage)
    getDailyClosingDetailMock.mockResolvedValue(detailFixture)

    renderPage()

    await screen.findByText('모델별 재검증')

    // 새니티체크 캡션(집계단위 오해 방지)
    expect(screen.getByText(/모델·일 합계 평균 기준 새니티 체크/)).toBeTruthy()

    // 확인 배지(verified=true) — VERIFIED 행 스코프. 사유 컬럼이 '—' 라 행 내 '확인' 텍스트는
    // 배지 1개뿐(사유='확인' 자기모순 회귀 시 2개가 되어 실패 = genuine 고정).
    const verifiedRow = rowOf('AM160NXVHHH1 [상업멀티]')
    expect(within(verifiedRow).getAllByText('확인').length).toBe(1)
    // 기대율·할인율 둘 다 45%(2셀)·모두 비음수라 빨강 아님(회귀 가드)
    const rates45 = within(verifiedRow).getAllByText('45%')
    expect(rates45.length).toBe(2)
    rates45.forEach((el) => expect(el.getAttribute('style') ?? '').not.toContain('state-danger'))
    // VERIFIED 행 사유 = '—'(배지가 판정 전달·자기모순 방지)
    expect(within(verifiedRow).getByText('—')).toBeTruthy()

    // 불일치 배지(verified=false) — 과충전 행, 사유 '—', 음수율 빨강
    const mismatchRow = rowOf('과충전 모델')
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

    // null referent → '—' (NOT_FOUND 행 출고가/납품가 셀)
    const notFoundRow = rowOf('미등록서비스품목')
    expect(within(notFoundRow).getAllByText('—').length).toBeGreaterThanOrEqual(4) // release/delivery/expected/actual

    // 모델 컬럼 제거 확인(BE 상시 null·dead column)
    expect(screen.queryByRole('columnheader', { name: '모델' })).toBeNull()
  })

  it('매입 조회에서는 재검증 테이블을 렌더하지 않고 기존 상세 전표는 유지한다', async () => {
    listDailyClosingsMock.mockResolvedValue(emptyPage)
    getDailyClosingDetailMock.mockResolvedValue(detailFixture)

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
    // 매입에서는 재검증 테이블 미렌더(매출만 게이팅)
    expect(screen.queryByText('모델별 재검증')).toBeNull()
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
  })
})
