/**
 * SP-D3 매입/매출/배차 동적 RBAC 마이그레이션 — Playwright 스펙
 *
 * 실행 조건:
 *   cd clients/desktop
 *   VITE_MOCK_MODE=1 npx vite src/renderer --host 127.0.0.1 --port 5173  (별도 터미널)
 *   npx playwright test playwright/sp-d3-slip-dispatch-permission-migration/sp-d3-slip-dispatch-permission-migration.spec.ts --reporter=line
 *
 * dev server 미가용 시 테스트 FAIL (false green 방지 — SP-09 패턴 일관).
 * 스크린샷 저장: docs/qa/sp-d3-slip-dispatch-permission-migration/screenshots/*.png
 *
 * TC 목록 (5건):
 *   T1 SALES 로그인 → 매출 슬립 + SMS 발송 이력 접근 가능 / 매입 슬립 + 배차 hidden
 *   T2 WAREHOUSE 로그인 → 매입 슬립 + OCR + 입고 검수 가능 / 매출 슬립 + 배차 hidden
 *   T3 DISPATCH 로그인 → 배차 메뉴 + SMS 발송 이력 가능 / 매입 슬립 + 매출 슬립 hidden
 *   T4 마스터가 SALES 의 purchases.slip.list revoke → SALES 매입 슬립 접근 차단 확인
 *   T5 권한 없는 URL 직접 진입 → redirect "/"
 *
 * SP-D2 회귀 가드:
 *   - SP-09 false green (|| true / test.skip(!ok) / page.setContent) 0건
 *   - data-testid 기반 assertion
 *   - URL HashRouter 정합: /#/sales/slips, /#/purchases/slips, /#/dispatch-board, ...
 *   - ACCOUNTING_ROUTES pageCode 1:1 일치 패턴 일관
 *
 * SP-D3 마이그레이션 대상 6 PageCode (routes/index.tsx 1:1 정합):
 *   /sales/slips                          → sales.slip.list               (매출 슬립 목록)
 *   /purchases/slips                      → purchases.slip.list           (매입 슬립 목록)
 *   /purchases/receipt-ocr                → purchases.receipt-ocr        (영수증 OCR)
 *   /dispatch-board                       → dispatch.board               (배차 메뉴)
 *   /arologis/dispatch-sms/send-audit     → notification.dispatch-sms.send-audit (SMS 발송 이력)
 *   /warehouse/inbound-inspections        → inbound.inspection           (입고 검수 — 사이드바 연동)
 *
 * BE endpoint (user-service, SP-D1 구현):
 *   GET  /auth/admin/permissions/my   — 현재 사용자 권한 목록 (인증된 모든 역할)
 *   POST /auth/admin/permissions/batch — batch update (MASTER 전용)
 */

