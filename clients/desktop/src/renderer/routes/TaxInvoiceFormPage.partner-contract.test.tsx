// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PartnerAutocomplete, type PartnerOption } from '@samhan/design-system'
import {
  resolveTaxInvoicePartnerId,
  toTaxInvoicePartnerOption,
} from './TaxInvoiceFormPage'

const PARTNER_ID = '11111111-1111-4111-8111-111111111111'
const SNAPSHOT_ID = '22222222-2222-4222-8222-222222222222'
const PARTNER_ID_2 = '33333333-3333-4333-8333-333333333333'

// render 누적 방지 — screen 전역 쿼리(combobox/option)가 이전 테스트 트리와 충돌하지 않도록.
afterEach(() => cleanup())

describe('TaxInvoiceFormPage partnerId 계약', () => {
  it('검색 UUID를 PartnerOption.id에만 보관하고 사업자번호를 id로 쓰지 않는다', () => {
    const option = toTaxInvoicePartnerOption({
      partnerId: PARTNER_ID,
      businessRegistrationNumber: '123-45-67890',
      companyName: '삼한물류',
      representativeName: null,
      contactPhone: null,
      address: null,
      groupName: null,
      note: null,
    })

    expect(option.id).toBe(PARTNER_ID)
    expect(option.partnerCode).toBe('123-45-67890')
    expect(option.id).not.toBe(option.partnerCode)
  })

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
 * [#825 R1 M4] 동일 사업자번호(bizNo) 2건 계약 문서화.
 *
 * <p>세금계산서 검색 어댑터는 partnerCode 를 bizNo 로 채우므로
 * (toTaxInvoicePartnerOption — {@code partnerCode: row.businessRegistrationNumber}),
 * 동일 bizNo 거래처 2건이 응답되면 AsyncAutocomplete 의
 * {@code getKey(partner) = partner.partnerCode} 가 충돌한다 (React key /
 * aria-activedescendant id 중복 경고). getKey 변경은 공유 컴포넌트의 pre-existing
 * 계약이라 이번 라운드 스코프 밖 — 여기서는 충돌 사실과 "클릭 선택은 pick(item)
 * 객체 identity 기반이라 오선택이 발생하지 않음"을 회귀 테스트로 고정한다.
 */
describe('TaxInvoiceFormPage 동일 bizNo 2건 계약 (getKey 충돌 문서화)', () => {
  const SHARED_BIZ_NO = '555-66-77777'

  const makeSummary = (partnerId: string, companyName: string) => ({
    partnerId,
    businessRegistrationNumber: SHARED_BIZ_NO,
    companyName,
    representativeName: null,
    contactPhone: null,
    address: null,
    groupName: null,
    note: null,
  })

  it('동일 bizNo 2건은 partnerCode(=getKey)가 충돌하지만 id(UUID)는 서로 다르다', () => {
    const first = toTaxInvoicePartnerOption(makeSummary(PARTNER_ID, '본점물류'))
    const second = toTaxInvoicePartnerOption(makeSummary(PARTNER_ID_2, '지점물류'))

    // getKey 충돌 — 두 옵션 모두 같은 partnerCode(=bizNo)로 매핑된다.
    expect(first.partnerCode).toBe(SHARED_BIZ_NO)
    expect(second.partnerCode).toBe(SHARED_BIZ_NO)
    expect(first.partnerCode).toBe(second.partnerCode)

    // 반면 payload 식별자 id(UUID)는 서로 달라 저장 경로에서는 구분 가능하다.
    expect(first.id).toBe(PARTNER_ID)
    expect(second.id).toBe(PARTNER_ID_2)
    expect(first.id).not.toBe(second.id)
  })

  it('동일 key 2건이 표시돼도 클릭 선택은 pick(item) identity 기반 — 두 번째 항목 클릭 시 두 번째 id 가 전달된다', async () => {
    const first = toTaxInvoicePartnerOption(makeSummary(PARTNER_ID, '본점물류'))
    const second = toTaxInvoicePartnerOption(makeSummary(PARTNER_ID_2, '지점물류'))
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

    // 동일 getKey 임에도 후보 2건 모두 렌더된다 (React key 중복 경고는 문서화된 한계).
    // name 필터 — 로딩 행("검색 중…")도 role=option 이므로 실제 후보만 집계한다.
    const options = await screen.findAllByRole('option', { name: /물류/ })
    expect(options.length).toBe(2)

    // 두 번째 항목 클릭(마우스다운) — key 조회가 아닌 클릭한 item 객체가 그대로 전달된다.
    fireEvent.mouseDown(options[1]!)

    expect(onChange).toHaveBeenCalledTimes(1)
    const picked = onChange.mock.calls[0]?.[0]
    expect(picked).toBe(second)
    expect(picked?.id).toBe(PARTNER_ID_2)
    expect(picked?.name).toBe('지점물류')
  })
})
