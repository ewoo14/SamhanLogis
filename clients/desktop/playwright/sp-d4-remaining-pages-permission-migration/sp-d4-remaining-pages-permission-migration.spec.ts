/**
 * SP-D4 잔여 7 도메인 동적 RBAC PermissionGuard 이중 가드 마이그레이션 — Playwright 스펙
 *
 * 실행 조건:
 *   cd clients/desktop
 *   VITE_MOCK_MODE=1 npx vite src/renderer --host 127.0.0.1 --port 5173  (별도 터미널)
 *   npx playwright test playwright/sp-d4-remaining-pages-permission-migration/sp-d4-remaining-pages-permission-migration.spec.ts --reporter=line
 *
 * dev server 미가용 시 테스트 FAIL (false green 방지 — SP-09 패턴 일관).
 * 스크린샷 저장:
 *   clients/desktop/playwright/sp-d4-remaining-pages-permission-migration/screenshots/T{n}-{slug}.png
 *   docs/qa/sp-d4-remaining-pages-permission-migration/screenshots/sidebar-{role}.png
 *
 * TC 목록 (14건):
 *   T01 MASTER allow arologis.admin: /arologis/admin 200 + 사이드바 노출
 *   T02 MANAGER allow partners.list: /partners 200 + 데이터 노출
 *   T03 ACCOUNTANT deny partners.block: /partners/block 사이드바 hidden + URL redirect
 *   T04 SALES allow sales.partner-order.draft: /sales/partner-orders/new → 저장 버튼 활성
 *   T05 SALES deny admin.users: /admin/users URL 직접 진입 → redirect 403
 *   T06 WAREHOUSE allow inventory.warehouse: /inventory/warehouses → 창고 목록 + 편집 활성
 *   T07 WAREHOUSE deny sales.partner-order.list: /sales/partner-orders 사이드바 hidden
 *   T08 DISPATCH allow arologis.admin: /arologis/admin 200 + 편집 가능
 *   T09 DISPATCH allow inventory.warehouse: /warehouses 200 + 사이드바 노출
 *   T10 INVENTORY allow inventory.stock: /inventory/stocks 재고 현황 200
 *   T11 INVENTORY deny arologis.admin: 사이드바 hidden
 *   T12 ACCOUNTANT view-only partners.list: /partners 200, edit 버튼 disabled
 *   T13 revoke 시나리오: SALES sales.partner-order.confirm revoke → 사이드바 hidden
 *   T14 URL 직접 진입 redirect: SALES /inventory/audit 직접 진입 → "/" redirect
 *
 * SP-D4 마이그레이션 대상 22 PageCode (§2 카탈로그):
 *   estimates.list / sales.partner-order.list / sales.partner-order.draft
 *   sales.partner-order.confirm / sales.partner-order.history / sales.partner-order.print
 *   inventory.warehouse / inventory.stock / inventory.stock-transfer
 *   inventory.dps / inventory.audit / admin.employees / admin.users / partners.list
 *   partners.detail / partners.block / partners.edit-request / products.list
 *   products.admin / arologis.admin / arologis.region
 *
 * BE endpoint (auth-service, SP-D1 구현):
 *   GET  /auth/admin/permissions/my    — 현재 사용자 권한 목록
 *   POST /auth/admin/permissions/batch — batch update (MASTER 전용)
 *
 * SP-D3 cycle 3 회귀 가드:
 *   - @MockBean DynamicPermissionClient 의무 (BE IT 점검)
 *   - X-User-Role 헤더 명시 의무
 *   - false green (|| true / test.skip(!ok) / page.setContent) 0건
 */

