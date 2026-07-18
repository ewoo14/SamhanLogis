// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PartnerAutocomplete, type PartnerOption } from '@samhan/design-system'
import { apiClient } from '../api/client'
import type { CreateTaxInvoiceRequest } from '../api/taxInvoiceApi'

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }))

// [#825 재수렴 CM-a] 풀렌더 payload 계약용 — 저장 API 와 정준 거래처 검색을 모듈 mock.
const createTaxInvoiceMock = vi.fn()
vi.mock('../api/taxInvoiceApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/taxInvoiceApi')>()
  return {
    ...actual,
    createTaxInvoice: (...args: unknown[]) => createTaxInvoiceMock(...args),
  }
})

const searchPartnersMock = vi.fn()
vi.mock('../api/partnerApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/partnerApi')>()
  return {
    ...actual,
    searchPartners: (...args: unknown[]) => searchPartnersMock(...args),
  }
})

import {
  resolveTaxInvoicePartnerCode,
  resolveTaxInvoicePartnerId,
  TaxInvoiceFormPage,
} from './TaxInvoiceFormPage'

const PARTNER_ID = '11111111-1111-4111-8111-111111111111'
const SNAPSHOT_ID = '22222222-2222-4222-8222-222222222222'
const PARTNER_ID_2 = '33333333-3333-4333-8333-333333333333'

// render 누적 방지 — screen 전역 쿼리(combobox/option)가 이전 테스트 트리와 충돌하지 않도록.
afterEach(() => {
  cleanup()
  createTaxInvoiceMock.mockReset()
  searchPartnersMock.mockReset()
})

describe('TaxInvoiceFormPage partnerId 계약', () => {
  it('새 선택 UUID가 edit snapshot보다 우선한다', () => {
    expect(resolveTaxInvoicePartnerId(PARTNER_ID, SNAPSHOT_ID, true)).toBe(PARTNER_ID)
  })

  it('edit에서 거래처를 다시 선택하지 않으면 snapshot UUID를 유지한다', () => {
    expect(resolveTaxInvoicePartnerId(undefined, SNAPSHOT_ID, false)).toBe(SNAPSHOT_ID)
  })

  it('UUID 없는 새 선택은 사업자번호 fallback 없이 null을 반환한다', () => {
    expect(resolveTaxInvoicePartnerId(undefined, SNAPSHOT_ID, true)).toBeNull()
  })

  it('PartnerAutocomplete 렌더에는 UUID를 표시하지 않는다', () => {
    const { container } = render(
      <PartnerAutocomplete
        value={{
          id: PARTNER_ID,
          partnerCode: 'P-001',
          name: '삼한물류',
          bizNo: '123-45-67890',
        }}
        onChange={() => undefined}
        searchPartners={async () => []}
      />,
    )

    expect(container.innerHTML).not.toContain(PARTNER_ID)
    expect((container.querySelector('input') as HTMLInputElement).value).toBe('삼한물류')
  })
})

/**
 * [#825 재수렴 CM-a] 실 partnerCode 결정 계약 — {@code resolveTaxInvoicePartnerId} 와
 * 대칭 시맨틱. 새 선택은 옵션의 실 코드만 사용하고(빈 값이면 null — 이전 snapshot
 * fallback 은 partnerId≠partnerCode 오염이라 금지), 재선택 없으면 BE snapshot 유지.
 */
describe('TaxInvoiceFormPage partnerCode 계약 (#825 재수렴 CM-a)', () => {
  it('새 선택의 실 partnerCode가 edit snapshot보다 우선한다', () => {
    expect(resolveTaxInvoicePartnerCode('P-2026-0001', 'P-OLD-0009', true)).toBe('P-2026-0001')
  })

  it('edit에서 거래처를 다시 선택하지 않으면 snapshot partnerCode를 유지한다', () => {
    expect(resolveTaxInvoicePartnerCode(undefined, 'P-OLD-0009', false)).toBe('P-OLD-0009')
  })

  it('코드 없는 새 선택은 snapshot fallback 없이 null — 이전 코드 오염 금지', () => {
    expect(resolveTaxInvoicePartnerCode(undefined, 'P-OLD-0009', true)).toBeNull()
    expect(resolveTaxInvoicePartnerCode('', 'P-OLD-0009', true)).toBeNull()
    expect(resolveTaxInvoicePartnerCode('   ', 'P-OLD-0009', true)).toBeNull()
  })

  it('선택도 snapshot도 없으면 null (payload에서 생략)', () => {
    expect(resolveTaxInvoicePartnerCode(undefined, '', false)).toBeNull()
  })
})

