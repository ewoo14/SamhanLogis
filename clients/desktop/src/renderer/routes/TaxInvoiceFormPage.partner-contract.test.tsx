// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import React from 'react'
import { render } from '@testing-library/react'
import { PartnerAutocomplete } from '@samhan/design-system'
import {
  resolveTaxInvoicePartnerId,
  toTaxInvoicePartnerOption,
} from './TaxInvoiceFormPage'

const PARTNER_ID = '11111111-1111-4111-8111-111111111111'
const SNAPSHOT_ID = '22222222-2222-4222-8222-222222222222'

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
