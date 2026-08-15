/**
 * 권한그룹 C5 후속 정리 정적 계약.
 *
 * source contract 와 mock runtime contract 를 함께 검증한다.
 * - SalesQueryPage 는 role 문자열이 아니라 세션 groups 기반 canQuerySales(auth) 를 사용한다.
 * - AppLayout 은 C5 대상 정적 role fallback 상수/헬퍼를 사용하지 않는다.
 * - S5 전환 라우트 3건은 PermissionGuard 단일 게이트를 사용한다.
 */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(__dirname, '../..')
const layoutPath = path.join(desktopRoot, 'src/renderer/components/AppLayout.tsx')
const routePath = path.join(desktopRoot, 'src/renderer/routes/index.tsx')
const sessionPath = path.join(desktopRoot, 'src/renderer/stores/session.ts')
const salesQueryPath = path.join(desktopRoot, 'src/renderer/routes/sales-query/SalesQueryPage.tsx')
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

function read(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8')
}

type MockPerm = { pageCode: string; view?: boolean; edit?: boolean }

function mockPerms(perms: MockPerm[]): string {
  return btoa(JSON.stringify(perms))
}

test.describe('권한그룹 C5 후속 정리', () => {
  test('canQuerySales 는 세션 그룹 기반으로 SALES/MANAGER/MASTER 를 판정한다', () => {
    const session = read(sessionPath)
    const salesQuery = read(salesQueryPath)

    expect(session).toContain('export function canQuerySales(auth: AuthSnapshot | null): boolean')
    expect(session).not.toContain('canQuerySales(role: string')
    expect(session).toContain("hasBuiltinRoleGroup(auth, 'SALES')")
    expect(session).toContain("hasBuiltinRoleGroup(auth, 'MANAGER')")
    expect(session).toContain("hasBuiltinRoleGroup(auth, 'MASTER')")
    expect(salesQuery).toContain('const auth = useSessionStore((s) => s.auth)')
    expect(salesQuery).toContain('const canQuery = canQuerySales(auth)')
  })

  test('AppLayout C5 대상 메뉴는 정적 role fallback 상수/헬퍼를 사용하지 않는다', () => {
    const layout = read(layoutPath)

    for (const token of [
      'canAccessAccounting',
      'canAccessAdmin',
      'canAccessAudit',
      'ACCOUNTING_EDIT_REQUEST_REVIEWER_ROLES',
      'ARO_MANUAL_DISPATCH_ROLES',
      'ARO_PRECLASSIFY_ROLES',
      'ARO_UNASSIGNED_ROLES',
      'ARO_ADMIN_DISPATCH_ROLES',
      'SLIP_CLEANUP_ROLES',
      'SLIP_EDIT_REQUEST_REVIEWER_ROLES',
      'REGION_MGMT_SIDEBAR_ROLES',
      'SHEET_SYNC_SIDEBAR_ROLES',
      'ALIGO_ADDRESS_BOOK_SIDEBAR_ROLES',
      'BLOCKED_PARTNERS_SIDEBAR_ROLES',
    ]) {
      expect(layout).not.toContain(token)
    }

    expect(layout).toContain("dynamicCanAccess('accounting.edit-requests.decide', 'view')")
    expect(layout).toContain("dynamicCanAccess('slip.edit-requests.decide', 'view')")
    expect(layout).toContain("dynamicCanAccess('slip.cleanup', 'view')")
    expect(layout).toMatch(/dynamicCanAccess\('products\.sync',\s*'view'\)/)
    expect(layout).toMatch(/const showSheetSync = showProductsSync/)
    // [Round B] 시트 동기화 링크는 품목 권한 동반 노출 분기 도입으로 show={showSheetSync && showProductsList}
    //   / show={showSheetSync && !showProductsList} 두 변형을 갖는다(기존 단일 show={showSheetSync} 가정은
    //   stale → 상시 FAIL 이던 선재 갭). showSheetSync 게이트 보존만 박제하도록 표현식 시작을 허용 매칭한다.
    expect(layout).toMatch(/to="\/admin\/sheet-sync"[\s\S]*?show=\{showSheetSync\b/)
    expect(layout).toMatch(/const showAccountingPeriodClose = dynamicCanAccess\('accounting\.period-close',\s*'view'\)/)
    expect(layout).toMatch(/to="\/sales\/closing"[\s\S]*?show=\{showAccountingPeriodClose\}/)

    // [사이클1 fix] arologis 사이드바 = 라우트 PermissionGuard 와 동일 page-code 단일 소스
    // (그룹 UUID 매칭 분기 제거 — FE P1-2 + Designer D-002 일원화).
    expect(layout).toMatch(/dynamicCanAccess\('arologis\.dispatch\.admin',\s*'view'\)/)
    expect(layout).toMatch(/dynamicCanAccess\('arologis\.dispatch\.ops',\s*'view'\)/)
    expect(layout).toMatch(/dynamicCanAccess\('notification\.dispatch-sms\.display',\s*'view'\)/)
    // 매출 마감 사이드바 = accounting.period-close 단일 page-code (D-001 과다 노출 교정).
    expect(layout).not.toMatch(/to="\/sales\/closing"\s+show=\{showAccounting\}/)
    // [Round B P2] 단톡방 매핑 그룹웨어 단일화 — 기존 !showAdmin 분기(빌트인 MASTER 그룹 UUID 비교)
    //   제거. hasAnyBuiltinRoleGroup 헬퍼/ showAdmin 변수가 dead 가 되어 완전 삭제되었음을 박제한다.
    //   (단톡방 매핑은 messenger.admin 동적 권한자 전원이 그룹웨어에서 단일 노출 — AdminLayout 중복 제거.)
    expect(layout).not.toContain('hasAnyBuiltinRoleGroup')
    expect(layout).not.toMatch(/const showAdmin\b/)
    // 단톡방 매핑 entry 는 그룹웨어 블록에서 messenger.admin 단독 게이트(showChatRoomAdmin)로 노출.
    expect(layout).toMatch(/to="\/admin\/chat-rooms"[\s\S]*?show=\{showChatRoomAdmin\}/)
    expect(layout).not.toMatch(/show=\{showChatRoomAdmin\s*&&\s*!showAdmin\}/)
  })

  test('messenger.admin 권한자는 그룹웨어 단톡방 매핑에 도달하고 SALES에는 항목이 없다', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/?mockRole=MANAGER`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await expect(page.getByTestId('sidebar-category-toggle-그룹웨어')).toBeVisible({ timeout: 15000 })
    await page.getByTestId('sidebar-category-toggle-그룹웨어').click()
    await expect(page.getByTestId('sidebar-admin-chat-rooms')).toBeVisible({ timeout: 15000 })
    await page.getByTestId('sidebar-admin-chat-rooms').click()
    await expect(page).toHaveURL(/#\/admin\/chat-rooms/)
    await expect(page.getByTestId('admin-chatrooms-table')).toBeVisible({ timeout: 15000 })

    await page.goto(`${BASE_URL}/#/?mockRole=SALES`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('sidebar-admin-chat-rooms')).toHaveCount(0)
  })

  test('S5 route 3건은 PermissionGuard page-code 단일 게이트로 전환된다', () => {
    const routes = read(routePath)

    expect(routes).toMatch(
      /path:\s*'\/sales\/closing'[\s\S]*?<PermissionGuard pageCode="accounting\.period-close" action="view">[\s\S]*?<SalesClosingPage \/>/,
    )
    expect(routes).toMatch(
      /path:\s*'\/admin\/sheet-sync'[\s\S]*?<PermissionGuard pageCode="products\.sync" action="view">[\s\S]*?<AdminSheetSyncPage \/>/,
    )
    expect(routes).not.toContain('ACCOUNTING_ROLES')
    expect(routes).not.toContain('SHEET_SYNC_ROLES')
  })

  test('mock runtime: products.sync grant controls /admin/sheet-sync allow and redirect', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/admin/sheet-sync?mockRole=MANAGER`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await expect(page).toHaveURL(/#\/admin\/sheet-sync/)
    await expect(page.getByTestId('admin-sheetsync-trigger-btn')).toBeVisible({ timeout: 15000 })

    await page.goto(`${BASE_URL}/#/admin/sheet-sync?mockRole=SALES`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect.poll(() => page.url(), { timeout: 15000 }).not.toContain('/admin/sheet-sync')
    await expect(page.getByTestId('admin-sheetsync-trigger-btn')).toHaveCount(0)
  })

  test('mock runtime: MANAGER can enter /sales/closing and sees close action surface', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/sales/closing?mockRole=MANAGER`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await expect(page).toHaveURL(/#\/sales\/closing/)
    await expect(page.getByTestId('sales-closing-new-button')).toBeVisible({ timeout: 15000 })
  })

  test('mock runtime: slip.print.export download controls sales export button', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/sales?mockRole=MANAGER`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await expect(page).toHaveURL(/#\/sales/)
    await expect(page.getByTestId('sales-query-excel-download')).toBeVisible({ timeout: 15000 })

    await page.goto(`${BASE_URL}/#/sales?mockRole=SALES`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/#\/sales/)
    await expect(page.getByTestId('sales-query-excel-download')).toHaveCount(0)
  })

  test('mock runtime: V37 ACCOUNTANT daily-closing.run CREATE enables daily close button', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/accounting/daily-closing?mockRole=ACCOUNTANT`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })

    await expect(page).toHaveURL(/#\/accounting\/daily-closing/)
    await expect(page.getByTestId('daily-closing-page')).toBeVisible({ timeout: 15000 })
    // 권한 축만 검증하도록 범위를 명시적으로 전체(ALL)로 선택한다.
    // 범위 미지정 disabled가 ACCOUNTANT의 실행 권한 단언을 마스킹하지 않게 한다.
    await page.getByTestId('daily-closing-exec-button').click()
    await page.getByTestId('daily-closing-all-chip').click()
    await expect(page.getByTestId('daily-closing-exec-button')).toBeEnabled()
    await expect(page.getByText('일마감 실행 권한이 없습니다')).toHaveCount(0)
  })

  test('mock runtime: view-only daily closing permission keeps daily close button disabled', async ({ page }) => {
    const viewOnly = encodeURIComponent(mockPerms([
      { pageCode: 'accounting.daily-closing', view: true, edit: false },
      { pageCode: 'accounting.daily-closing.run', view: true, edit: false },
    ]))

    await page.goto(`${BASE_URL}/#/accounting/daily-closing?mockRole=SALES&mockPerms=${viewOnly}`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })

    await expect(page).toHaveURL(/#\/accounting\/daily-closing/)
    await expect(page.getByTestId('daily-closing-page')).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('daily-closing-exec-button')).toBeDisabled()
    await expect(page.getByText(/마감 실행 권한이 없습니다/)).toBeVisible()
  })

  test('mock runtime: MASTER daily-closing.unlock UPDATE shows reverse action', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/accounting/daily-closing?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })

    await expect(page).toHaveURL(/#\/accounting\/daily-closing/)
    await expect(page.getByTestId('daily-closing-page')).toBeVisible({ timeout: 15000 })
    await page.getByTestId('daily-closing-tab-history').click()
    await expect(page.getByTestId(/^daily-closing-reverse-button-/)).toBeVisible({ timeout: 15000 })
  })
})