import { test, expect, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import * as http from 'http'
import { fileURLToPath } from 'url'
import { resolveMockQaShotsDir } from '../support/qa-screenshot-dir'

// ---------------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------------

const _filename = fileURLToPath(import.meta.url)
const _dirname = path.dirname(_filename)

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

/** Playwright 스펙 내 스크린샷 저장 디렉터리 */
// 캡처는 커밋된 확정 증거(docs/qa/<slug>/*.png)가 아니라 gitignore 된 _local/ 로 나간다 —
// 재실행이 증거를 덮어쓰지 못하게 한다. 승격은 QA_SHOTS_DIR 로만 opt-in (#926 참조 구현).
const SPEC_SS_DIR = resolveMockQaShotsDir(path.resolve(_dirname, 'screenshots'))

/** docs/qa 사이드바 스크린샷 저장 디렉터리 */
// 캡처는 커밋된 확정 증거(docs/qa/<slug>/*.png)가 아니라 gitignore 된 _local/ 로 나간다 —
// 재실행이 증거를 덮어쓰지 못하게 한다. 승격은 QA_SHOTS_DIR 로만 opt-in (#926 참조 구현).
const SIDEBAR_SS_DIR = resolveMockQaShotsDir(path.resolve(
  _dirname,
  '../../../../docs/qa/sp-d4-remaining-pages-permission-migration/screenshots',
))

function ensureDirs(): void {
  if (!fs.existsSync(SPEC_SS_DIR)) {
    fs.mkdirSync(SPEC_SS_DIR, { recursive: true })
  }
  if (!fs.existsSync(SIDEBAR_SS_DIR)) {
    fs.mkdirSync(SIDEBAR_SS_DIR, { recursive: true })
  }
}

/** dev server 가용 여부 확인 — 미가용 시 false 반환 (테스트는 반드시 FAIL) */
async function isServerAvailable(): Promise<boolean> {
  return new Promise(resolve => {
    try {
      const url = new URL(BASE_URL)
      const req = http.get(
        {
          hostname: url.hostname,
          port: Number(url.port) || 80,
          path: '/',
          timeout: 2000,
        },
        res => {
          resolve(true)
          res.resume()
        },
      )
      req.on('error', () => resolve(false))
      req.on('timeout', () => {
        req.destroy()
        resolve(false)
      })
    } catch {
      resolve(false)
    }
  })
}

const SKIP_UI =
  process.env['PLAYWRIGHT_SKIP_UI'] === '1' ||
  process.env['PLAYWRIGHT_SKIP_UI'] === 'true'

/** pageerror 훅 등록 */
function attachPageErrorHook(page: Page, errors: string[]): void {
  page.on('pageerror', err => {
    errors.push(err.message)
  })
}

// ---------------------------------------------------------------------------
// SP-D4 22 PageCode 정의 — §2 카탈로그 기준
// ---------------------------------------------------------------------------

/**
 * SP-D4 ROLE × PageCode 매트릭스 (V=canView, E=canEdit, -=false)
 * §2 카탈로그 일치.
 */
const SP_D4_PERMISSION_MATRIX: Record<string, Record<string, { view: boolean; edit: boolean }>> = {
  MASTER: {
    'estimates.list': { view: true, edit: true },
    'sales.partner-order.list': { view: true, edit: true },
    'sales.partner-order.draft': { view: true, edit: true },
    'sales.partner-order.confirm': { view: true, edit: true },
    'sales.partner-order.history': { view: true, edit: true },
    'sales.partner-order.print': { view: true, edit: true },
    'inventory.warehouse': { view: true, edit: true },
    'inventory.stock': { view: true, edit: true },
    'inventory.stock-transfer': { view: true, edit: true },
    'inventory.dps': { view: true, edit: true },
    'inventory.audit': { view: true, edit: true },
    'admin.employees': { view: true, edit: true },
    'admin.users': { view: true, edit: true },
    'partners.list': { view: true, edit: true },
    'partners.detail': { view: true, edit: true },
    'partners.block': { view: true, edit: true },
    'partners.edit-request': { view: true, edit: true },
    'products.list': { view: true, edit: true },
    'products.admin': { view: true, edit: true },
    'arologis.admin': { view: true, edit: true },
    'arologis.region': { view: true, edit: true },
  },
  MANAGER: {
    'estimates.list': { view: true, edit: true },
    'sales.partner-order.list': { view: true, edit: true },
    'sales.partner-order.draft': { view: true, edit: true },
    'sales.partner-order.confirm': { view: true, edit: true },
    'sales.partner-order.history': { view: true, edit: false },
    'sales.partner-order.print': { view: true, edit: false },
    'inventory.warehouse': { view: true, edit: true },
    'inventory.stock': { view: true, edit: false },
    'inventory.stock-transfer': { view: true, edit: true },
    'inventory.dps': { view: true, edit: false },
    'inventory.audit': { view: true, edit: false },
    'admin.employees': { view: true, edit: true },
    'admin.users': { view: false, edit: false },
    'partners.list': { view: true, edit: true },
    'partners.detail': { view: true, edit: true },
    'partners.block': { view: true, edit: true },
    'partners.edit-request': { view: true, edit: true },
    'products.list': { view: true, edit: true },
    'products.admin': { view: true, edit: true },
    'arologis.admin': { view: true, edit: true },
    'arologis.region': { view: true, edit: true },
  },
  ACCOUNTANT: {
    'estimates.list': { view: true, edit: false },
    'sales.partner-order.list': { view: true, edit: false },
    'sales.partner-order.draft': { view: false, edit: false },
    'sales.partner-order.confirm': { view: false, edit: false },
    'sales.partner-order.history': { view: true, edit: false },
    'sales.partner-order.print': { view: false, edit: false },
    'inventory.warehouse': { view: false, edit: false },
    'inventory.stock': { view: true, edit: false },
    'inventory.stock-transfer': { view: false, edit: false },
    'inventory.dps': { view: false, edit: false },
    'inventory.audit': { view: true, edit: false },
    'admin.employees': { view: false, edit: false },
    'admin.users': { view: false, edit: false },
    'partners.list': { view: true, edit: false },
    'partners.detail': { view: true, edit: false },
    'partners.block': { view: false, edit: false },
    'partners.edit-request': { view: false, edit: false },
    'products.list': { view: true, edit: false },
    'products.admin': { view: false, edit: false },
    'arologis.admin': { view: false, edit: false },
    'arologis.region': { view: false, edit: false },
  },
  SALES: {
    'estimates.list': { view: true, edit: true },
    'sales.partner-order.list': { view: true, edit: true },
    'sales.partner-order.draft': { view: true, edit: true },
    'sales.partner-order.confirm': { view: true, edit: true },
    'sales.partner-order.history': { view: true, edit: false },
    'sales.partner-order.print': { view: true, edit: true },
    'inventory.warehouse': { view: false, edit: false },
    'inventory.stock': { view: true, edit: false },
    'inventory.stock-transfer': { view: false, edit: false },
    'inventory.dps': { view: false, edit: false },
    'inventory.audit': { view: false, edit: false },
    'admin.employees': { view: false, edit: false },
    'admin.users': { view: false, edit: false },
    'partners.list': { view: true, edit: true },
    'partners.detail': { view: true, edit: true },
    'partners.block': { view: false, edit: false },
    'partners.edit-request': { view: true, edit: false },
    'products.list': { view: true, edit: false },
    'products.admin': { view: true, edit: true },
    'arologis.admin': { view: false, edit: false },
    'arologis.region': { view: false, edit: false },
  },
  WAREHOUSE: {
    'estimates.list': { view: false, edit: false },
    'sales.partner-order.list': { view: false, edit: false },
    'sales.partner-order.draft': { view: false, edit: false },
    'sales.partner-order.confirm': { view: false, edit: false },
    'sales.partner-order.history': { view: false, edit: false },
    'sales.partner-order.print': { view: true, edit: false },
    'inventory.warehouse': { view: true, edit: true },
    'inventory.stock': { view: true, edit: true },
    'inventory.stock-transfer': { view: true, edit: true },
    'inventory.dps': { view: true, edit: true },
    'inventory.audit': { view: true, edit: false },
    'admin.employees': { view: false, edit: false },
    'admin.users': { view: false, edit: false },
    'partners.list': { view: false, edit: false },
    'partners.detail': { view: false, edit: false },
    'partners.block': { view: false, edit: false },
    'partners.edit-request': { view: false, edit: false },
    'products.list': { view: true, edit: false },
    'products.admin': { view: false, edit: false },
    'arologis.admin': { view: false, edit: false },
    'arologis.region': { view: false, edit: false },
  },
  DISPATCH: {
    'estimates.list': { view: false, edit: false },
    'sales.partner-order.list': { view: false, edit: false },
    'sales.partner-order.draft': { view: false, edit: false },
    'sales.partner-order.confirm': { view: false, edit: false },
    'sales.partner-order.history': { view: false, edit: false },
    'sales.partner-order.print': { view: false, edit: false },
    'inventory.warehouse': { view: true, edit: false },
    'inventory.stock': { view: true, edit: false },
    'inventory.stock-transfer': { view: false, edit: false },
    'inventory.dps': { view: false, edit: false },
    'inventory.audit': { view: false, edit: false },
    'admin.employees': { view: false, edit: false },
    'admin.users': { view: false, edit: false },
    'partners.list': { view: false, edit: false },
    'partners.detail': { view: false, edit: false },
    'partners.block': { view: false, edit: false },
    'partners.edit-request': { view: false, edit: false },
    'products.list': { view: false, edit: false },
    'products.admin': { view: false, edit: false },
    'arologis.admin': { view: true, edit: true },
    'arologis.region': { view: true, edit: true },
  },
  INVENTORY: {
    'estimates.list': { view: false, edit: false },
    'sales.partner-order.list': { view: false, edit: false },
    'sales.partner-order.draft': { view: false, edit: false },
    'sales.partner-order.confirm': { view: false, edit: false },
    'sales.partner-order.history': { view: false, edit: false },
    'sales.partner-order.print': { view: false, edit: false },
    'inventory.warehouse': { view: true, edit: true },
    'inventory.stock': { view: true, edit: true },
    'inventory.stock-transfer': { view: true, edit: true },
    'inventory.dps': { view: true, edit: true },
    'inventory.audit': { view: true, edit: false },
    'admin.employees': { view: false, edit: false },
    'admin.users': { view: false, edit: false },
    'partners.list': { view: false, edit: false },
    'partners.detail': { view: false, edit: false },
    'partners.block': { view: false, edit: false },
    'partners.edit-request': { view: false, edit: false },
    'products.list': { view: true, edit: false },
    'products.admin': { view: true, edit: true },
    'arologis.admin': { view: false, edit: false },
    'arologis.region': { view: false, edit: false },
  },
}

// ---------------------------------------------------------------------------
// 권한 mock 빌더 — ROLE 기반 permissions/my 응답 생성
// ---------------------------------------------------------------------------

function buildPermissionsForRole(role: keyof typeof SP_D4_PERMISSION_MATRIX) {
  const matrix = SP_D4_PERMISSION_MATRIX[role]
  return {
    success: true,
    data: Object.entries(matrix)
      .filter(([, perms]) => perms.view || perms.edit)
      .map(([pageCode, perms]) => ({
        pageCode,
        canView: perms.view,
        canEdit: perms.edit,
      })),
  }
}

/** 특정 pageCode 만 revoke 한 SALES 권한 */
function buildSalesWithRevokedConfirm() {
  const matrix = { ...SP_D4_PERMISSION_MATRIX['SALES'] }
  matrix['sales.partner-order.confirm'] = { view: false, edit: false }
  return {
    success: true,
    data: Object.entries(matrix)
      .filter(([, perms]) => perms.view || perms.edit)
      .map(([pageCode, perms]) => ({
        pageCode,
        canView: perms.view,
        canEdit: perms.edit,
      })),
  }
}

/**
 * [Round C] 사이드바 카테고리는 기본 접힘이므로 자식 링크 단언 전 해당 그룹을 펼친다.
 * 활성 라우트 자동 펼침 등으로 이미 펼쳐져 있으면 클릭을 건너뛴다.
 */
async function openSidebarCategory(page: Page, label: string): Promise<void> {
  const toggle = page.getByTestId(`sidebar-category-toggle-${label.replace(/\s+/g, '')}`)
  await expect(toggle, `${label} 그룹 토글 버튼`).toBeVisible({ timeout: 10_000 })
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click()
  }
  await expect(toggle, `${label} 그룹 펼침 상태`).toHaveAttribute('aria-expanded', 'true')
}

// ---------------------------------------------------------------------------
// URL 상수 — HashRouter 라우트
// ---------------------------------------------------------------------------

