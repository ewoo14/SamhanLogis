import { expect, test, type Locator, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../../..')
const baseUrl = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const qaDir = resolveQaShotsDir(path.join(repoRoot, 'docs/qa/2026-08-11-dg1-s4a'))

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8')
}

function mockPerms(perms: Array<{ pageCode: string; view?: boolean; edit?: boolean }>): string {
  return Buffer.from(JSON.stringify(perms), 'utf8').toString('base64')
}

function withMockPerms(pathname: string, perms: Array<{ pageCode: string; view?: boolean; edit?: boolean }>): string {
  return `${baseUrl}/#${pathname}?mockPerms=${encodeURIComponent(mockPerms(perms))}`
}

async function expectActuallyVisible(page: Page, locator: Locator): Promise<void> {
  await locator.scrollIntoViewIfNeeded()
  await expect(locator).toBeVisible()
  const box = await locator.boundingBox()
  expect(box, 'locator가 DOM에는 있으나 bounding box가 없습니다.').not.toBeNull()
  const bounds = box!
  const viewport = page.viewportSize()
  expect(viewport).not.toBeNull()
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.y).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport!.width)
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport!.height)
  const hitTest = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y)
    return Boolean(element && (element === document.querySelector('[data-testid="sidebar-accounting-sales-commission-settlements"]') || element.closest('[data-testid="sidebar-accounting-sales-commission-settlements"]')))
  }, { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 })
  expect(hitTest, 'locator 중심점이 다른 요소에 가려져 hit-test에 실패했습니다.').toBe(true)
}

test.describe('D-G1 S4a 영업수수료 정산 실제 화면 QA', () => {
  test.beforeAll(() => fs.mkdirSync(qaDir, { recursive: true }))

  test('ACCOUNTANT: 회계 메뉴가 실제로 보이고 문서번호 클릭이 상세로 이동한다', async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 900 })
    await page.goto(`${baseUrl}/#/accounting/sales-commission-settlements?mockRole=ACCOUNTANT`, { waitUntil: 'networkidle' })
    await expect(page.locator('h3').filter({ hasText: '영업수수료 정산' })).toBeVisible()
    await page.getByTestId('app-drawer-toggle').click()
    await page.waitForTimeout(350)
    await expectActuallyVisible(page, page.getByTestId('sidebar-accounting-sales-commission-settlements'))
    await page.keyboard.press('Escape')
    await page.waitForTimeout(350)

    const documentLink = page.getByTestId('sales-commission-settlement-document-2026/08/11-1')
    await expect(documentLink).toBeVisible()
    await documentLink.click()
    await expect(page).toHaveURL(/\/accounting\/sales-commission-settlements\//)
    await expect(page.locator('h3').filter({ hasText: '2026/08/11-1' })).toBeVisible()
    await expect(page.getByTestId('sales-commission-settlement-back')).toBeVisible()
    await page.screenshot({ path: path.join(qaDir, 'accountant-detail.png'), fullPage: true })
  })

  test('DRAFT 생성 후 확정하면 settlementDate 기준 문서번호가 채번된다', async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 900 })
    await page.goto(`${baseUrl}/#/accounting/sales-commission-settlements?mockRole=ACCOUNTANT`, { waitUntil: 'networkidle' })
    await page.getByLabel('정산 기준일').fill('2026-08-13')
    await page.getByTestId('sales-commission-settlement-create').click()
    await expect(page.getByRole('heading', { name: '문서번호 없음' })).toBeVisible()
    await page.getByTestId('sales-commission-settlement-confirm').click()
    await expect(page.locator('h3').filter({ hasText: /2026\/08\/13-/ })).toBeVisible()
    await expect(page.getByText('확정', { exact: true })).toBeVisible()
    await page.screenshot({ path: path.join(qaDir, 'draft-confirmed.png'), fullPage: true })
  })

  test('권한 없는 역할은 메뉴가 보이지 않고 직접 진입도 차단된다', async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 900 })
    const noPermission = [{ pageCode: 'sales.slip.list', view: true, edit: false }]
    await page.goto(withMockPerms('/accounting/sales-commission-settlements', noPermission), { waitUntil: 'networkidle' })
    await expect(page).not.toHaveURL(/\/accounting\/sales-commission-settlements/)
    await expect(page.getByTestId('sidebar-accounting-sales-commission-settlements')).toHaveCount(0)
    await page.screenshot({ path: path.join(qaDir, 'no-permission-hidden.png'), fullPage: true })
  })
})

test.describe('D-G1 S4a 정적 계약 및 기존 회계 메뉴 회귀', () => {
  test('전용 pageCode·REST 권한·7 action seed가 일치한다', () => {
    const controller = read('services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/SalesCommissionSettlementController.java')
    const pageCode = read('services/auth-service/src/main/java/com/samhanair/logis/auth/domain/PageCode.java')
    const migration = read('services/auth-service/src/main/resources/db/migration/V101__seed_sales_commission_settlement_page_permission.sql')
    const matrix = read('clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx')
    for (const action of ['can_view', 'can_create', 'can_update', 'can_delete', 'can_restore', 'can_download', 'can_print']) expect(migration).toContain(action)
    expect(controller).toContain('@RequirePermission(page = PAGE_CODE, action = PermissionAction.VIEW)')
    expect(controller).toContain('@RequirePermission(page = PAGE_CODE, action = PermissionAction.CREATE)')
    expect(controller).toContain('@RequirePermission(page = PAGE_CODE, action = PermissionAction.UPDATE)')
    expect(pageCode).toContain('accounting.sales-commission-settlement')
    expect(matrix).toContain('accounting.sales-commission-settlement')
  })

  test('회계 기존 메뉴 좌표가 보존된 채 정산 메뉴만 추가된다', () => {
    const layout = read('clients/desktop/src/renderer/components/AppLayout.tsx')
    for (const route of [
      '/accounting/sales-slips', '/accounting/purchase-slips', '/accounting/accounts',
      '/accounting/journals', '/accounting/tax-invoices', '/accounting/balances',
      '/accounting/reports', '/accounting/period-close', '/accounting/statement-batch',
      '/accounting/partner-ledger', '/accounting/hometax-export', '/accounting/supplier-profiles',
      '/accounting/bank-card-admin', '/accounting/bank-transactions', '/accounting/deposit-mappings',
      '/accounting/admin/cash-receipts', '/accounting/daily-closing', '/accounting/ledgers',
      '/accounting/admin/ledger/sales', '/accounting/admin/ledger/purchase', '/accounting/admin/migration-ops',
      '/admin/accounting-edit-requests', '/accounting/sales-commission-settlements',
    ]) expect(layout).toContain(route)
  })
})