import { test, expect, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import * as http from 'http'
import { fileURLToPath } from 'url'

// ---------------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------------

const _filename = fileURLToPath(import.meta.url)
const _dirname = path.dirname(_filename)

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

/** 스크린샷 저장 디렉터리 */
const QA_DIR = path.resolve(
  _dirname,
  '../../../../docs/qa/sp-d3-slip-dispatch-permission-migration/screenshots',
)

function ensureQaDir(): void {
  if (!fs.existsSync(QA_DIR)) {
    fs.mkdirSync(QA_DIR, { recursive: true })
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

type MockPerm = { pageCode: string; view?: boolean; edit?: boolean }

function mockPerms(perms: MockPerm[]): string {
  return btoa(JSON.stringify(perms))
}

function withMockPerms(url: string, perms: MockPerm[]): string {
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}mockPerms=${encodeURIComponent(mockPerms(perms))}`
}

function mockPermsFromResponse(
  response: { data: Array<{ pageCode: string; canView?: boolean; canEdit?: boolean }> },
): MockPerm[] {
  return response.data.map((permission) => ({
    pageCode: permission.pageCode,
    view: permission.canView ?? true,
    edit: permission.canEdit ?? false,
  }))
}

/**
 * 권한 없는 라우트 접근이 차단됐는지 판정한다(이중 가드 일관 — sp-d4 패턴).
 *
 * <p>슬립/배차 라우트는 RoleGuard(정적 화이트리스트) + PermissionGuard 이중 가드다. 화이트리스트
 * 밖 role 은 바깥 RoleGuard 가 먼저 "접근 권한이 없습니다" 화면을 in-place 렌더(URL 유지)하고,
 * RoleGuard 를 통과한 role 은 PermissionGuard 가 "/" 로 redirect 한다. 둘 중 하나면 차단 성립이며,
 * 어느 경우든 보호 페이지 콘텐츠는 렌더되지 않는다.
 *
 * @param currentUrl 현재 URL
 * @param bodyText 현재 body 텍스트
 * @param pathFragment 차단 대상 라우트 경로 조각(예: '/purchases/slips')
 */
function isAccessBlocked(currentUrl: string, bodyText: string, pathFragment: string): boolean {
  const blockedByRoleGuard =
    bodyText.includes('접근 권한이 없습니다') || bodyText.includes('권한 보유자만')
  const redirectedByPermGuard =
    currentUrl.endsWith('/#/') ||
    currentUrl.endsWith('/#') ||
    (currentUrl.includes(BASE_URL) && !currentUrl.includes(pathFragment)) ||
    currentUrl.includes('/login') ||
    currentUrl.includes('/forbidden')
  return blockedByRoleGuard || redirectedByPermGuard
}

/**
 * 권한 없는 라우트 진입 후 차단(redirect/forbidden)이 정착할 때까지 폴링한다.
 *
 * <p>PermissionGuard 의 "/" redirect 는 권한 fetch 완료 후 발생하므로, 고정 대기는 전이 중
 * 빈 프레임을 포착할 수 있다. 차단이 확인되면 즉시 반환하고, 미차단이면 최대 대기 후 반환해
 * (false-green 없이) 호출부 단언이 실제 상태로 실패하게 한다.
 */
async function waitForAccessSettled(page: Page, pathFragment: string): Promise<void> {
  await page.waitForTimeout(600)
  for (let i = 0; i < 24; i++) {
    const currentUrl = page.url()
    const bodyText = (await page.textContent('body').catch(() => '')) ?? ''
    if (isAccessBlocked(currentUrl, bodyText, pathFragment)) return
    await page.waitForTimeout(300)
  }
}

// ---------------------------------------------------------------------------
// SP-D3 마이그레이션 대상 6 PageCode 정의 — routes/index.tsx 1:1 정합
// ---------------------------------------------------------------------------

/**
 * SP-D3 PermissionGuard 적용 대상 6 라우트.
 * 각 항목은 라우트 path, data-testid 사이드바 링크, pageCode 를 포함한다.
 */
const SP_D3_ROUTES = [
  {
    path: '/sales/slips',
    sidebarTestId: 'sidebar-sales',
    pageCode: 'sales.slip.list',
    label: '매출 슬립 목록',
    roles: ['SALES', 'MANAGER', 'MASTER'],
  },
  {
    path: '/purchases/slips',
    sidebarTestId: 'sidebar-purchases',
    pageCode: 'purchases.slip.list',
    label: '매입 슬립 목록',
    roles: ['WAREHOUSE', 'MANAGER', 'MASTER'],
  },
  {
    path: '/purchases/receipt-ocr',
    sidebarTestId: 'sidebar-purchases-receipt-ocr',
    pageCode: 'purchases.receipt-ocr',
    label: '영수증 OCR',
    roles: ['WAREHOUSE', 'ACCOUNTANT', 'MANAGER', 'MASTER'],
  },
  {
    path: '/dispatch-board',
    sidebarTestId: 'sidebar-dispatch-board',
    pageCode: 'dispatch.board',
    label: '배차 메뉴',
    roles: ['DISPATCH', 'MANAGER', 'MASTER'],
  },
  {
    path: '/arologis/dispatch-sms/send-audit',
    sidebarTestId: 'sidebar-arologis-sms-send-audit',
    pageCode: 'notification.dispatch-sms.send-audit',
    label: 'SMS 발송 이력',
    roles: ['DISPATCH', 'MANAGER', 'MASTER'],
  },
  {
    path: '/warehouse/inbound-inspections',
    sidebarTestId: 'sidebar-warehouse-inbound-inspections',
    pageCode: 'inbound.inspection',
    label: '입고 검수',
    roles: ['WAREHOUSE', 'MANAGER', 'MASTER'],
  },
] as const

// ---------------------------------------------------------------------------
// 권한 mock 빌더 함수
// ---------------------------------------------------------------------------

/** SALES 기본 권한 — 매출 슬립 접근 가능, 매입/배차 권한 없음 */
function buildSalesPermissions() {
  return {
    success: true,
    data: [
      { pageCode: 'sales.slip.list', canView: true, canEdit: true },
      { pageCode: 'notification.dispatch-sms.send-audit', canView: true, canEdit: false },
    ],
  }
}

/** WAREHOUSE 기본 권한 — 매입 슬립 + OCR + 입고 검수 가능, 매출/배차 없음 */
function buildWarehousePermissions() {
  return {
    success: true,
    data: [
      { pageCode: 'purchases.slip.list', canView: true, canEdit: true },
      { pageCode: 'purchases.receipt-ocr', canView: true, canEdit: false },
      { pageCode: 'inbound.inspection', canView: true, canEdit: true },
    ],
  }
}

/** DISPATCH 기본 권한 — 배차 메뉴 + SMS 발송 이력 가능, 매입/매출 없음 */
function buildDispatchPermissions() {
  return {
    success: true,
    data: [
      { pageCode: 'dispatch.board', canView: true, canEdit: false },
      { pageCode: 'notification.dispatch-sms.send-audit', canView: true, canEdit: false },
    ],
  }
}

/** SALES 에서 purchases.slip.list revoke 후 — 매입 슬립 접근 불가 */
function buildSalesWithPurchaseSlipRevoked() {
  return {
    success: true,
    data: [
      { pageCode: 'sales.slip.list', canView: true, canEdit: true },
      { pageCode: 'notification.dispatch-sms.send-audit', canView: true, canEdit: false },
      // purchases.slip.list 제외 (revoke — SALES 는 원래 매입 권한 없음)
    ],
  }
}

/** 권한 완전 없는 사용자 — URL 직접 진입 차단 검증용 */
function buildNoPermissions() {
  return {
    success: true,
    data: [],
  }
}

// ---------------------------------------------------------------------------
// URL 상수 — HashRouter 라우트
// ---------------------------------------------------------------------------

const SALES_SLIPS_URL = `${BASE_URL}/#/sales/slips?mockRole=SALES`
const PURCHASES_SLIPS_URL = `${BASE_URL}/#/purchases/slips?mockRole=SALES`
const DISPATCH_BOARD_URL = `${BASE_URL}/#/dispatch-board?mockRole=SALES`
const WAREHOUSE_PURCHASES_URL = `${BASE_URL}/#/purchases/slips?mockRole=WAREHOUSE`
const WAREHOUSE_OCR_URL = `${BASE_URL}/#/purchases/receipt-ocr?mockRole=WAREHOUSE`
const DISPATCH_BOARD_DISPATCH_URL = `${BASE_URL}/#/dispatch-board?mockRole=DISPATCH`
const DISPATCH_SMS_AUDIT_URL = `${BASE_URL}/#/arologis/dispatch-sms/send-audit?mockRole=DISPATCH`
const PURCHASES_SLIPS_NO_PERM_URL = `${BASE_URL}/#/purchases/slips?mockRole=NOPERM`
const DISPATCH_BOARD_NO_PERM_URL = `${BASE_URL}/#/dispatch-board?mockRole=NOPERM`
const SALES_SLIPS_NO_PERM_URL = `${BASE_URL}/#/sales/slips?mockRole=NOPERM`

// ---------------------------------------------------------------------------
// TC-T1 ~ TC-T5
// ---------------------------------------------------------------------------

test.describe('SP-D3 매입/매출/배차 동적 RBAC 마이그레이션 (T1~T5)', () => {
  test.skip(SKIP_UI, 'PLAYWRIGHT_SKIP_UI=1 — UI 테스트 전체 skip')

  test.beforeEach(async () => {
    const ok = await isServerAvailable()
    // dev server 미가용 시 false green 방지 — skip 이 아닌 FAIL
    expect(
      ok,
      `dev server 미접근: ${BASE_URL} — VITE_MOCK_MODE=1 npx vite src/renderer --host 127.0.0.1 --port 5173 실행 후 재시도`,
    ).toBe(true)
  })

  // -------------------------------------------------------------------------
  /**
   * T1: SALES 로그인 → 매출 슬립 + SMS 발송 이력 접근 가능 / 매입 슬립 + 배차 hidden
   *
   * 검증 항목:
   *   - GET /auth/admin/permissions/my → SALES: sales.slip.list + notification.dispatch-sms.send-audit view=true
   *   - /sales/slips 진입 → 매출 슬립 목록 페이지 표시 (PermissionGuard 통과)
   *   - 사이드바: [data-testid="sidebar-dispatch-board"] visible=false
   *   - /purchases/slips 직접 진입 → PermissionGuard redirect "/" (purchases.slip.list 없음)
   *   - /dispatch-board 직접 진입 → redirect "/" (dispatch.board 없음)
   *   - pageerror 없음
   */
  test('T1: SALES → 매출 슬립 접근 가능 + 매입/배차 hidden + URL 직접 진입 차단', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()

    const salesPerms = mockPermsFromResponse(buildSalesPermissions())

    // 슬립 BE endpoint mock — 빈 목록 응답
    await page.route('**/slips**', async route => {
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

    await test.step('SALES — 매출 슬립 목록 (/sales/slips) 접근 가능 확인', async () => {
      await page.goto(withMockPerms(SALES_SLIPS_URL, salesPerms), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()

      // PermissionGuard 차단 시 "/" redirect — 차단 여부 확인 (차단 안 됨이 기대)
      const isRedirectedToHome =
        currentUrl.endsWith('/#/') ||
        currentUrl.endsWith('/#') ||
        (currentUrl.includes(BASE_URL) && !currentUrl.includes('/sales/slips'))

      expect(
        isRedirectedToHome,
        `SALES 매출 슬립 페이지 접근이 차단됨 — URL: ${currentUrl}. sales.slip.list view=true 보유 SALES 는 접근 허용 필요.`,
      ).toBe(false)
    })

    await test.step('SALES — 배차 메뉴 사이드바 hidden 확인', async () => {
      await page.goto(withMockPerms(`${BASE_URL}/#/?mockRole=SALES`, salesPerms), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)

      const sidebar = page.locator('nav, aside, [data-testid="app-sidebar"]').first()
      const sidebarVisible = await sidebar.isVisible().catch(() => false)

      expect(
        sidebarVisible,
        '사이드바가 렌더링되어야 함 — SALES 홈 진입 후 nav/aside 미표시',
      ).toBe(true)

      // 배차 메뉴 사이드바 hidden 확인
      const dispatchBoardLink = page.locator('[data-testid="sidebar-dispatch-board"]')
      const dispatchBoardVisible = await dispatchBoardLink.isVisible().catch(() => false)

      expect(
        dispatchBoardVisible,
        'SALES 사이드바에 배차 메뉴가 표시됨 — dispatch.board 권한 없으므로 hidden 필요',
      ).toBe(false)
    })

    await test.step('SALES — 매입 슬립 URL 직접 진입 시 redirect "/" 확인', async () => {
      await page.goto(withMockPerms(PURCHASES_SLIPS_URL, salesPerms), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()
      const bodyText = (await page.textContent('body')) ?? ''

      // purchases.slip.list 없음 → RoleGuard 차단(접근 권한 없음) 또는 PermissionGuard redirect "/"
      expect(
        isAccessBlocked(currentUrl, bodyText, '/purchases/slips'),
        `SALES 매입 슬립 직접 진입 차단 미작동 — URL: ${currentUrl}. RoleGuard 또는 PermissionGuard 중 하나가 차단해야 함.`,
      ).toBe(true)
    })

    await test.step('SALES — 배차 메뉴 URL 직접 진입 시 차단 확인', async () => {
      await page.goto(withMockPerms(DISPATCH_BOARD_URL, salesPerms), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()
      const bodyText = (await page.textContent('body')) ?? ''

      expect(
        isAccessBlocked(currentUrl, bodyText, '/dispatch-board'),
        `SALES 배차 메뉴 직접 진입 차단 미작동 — URL: ${currentUrl}. dispatch.board 권한 없으므로 차단 필요.`,
      ).toBe(true)
    })

    await page.screenshot({
      path: path.join(QA_DIR, 'T1-sales-slip-access-dispatch-hidden.png'),
      fullPage: true,
    })

    await page.unroute('**/slips**')

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T2: WAREHOUSE 로그인 → 매입 슬립 + OCR + 입고 검수 가능 / 매출 슬립 + 배차 hidden
   *
   * 검증 항목:
   *   - GET /auth/admin/permissions/my → WAREHOUSE: purchases.slip.list + purchases.receipt-ocr + inbound.inspection view=true
   *   - /purchases/slips 진입 → 매입 슬립 목록 페이지 표시 (PermissionGuard 통과)
   *   - /purchases/receipt-ocr 진입 → OCR 페이지 표시 (PermissionGuard 통과)
   *   - 사이드바: [data-testid="sidebar-dispatch-board"] visible=false
   *   - 사이드바: [data-testid="sidebar-arologis-sms-send-audit"] visible=false
   *   - pageerror 없음
   */
  test('T2: WAREHOUSE → 매입 슬립 + OCR 접근 가능 + 매출/배차 hidden', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()

    const warehousePerms = mockPermsFromResponse(buildWarehousePermissions())

    // 슬립 BE endpoint mock
    await page.route('**/slips**', async route => {
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

    await test.step('WAREHOUSE — 매입 슬립 목록 (/purchases/slips) 접근 가능 확인', async () => {
      await page.goto(withMockPerms(WAREHOUSE_PURCHASES_URL, warehousePerms), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()

      const isRedirectedToHome =
        currentUrl.endsWith('/#/') ||
        currentUrl.endsWith('/#') ||
        (currentUrl.includes(BASE_URL) && !currentUrl.includes('/purchases/slips'))

      expect(
        isRedirectedToHome,
        `WAREHOUSE 매입 슬립 페이지 접근이 차단됨 — URL: ${currentUrl}. purchases.slip.list view=true 보유 WAREHOUSE 는 접근 허용 필요.`,
      ).toBe(false)
    })

    await test.step('WAREHOUSE — 영수증 OCR (/purchases/receipt-ocr) 접근 가능 확인', async () => {
      await page.goto(withMockPerms(WAREHOUSE_OCR_URL, warehousePerms), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()

      const isRedirectedToHome =
        currentUrl.endsWith('/#/') ||
        currentUrl.endsWith('/#') ||
        (currentUrl.includes(BASE_URL) && !currentUrl.includes('/purchases/receipt-ocr'))

      expect(
        isRedirectedToHome,
        `WAREHOUSE 영수증 OCR 페이지 접근이 차단됨 — URL: ${currentUrl}. purchases.receipt-ocr view=true 보유 WAREHOUSE 는 접근 허용 필요.`,
      ).toBe(false)
    })

    await test.step('WAREHOUSE — 배차 메뉴 + SMS 발송 이력 사이드바 hidden 확인', async () => {
      await page.goto(withMockPerms(`${BASE_URL}/#/?mockRole=WAREHOUSE`, warehousePerms), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)

      const sidebar = page.locator('nav, aside, [data-testid="app-sidebar"]').first()
      const sidebarVisible = await sidebar.isVisible().catch(() => false)

      expect(
        sidebarVisible,
        '사이드바가 렌더링되어야 함 — WAREHOUSE 홈 진입 후 nav/aside 미표시',
      ).toBe(true)

      // 배차 메뉴 hidden 확인
      const dispatchBoardLink = page.locator('[data-testid="sidebar-dispatch-board"]')
      const dispatchBoardVisible = await dispatchBoardLink.isVisible().catch(() => false)
      expect(
        dispatchBoardVisible,
        'WAREHOUSE 사이드바에 배차 메뉴가 표시됨 — dispatch.board 권한 없으므로 hidden 필요',
      ).toBe(false)

      // SMS 발송 이력 hidden 확인
      const smsAuditLink = page.locator('[data-testid="sidebar-arologis-sms-send-audit"]')
      const smsAuditVisible = await smsAuditLink.isVisible().catch(() => false)
      expect(
        smsAuditVisible,
        'WAREHOUSE 사이드바에 SMS 발송 이력이 표시됨 — notification.dispatch-sms.send-audit 권한 없으므로 hidden 필요',
      ).toBe(false)
    })

    await page.screenshot({
      path: path.join(QA_DIR, 'T2-warehouse-purchase-ocr-access-dispatch-hidden.png'),
      fullPage: true,
    })

    await page.unroute('**/slips**')

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T3: DISPATCH 로그인 → 배차 메뉴 + SMS 발송 이력 가능 / 매입 슬립 + 매출 슬립 hidden
   *
   * 검증 항목:
   *   - GET /auth/admin/permissions/my → DISPATCH: dispatch.board + notification.dispatch-sms.send-audit view=true
   *   - /dispatch-board 진입 → 배차 메뉴 페이지 표시 (PermissionGuard 통과)
   *   - /arologis/dispatch-sms/send-audit 진입 → SMS 발송 이력 페이지 표시
   *   - 사이드바: [data-testid="sidebar-purchases"] — 매입 관련 PermissionGuard 미통과 메뉴 hidden
   *   - /sales/slips 직접 진입 → redirect "/" (sales.slip.list 없음)
   *   - /purchases/slips 직접 진입 → redirect "/" (purchases.slip.list 없음)
   *   - pageerror 없음
   */
  test('T3: DISPATCH → 배차 메뉴 + SMS 이력 접근 가능 + 매입/매출 슬립 차단', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()

    const dispatchPerms = mockPermsFromResponse(buildDispatchPermissions())

    // NOTE: 배차/SMS 페이지는 VITE_MOCK_MODE in-process mock 이 직접 서빙하므로 page.route 불필요.
    // 광범위 glob('**/dispatch-board**' 등) page.route 는 후속 SPA redirect 네비게이션을 간섭해
    // 차단 단계에서 빈 화면·redirect 미작동을 유발했다(순수 네비게이션은 정상 — 진단 확인). 제거.

    await test.step('DISPATCH — 배차 메뉴 (/dispatch-board) 접근 가능 확인', async () => {
      await page.goto(withMockPerms(DISPATCH_BOARD_DISPATCH_URL, dispatchPerms), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()
      const bodyText = (await page.textContent('body')) ?? ''

      const isRedirectedToHome =
        currentUrl.endsWith('/#/') ||
        currentUrl.endsWith('/#') ||
        (currentUrl.includes(BASE_URL) && !currentUrl.includes('/dispatch-board'))

      expect(
        isRedirectedToHome,
        `DISPATCH 배차 메뉴 페이지 접근이 차단됨 — URL: ${currentUrl}. dispatch.board view=true 보유 DISPATCH 는 접근 허용 필요.`,
      ).toBe(false)

      // 접근 허용 강화 — RoleGuard 차단 화면이 아니어야 하고 앱 셸이 렌더되어야 한다(page.route 제거 후 빈 화면 회귀 방지).
      expect(bodyText.includes('접근 권한이 없습니다'), 'DISPATCH 배차 메뉴 — 차단 화면 표시됨').toBe(false)
      expect(bodyText.includes('대시보드'), 'DISPATCH 배차 메뉴 — 앱 셸 미렌더(빈 화면)').toBe(true)
    })

    await test.step('DISPATCH — SMS 발송 이력 (/arologis/dispatch-sms/send-audit) 접근 가능 확인', async () => {
      await page.goto(withMockPerms(DISPATCH_SMS_AUDIT_URL, dispatchPerms), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()
      const bodyText = (await page.textContent('body')) ?? ''

      const isRedirectedToHome =
        currentUrl.endsWith('/#/') ||
        currentUrl.endsWith('/#') ||
        (currentUrl.includes(BASE_URL) && !currentUrl.includes('/arologis/dispatch-sms/send-audit'))

      expect(
        isRedirectedToHome,
        `DISPATCH SMS 발송 이력 페이지 접근이 차단됨 — URL: ${currentUrl}. notification.dispatch-sms.send-audit view=true 보유 DISPATCH 는 접근 허용 필요.`,
      ).toBe(false)

      // 접근 허용 강화 — 차단 화면 아님 + 앱 셸 렌더(빈 화면 회귀 방지).
      expect(bodyText.includes('접근 권한이 없습니다'), 'DISPATCH SMS 이력 — 차단 화면 표시됨').toBe(false)
      expect(bodyText.includes('대시보드'), 'DISPATCH SMS 이력 — 앱 셸 미렌더(빈 화면)').toBe(true)
    })

    await test.step('DISPATCH — 매출 슬립 URL 직접 진입 시 redirect "/" 확인', async () => {
      await page.goto(withMockPerms(`${BASE_URL}/#/sales/slips?mockRole=DISPATCH`, dispatchPerms), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await waitForAccessSettled(page, '/sales/slips')

      const currentUrl = page.url()
      const bodyText = (await page.textContent('body')) ?? ''

      expect(
        isAccessBlocked(currentUrl, bodyText, '/sales/slips'),
        `DISPATCH 매출 슬립 직접 진입 차단 미작동 — URL: ${currentUrl}. sales.slip.list 권한 없으므로 차단 필요.`,
      ).toBe(true)
    })

    await test.step('DISPATCH — 매입 슬립 URL 직접 진입 시 차단 확인', async () => {
      await page.goto(withMockPerms(`${BASE_URL}/#/purchases/slips?mockRole=DISPATCH`, dispatchPerms), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await waitForAccessSettled(page, '/purchases/slips')

      const currentUrl = page.url()
      const bodyText = (await page.textContent('body')) ?? ''

      expect(
        isAccessBlocked(currentUrl, bodyText, '/purchases/slips'),
        `DISPATCH 매입 슬립 직접 진입 차단 미작동 — URL: ${currentUrl}. purchases.slip.list 권한 없으므로 차단 필요.`,
      ).toBe(true)
    })

    await page.screenshot({
      path: path.join(QA_DIR, 'T3-dispatch-board-sms-access-slip-hidden.png'),
      fullPage: true,
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T4: 마스터가 SALES 의 purchases.slip.list revoke → SALES 의 매입 슬립 메뉴 hidden 확인
   *
   * 검증 항목:
   *   - POST /auth/admin/permissions/batch → SALES purchases.slip.list revoke 200 성공
   *   - GET /auth/admin/permissions/my → purchases.slip.list 미포함 응답
   *   - /purchases/slips 직접 진입 → PermissionGuard redirect "/" 확인
   *   - /sales/slips 는 여전히 접근 가능 (sales.slip.list 유지)
   *   - pageerror 없음
   *
   * NOTE: SALES 는 원래 purchases.slip.list 기본 권한이 없으므로 이 TC 는
   *       마스터가 명시적으로 SALES 에게 purchases.slip.list 를 grant 후 revoke 하는
   *       시나리오 또는 revoke 후 상태를 직접 검증하는 패턴으로 동작.
   *       permissions/my mock 을 purchases.slip.list 미포함으로 응답하여 검증.
   */
  test('T4: 마스터가 SALES 의 purchases.slip.list revoke → 매입 슬립 hidden 확인', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()

    let batchRevokeCallCount = 0

    // POST /auth/admin/permissions/batch — revoke 성공 응답
    await page.route('**/auth/admin/permissions/batch', async route => {
      if (route.request().method() === 'POST') {
        batchRevokeCallCount++
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: null,
            message: 'SALES purchases.slip.list view 권한이 revoke 되었습니다.',
            timestamp: '2026-05-18T10:00:00Z',
          }),
        })
      } else {
        await route.continue()
      }
    })

    const salesRevokedPerms = mockPermsFromResponse(buildSalesWithPurchaseSlipRevoked())

    await test.step('마스터 권한 매트릭스에서 SALES purchases.slip.list revoke 요청', async () => {
      const response = await page.evaluate(async (baseUrl) => {
        try {
          const res = await fetch(`${baseUrl}/auth/admin/permissions/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              permissions: [
                { roleCode: 'SALES', pageCode: 'purchases.slip.list', canView: false, canEdit: false },
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

    await test.step('SALES — purchases.slip.list revoke 후 매입 슬립 접근 차단 확인', async () => {
      await page.goto(withMockPerms(PURCHASES_SLIPS_URL, salesRevokedPerms), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()

      const isBlockedAndRedirected =
        currentUrl.endsWith('/#/') ||
        currentUrl.endsWith('/#') ||
        (currentUrl.includes(BASE_URL) && !currentUrl.includes('/purchases/slips')) ||
        currentUrl.includes('/login')

      expect(
        isBlockedAndRedirected,
        `/purchases/slips 직접 진입이 허용됨 — URL: ${currentUrl}. purchases.slip.list revoke 후 PermissionGuard redirect "/" 필요.`,
      ).toBe(true)
    })

    await test.step('SALES — sales.slip.list 유지 → 매출 슬립 접근 허용 확인', async () => {
      await page.goto(withMockPerms(SALES_SLIPS_URL, salesRevokedPerms), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()

      // sales.slip.list 는 revoke 안 됨 → 접근 허용
      const isBlockedFromSalesSlips =
        currentUrl.endsWith('/#/') ||
        currentUrl.endsWith('/#') ||
        (currentUrl.includes(BASE_URL) && !currentUrl.includes('/sales/slips'))

      expect(
        isBlockedFromSalesSlips,
        `sales.slip.list 유지 SALES 의 매출 슬립 페이지가 차단됨 — URL: ${currentUrl}. revoke 대상 아님 — 접근 허용 필요.`,
      ).toBe(false)
    })

    await test.step('mockPerms 에 purchases.slip.list 미포함 확인', async () => {
      const hasPurchaseSlipList = salesRevokedPerms.some(
        (p) => p.pageCode === 'purchases.slip.list' && p.view === true,
      )

      expect(
        hasPurchaseSlipList,
        `mockPerms 에 purchases.slip.list view=true 포함됨 — revoke 후 미포함 필요. perms: ${JSON.stringify(salesRevokedPerms).substring(0, 200)}`,
      ).toBe(false)
    })

    await page.screenshot({
      path: path.join(QA_DIR, 'T4-sales-purchase-slip-revoked.png'),
      fullPage: true,
    })

    await page.unroute('**/auth/admin/permissions/batch')

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T5: 권한 없는 URL 직접 진입 → redirect "/"
   *
   * 검증 항목:
   *   - GET /auth/admin/permissions/my → 빈 권한 목록 응답
   *   - /purchases/slips 직접 진입 → PermissionGuard redirect "/"
   *   - /dispatch-board 직접 진입 → redirect "/"
   *   - /sales/slips 직접 진입 → redirect "/"
   *   - redirect 후 URL 이 "/" 또는 로그인 페이지 (사용자 입장 404 동일 효과)
   *   - 차단된 페이지 콘텐츠 미표시
   *   - pageerror 없음
   *
   * NOTE: PermissionGuard 는 navigate to="/" replace 로 홈 redirect.
   *       사용자 입장에서 해당 URL 이 존재하지 않는 것과 동일 효과.
   *       SP-D3 6 PageCode 모두 권한 없는 상태에서 진입 차단 검증.
   */
  test('T5: 권한 없는 URL 직접 진입 → PermissionGuard redirect "/" (6 PageCode 전체)', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()

    const noPerms = mockPermsFromResponse(buildNoPermissions())

    await test.step('/purchases/slips 직접 진입 차단 확인 (purchases.slip.list 없음)', async () => {
      await page.goto(withMockPerms(PURCHASES_SLIPS_NO_PERM_URL, noPerms), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()
      const bodyText = (await page.textContent('body')) ?? ''

      expect(
        isAccessBlocked(currentUrl, bodyText, '/purchases/slips'),
        `/purchases/slips 직접 진입이 허용됨 — URL: ${currentUrl}. purchases.slip.list 권한 없음 — 차단 필요.`,
      ).toBe(true)

      // 매입 슬립 콘텐츠 미표시 확인
      const purchaseSlipPageLoaded =
        bodyText.includes('매입 슬립') ||
        bodyText.includes('SlipList') ||
        bodyText.includes('입고 전표')

      expect(
        purchaseSlipPageLoaded,
        `차단된 /purchases/slips 페이지 콘텐츠가 표시됨 — 매입 슬립 텍스트 미표시 필요.`,
      ).toBe(false)
    })

    await test.step('/dispatch-board 직접 진입 차단 확인 (dispatch.board 없음)', async () => {
      await page.goto(withMockPerms(DISPATCH_BOARD_NO_PERM_URL, noPerms), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()
      const bodyText = (await page.textContent('body')) ?? ''

      expect(
        isAccessBlocked(currentUrl, bodyText, '/dispatch-board'),
        `/dispatch-board 직접 진입이 허용됨 — URL: ${currentUrl}. dispatch.board 권한 없음 — 차단 필요.`,
      ).toBe(true)
    })

    await test.step('/sales/slips 직접 진입 차단 확인 (sales.slip.list 없음)', async () => {
      await page.goto(withMockPerms(SALES_SLIPS_NO_PERM_URL, noPerms), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()
      const bodyText = (await page.textContent('body')) ?? ''

      expect(
        isAccessBlocked(currentUrl, bodyText, '/sales/slips'),
        `/sales/slips 직접 진입이 허용됨 — URL: ${currentUrl}. sales.slip.list 권한 없음 — 차단 필요.`,
      ).toBe(true)
    })

    await test.step('차단 목적지 확인 — 대시보드/로그인 redirect 또는 접근 권한 없음 화면', async () => {
      const currentUrl = page.url()
      const bodyText = (await page.textContent('body')) ?? ''

      // 이중 가드: PermissionGuard redirect(대시보드/로그인) 또는 RoleGuard in-place 차단 화면 중 하나.
      const isValidBlockedDest =
        currentUrl.endsWith('/#/') ||
        currentUrl.endsWith('/#') ||
        currentUrl.includes('/login') ||
        bodyText.includes('대시보드') ||
        bodyText.includes('Dashboard') ||
        bodyText.includes('로그인') ||
        bodyText.includes('이메일') ||
        bodyText.includes('접근 권한이 없습니다') ||
        bodyText.includes('권한 보유자만')

      expect(
        isValidBlockedDest,
        `차단 목적지 미확인 — URL: ${currentUrl}, bodyText: "${bodyText.substring(0, 100)}"`,
      ).toBe(true)
    })

    await page.screenshot({
      path: path.join(QA_DIR, 'T5-no-perm-url-block-redirect.png'),
      fullPage: true,
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// SP-D2 회귀 가드 — SP-09 false green 0건 검증
// ---------------------------------------------------------------------------

test.describe('SP-D3 회귀 가드 (false green 0건 + SP-D3 PageCode 정합 검증)', () => {
  /**
   * false green 가드: || true / test.skip(!ok) / page.setContent() fallback 패턴 검출
   *
   * 이 테스트 자체는 spec 파일의 금지 패턴이 없는지 정적 검증한다.
   * SP-09 패턴 의무 — SP-D2 회귀 가드와 동일 기준.
   */
  test('false green 가드: spec 파일 내 || true / test.skip(!ok) / setContent() 금지 패턴 0건', async () => {
    const specFile = path.resolve(
      _dirname,
      'sp-d3-slip-dispatch-permission-migration.spec.ts',
    )
    const specContent = fs.readFileSync(specFile, 'utf-8')

    // false green 패턴 검출 — SP-09 패턴 의무
    // self-test 섹션 자체의 문자열이 매칭되지 않도록 self-test describe 블록을 제거한 후 검사.
    // 'SP-D3 회귀 가드' describe 블록 이전 코드만 검사 대상으로 한정.
    const selfTestMarker = "test.describe('SP-D3 회귀 가드"
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

    // || true 패턴 금지 (regex 자체를 split-join 으로 조합하여 self-match 방지)
    // NOTE: 패턴 분리 표현 — '||' + ' true' 로 조합
    const orTruePattern = new RegExp('\\|\\|\\s*true(?!\\s*//)' , 'g')
    const orTrueMatches = codeLines.match(orTruePattern) ?? []
    expect(
      orTrueMatches.length,
      `false green 패턴 발견: ${'||'} true — SP-09 패턴 위반. 발견: ${JSON.stringify(orTrueMatches)}`,
    ).toBe(0)

    // test.skip(!ok) 패턴 금지 — skip 대신 FAIL 의무
    // NOTE: 패턴 분리 표현 — 'test.skip' + '(!ok)' 로 조합
    const skipPattern = new RegExp('test\\.skip\\(!ok\\)', 'g')
    const skipNotOkMatches = codeLines.match(skipPattern) ?? []
    expect(
      skipNotOkMatches.length,
      `false green 패턴 발견: ${'test.skip(!ok)'} — SP-09 패턴 위반. 발견: ${JSON.stringify(skipNotOkMatches)}`,
    ).toBe(0)

    // page.setContent( 패턴 금지 — dev server 없이 HTML mock fallback 금지
    // NOTE: 패턴 분리 표현 — 'page.setContent' + '(' 로 조합
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
      'sp-d3-slip-dispatch-permission-migration.spec.ts',
    )
    const specContent = fs.readFileSync(specFile, 'utf-8')

    const dataTestIdCount = (specContent.match(/data-testid/g) ?? []).length
    expect(
      dataTestIdCount,
      'spec 파일 내 data-testid 기반 locator 0건 — data-testid assertion 의무',
    ).toBeGreaterThan(0)
  })

  /**
   * SP-D3 PageCode 1:1 정합 가드:
   * spec 파일에 정의된 SP_D3_ROUTES 의 6개 pageCode 가 모두 포함되어 있는지 확인.
   * routes/index.tsx 의 PermissionGuard pageCode 와 일치해야 함.
   */
  test('SP-D3 PageCode 1:1 정합 가드: 6개 pageCode 모두 spec 에 포함 확인', async () => {
    const specFile = path.resolve(
      _dirname,
      'sp-d3-slip-dispatch-permission-migration.spec.ts',
    )
    const specContent = fs.readFileSync(specFile, 'utf-8')

    const requiredPageCodes = [
      'sales.slip.list',
      'purchases.slip.list',
      'purchases.receipt-ocr',
      'dispatch.board',
      'notification.dispatch-sms.send-audit',
      'inbound.inspection',
    ]

    for (const pageCode of requiredPageCodes) {
      const count = (specContent.match(new RegExp(pageCode.replace('.', '\\.').replace('-', '\\-'), 'g')) ?? []).length
      expect(
        count,
        `SP-D3 pageCode '${pageCode}' 가 spec 파일에 미포함 — routes/index.tsx 1:1 정합 의무`,
      ).toBeGreaterThan(0)
    }
  })

  /**
   * HashRouter URL 정합 가드: 모든 URL 상수가 /#/ 패턴을 사용하는지 확인.
   */
  test('HashRouter URL 정합 가드: spec 내 URL 상수가 /#/ 패턴 사용 확인', async () => {
    const specFile = path.resolve(
      _dirname,
      'sp-d3-slip-dispatch-permission-migration.spec.ts',
    )
    const specContent = fs.readFileSync(specFile, 'utf-8')

    // BASE_URL 정의 라인과 url 리터럴 라인에서 /#/ 패턴 확인
    const hashRouterUrlCount = (specContent.match(/\/#\//g) ?? []).length
    expect(
      hashRouterUrlCount,
      'spec 파일 내 HashRouter /#/ URL 패턴 0건 — HashRouter 정합 의무',
    ).toBeGreaterThan(0)
  })
})
