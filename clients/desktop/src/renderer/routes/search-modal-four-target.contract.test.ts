import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('#1049 4종 공용 검색 결과 선택 모달 연결 계약', () => {
  it('품목·수신자·거래처·담당자가 모두 공용 모달 계약을 사용한다', () => {
    expect(read('./EstimateItemsCatalogPage.tsx')).toContain('<ProductMultiSelectAutocomplete')
    expect(read('./MessengerPage.tsx')).toContain('resultSelectionMode="multiple"')
    expect(read('./DepositorMappingPage.tsx')).toContain('resultSelectionMode="single"')
    expect(read('./GroupwareApprovalCreatePage.tsx')).toContain('resultSelectionMode="multiple"')
  })
})
