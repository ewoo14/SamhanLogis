import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function sourceOf(name: string): string {
  return readFileSync(new URL(`../api/${name}`, import.meta.url), 'utf8')
}

const pageSource = readFileSync(new URL('./PartnerLedgerPage.tsx', import.meta.url), 'utf8')
const mockSource = sourceOf('mock.ts')
const partnerLedgerApiSource = sourceOf('partnerLedgerApi.ts')
const taxInvoiceDetailPageSource = readFileSync(new URL('./TaxInvoiceDetailPage.tsx', import.meta.url), 'utf8')

describe('거래처 원장 사용자 안내문 계정 코드 계약', () => {
  it('폐기된 3자리 코드 대신 이카운트 4자리 정본을 안내한다', () => {
    expect(pageSource).not.toContain('(401/110 코드)')
    expect(pageSource).toContain('4019/1089')
    expect(mockSource).not.toContain("account('110'")
    expect(mockSource).not.toContain("counterAccountCode: '110'")
    expect(mockSource).not.toContain("counterAccountCode: '401'")
    expect(partnerLedgerApiSource).not.toContain('401/110')
    expect(partnerLedgerApiSource).toContain('4019/1089')
    expect(taxInvoiceDetailPageSource).not.toContain('(110/255/400)')
    expect(taxInvoiceDetailPageSource).toContain('(1089/2559/4019)')
  })
})