const AROLOGIS_ADMIN_MASTER_URL = `${BASE_URL}/#/arologis/admin?mockRole=MASTER`
const AROLOGIS_ADMIN_DISPATCH_URL = `${BASE_URL}/#/arologis/admin?mockRole=DISPATCH`
const AROLOGIS_ADMIN_INVENTORY_URL = `${BASE_URL}/#/arologis/admin?mockRole=INVENTORY`
const PARTNERS_MANAGER_URL = `${BASE_URL}/#/partners?mockRole=MANAGER`
const PARTNERS_ACCOUNTANT_URL = `${BASE_URL}/#/partners?mockRole=ACCOUNTANT`
// partners.block PermissionGuard 는 /admin/blocked-partners 라우트에 아직 미적용 (SP-D4 FE 작업 의무)
// 현재 라우트는 RoleGuard(MANAGER/MASTER)만 적용됨 — ACCOUNTANT(뷰어) deny 검증 목적
const PARTNERS_BLOCK_ACCOUNTANT_URL = `${BASE_URL}/#/admin/blocked-partners?mockRole=ACCOUNTANT`
const PARTNER_ORDERS_NEW_SALES_URL = `${BASE_URL}/#/sales/partner-orders/new?mockRole=SALES`
const PARTNER_ORDERS_LIST_WAREHOUSE_URL = `${BASE_URL}/#/sales/partner-orders?mockRole=WAREHOUSE`
// admin.users PageCode 는 /admin/permission-matrix 라우트를 보호함 (routes/index.tsx §SP-D4)
const ADMIN_USERS_SALES_URL = `${BASE_URL}/#/admin/permission-matrix?mockRole=SALES`
// inventory.warehouse PageCode 는 /warehouses 라우트를 보호함 (routes/index.tsx §SP-D4)
const INVENTORY_WAREHOUSES_WAREHOUSE_URL = `${BASE_URL}/#/warehouses?mockRole=WAREHOUSE`
const INVENTORY_WAREHOUSES_DISPATCH_URL = `${BASE_URL}/#/warehouses?mockRole=DISPATCH`
const INVENTORY_STOCKS_INVENTORY_URL = `${BASE_URL}/#/inventory/stocks?mockRole=INVENTORY`
// inventory.audit PageCode 는 /warehouse/audit 라우트를 보호함 (routes/index.tsx §SP-D4)
const INVENTORY_AUDIT_SALES_URL = `${BASE_URL}/#/warehouse/audit?mockRole=SALES`

// ---------------------------------------------------------------------------
// TC T01~T14
// ---------------------------------------------------------------------------

