/**
 * Samhan Public 회계 마감 메뉴 UI gap contract.
 *
 * dev server 없이 실행되는 정적 회귀 스펙:
 * - 매출 마감 메뉴는 판매/회계 양쪽에서 정식 route `/sales/closing`으로 이동해야 한다.
 * - 월말 마감 메뉴는 회계 사이드바에서 `/accounting/period-close`로 발견 가능해야 한다.
 * - 두 route 모두 ACCOUNTANT / MANAGER / MASTER 가드와 연결되어야 한다.
 */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(__dirname, '../..')
const layoutPath = path.join(desktopRoot, 'src/renderer/components/AppLayout.tsx')
const routePath = path.join(desktopRoot, 'src/renderer/routes/index.tsx')

function read(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8')
}

test.describe('Samhan Public 회계 마감 메뉴 gap', () => {
  test('판매와 회계 사이드바는 정식 매출/월말 마감 route를 노출한다', () => {
    const layout = read(layoutPath)

    expect(layout).toContain('sidebar-sales-closing')
    expect(layout).toMatch(
      /to="\/sales\/closing"[\s\S]*data-testid="sidebar-sales-closing"[\s\S]*매출 마감/,
    )

    expect(layout).toContain('sidebar-accounting-sales-closing')
    expect(layout).toMatch(
      /to="\/sales\/closing"[\s\S]*data-testid="sidebar-accounting-sales-closing"[\s\S]*매출 마감/,
    )

    expect(layout).toContain('sidebar-accounting-period-close')
    expect(layout).toContain('to="/accounting/period-close"')
    expect(layout).toContain('월말 마감')
  })

  test('legacy warehouse closing route가 회계 메뉴의 목적지가 되지 않는다', () => {
    const layout = read(layoutPath)

    expect(layout).not.toContain('<NavLink to="/warehouse/closing">매출 마감</NavLink>')
  })

  test('정식 route는 권한 가드로 보호된다 (C2a 후 period-close 는 PermissionGuard 단일 게이트)', () => {
    const routes = read(routePath)

    // /sales/closing 은 PermissionGuard 미병행 단독 RoleGuard 라우트로 유지(C2b 대상).
    expect(routes).toMatch(
      /path:\s*'\/sales\/closing'[\s\S]*?<RoleGuard allow=\{ACCOUNTING_ROLES\}>[\s\S]*?<SalesClosingPage \/>/,
    )
    // [C2a] /accounting/period-close 는 redundant 외부 RoleGuard 제거 →
    // PermissionGuard(accounting.period-close) 단일 게이트. seed grant 가 진실원(Option A, D-PGC-01).
    expect(routes).toMatch(
      /path:\s*'\/accounting\/period-close'[\s\S]*?<PermissionGuard pageCode="accounting\.period-close"[\s\S]*?<PeriodCloseListPage \/>/,
    )
  })
})
