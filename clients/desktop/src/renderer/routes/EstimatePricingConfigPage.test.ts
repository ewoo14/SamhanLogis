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
    expect(route).toContain('<PermissionGuard pageCode="sales.estimate-config" action="view">')
    expect(subNav).not.toContain("'/sales/estimate-config'")
    expect(subNav).not.toContain('견적 가격 설정')
    expect(layout).toContain('to="/sales/estimate-config"')
    expect(layout).toContain('data-testid="sidebar-sales-estimate-config"')
    expect(layout).toContain("const showEstimateConfig = dynamicCanAccess('sales.estimate-config', 'view')")
    expect(layout).not.toContain("dynamicCanAccess('sales.estimate-config', 'view') || dynamicCanAccess('products.price-schedule', 'view')")
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

  test('제품 카테고리별 단가변동 route/menu/page-code 계약을 등록한다', () => {
    const route = read('src/renderer/routes/index.tsx')
    const layout = read('src/renderer/components/AppLayout.tsx')
    const page = read('src/renderer/routes/ProductPriceSchedulePage.tsx')
    const catalogApi = read('src/renderer/api/productCatalogApi.ts')
    const mock = read('src/renderer/api/mock.ts')

    // productCatalogApi.ts — admin GET/PUT 배선(S4a #774 계약 그대로 소비).
    expect(catalogApi).toContain('getPriceChangeScheduleAdmin')
    expect(catalogApi).toContain('updatePriceChangeSchedule')
    expect(catalogApi).toContain('/api/v1/products/admin/price-change-schedule')

    expect(route).toContain("path: '/products/price-schedule'")
    expect(route).toContain('<PermissionGuard pageCode="products.price-schedule" action="view">')
    expect(route).toContain('<ProductPriceSchedulePage />')
    expect(layout).toContain("const showPriceSchedule          = dynamicCanAccess('products.price-schedule',       'view')")
    expect(layout).toContain('to="/products/price-schedule"')
    expect(layout).toContain('show={showPriceSchedule}')

    // ProductPriceSchedulePage.tsx — products.price-schedule 단일 page-code 가드.
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

  test('단가변동과 전역 견적 설정의 VIEW 역할 집합을 정확히 대조한다', () => {
    const mock = read('src/renderer/api/mock.ts')
    const roles = ['MASTER', 'MANAGER', 'SALES', 'ACCOUNTANT', 'WAREHOUSE', 'INVENTORY', 'DISPATCH', 'DRIVER', 'STAFF', 'DEVELOPER', 'PARTNER']
    const viewSource = mock.slice(
      mock.indexOf('const SP_D1_DEFAULT_VIEW'),
      mock.indexOf('const SP_D1_DEFAULT_EDIT'),
    )

    const rolesWithPage = (pageCode: string) => roles.filter((role) => {
      if (role === 'MASTER') return true
      const roleBlock = viewSource.match(
        new RegExp(`\\n  ${role}: \\[(?:(?!\\n  [A-Z]+: \\[)[\\s\\S])*?\\n  \\],`),
      )?.[0] ?? ''
      return roleBlock.includes(`'${pageCode}'`)
    })

    expect(rolesWithPage('products.price-schedule')).toEqual(['MASTER', 'MANAGER', 'ACCOUNTANT'])
    expect(rolesWithPage('sales.estimate-config')).toEqual(['MASTER', 'MANAGER'])
  })
})