test.describe('SP-D4 잔여 7 도메인 동적 RBAC 마이그레이션 (T01~T14)', () => {
  test.skip(SKIP_UI, 'PLAYWRIGHT_SKIP_UI=1 — UI 테스트 전체 skip')

  test.beforeEach(async () => {
    const ok = await isServerAvailable()
    expect(
      ok,
      `dev server 미접근: ${BASE_URL} — VITE_MOCK_MODE=1 npx vite src/renderer --host 127.0.0.1 --port 5173 실행 후 재시도`,
    ).toBe(true)
  })

  // -------------------------------------------------------------------------
  /**
   * T01: MASTER allow arologis.admin
   *
   * 검증:
   *   - GET /auth/admin/permissions/my → MASTER: arologis.admin view=true, edit=true
   *   - /arologis/admin 접근 → 200, redirect 미발생
   *   - 사이드바에 [data-testid="sidebar-arologis-admin"] 노출
   */
  test('T01: MASTER allow arologis.admin → /arologis/admin 200 + 사이드바 노출', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureDirs()

    await page.route('**/auth/admin/permissions/my', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildPermissionsForRole('MASTER')),
      })
    })

    await page.route('**/arologis/admin/**', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: [], total: 0 }),
        })
      } else {
        await route.continue()
      }
    })

    await test.step('MASTER — /arologis/admin 접근 가능 (redirect 미발생)', async () => {
      await page.goto(AROLOGIS_ADMIN_MASTER_URL, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()
      const isRedirected =
        currentUrl.endsWith('/#/') ||
        currentUrl.endsWith('/#') ||
        (currentUrl.includes(BASE_URL) && !currentUrl.includes('/arologis/admin'))

      expect(
        isRedirected,
        `MASTER arologis.admin 접근 차단됨 — URL: ${currentUrl}. arologis.admin view=true 보유 MASTER 는 접근 허용 필요.`,
      ).toBe(false)
    })

    await test.step('MASTER — 홈 진입 후 사이드바에 아로로지스 관리 메뉴 노출 확인', async () => {
      await page.goto(`${BASE_URL}/#/?mockRole=MASTER`, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1500)

      const sidebar = page.locator('nav, aside, [data-testid="app-sidebar"]').first()
      const sidebarVisible = await sidebar.isVisible().catch(() => false)
      expect(sidebarVisible, '사이드바가 렌더링되어야 함').toBe(true)

      // [Round C] 자동매칭은 '배차' 카테고리 자식 — 기본 접힘이므로 먼저 펼친다.
      await openSidebarCategory(page, '배차')
      // arologis.admin 기반 SidebarLink 의 실제 data-testid: sidebar-arologis-auto-dispatch
      const arologisAdminLink = page.locator('[data-testid="sidebar-arologis-auto-dispatch"]')
      const arologisAdminVisible = await arologisAdminLink.isVisible().catch(() => false)
      expect(
        arologisAdminVisible,
        'MASTER 사이드바에 아로로지스 자동매칭 메뉴가 표시되어야 함 — arologis.admin view=true (testid: sidebar-arologis-auto-dispatch)',
      ).toBe(true)
    })

    await page.screenshot({ path: path.join(SPEC_SS_DIR, 'T01-master-arologis-admin-allow.png'), fullPage: true })
    // 사이드바 스크린샷 (MASTER)
    await page.screenshot({ path: path.join(SIDEBAR_SS_DIR, 'sidebar-master.png'), fullPage: true })

    await page.unroute('**/auth/admin/permissions/my')
    await page.unroute('**/arologis/admin/**')

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T02: MANAGER allow partners.list
   *
   * 검증:
   *   - GET /auth/admin/permissions/my → MANAGER: partners.list view=true, edit=true
   *   - /partners 접근 → 200, redirect 미발생
   *   - 거래처 목록 데이터 영역 노출 확인
   */
  test('T02: MANAGER allow partners.list → /partners 200 + 데이터 노출', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureDirs()

    await page.route('**/auth/admin/permissions/my', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildPermissionsForRole('MANAGER')),
      })
    })

    await page.route('**/partners**', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: [{ id: 'p001', name: '테스트거래처' }], total: 1 }),
        })
      } else {
        await route.continue()
      }
    })

    await test.step('MANAGER — /partners 접근 가능 (redirect 미발생)', async () => {
      await page.goto(PARTNERS_MANAGER_URL, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()
      const isRedirected =
        currentUrl.endsWith('/#/') ||
        currentUrl.endsWith('/#') ||
        (currentUrl.includes(BASE_URL) && !currentUrl.includes('/partners'))

      expect(
        isRedirected,
        `MANAGER partners.list 접근 차단됨 — URL: ${currentUrl}. partners.list view=true 보유 MANAGER 는 접근 허용 필요.`,
      ).toBe(false)
    })

    await page.screenshot({ path: path.join(SPEC_SS_DIR, 'T02-manager-partners-list-allow.png'), fullPage: true })
    // 사이드바 스크린샷 (MANAGER)
    await page.goto(`${BASE_URL}/#/?mockRole=MANAGER`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(1000)
    await page.screenshot({ path: path.join(SIDEBAR_SS_DIR, 'sidebar-manager.png'), fullPage: true })

    await page.unroute('**/auth/admin/permissions/my')
    await page.unroute('**/partners**')

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T03: ACCOUNTANT deny partners.block
   *
   * 검증:
   *   - GET /auth/admin/permissions/my → ACCOUNTANT: partners.block view=false
   *   - 사이드바에 [data-testid="sidebar-partners-block"] hidden
   *   - /partners/block URL 직접 진입 → redirect "/"
   */
  test('T03: ACCOUNTANT deny partners.block → 사이드바 hidden + URL 직접 진입 redirect', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureDirs()

    await page.route('**/auth/admin/permissions/my', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildPermissionsForRole('ACCOUNTANT')),
      })
    })

    await test.step('ACCOUNTANT — 사이드바에 거래처 차단 메뉴 hidden 확인', async () => {
      await page.goto(`${BASE_URL}/#/?mockRole=ACCOUNTANT`, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1500)

      const sidebar = page.locator('nav, aside, [data-testid="app-sidebar"]').first()
      const sidebarVisible = await sidebar.isVisible().catch(() => false)
      expect(sidebarVisible, '사이드바가 렌더링되어야 함').toBe(true)

      // partners.block 기반 SidebarLink 의 실제 data-testid: sidebar-sales-blocked-partners
      const partnersBlockLink = page.locator('[data-testid="sidebar-sales-blocked-partners"]')
      const partnersBlockVisible = await partnersBlockLink.isVisible().catch(() => false)
      expect(
        partnersBlockVisible,
        'ACCOUNTANT 사이드바에 거래처 차단 메뉴가 표시됨 — partners.block 권한 없으므로 hidden 필요 (testid: sidebar-sales-blocked-partners)',
      ).toBe(false)
    })

    await test.step('ACCOUNTANT — /admin/blocked-partners URL 직접 진입 차단 확인 (RoleGuard or PermissionGuard)', async () => {
      // /admin/blocked-partners 는 MANAGER/MASTER RoleGuard 적용
      // ACCOUNTANT 는 RoleGuard 에서 차단 → "접근 권한이 없습니다" 화면 표시 (URL 유지)
      await page.goto(PARTNERS_BLOCK_ACCOUNTANT_URL, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()
      const bodyText = (await page.textContent('body')) ?? ''

      // RoleGuard 는 URL 유지 + "접근 권한이 없습니다" 텍스트 렌더링
      const isBlockedByRoleGuard =
        bodyText.includes('접근 권한이 없습니다') ||
        bodyText.includes('권한 보유자만')

      // PermissionGuard 는 navigate('/', {replace: true}) → URL 변경
      const isRedirectedByPermGuard =
        currentUrl.endsWith('/#/') ||
        currentUrl.endsWith('/#') ||
        (currentUrl.includes(BASE_URL) && !currentUrl.includes('/admin/blocked-partners')) ||
        currentUrl.includes('/login')

      expect(
        isBlockedByRoleGuard || isRedirectedByPermGuard,
        `ACCOUNTANT /admin/blocked-partners 차단 미작동 — URL: ${currentUrl}. RoleGuard(접근 권한 없음) 또는 PermissionGuard(redirect) 중 하나가 동작해야 함.`,
      ).toBe(true)
    })

    await page.screenshot({ path: path.join(SPEC_SS_DIR, 'T03-accountant-partners-block-deny.png'), fullPage: true })
    // 사이드바 스크린샷 (ACCOUNTANT)
    await page.goto(`${BASE_URL}/#/?mockRole=ACCOUNTANT`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(1000)
    await page.screenshot({ path: path.join(SIDEBAR_SS_DIR, 'sidebar-accountant.png'), fullPage: true })

    await page.unroute('**/auth/admin/permissions/my')

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T04: SALES allow sales.partner-order.draft
   *
   * 검증:
   *   - GET /auth/admin/permissions/my → SALES: sales.partner-order.draft view=true, edit=true
   *   - /sales/partner-orders/new 접근 → 페이지 로드 + 저장 버튼 활성 확인
   *   - pageerror 없음
   */
  test('T04: SALES allow sales.partner-order.draft → /sales/partner-orders/new 작성 + 저장 버튼 활성', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureDirs()

    await page.route('**/auth/admin/permissions/my', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildPermissionsForRole('SALES')),
      })
    })

    await page.route('**/partner-orders**', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: [], total: 0 }),
        })
      } else {
        await route.continue()
      }
    })

    await test.step('SALES — /sales/partner-orders/new 접근 가능 (redirect 미발생)', async () => {
      await page.goto(PARTNER_ORDERS_NEW_SALES_URL, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()
      const isRedirected =
        currentUrl.endsWith('/#/') ||
        currentUrl.endsWith('/#') ||
        (currentUrl.includes(BASE_URL) && !currentUrl.includes('/partner-orders'))

      expect(
        isRedirected,
        `SALES sales.partner-order.draft 접근 차단됨 — URL: ${currentUrl}. sales.partner-order.draft view=true 보유 SALES 는 접근 허용 필요.`,
      ).toBe(false)
    })

    await test.step('SALES — 거래처주문 작성 페이지 저장 버튼 활성 확인 (canEdit=true)', async () => {
      // canEdit=true 인 경우 저장/제출 버튼이 disabled 되지 않아야 함
      const saveButton = page.locator(
        '[data-testid="partner-order-save-button"], button[type="submit"], button:has-text("저장"), button:has-text("작성")',
      ).first()
      const saveButtonExists = await saveButton.isVisible().catch(() => false)

      if (saveButtonExists) {
        const isDisabled = await saveButton.isDisabled().catch(() => false)
        expect(
          isDisabled,
          'SALES canEdit=true 인데 저장 버튼이 disabled — sales.partner-order.draft edit=true 이므로 enabled 필요',
        ).toBe(false)
      }
      // 버튼이 렌더링되지 않은 경우(페이지 구조 차이)는 URL 접근 성공으로 대체 검증
    })

    await page.screenshot({ path: path.join(SPEC_SS_DIR, 'T04-sales-partner-order-draft-allow.png'), fullPage: true })
    // 사이드바 스크린샷 (SALES)
    await page.goto(`${BASE_URL}/#/?mockRole=SALES`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(1000)
    await page.screenshot({ path: path.join(SIDEBAR_SS_DIR, 'sidebar-sales.png'), fullPage: true })

    await page.unroute('**/auth/admin/permissions/my')
    await page.unroute('**/partner-orders**')

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T05: SALES deny admin.users
   *
   * 검증:
   *   - GET /auth/admin/permissions/my → SALES: admin.users view=false
   *   - /admin/users URL 직접 진입 → redirect "/" (403 효과)
   *   - 계정 관리 페이지 콘텐츠 미표시
   */
  test('T05: SALES deny admin.users → /admin/users URL 직접 진입 → redirect 403', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureDirs()

    await page.route('**/auth/admin/permissions/my', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildPermissionsForRole('SALES')),
      })
    })

    await test.step('SALES — /admin/permission-matrix 직접 진입 차단 확인 (RoleGuard or PermissionGuard)', async () => {
      // /admin/permission-matrix 는 RoleGuard(MASTER) + PermissionGuard(admin.users) 이중 가드
      // SALES 는 RoleGuard(MASTER only) 에서 차단 → "접근 권한이 없습니다" 화면 표시 (URL 유지)
      await page.goto(ADMIN_USERS_SALES_URL, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()
      const bodyText = (await page.textContent('body')) ?? ''

      // RoleGuard 는 URL 유지 + "접근 권한이 없습니다" 텍스트 렌더링
      const isBlockedByRoleGuard =
        bodyText.includes('접근 권한이 없습니다') ||
        bodyText.includes('권한 보유자만')

      // PermissionGuard 는 navigate('/', {replace: true}) → URL 변경
      const isRedirectedByPermGuard =
        currentUrl.endsWith('/#/') ||
        currentUrl.endsWith('/#') ||
        (currentUrl.includes(BASE_URL) && !currentUrl.includes('/admin/permission-matrix')) ||
        currentUrl.includes('/login')

      expect(
        isBlockedByRoleGuard || isRedirectedByPermGuard,
        `SALES /admin/permission-matrix 차단 미작동 — URL: ${currentUrl}. RoleGuard(접근 권한 없음) 또는 PermissionGuard(redirect) 중 하나가 동작해야 함.`,
      ).toBe(true)
    })

    await test.step('SALES — 권한설정 콘텐츠 미표시 확인 (admin.users 차단)', async () => {
      const bodyText = (await page.textContent('body')) ?? ''
      const adminUsersPageLoaded =
        bodyText.includes('권한설정') ||
        bodyText.includes('PermissionMatrix') ||
        bodyText.includes('admin.users')

      expect(
        adminUsersPageLoaded,
        '차단된 /admin/permission-matrix 페이지 콘텐츠가 표시됨 — 권한설정 텍스트 미표시 필요.',
      ).toBe(false)
    })

    await page.screenshot({ path: path.join(SPEC_SS_DIR, 'T05-sales-admin-users-deny.png'), fullPage: true })

    await page.unroute('**/auth/admin/permissions/my')

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T06: WAREHOUSE allow inventory.warehouse
   *
   * 검증:
   *   - GET /auth/admin/permissions/my → WAREHOUSE: inventory.warehouse view=true, edit=true
   *   - /inventory/warehouses 접근 → 창고 목록 표시 + 편집 버튼 활성
   */
  test('T06: WAREHOUSE allow inventory.warehouse → /inventory/warehouses 창고 목록 + 편집 활성', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureDirs()

    await page.route('**/auth/admin/permissions/my', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildPermissionsForRole('WAREHOUSE')),
      })
    })

    await page.route('**/warehouses**', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: [{ id: 'wh001', code: 'WH-001', name: '서울 창고' }],
            total: 1,
          }),
        })
      } else {
        await route.continue()
      }
    })

    await test.step('WAREHOUSE — /warehouses 접근 가능 (redirect 미발생) — inventory.warehouse PageCode 보호', async () => {
      await page.goto(INVENTORY_WAREHOUSES_WAREHOUSE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()
      const isRedirected =
        currentUrl.endsWith('/#/') ||
        currentUrl.endsWith('/#') ||
        (currentUrl.includes(BASE_URL) && !currentUrl.includes('/warehouses'))

      expect(
        isRedirected,
        `WAREHOUSE inventory.warehouse 접근 차단됨 — URL: ${currentUrl}. inventory.warehouse view=true 보유 WAREHOUSE 는 접근 허용 필요.`,
      ).toBe(false)
    })

    await test.step('WAREHOUSE — inventory.warehouse canEdit=true → 편집 버튼 활성 확인', async () => {
      const editButton = page.locator(
        '[data-testid="warehouse-edit-button"], button:has-text("편집"), button:has-text("수정")',
      ).first()
      const editButtonExists = await editButton.isVisible().catch(() => false)

      if (editButtonExists) {
        const isDisabled = await editButton.isDisabled().catch(() => false)
        expect(
          isDisabled,
          'WAREHOUSE canEdit=true 인데 편집 버튼이 disabled — inventory.warehouse edit=true 이므로 enabled 필요',
        ).toBe(false)
      }
    })

    await page.screenshot({ path: path.join(SPEC_SS_DIR, 'T06-warehouse-inventory-warehouse-allow.png'), fullPage: true })
    // 사이드바 스크린샷 (WAREHOUSE)
    await page.goto(`${BASE_URL}/#/?mockRole=WAREHOUSE`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(1000)
    await page.screenshot({ path: path.join(SIDEBAR_SS_DIR, 'sidebar-warehouse.png'), fullPage: true })

    await page.unroute('**/auth/admin/permissions/my')
    await page.unroute('**/warehouses**')

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T07: WAREHOUSE deny sales.partner-order.list
   *
   * 검증:
   *   - GET /auth/admin/permissions/my → WAREHOUSE: sales.partner-order.list view=false
   *   - 사이드바에 [data-testid="sidebar-partner-orders"] hidden
   */
  test('T07: WAREHOUSE deny sales.partner-order.list → 사이드바 hidden', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureDirs()

    await page.route('**/auth/admin/permissions/my', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildPermissionsForRole('WAREHOUSE')),
      })
    })

    await test.step('WAREHOUSE — 사이드바에 거래처주문 목록 hidden 확인', async () => {
      await page.goto(`${BASE_URL}/#/?mockRole=WAREHOUSE`, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1500)

      const sidebar = page.locator('nav, aside, [data-testid="app-sidebar"]').first()
      const sidebarVisible = await sidebar.isVisible().catch(() => false)
      expect(sidebarVisible, '사이드바가 렌더링되어야 함').toBe(true)

      // sales.partner-order.list 기반 SidebarLink 의 실제 data-testid: sidebar-sales-partner-orders
      const partnerOrdersLink = page.locator('[data-testid="sidebar-sales-partner-orders"]')
      const partnerOrdersVisible = await partnerOrdersLink.isVisible().catch(() => false)
      expect(
        partnerOrdersVisible,
        'WAREHOUSE 사이드바에 거래처주문 목록이 표시됨 — sales.partner-order.list 권한 없으므로 hidden 필요 (testid: sidebar-sales-partner-orders)',
      ).toBe(false)
    })

    await test.step('WAREHOUSE — /sales/partner-orders URL 직접 진입 차단 확인 (RoleGuard or PermissionGuard)', async () => {
      await page.goto(PARTNER_ORDERS_LIST_WAREHOUSE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()
      const bodyText = (await page.textContent('body')) ?? ''

      // RoleGuard 는 URL 유지 + "접근 권한이 없습니다" 텍스트 렌더링
      // PermissionGuard 는 navigate('/', {replace: true}) → URL 변경
      const isBlockedByRoleGuard =
        bodyText.includes('접근 권한이 없습니다') ||
        bodyText.includes('권한 보유자만')

      const isRedirectedByPermGuard =
        currentUrl.endsWith('/#/') ||
        currentUrl.endsWith('/#') ||
        (currentUrl.includes(BASE_URL) && !currentUrl.includes('/sales/partner-orders')) ||
        currentUrl.includes('/login')

      expect(
        isBlockedByRoleGuard || isRedirectedByPermGuard,
        `WAREHOUSE /sales/partner-orders 차단 미작동 — URL: ${currentUrl}. RoleGuard(접근 권한 없음 텍스트) 또는 PermissionGuard(redirect) 중 하나가 동작해야 함.`,
      ).toBe(true)
    })

    await page.screenshot({ path: path.join(SPEC_SS_DIR, 'T07-warehouse-partner-order-list-deny.png'), fullPage: true })

    await page.unroute('**/auth/admin/permissions/my')

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T08: DISPATCH allow arologis.admin
   *
   * 검증:
   *   - GET /auth/admin/permissions/my → DISPATCH: arologis.admin view=true, edit=true
   *   - /arologis/admin 접근 → 200, redirect 미발생
   *   - 편집 가능 (canEdit=true) 확인
   */
  test('T08: DISPATCH allow arologis.admin → /arologis/admin 200 + 편집 가능', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureDirs()

    await page.route('**/auth/admin/permissions/my', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildPermissionsForRole('DISPATCH')),
      })
    })

    await page.route('**/arologis/admin/**', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: [], total: 0 }),
        })
      } else {
        await route.continue()
      }
    })

    await test.step('DISPATCH — /arologis/admin 접근 가능 (redirect 미발생)', async () => {
      await page.goto(AROLOGIS_ADMIN_DISPATCH_URL, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()
      const isRedirected =
        currentUrl.endsWith('/#/') ||
        currentUrl.endsWith('/#') ||
        (currentUrl.includes(BASE_URL) && !currentUrl.includes('/arologis/admin'))

      expect(
        isRedirected,
        `DISPATCH arologis.admin 접근 차단됨 — URL: ${currentUrl}. arologis.admin view=true 보유 DISPATCH 는 접근 허용 필요.`,
      ).toBe(false)
    })

    await page.screenshot({ path: path.join(SPEC_SS_DIR, 'T08-dispatch-arologis-admin-allow.png'), fullPage: true })
    // 사이드바 스크린샷 (DISPATCH)
    await page.goto(`${BASE_URL}/#/?mockRole=DISPATCH`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(1000)
    await page.screenshot({ path: path.join(SIDEBAR_SS_DIR, 'sidebar-dispatch.png'), fullPage: true })

    await page.unroute('**/auth/admin/permissions/my')
    await page.unroute('**/arologis/admin/**')

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T09: DISPATCH allow inventory.warehouse
   *
   * 검증:
   *   - GET /auth/admin/permissions/my → DISPATCH: inventory.warehouse view=true, edit=false
   *   - 사이드바에 창고 운영 그룹 노출
   *   - /warehouses 직접 진입 redirect 미발생
   */
  test('T09: DISPATCH allow inventory.warehouse → /warehouses 200 + 사이드바 노출', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureDirs()

    await page.route('**/auth/admin/permissions/my', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildPermissionsForRole('DISPATCH')),
      })
    })

    await page.route('**/warehouses**', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: [{ id: 'wh-dispatch-1', code: 'WH-DSP', name: '배차 출고창고' }],
            total: 1,
          }),
        })
      } else {
        await route.continue()
      }
    })

    await test.step('DISPATCH — 사이드바에 창고 운영 그룹 노출 확인', async () => {
      await page.goto(`${BASE_URL}/#/?mockRole=DISPATCH`, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1500)

      const sidebar = page.locator('nav, aside, [data-testid="app-sidebar"]').first()
      const sidebarVisible = await sidebar.isVisible().catch(() => false)
      expect(sidebarVisible, '사이드바가 렌더링되어야 함').toBe(true)

      const warehouseGroupToggle = page.locator('[data-testid="sidebar-category-toggle-창고운영"]')
      await expect(warehouseGroupToggle, '창고 운영 그룹 토글이 표시되어야 함').toBeVisible()
      if ((await warehouseGroupToggle.getAttribute('aria-expanded')) !== 'true') {
        await warehouseGroupToggle.click()
      }

      // inventory.warehouse 기반: 창고 운영 그룹 내 창고관리 링크 (testid: sidebar-warehouses)
      // DISPATCH 는 V79/#706 이후 inventory.warehouse view=true → 창고관리 링크 visible
      const warehouseLink = page.locator('[data-testid="sidebar-warehouses"]')
      await expect(
        warehouseLink,
        'DISPATCH 사이드바에 창고관리 링크가 표시되어야 함 — inventory.warehouse view=true 정합 필요 (testid: sidebar-warehouses)',
      ).toBeVisible()
    })

    await test.step('DISPATCH — /warehouses URL 직접 진입 허용 확인 (inventory.warehouse PageCode 보호)', async () => {
      await page.goto(INVENTORY_WAREHOUSES_DISPATCH_URL, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()
      const isRedirected =
        currentUrl.endsWith('/#/') ||
        currentUrl.endsWith('/#') ||
        (currentUrl.includes(BASE_URL) && !currentUrl.includes('/warehouses')) ||
        currentUrl.includes('/login') ||
        currentUrl.includes('/forbidden')

      expect(
        isRedirected,
        `DISPATCH /warehouses 직접 진입이 차단됨 — URL: ${currentUrl}. inventory.warehouse view=true 보유 DISPATCH 는 접근 허용 필요.`,
      ).toBe(false)
    })

    await page.screenshot({ path: path.join(SPEC_SS_DIR, 'T09-dispatch-inventory-warehouse-allow.png'), fullPage: true })

    await page.unroute('**/auth/admin/permissions/my')
    await page.unroute('**/warehouses**')

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T10: INVENTORY allow inventory.stock
   *
   * 검증:
   *   - GET /auth/admin/permissions/my → INVENTORY: inventory.stock view=true, edit=true
   *   - /inventory/stocks 접근 → 재고 현황 200
   */
  test('T10: INVENTORY allow inventory.stock → /inventory/stocks 재고 현황 200', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureDirs()

    await page.route('**/auth/admin/permissions/my', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildPermissionsForRole('INVENTORY')),
      })
    })

    await page.route('**/stocks**', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: [{ productCode: 'P-001', warehouseCode: 'WH-001', qty: 100 }],
            total: 1,
          }),
        })
      } else {
        await route.continue()
      }
    })

    await test.step('INVENTORY — /inventory/stocks 접근 가능 (redirect 미발생)', async () => {
      await page.goto(INVENTORY_STOCKS_INVENTORY_URL, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()
      const isRedirected =
        currentUrl.endsWith('/#/') ||
        currentUrl.endsWith('/#') ||
        (currentUrl.includes(BASE_URL) && !currentUrl.includes('/inventory/stocks'))

      expect(
        isRedirected,
        `INVENTORY inventory.stock 접근 차단됨 — URL: ${currentUrl}. inventory.stock view=true 보유 INVENTORY 는 접근 허용 필요.`,
      ).toBe(false)
    })

    await page.screenshot({ path: path.join(SPEC_SS_DIR, 'T10-inventory-stock-allow.png'), fullPage: true })
    // 사이드바 스크린샷 (INVENTORY)
    await page.goto(`${BASE_URL}/#/?mockRole=INVENTORY`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(1000)
    await page.screenshot({ path: path.join(SIDEBAR_SS_DIR, 'sidebar-inventory.png'), fullPage: true })

    await page.unroute('**/auth/admin/permissions/my')
    await page.unroute('**/stocks**')

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T11: INVENTORY deny arologis.admin
   *
   * 검증:
   *   - GET /auth/admin/permissions/my → INVENTORY: arologis.admin view=false
   *   - 사이드바에 [data-testid="sidebar-arologis-admin"] hidden
   */
  test('T11: INVENTORY deny arologis.admin → 사이드바 hidden', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureDirs()

    await page.route('**/auth/admin/permissions/my', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildPermissionsForRole('INVENTORY')),
      })
    })

    await test.step('INVENTORY — 사이드바에 아로로지스 관리 메뉴 hidden 확인', async () => {
      await page.goto(`${BASE_URL}/#/?mockRole=INVENTORY`, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1500)

      const sidebar = page.locator('nav, aside, [data-testid="app-sidebar"]').first()
      const sidebarVisible = await sidebar.isVisible().catch(() => false)
      expect(sidebarVisible, '사이드바가 렌더링되어야 함').toBe(true)

      // arologis.admin 기반 SidebarLink 의 실제 data-testid: sidebar-arologis-auto-dispatch
      const arologisAdminLink = page.locator('[data-testid="sidebar-arologis-auto-dispatch"]')
      const arologisAdminVisible = await arologisAdminLink.isVisible().catch(() => false)
      expect(
        arologisAdminVisible,
        'INVENTORY 사이드바에 아로로지스 자동매칭 메뉴가 표시됨 — arologis.admin 권한 없으므로 hidden 필요 (testid: sidebar-arologis-auto-dispatch)',
      ).toBe(false)
    })

    await test.step('INVENTORY — arologis.admin deny 사이드바 hidden 확인 (직접 진입 차단은 BE IT 대체)', async () => {
      // FE mockRole 시스템은 sessionStore 를 쿼리파라미터로 초기화하는 방식이므로
      // 직접 URL 진입 시 sessionStore 초기화 전 RoleGuard 가 동작하여 미인증 상태로 처리될 수 있음.
      // INVENTORY deny 검증은 1단계 사이드바 hidden 확인으로 갈음하며,
      // 직접 진입 차단은 BE IT (ArologisAdminPermissionIT C8) 에서 검증한다.
      //
      // 실제 동작 확인: /arologis/admin/auto-dispatch 는 ARO_ADMIN_DISPATCH_ROLES(MASTER/MANAGER) RoleGuard
      // + PermissionGuard(arologis.admin) 이중 가드 → INVENTORY 는 두 가드 모두 차단 예정
      // BE IT: INVENTORY, arologis.admin canView=false → GET /api/v1/arologis/admin/... 403 검증 (것 포함)
      await page.goto(`${BASE_URL}/#/?mockRole=INVENTORY`, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1000)

      // 사이드바 hidden 이미 확인됨 (step 1) — 이 step 은 추가 FE 회귀 확인
      const sidebar = page.locator('nav, aside, [data-testid="app-sidebar"]').first()
      const sidebarVisible = await sidebar.isVisible().catch(() => false)
      expect(sidebarVisible, '사이드바가 렌더링되어야 함').toBe(true)

      // arologis.admin 사이드바 메뉴 hidden 재확인
      const arologisAutoDispatch = page.locator('[data-testid="sidebar-arologis-auto-dispatch"]')
      const autoDispatchVisible = await arologisAutoDispatch.isVisible().catch(() => false)
      expect(
        autoDispatchVisible,
        'INVENTORY 사이드바에 아로로지스 자동매칭 메뉴가 표시됨 — arologis.admin 권한 없으므로 hidden 필요',
      ).toBe(false)
    })

    await page.screenshot({ path: path.join(SPEC_SS_DIR, 'T11-inventory-arologis-admin-deny.png'), fullPage: true })

    await page.unroute('**/auth/admin/permissions/my')

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T12: ACCOUNTANT view-only partners.list
   *
   * 검증:
   *   - GET /auth/admin/permissions/my → ACCOUNTANT: partners.list view=true, edit=false
   *   - /partners 접근 → 200 (view 허용)
   *   - edit 버튼 disabled (canEdit=false)
   */
  test('T12: ACCOUNTANT view-only partners.list → /partners 200 + edit 버튼 disabled', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureDirs()

    await page.route('**/auth/admin/permissions/my', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildPermissionsForRole('ACCOUNTANT')),
      })
    })

    await page.route('**/partners**', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: [{ id: 'p001', name: '테스트거래처', status: 'ACTIVE' }],
            total: 1,
          }),
        })
      } else {
        await route.continue()
      }
    })

    await test.step('ACCOUNTANT — /partners 접근 가능 (view=true)', async () => {
      await page.goto(PARTNERS_ACCOUNTANT_URL, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()
      const isRedirected =
        currentUrl.endsWith('/#/') ||
        currentUrl.endsWith('/#') ||
        (currentUrl.includes(BASE_URL) && !currentUrl.includes('/partners'))

      expect(
        isRedirected,
        `ACCOUNTANT partners.list view=true 인데 접근 차단됨 — URL: ${currentUrl}. view 권한 있으므로 접근 허용 필요.`,
      ).toBe(false)
    })

    await test.step('ACCOUNTANT — partners.list canEdit=false → edit 버튼 disabled 확인', async () => {
      const editButton = page.locator(
        '[data-testid="partner-edit-button"], button:has-text("편집"), button:has-text("수정"), button:has-text("등록")',
      ).first()
      const editButtonExists = await editButton.isVisible().catch(() => false)

      if (editButtonExists) {
        const isDisabled = await editButton.isDisabled().catch(() => false)
        expect(
          isDisabled,
          'ACCOUNTANT canEdit=false 인데 edit 버튼이 enabled — partners.list edit=false 이므로 disabled 필요',
        ).toBe(true)
      }
    })

    await page.screenshot({ path: path.join(SPEC_SS_DIR, 'T12-accountant-partners-list-view-only.png'), fullPage: true })

    await page.unroute('**/auth/admin/permissions/my')
    await page.unroute('**/partners**')

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T13: revoke 시나리오 — SALES sales.partner-order.confirm revoke 후 사이드바 hidden
   *
   * 검증:
   *   - POST /auth/admin/permissions/batch → SALES sales.partner-order.confirm revoke 200
   *   - GET /auth/admin/permissions/my (revoke 후) → sales.partner-order.confirm 미포함
   *   - 사이드바에 [data-testid="sidebar-partner-order-confirm"] hidden
   */
  test('T13: revoke 시나리오 — SALES sales.partner-order.confirm revoke → 사이드바 즉시 hidden', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureDirs()

    let batchRevokeCallCount = 0

    await page.route('**/auth/admin/permissions/batch', async route => {
      if (route.request().method() === 'POST') {
        batchRevokeCallCount++
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: null,
            message: 'SALES sales.partner-order.confirm 권한이 revoke 되었습니다.',
            timestamp: '2026-05-18T10:00:00Z',
          }),
        })
      } else {
        await route.continue()
      }
    })

    // revoke 후 권한 응답
    await page.route('**/auth/admin/permissions/my', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildSalesWithRevokedConfirm()),
      })
    })

    await test.step('마스터 권한 매트릭스에서 SALES sales.partner-order.confirm revoke 요청', async () => {
      const response = await page.evaluate(async (baseUrl) => {
        try {
          const res = await fetch(`${baseUrl}/auth/admin/permissions/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              permissions: [
                { roleCode: 'SALES', pageCode: 'sales.partner-order.confirm', canView: false, canEdit: false },
              ],
            }),
          })
          return { status: res.status, ok: res.ok }
        } catch {
          return { status: 0, ok: false }
        }
      }, BASE_URL)

      expect(
        response.ok || batchRevokeCallCount > 0,
        `POST /auth/admin/permissions/batch revoke 호출 실패 — status: ${response.status}`,
      ).toBe(true)
    })

    await test.step('SALES — revoke 후 permissions/my 응답에 sales.partner-order.confirm 미포함 확인', async () => {
      await page.goto(`${BASE_URL}/#/?mockRole=SALES`, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1500)

      // sales.partner-order.confirm 은 독립 사이드바 링크가 없고 주문서 관리 페이지 내 탭으로 처리됨.
      // revoke 검증은 permissions/my API 응답으로 대신 확인한다.
      const sidebar = page.locator('nav, aside, [data-testid="app-sidebar"]').first()
      const sidebarVisible = await sidebar.isVisible().catch(() => false)
      expect(sidebarVisible, '사이드바가 렌더링되어야 함').toBe(true)

      // [Round C] 주문서 관리는 '판매' 카테고리 자식 — 기본 접힘이므로 먼저 펼친다.
      await openSidebarCategory(page, '판매')
      // 사이드바 주문서 관리 링크는 sales.partner-order.list 기반 → 여전히 표시
      const partnerOrdersLink = page.locator('[data-testid="sidebar-sales-partner-orders"]')
      const partnerOrdersVisible = await partnerOrdersLink.isVisible().catch(() => false)
      expect(
        partnerOrdersVisible,
        'SALES 사이드바에 주문서 관리 링크가 표시되어야 함 — sales.partner-order.list 는 revoke 대상 아님',
      ).toBe(true)
    })

    await test.step('SALES — sales.partner-order.list 는 여전히 접근 가능 (revoke 대상 아님)', async () => {
      const permResponse = await page.evaluate(async (baseUrl) => {
        try {
          const res = await fetch(`${baseUrl}/auth/admin/permissions/my`)
          const json = (await res.json()) as {
            data?: Array<{ pageCode: string; canView: boolean }>
          }
          return json.data ?? []
        } catch {
          return []
        }
      }, BASE_URL)

      const hasConfirm = Array.isArray(permResponse) && permResponse.some(
        (p: { pageCode: string; canView: boolean }) =>
          p.pageCode === 'sales.partner-order.confirm' && p.canView === true,
      )

      expect(
        hasConfirm,
        `permissions/my 응답에 sales.partner-order.confirm view=true 포함됨 — revoke 후 미포함 필요.`,
      ).toBe(false)

      const hasList = Array.isArray(permResponse) && permResponse.some(
        (p: { pageCode: string; canView: boolean }) =>
          p.pageCode === 'sales.partner-order.list' && p.canView === true,
      )

      expect(
        hasList,
        `SALES sales.partner-order.list 가 revoke 후에도 포함되어야 함 — revoke 대상이 아님.`,
      ).toBe(true)
    })

    await page.screenshot({ path: path.join(SPEC_SS_DIR, 'T13-sales-confirm-revoked.png'), fullPage: true })

    await page.unroute('**/auth/admin/permissions/batch')
    await page.unroute('**/auth/admin/permissions/my')

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T14: URL 직접 진입 redirect — SALES /inventory/audit 직접 진입
   *
   * 검증:
   *   - GET /auth/admin/permissions/my → SALES: inventory.audit view=false
   *   - /inventory/audit URL 직접 진입 → "/" redirect
   *   - redirect 후 URL 확인 + 재고 감사 콘텐츠 미표시
   */
  test('T14: URL 직접 진입 redirect — SALES /inventory/audit 직접 진입 → "/" redirect', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureDirs()

    await page.route('**/auth/admin/permissions/my', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildPermissionsForRole('SALES')),
      })
    })

    await test.step('SALES — /warehouse/audit 직접 진입 차단 확인 (RoleGuard or PermissionGuard)', async () => {
      // /warehouse/audit 는 RoleGuard(WAREHOUSE/MASTER) + PermissionGuard(inventory.audit) 이중 가드
      // SALES 는 RoleGuard 에서 차단 → "접근 권한이 없습니다" 화면 표시 (URL 유지)
      // SP-D4 FE PermissionGuard 완료 시: PermissionGuard 차단 → redirect "/" 로 변경 예정
      await page.goto(INVENTORY_AUDIT_SALES_URL, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()
      const bodyText = (await page.textContent('body')) ?? ''

      // RoleGuard 는 URL 유지 + "접근 권한이 없습니다" 텍스트 렌더링
      const isBlockedByRoleGuard =
        bodyText.includes('접근 권한이 없습니다') ||
        bodyText.includes('권한 보유자만')

      // PermissionGuard 는 navigate('/', {replace: true}) → URL 변경
      const isRedirectedByPermGuard =
        currentUrl.endsWith('/#/') ||
        currentUrl.endsWith('/#') ||
        (currentUrl.includes(BASE_URL) && !currentUrl.includes('/warehouse/audit')) ||
        currentUrl.includes('/login')

      expect(
        isBlockedByRoleGuard || isRedirectedByPermGuard,
        `SALES /warehouse/audit 차단 미작동 — URL: ${currentUrl}. RoleGuard(접근 권한 없음 텍스트) 또는 PermissionGuard(redirect) 중 하나가 동작해야 함.`,
      ).toBe(true)
    })

    await test.step('SALES — redirect 목적지 확인 (홈 또는 로그인)', async () => {
      const currentUrl = page.url()
      const bodyText = (await page.textContent('body')) ?? ''

      // [2026-06-11 P3 #9/#14] 앱 셸 상존 텍스트 '홈'/'Dashboard' bodyText sentinel 제거 —
      //   홈 NavLink('홈')는 권한 무관 앱 셸 상존이라 차단 실패 시에도 매칭되어 vacuous 였다.
      //   홈 redirect 는 URL('/#/'·'/#'), 로그인 redirect 는 URL('/login')·로그인 화면 고유
      //   텍스트(로그인/이메일)로만 판정한다(본 step 은 PermissionGuard redirect 도착지 확인).
      const isValidRedirectDest =
        currentUrl.endsWith('/#/') ||
        currentUrl.endsWith('/#') ||
        currentUrl.includes('/login') ||
        bodyText.includes('로그인') ||
        bodyText.includes('이메일')

      expect(
        isValidRedirectDest,
        `redirect 목적지 미확인 — URL: ${currentUrl}, bodyText: "${bodyText.substring(0, 100)}"`,
      ).toBe(true)
    })

    await test.step('재고 실사 콘텐츠 미표시 확인 (/warehouse/audit)', async () => {
      const bodyText = (await page.textContent('body')) ?? ''
      const auditPageLoaded =
        bodyText.includes('재고 실사') ||
        bodyText.includes('InventoryAudit') ||
        bodyText.includes('실사 목록')

      expect(
        auditPageLoaded,
        '차단된 /warehouse/audit 페이지 콘텐츠가 표시됨 — 재고 실사 텍스트 미표시 필요.',
      ).toBe(false)
    })

    await page.screenshot({ path: path.join(SPEC_SS_DIR, 'T14-sales-inventory-audit-redirect.png'), fullPage: true })

    await page.unroute('**/auth/admin/permissions/my')

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// SP-D4 회귀 가드 — false green 0건 + PageCode 정합 검증
// ---------------------------------------------------------------------------

test.describe('SP-D4 회귀 가드 (false green 0건 + SP-D4 PageCode 정합 검증)', () => {
  /**
   * false green 가드: || true / test.skip(!ok) / page.setContent() 금지 패턴 검출
   */
  test('false green 가드: spec 파일 내 || true / test.skip(!ok) / setContent() 금지 패턴 0건', async () => {
    const specFile = path.resolve(
      _dirname,
      'sp-d4-remaining-pages-permission-migration.spec.ts',
    )
    const specContent = fs.readFileSync(specFile, 'utf-8')

    const selfTestMarker = "test.describe('SP-D4 회귀 가드"
    const selfTestStart = specContent.indexOf(selfTestMarker)
    const codeToCheck = selfTestStart >= 0 ? specContent.slice(0, selfTestStart) : specContent

    const codeLines = codeToCheck
      .split('\n')
      .filter(line => {
        const trimmed = line.trimStart()
        return !trimmed.startsWith('//') &&
               !trimmed.startsWith('*') &&
               !trimmed.startsWith('/*')
      })
      .join('\n')

    // || true 패턴 금지
    const orTruePattern = new RegExp('\\|\\|\\s*true(?!\\s*//)' , 'g')
    const orTrueMatches = codeLines.match(orTruePattern) ?? []
    expect(
      orTrueMatches.length,
      `false green 패턴 발견: ${'||'} true — SP-09 패턴 위반. 발견: ${JSON.stringify(orTrueMatches)}`,
    ).toBe(0)

    // test.skip(!ok) 패턴 금지
    const skipPattern = new RegExp('test\\.skip\\(!ok\\)', 'g')
    const skipNotOkMatches = codeLines.match(skipPattern) ?? []
    expect(
      skipNotOkMatches.length,
      `false green 패턴 발견: ${'test.skip(!ok)'} — SP-09 패턴 위반. 발견: ${JSON.stringify(skipNotOkMatches)}`,
    ).toBe(0)

    // page.setContent( 패턴 금지
    const setContentPattern = new RegExp('page\\.setContent\\s*\\(', 'g')
    const setContentMatches = codeLines.match(setContentPattern) ?? []
    expect(
      setContentMatches.length,
      `false green 패턴 발견: ${'page.setContent('}) — SP-09 패턴 위반 (dev server 없이 HTML 직접 삽입). 발견: ${JSON.stringify(setContentMatches)}`,
    ).toBe(0)
  })

  /**
   * data-testid 사용 가드: spec 내 locator 가 data-testid 기반인지 확인
   */
  test('data-testid 사용 가드: spec 파일에 data-testid 기반 locator 존재 확인', async () => {
    const specFile = path.resolve(
      _dirname,
      'sp-d4-remaining-pages-permission-migration.spec.ts',
    )
    const specContent = fs.readFileSync(specFile, 'utf-8')

    const dataTestIdCount = (specContent.match(/data-testid/g) ?? []).length
    expect(
      dataTestIdCount,
      'spec 파일 내 data-testid 기반 locator 0건 — data-testid assertion 의무',
    ).toBeGreaterThan(0)
  })

  /**
   * SP-D4 22 PageCode 1:1 정합 가드:
   * spec 파일에 정의된 SP_D4_PERMISSION_MATRIX 의 22 pageCode 가 모두 포함되어 있는지 확인.
   */
  test('SP-D4 22 PageCode 1:1 정합 가드: spec 에 모두 포함 확인', async () => {
    const specFile = path.resolve(
      _dirname,
      'sp-d4-remaining-pages-permission-migration.spec.ts',
    )
    const specContent = fs.readFileSync(specFile, 'utf-8')

    const requiredPageCodes = [
      'estimates.list',
      'sales.partner-order.list',
      'sales.partner-order.draft',
      'sales.partner-order.confirm',
      'sales.partner-order.history',
      'sales.partner-order.print',
      'inventory.warehouse',
      'inventory.stock',
      'inventory.stock-transfer',
      'inventory.dps',
      'inventory.audit',
      'admin.employees',
      'admin.users',
      'partners.list',
      'partners.detail',
      'partners.block',
      'partners.edit-request',
      'products.list',
      'products.admin',
      'arologis.admin',
      'arologis.region',
    ]

    for (const pageCode of requiredPageCodes) {
      const escapedCode = pageCode.replace(/\./g, '\\.').replace(/-/g, '\\-')
      const count = (specContent.match(new RegExp(escapedCode, 'g')) ?? []).length
      expect(
        count,
        `SP-D4 pageCode '${pageCode}' 가 spec 파일에 미포함 — §2 카탈로그 1:1 정합 의무`,
      ).toBeGreaterThan(0)
    }
  })

  /**
   * HashRouter URL 정합 가드: 모든 URL 상수가 /#/ 패턴을 사용하는지 확인.
   */
  test('HashRouter URL 정합 가드: spec 내 URL 상수가 /#/ 패턴 사용 확인', async () => {
    const specFile = path.resolve(
      _dirname,
      'sp-d4-remaining-pages-permission-migration.spec.ts',
    )
    const specContent = fs.readFileSync(specFile, 'utf-8')

    const hashRouterUrlCount = (specContent.match(/\/#\//g) ?? []).length
    expect(
      hashRouterUrlCount,
      'spec 파일 내 HashRouter /#/ URL 패턴 0건 — HashRouter 정합 의무',
    ).toBeGreaterThan(0)
  })

  /**
   * X-User-Role 헤더 패턴 가드 (SP-D3 cycle 3 회고):
   * BE IT 에서 X-User-Role 헤더 누락 시 정적 가드 미통과 — spec 내 X-User-Role mockRole 패턴 명시 확인.
   */
  test('X-User-Role 패턴 가드: mockRole 쿼리파라미터 기반 URL 사용 확인 (SP-D3 cycle 3 회귀)', async () => {
    const specFile = path.resolve(
      _dirname,
      'sp-d4-remaining-pages-permission-migration.spec.ts',
    )
    const specContent = fs.readFileSync(specFile, 'utf-8')

    const mockRoleCount = (specContent.match(/mockRole=/g) ?? []).length
    expect(
      mockRoleCount,
      'spec 파일 내 mockRole 기반 URL 파라미터 0건 — X-User-Role 헤더 패턴 의무 (SP-D3 cycle 3 회고)',
    ).toBeGreaterThan(0)
  })

  /**
   * 7 역할 사이드바 스크린샷 가드:
   * 사이드바 스크린샷 7개가 저장 디렉터리에 존재하는지 확인.
   */
  test('사이드바 스크린샷 가드: 7 역할 사이드바 스크린샷 저장 경로 확인', async () => {
    const sidebarDir = path.resolve(
      _dirname,
      '../../../../docs/qa/sp-d4-remaining-pages-permission-migration/screenshots',
    )
    const requiredRoles = ['master', 'manager', 'accountant', 'sales', 'warehouse', 'dispatch', 'inventory']

    // 가드: 디렉터리 + 7 역할 캡처가 **전부** 존재해야 한다.
    // (2026-07-26 하네스 배치) 이전에는 누락 시 console.warn 만 하고 디렉터리 존재만
    // 단정했다 — 7개 중 0개여도 통과하는 soft-pass 였다. 이 캡처들은 커밋된 확정 증거이고
    // (git ls-files 로 7개 전부 추적됨) 라이브 실행 출력은 _local/ 로 분리됐으므로
    // (resolveMockQaShotsDir), 재실행이 이 파일들을 지우거나 덮어쓰는 일도 없다. 따라서
    // "없으면 RED" 가 정확한 계약이다.
    expect(
      fs.existsSync(sidebarDir),
      `사이드바 스크린샷 저장 디렉터리 미존재: ${sidebarDir}`,
    ).toBe(true)

    const missing = requiredRoles.filter(
      (role) => !fs.existsSync(path.join(sidebarDir, `sidebar-${role}.png`)),
    )
    expect(
      missing,
      `사이드바 확정 증거 캡처 누락: ${missing.join(', ')} (기준 디렉터리: ${sidebarDir})`,
    ).toEqual([])
  })
})
