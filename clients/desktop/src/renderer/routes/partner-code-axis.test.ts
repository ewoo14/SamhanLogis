import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const estimateForm = readFileSync(new URL('./EstimateFormPage.tsx', import.meta.url), 'utf8')
const slipDetail = readFileSync(new URL('./SlipDetailPage.tsx', import.meta.url), 'utf8')
const salesApi = readFileSync(new URL('../api/sales.ts', import.meta.url), 'utf8')

describe('partnerCode 축 분리', () => {
  it('견적 거래처 옵션과 business number fallback을 서로 섞지 않는다', () => {
    expect(estimateForm).toContain('partnerCode: row.partnerCode')
    expect(estimateForm).toContain('businessRegistrationNumber: option.bizNo ?? \'\'')
    expect(estimateForm).toContain('partnerCode: partner.partnerCode')
    expect(estimateForm).not.toContain('partnerCode: row.businessRegistrationNumber')
    expect(estimateForm).not.toContain('businessRegistrationNumber: option.bizNo ?? option.partnerCode')
    expect(estimateForm).not.toContain('partnerCode: partner.businessRegistrationNumber')
  })

  it('전표 controlled option은 거래처코드만 partnerCode에 넣는다', () => {
    expect(slipDetail).toContain('partnerCode: code')
    expect(slipDetail).not.toContain('partnerCode: bizNo')
  })

  it('견적 상세와 거래처 검색 fallback은 사업자번호를 거래처코드로 대체하지 않는다', () => {
    expect(salesApi).toContain("partnerCode: e.partnerCode ?? ''")
    expect(salesApi).toContain("businessRegistrationNumber: row.bizNo ?? ''")
    expect(salesApi).not.toContain("partnerCode: e.partnerBusinessNo ?? ''")
    expect(salesApi).not.toContain('businessRegistrationNumber: row.bizNo ?? row.partnerCode')
  })
})
