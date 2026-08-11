import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

describe('EstimatePricingConfigPage contract', () => {
  test('설정 화면의 두 버튼이 실제 sales CSS module의 btnMini 스타일을 사용한다', () => {
    const css = read('src/renderer/components/sales/sales.module.css')
    const pricingPage = read('src/renderer/routes/EstimatePricingConfigPage.tsx')
    const dcPage = read('src/renderer/routes/SalesPartnerDcConfigPage.tsx')

    expect(css).toMatch(/\.btnMini\s*\{/)
    expect(pricingPage.match(/styles\[['"]btnMini['"]\]/g)).toHaveLength(2)
    expect(dcPage.match(/styles\[['"]btnMini['"]\]/g)).toHaveLength(5)
  })

  test('판매 전역 견적 설정 route/menu/API/page-code 계약을 등록한다', () => {
    const route = read('src/renderer/routes/index.tsx')
    const subNav = read('src/renderer/components/sales/SalesSubNav.tsx')
    const layout = read('src/renderer/components/AppLayout.tsx')
    const api = read('src/renderer/api/sales.ts')
    const page = read('src/renderer/routes/EstimatePricingConfigPage.tsx')
    const mock = read('src/renderer/api/mock.ts')

    expect(route).toContain("path: '/sales/estimate-config'")
    // H1(#17 S4b R1 fix) — ACCOUNTANT OR 도달 허용으로 배열 pageCode 로 변경(PermissionGuard 확장).
    expect(route).toContain("pageCode={['sales.estimate-config', 'products.price-schedule']}")
    expect(subNav).toContain("'/sales/estimate-config'")
    expect(subNav).toContain('견적 가격 설정')
    expect(layout).toContain("dynamicCanAccess('sales.estimate-config', 'view')")
    expect(api).toContain('getEstimateConfig')
    expect(api).toContain('updateEstimateConfig')
    expect(page).toContain("canAccess('sales.estimate-config', 'update')")
    expect(page).toContain('옵션 기본값')
    expect(page).toContain('homeNoHose')
    expect(page).toContain('singlePanelShape')
    expect(page).toContain('singleMaterialInclusion')
    expect(mock).toContain('/api/v1/estimate-config')
    expect(mock).toContain('cardFeeRate: 0.03')
    expect(mock).toContain("singlePanelShape: '원형'")
    expect(api).toContain('homeNoHose: boolean')
    expect(api).toContain('singleDiscount: number')
  })

  test('카테고리별 단가변동(#17 S4b) admin 섹션 API/page-code/mock 계약을 등록한다', () => {
    const page = read('src/renderer/routes/EstimatePricingConfigPage.tsx')
    const catalogApi = read('src/renderer/api/productCatalogApi.ts')
    const mock = read('src/renderer/api/mock.ts')

    // productCatalogApi.ts — admin GET/PUT 배선(S4a #774 계약 그대로 소비).
    expect(catalogApi).toContain('getPriceChangeScheduleAdmin')
    expect(catalogApi).toContain('updatePriceChangeSchedule')
    expect(catalogApi).toContain('/api/v1/products/admin/price-change-schedule')

    // EstimatePricingConfigPage.tsx — estimateConfig 폼과 분리된 자립 섹션 + kebab page-code 가드.
    expect(page).toContain('getPriceChangeScheduleAdmin')
    expect(page).toContain('updatePriceChangeSchedule')
    expect(page).toContain("canAccess('products.price-schedule')")
    expect(page).toContain("canAccess('products.price-schedule', 'update')")
    expect(page).toContain('카테고리별 단가변동')
    expect(page).toContain('홈멀티')
    expect(page).toContain('싱글')
    expect(page).toContain('상업멀티')
    expect(page).toContain('구형')

    // mock.ts — MASTER/MANAGER/ACCOUNTANT 권한 시뮬레이션 등재(누락 시 mock 모드 canAccess 전건 false).
    expect(mock).toContain("'products.price-schedule'")
  })
})