/**
 * [#825 재수렴 CM-a] 정준 검색 소스(partnerApi.searchPartners) 매핑 계약.
 *
 * <p>구 sales.ts 어댑터는 partnerCode 를 bizNo 로 채워(L6 오라벨) 동일 bizNo 2건에서
 * AsyncAutocomplete getKey(partnerCode) 충돌이 있었다 (구 R1 M4 문서화). 정준 소스는
 * BE 실 partnerCode / bizNo / partnerId(UUID) 를 분리 보유하므로 충돌 자체가 해소된다.
 */
describe('TaxInvoice 거래처 검색 정준 소스 매핑 (L6 해소)', () => {
  const SHARED_BIZ_NO = '555-66-77777'

  it('BE 응답의 실 partnerCode·bizNo·partnerId(UUID)를 분리 보유하고, 동일 bizNo 2건의 getKey(partnerCode) 충돌이 해소된다', async () => {
    const actualPartnerApi = await vi.importActual<typeof import('../api/partnerApi')>(
      '../api/partnerApi',
    )
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: {
        success: true,
        code: 'OK',
        message: '성공',
        data: {
          items: [
            {
              partnerId: PARTNER_ID,
              partnerCode: 'P-2026-0001',
              name: '본점물류',
              bizNo: SHARED_BIZ_NO,
              phone: null,
            },
            {
              partnerId: PARTNER_ID_2,
              partnerCode: 'P-2026-0002',
              name: '지점물류',
              bizNo: SHARED_BIZ_NO,
              phone: null,
            },
          ],
          total: 2,
          page: 0,
          size: 20,
        },
        timestamp: '2026-07-18T10:00:00+09:00',
      },
    } as never)

    try {
      const options = await actualPartnerApi.searchPartners('물류', { activeOnly: true })

      // activeOnly → status=ACTIVE 파라미터 경로
      expect(getSpy).toHaveBeenCalledWith('/admin/partners/search', {
        params: { q: '물류', size: 20, status: 'ACTIVE' },
      })

      expect(options.length).toBe(2)
      // 실 partnerCode ≠ bizNo — 코드 자리에 사업자번호를 넣지 않는다 (L6 해소)
      expect(options[0]!.partnerCode).toBe('P-2026-0001')
      expect(options[0]!.bizNo).toBe(SHARED_BIZ_NO)
      expect(options[0]!.partnerCode).not.toBe(options[0]!.bizNo)
      // UUID 는 id 에만 (payload 전용)
      expect(options[0]!.id).toBe(PARTNER_ID)
      expect(options[1]!.id).toBe(PARTNER_ID_2)
      // 동일 bizNo 2건이라도 getKey(=partnerCode)가 서로 달라 충돌하지 않는다
      expect(options[0]!.bizNo).toBe(options[1]!.bizNo)
      expect(options[0]!.partnerCode).not.toBe(options[1]!.partnerCode)
    } finally {
      getSpy.mockRestore()
    }
  })

  it('동일 bizNo 2건 후보에서 두 번째 항목 클릭 시 두 번째 거래처(id/코드)가 그대로 전달된다', async () => {
    const first: PartnerOption = {
      id: PARTNER_ID,
      partnerCode: 'P-2026-0001',
      name: '본점물류',
      bizNo: SHARED_BIZ_NO,
    }
    const second: PartnerOption = {
      id: PARTNER_ID_2,
      partnerCode: 'P-2026-0002',
      name: '지점물류',
      bizNo: SHARED_BIZ_NO,
    }
    const onChange = vi.fn<(partner: PartnerOption | null) => void>()

    render(
      <PartnerAutocomplete
        value={null}
        onChange={onChange}
        searchPartners={async () => [first, second]}
        minChars={1}
        debounceMs={0}
      />,
    )

    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '물류' } })

    // name 필터 — 로딩 행("검색 중…")도 role=option 이므로 실제 후보만 집계한다.
    const options = await screen.findAllByRole('option', { name: /물류/ })
    expect(options.length).toBe(2)
    // 실 partnerCode getKey는 React key/선택 동일성 전용이며, DOM id는 opaque index 기반이다.
    expect(options[0]!.id).not.toBe(options[1]!.id)

    fireEvent.mouseDown(options[1]!)

    expect(onChange).toHaveBeenCalledTimes(1)
    const picked = onChange.mock.calls[0]?.[0]
    expect(picked).toBe(second)
    expect(picked?.id).toBe(PARTNER_ID_2)
    expect(picked?.partnerCode).toBe('P-2026-0002')
    expect(picked?.name).toBe('지점물류')
  })
})

/**
 * [#825 재수렴 CM-a] 저장 payload 실 partnerCode 전송 — 풀렌더 계약.
 *
 * <p>정준 검색 선택 → 라인 입력 → 임시저장 시 createTaxInvoice 가
 * {@code partnerId(UUID) + partnerCode(실 코드) + partnerBusinessNo(bizNo)} 를 분리
 * 전송하는지 end-to-end 로 단언한다 (bizNo 를 partnerCode 로 보내는 회귀 시 RED).
 */
