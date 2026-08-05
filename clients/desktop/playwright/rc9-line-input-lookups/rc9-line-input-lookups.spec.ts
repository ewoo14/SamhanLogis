/**
 * RC9 — 견적/주문 라인 입력 lookup 3종 FE 계약.
 *
 * 정적 계약과 mock runtime 계약을 함께 박제한다.
 * - product-service lookup 3종은 products.list VIEW 권한으로 보호된다.
 * - desktop sales.ts/mock.ts 는 envelope 없이 배열 직접 반환 계약을 소비한다.
 * - 견적/주문 라인 입력 화면의 참조 조회 버튼은 products.list VIEW 권한으로만 노출된다.
 * - long-pending FE 데드코드는 재도입하지 않는다.
 */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(__dirname, '../..')
const repoRoot = path.resolve(desktopRoot, '../..')
const controllerPath = path.join(
  repoRoot,
  'services/product-service/src/main/java/com/samhanair/logis/product/web/ProductLookupController.java',
)
const estimatePagePath = path.join(desktopRoot, 'src/renderer/routes/EstimateFormPage.tsx')
const partnerOrderPagePath = path.join(desktopRoot, 'src/renderer/routes/SalesPartnerOrderDetailPage.tsx')
const salesApiPath = path.join(desktopRoot, 'src/renderer/api/sales.ts')
const mockApiPath = path.join(desktopRoot, 'src/renderer/api/mock.ts')
const gatewayPath = path.join(repoRoot, 'services/api-gateway/src/main/resources/application.yml')
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

type MockPerm = { pageCode: string; view?: boolean; edit?: boolean }

function read(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8')
}

function mockPerms(perms: MockPerm[]): string {
  return Buffer.from(JSON.stringify(perms), 'utf8').toString('base64')
}

function productLookupRouteBlock(gateway: string): string {
  const match = gateway.match(/- id: product-lookups-v1[\s\S]*?(?=\n        - id:|$)/)
  expect(match, 'gateway product-lookups-v1 route block').not.toBeNull()
  return match![0]
}

function expectProtectedGetMapping(controller: string, pathValue: string): void {
  expect(controller).toContain(`@GetMapping("${pathValue}")`)
  expect(controller).toMatch(
    new RegExp(
      `@GetMapping\\("${pathValue}"\\)[^\\r\\n]*\\r?\\n\\s*@RequirePermission\\(page = "products\\.list", action = PermissionAction\\.VIEW\\)`,
    ),
  )
}

test.describe('RC9 라인 입력 lookup 정적 계약', () => {
  test('ProductLookupController 3 GET 은 products.list VIEW 권한으로 보호된다', () => {
    const controller = read(controllerPath)

    for (const pathValue of ['/material-prices', '/odu-recommendations', '/branch-pipes']) {
      expectProtectedGetMapping(controller, pathValue)
    }
  })

  test('견적/주문 라인 참조 조회 버튼은 products.list VIEW 가드와 testid 를 가진다', () => {
    const estimatePage = read(estimatePagePath)
    const partnerOrderPage = read(partnerOrderPagePath)

    expect(estimatePage).toContain("canAccess('products.list', 'view')")
    expect(estimatePage).toContain('data-testid="estimate-line-lookup-btn"')
    expect(estimatePage).toContain('<LineLookupReferenceModal')
    expect(partnerOrderPage).toContain("canAccess('products.list', 'view')")
    expect(partnerOrderPage).toContain('data-testid="partner-order-line-lookup-btn"')
    expect(partnerOrderPage).toContain('<LineLookupReferenceModal')
  })

  test('mock.ts 는 lookup 3종 경로를 envelope 없이 배열 직접 반환한다', () => {
    const mockApi = read(mockApiPath)

    expect(mockApi).toContain('/api/v1/material-prices')
    expect(mockApi).toContain('/api/v1/odu-recommendations')
    expect(mockApi).toContain('/api/v1/branch-pipes')
    expect(mockApi).toContain('return MOCK_MATERIAL_PRICE_ROWS')
    expect(mockApi).toContain('return oduRows')
    expect(mockApi).toContain('return branchRows')
    expect(mockApi).not.toMatch(/return envelope\(MOCK_MATERIAL_PRICE_ROWS\)/)
    expect(mockApi).not.toMatch(/return envelope\(oduRows\)/)
    expect(mockApi).not.toMatch(/return envelope\(branchRows\)/)
  })

  test('sales.ts 는 long-pending 데드코드를 노출하지 않는다', () => {
    const salesApi = read(salesApiPath)

    expect(salesApi).not.toContain('listLongPendingPartners')
    expect(salesApi).not.toContain('LongPendingPartner')
    expect(salesApi).not.toContain('/api/v1/partners/long-pending')
  })

  test('gateway product-lookups-v1 route 는 3 경로를 no-strip 으로 유지한다', () => {
    const gateway = read(gatewayPath)
    const block = productLookupRouteBlock(gateway)

    expect(block).toContain('/api/v1/material-prices')
    expect(block).toContain('/api/v1/odu-recommendations')
    expect(block).toContain('/api/v1/branch-pipes')
    expect(block).not.toContain('StripPrefix')
  })
})

test.describe('RC9 라인 입력 lookup mock runtime', () => {
  test('MANAGER 는 견적 작성에서 참조 조회 모달 3탭 행을 확인한다', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/sales/estimates/new?mockRole=MANAGER`, {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    })

    const lookupButton = page.getByTestId('estimate-line-lookup-btn')
    await expect(lookupButton).toBeVisible({ timeout: 15_000 })
    await lookupButton.click()

    const modal = page.getByTestId('line-lookup-modal')
    await expect(modal).toBeVisible({ timeout: 10_000 })
    await expect(modal).toContainText('D2')
    await expect(modal).toContainText('유선리모컨')

    await expect(page.getByTestId('line-lookup-tab-odu')).toHaveAttribute('role', 'tab')
    await page.getByRole('tab', { name: '추천 실외기' }).click()
    await expect(modal).toContainText('HOME_MULTI')
    await expect(modal).toContainText('MULTI_HEATING_COOLING')

    await expect(page.getByTestId('line-lookup-tab-branch')).toHaveAttribute('role', 'tab')
    await page.getByRole('tab', { name: '분지관' }).click()
    await expect(modal).toContainText('1509')
    await expect(modal).toContainText('분지관 코드')
  })

  test('products.list VIEW 권한이 없으면 견적 참조 조회 버튼을 노출하지 않는다', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/sales/estimates/new?mockRole=MANAGER`, {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    })
    await expect(page.getByTestId('estimate-line-lookup-btn')).toBeVisible({ timeout: 15_000 })

    const noProductPerms = encodeURIComponent(mockPerms([
      { pageCode: 'estimates.list', view: true, edit: true },
    ]))
    await page.goto(`${BASE_URL}/#/sales/estimates/new?mockRole=SALES&mockPerms=${noProductPerms}`, {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    })
    await page.reload({ waitUntil: 'domcontentloaded' })

    await expect(page.getByTestId('sidebar-sales-estimates')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('heading', { name: '견적서 작성' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('estimate-line-lookup-btn')).toHaveCount(0)
  })
})
