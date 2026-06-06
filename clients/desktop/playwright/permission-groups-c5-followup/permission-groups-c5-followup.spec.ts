/**
 * 권한그룹 C5 후속 정리 정적 계약.
 *
 * dev server 없이 source contract 로 실행한다.
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

function read(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8')
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
      'VENDOR_ORDER_OCR_SIDEBAR_ROLES',
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
    expect(layout).toMatch(/hasAnyBuiltinRoleGroup\(auth,\s*\['MASTER',\s*'MANAGER'\]\)/)
  })

  test('S5 route 3건은 PermissionGuard page-code 단일 게이트로 전환된다', () => {
    const routes = read(routePath)

    expect(routes).toMatch(
      /path:\s*'\/sales\/closing'[\s\S]*?<PermissionGuard pageCode="accounting\.period-close" action="view">[\s\S]*?<SalesClosingPage \/>/,
    )
    expect(routes).toMatch(
      /path:\s*'\/sales\/vendor-order-upload'[\s\S]*?<PermissionGuard pageCode="sales\.vendor-order" action="view">[\s\S]*?<SalesVendorOrderUploadPage \/>/,
    )
    expect(routes).toMatch(
      /path:\s*'\/admin\/sheet-sync'[\s\S]*?<PermissionGuard pageCode="products\.sync" action="view">[\s\S]*?<AdminSheetSyncPage \/>/,
    )
    expect(routes).not.toContain('ACCOUNTING_ROLES')
    expect(routes).not.toContain('VENDOR_ORDER_OCR_ROLES')
    expect(routes).not.toContain('SHEET_SYNC_ROLES')
  })
})
