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

  it('D15 RED-A: 본체가 공용 규칙의 source로 들어가고 target multiplier가 품목명:수량 칩에 반영된다', () => {
    const source = read('./EstimateItemsCatalogPage.tsx')

    expect(source).toContain('target.multiplier')
    expect(source).toContain('multiplier: Number(target.multiplier)')
    expect(source).toContain('product.productName')
    expect(source).toContain('existing.sources')
    expect(source).toContain('sources.push({ productCode: modelCode, factor: 1 })')
    expect(source).toContain('targets: targetDrafts.map')
    expect(source).toContain("product.productCategory === 'MATERIAL'")
  })

  it('R32 MED RED-A: 409 문구의 활성 rule key에서 source 편집 지점으로 도달한다', () => {
    const source = read('./EstimateItemsCatalogPage.tsx')

    expect(source).toContain('extractQuantitySyncRuleKeys')
    expect(source).toContain('resolveQuantitySyncRuleEditTarget')
    expect(source).toContain('setCommittedSearch(editTarget.modelCode)')
    expect(source).toContain('scrollIntoView')
    expect(source).toContain('quantitySyncRuleEditAnchorId')
  })

  it('R32 mutation RED: 409 mutation alert가 rule key별 편집 동작을 노출한다', () => {
    const source = read('./EstimateItemsCatalogPage.tsx')

    expect(source).toContain('quantitySyncRuleKeys')
    expect(source).toContain('handleQuantitySyncRuleNavigate')
    expect(source).toContain('estimate-items-mutation-error-rule')
  })

  it('R32 RED-B3: 공용 multiselect-chip-count 기본 계약과 행별 input testid 계약을 보존한다', () => {
    const pageSource = read('./EstimateItemsCatalogPage.tsx')
    const multiSelectSource = read(
      '../../../../web/design-system/src/components/MultiSelectAutocomplete/MultiSelectAutocomplete.tsx',
    )

    expect(pageSource).toContain('inputTestId={`estimate-items-quantity-sync-${row.modelCode}-input`}')
    expect(multiSelectSource).toContain("'multiselect-chip-count'")
    expect(multiSelectSource).toContain('inputTestId ? `${inputTestId}-chip-count`')
  })
})
