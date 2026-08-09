import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('#896 RED-A — 견적품목 수량 동기화 칩 UI', () => {
  it('기준 품목 행에 종속 품목을 칩으로 선택·저장하고 재조회할 UI 계약이 존재한다', () => {
    const source = read('./EstimateItemsCatalogPage.tsx')

    expect(source).toContain('listQuantitySyncRules')
    expect(source).toContain('createQuantitySyncRule')
    expect(source).toContain('estimate-items-quantity-sync')
    expect(source).toContain('label="수량 동기화 품목"')
    expect(source).toContain('수량 동기화 저장')
  })
})