describe('TaxInvoiceFormPage 저장 payload 실 partnerCode 전송 (#825 재수렴 CM-a)', () => {
  function renderCreatePage() {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/accounting/tax-invoices/new']}>
          <Routes>
            <Route path="/accounting/tax-invoices/new" element={<TaxInvoiceFormPage />} />
            <Route path="*" element={<div data-testid="tax-invoice-nav-away" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }

  it('선택 거래처의 실 partnerCode 를 payload 로 전송하고 bizNo(사업자번호)와 분리한다', async () => {
    searchPartnersMock.mockResolvedValue([
      {
        id: PARTNER_ID,
        partnerCode: 'P-2026-0001',
        name: '엘에이시스템에어',
        bizNo: '123-45-67890',
        phone: '02-1234-5678',
      },
    ])
    createTaxInvoiceMock.mockResolvedValue({ id: 'created-tax-invoice-0001' })

    renderCreatePage()

    // 정준 검색 — activeOnly 로 호출
    const combo = screen.getByRole('combobox')
    fireEvent.focus(combo)
    fireEvent.change(combo, { target: { value: '엘에이' } })
    const option = await screen.findByRole('option', { name: /엘에이/ })
    expect(searchPartnersMock).toHaveBeenCalledWith('엘에이', { activeOnly: true })

    fireEvent.mouseDown(option)
    expect((combo as HTMLInputElement).value).toBe('엘에이시스템에어')

    // snapshot 분리 — 사업자번호 입력에는 bizNo (partnerCode 대체 기입 금지 = L6)
    const bizNoInput = screen.getByTestId(
      'tax-invoice-form-partner-business-no',
    ) as HTMLInputElement
    expect(bizNoInput.value).toBe('123-45-67890')

    // UUID 비공개 가드 — 선택 후 화면 어디에도 UUID 미노출
    expect(document.body.innerHTML).not.toContain(PARTNER_ID)

    // 라인 입력 (품명 + 수량>0 기본 1 + 단가)
    fireEvent.change(screen.getByTestId('tax-invoice-form-line-0-item-name'), {
      target: { value: '공조설비' },
    })
    fireEvent.change(screen.getByTestId('tax-invoice-form-line-0-unit-price'), {
      target: { value: '10000' },
    })

    // 임시저장 → createTaxInvoice payload 계약
    fireEvent.click(screen.getByTestId('tax-invoice-form-save-button'))
    await waitFor(() => expect(createTaxInvoiceMock).toHaveBeenCalledTimes(1))

    const body = createTaxInvoiceMock.mock.calls[0]![0] as CreateTaxInvoiceRequest
    expect(body.partnerId).toBe(PARTNER_ID)
    expect(body.partnerCode).toBe('P-2026-0001')
    expect(body.partnerBusinessNo).toBe('123-45-67890')
    expect(body.partnerCode).not.toBe(body.partnerBusinessNo)
    expect(body.partnerName).toBe('엘에이시스템에어')
    expect(body.lines.length).toBe(1)
    expect(body.lines[0]!.itemName).toBe('공조설비')
  })

  it('bizNo 미제공 거래처 선택 시 partnerCode 를 사업자번호로 대체 기입하지 않는다', async () => {
    searchPartnersMock.mockResolvedValue([
      {
        id: PARTNER_ID_2,
        partnerCode: 'P-2026-0002',
        name: '지점물류',
        // bizNo 없음 — 구 어댑터는 partnerCode(=bizNo 오라벨)로 채웠다
      },
    ])
    createTaxInvoiceMock.mockResolvedValue({ id: 'created-tax-invoice-0002' })

    renderCreatePage()

    const combo = screen.getByRole('combobox')
    fireEvent.focus(combo)
    fireEvent.change(combo, { target: { value: '지점' } })
    fireEvent.mouseDown(await screen.findByRole('option', { name: /지점/ }))

    // 사업자번호 snapshot 은 빈 값 유지 — 코드 유입 금지
    const bizNoInput = screen.getByTestId(
      'tax-invoice-form-partner-business-no',
    ) as HTMLInputElement
    expect(bizNoInput.value).toBe('')

    fireEvent.change(screen.getByTestId('tax-invoice-form-line-0-item-name'), {
      target: { value: '부속자재' },
    })
    fireEvent.change(screen.getByTestId('tax-invoice-form-line-0-unit-price'), {
      target: { value: '5000' },
    })
    fireEvent.click(screen.getByTestId('tax-invoice-form-save-button'))
    await waitFor(() => expect(createTaxInvoiceMock).toHaveBeenCalledTimes(1))

    const body = createTaxInvoiceMock.mock.calls[0]![0] as CreateTaxInvoiceRequest
    expect(body.partnerId).toBe(PARTNER_ID_2)
    expect(body.partnerCode).toBe('P-2026-0002')
    expect(body.partnerBusinessNo).toBeUndefined()
  })
})
