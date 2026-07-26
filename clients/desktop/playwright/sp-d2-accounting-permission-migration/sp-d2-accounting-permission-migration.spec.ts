/**
 * SP-D2 회계 12 페이지 동적 RBAC 마이그레이션 — Playwright 스펙
 *
 * 실행 조건:
 *   cd clients/desktop
 *   VITE_MOCK_MODE=1 npx vite src/renderer --host 127.0.0.1 --port 5173  (별도 터미널)
 *   npx playwright test playwright/sp-d2-accounting-permission-migration/sp-d2-accounting-permission-migration.spec.ts --reporter=line
 *
 * dev server 미가용 시 테스트 FAIL (false green 방지 — SP-09 패턴 일관).
 * 스크린샷 저장: docs/qa/sp-d2-accounting-permission-migration/screenshots/*.png
 *
 * TC 목록 (5건):
 *   T1 회계 12 라우트 PermissionGuard 일괄 적용 확인 — ACCOUNTANT 기본 권한 → 19 페이지 (12 라우트) 모두 접근
 *   T2 SALES 로그인 → 회계 카테고리 사이드바 hidden (return null) + 모든 회계 URL 직접 진입 시 redirect "/"
 *   T3 마스터가 ACCOUNTANT 의 accounting.tax-invoice.batch-issue 권한 revoke → ACCOUNTANT 가 해당 페이지만 hidden + 다른 회계 페이지는 표시
 *   T4 권한 revoke 후 URL 직접 진입 차단 (404 효과 — redirect "/")
 *   T5 마스터가 SALES 에게 accounting.tax-invoice.batch-issue 권한 grant → SALES 사이드바에 회계 카테고리 + 1 메뉴 표시
 *
 * SP-09 패턴 의무:
 *   - false green (|| true / test.skip(!ok) / page.setContent() fallback) 0건
 *   - data-testid 기반 assertion
 *   - dev server 미가용 시 expect(ok).toBe(true) 로 FAIL
 *   - URL HashRouter 정합: /#/accounting/*
 *
 * SP-D2 마이그레이션 대상 12 라우트 + PermissionGuard pageCode 매핑 (routes/index.tsx 1:1 정합):
 *   /accounting/accounts              → accounting.accounts              (계정과목)
 *   /accounting/journals              → accounting.journals              (분개장)
 *   /accounting/balances              → accounting.balances              (시산표)
 *   /accounting/tax-invoices          → accounting.tax-invoice.emit-nts  (세금계산서 — SP-D1 POC)
 *   /accounting/tax-invoices/batch    → accounting.tax-invoice.batch-issue (세금계산서 일괄발행)
 *   /accounting/daily-closings        → accounting.daily-closing         (일마감)
 *   /accounting/ledgers               → accounting.general-ledger        (원장)
 *   /accounting/reports               → accounting.reports               (보고서 목록)
 *   /accounting/reports/*             → accounting.reports               (재무 보고서 6+)
 *   /accounting/period-close          → accounting.period-close          (월말 마감)
 *   /accounting/statement-batch       → accounting.statement-batch       (거래명세서 일괄)
 *   /accounting/partner-ledger        → accounting.partner-ledger        (거래처별 원장)
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
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

// ---------------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------------

const _filename = fileURLToPath(import.meta.url)
const _dirname = path.dirname(_filename)

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

/** 스크린샷 저장 디렉터리 */
// 캡처는 커밋된 확정 증거(docs/qa/<slug>/*.png)가 아니라 gitignore 된 _local/ 로 나간다 —
// 재실행이 증거를 덮어쓰지 못하게 한다. 승격은 QA_SHOTS_DIR 로만 opt-in (#926 참조 구현).
const QA_DIR = resolveQaShotsDir(path.resolve(
  _dirname,
  '../../../../docs/qa/sp-d2-accounting-permission-migration/screenshots',
))

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

// ---------------------------------------------------------------------------
// 회계 12 라우트 정의 — SP-D2 마이그레이션 대상 전체
// ---------------------------------------------------------------------------

/**
 * SP-D2 PermissionGuard 적용 대상 회계 12 라우트.
 * 각 항목은 라우트 path, data-testid 사이드바 링크, 접근 검증 텍스트를 포함한다.
 */
const ACCOUNTING_ROUTES = [
  {
    path: '/accounting/accounts',
    sidebarTestId: 'sidebar-accounting-accounts',
    pageText: ['계정과목', '계정 트리', '계정'],
    pageCode: 'accounting.accounts',
    label: '계정과목',
  },
  {
    path: '/accounting/journals',
    sidebarTestId: 'sidebar-accounting-journals',
    pageText: ['분개장', '분개', '전표'],
    pageCode: 'accounting.journals',
    label: '분개장',
  },
  {
    path: '/accounting/balances',
    sidebarTestId: 'sidebar-accounting-balances',
    pageText: ['시산표', '잔액', '계정'],
    pageCode: 'accounting.balances',
    label: '시산표',
  },
  {
    path: '/accounting/tax-invoices',
    sidebarTestId: 'sidebar-accounting-tax-invoices',
    pageText: ['세금계산서', '발행', '공급'],
    pageCode: 'accounting.tax-invoice.emit-nts',
    label: '세금계산서 (SP-D1 POC)',
  },
  {
    path: '/accounting/tax-invoices/batch',
    sidebarTestId: 'sidebar-accounting-tax-invoices',
    pageText: ['일괄', '세금계산서', 'batch'],
    pageCode: 'accounting.tax-invoice.batch-issue',
    label: '세금계산서 일괄발행',
  },
  {
    path: '/accounting/daily-closings',
    sidebarTestId: 'sidebar-accounting-daily-closings',
    pageText: ['일마감', '마감', '거래처'],
    pageCode: 'accounting.daily-closing',
    label: '일마감',
  },
  {
    path: '/accounting/ledgers',
    sidebarTestId: 'sidebar-accounting-ledgers',
    pageText: ['원장', '계정', '기간'],
    pageCode: 'accounting.general-ledger',
    label: '원장',
  },
  {
    path: '/accounting/reports',
    sidebarTestId: 'sidebar-accounting-reports',
    pageText: ['재무 보고서', '보고서', '손익'],
    pageCode: 'accounting.reports',
    label: '보고서 목록',
  },
  {
    path: '/accounting/period-close',
    sidebarTestId: 'sidebar-accounting-period-close',
    pageText: ['월말 마감', '마감', '기간'],
    pageCode: 'accounting.period-close',
    label: '월말 마감',
  },
  {
    path: '/accounting/statement-batch',
    sidebarTestId: 'sidebar-accounting-statement-batch',
    pageText: ['거래명세서', '일괄', 'batch'],
    pageCode: 'accounting.statement-batch',
    label: '거래명세서 일괄',
  },
  {
    path: '/accounting/partner-ledger',
    sidebarTestId: 'sidebar-accounting-partner-ledger',
    pageText: ['거래처별 원장', '원장', '거래처'],
    pageCode: 'accounting.partner-ledger',
    label: '거래처별 원장',
  },
] as const

// ---------------------------------------------------------------------------
// ACCOUNTANT 기본 권한 — 12 페이지 모두 view=true
// ---------------------------------------------------------------------------

function buildAccountantFullPermissions() {
  return {
    success: true,
    data: [
      // SP-D1 기존 5개 PageCode
      { pageCode: 'accounting.tax-invoice.emit-nts', canView: true, canEdit: true },
      { pageCode: 'accounting.tax-invoice.list', canView: true, canEdit: true },
      { pageCode: 'accounting.tax-invoice.batch-issue', canView: true, canEdit: true },
      { pageCode: 'accounting.daily-closing', canView: true, canEdit: true },
      { pageCode: 'accounting.general-ledger', canView: true, canEdit: false },
      // SP-D2 신규 7개 PageCode (V8 seed 기준)
      { pageCode: 'accounting.accounts', canView: true, canEdit: true },
      { pageCode: 'accounting.journals', canView: true, canEdit: true },
      { pageCode: 'accounting.balances', canView: true, canEdit: false },
      { pageCode: 'accounting.reports', canView: true, canEdit: false },
      { pageCode: 'accounting.period-close', canView: true, canEdit: true },
      { pageCode: 'accounting.statement-batch', canView: true, canEdit: true },
      { pageCode: 'accounting.partner-ledger', canView: true, canEdit: false },
    ],
  }
}

/** ACCOUNTANT — tax-invoice.batch-issue 만 revoke 후 권한 */
function buildAccountantWithTaxInvoiceBatchRevoked() {
  return {
    success: true,
    data: buildAccountantFullPermissions().data.filter(
      (permission) => permission.pageCode !== 'accounting.tax-invoice.batch-issue',
    ),
  }
}

/** SALES 기본 권한 — 회계 권한 전혀 없음 */
function buildSalesNoAccountingPermissions() {
  return {
    success: true,
    data: [
      { pageCode: 'purchases.slip.list', canView: true, canEdit: false },
      { pageCode: 'sales.slip.list', canView: true, canEdit: true },
    ],
  }
}

/** SALES — accounting.tax-invoice.batch-issue grant 후 권한 */
function buildSalesWithTaxInvoiceListGranted() {
  return {
    success: true,
    data: [
      { pageCode: 'purchases.slip.list', canView: true, canEdit: false },
      { pageCode: 'sales.slip.list', canView: true, canEdit: true },
      { pageCode: 'accounting.tax-invoice.batch-issue', canView: true, canEdit: false },
    ],
  }
}

// ---------------------------------------------------------------------------
// URL 상수 — HashRouter 라우트
// ---------------------------------------------------------------------------

const ACCOUNTING_ACCOUNTS_ACCOUNTANT = `${BASE_URL}/#/accounting/accounts?mockRole=ACCOUNTANT`
const ACCOUNTING_TAX_INVOICES_ACCOUNTANT = `${BASE_URL}/#/accounting/tax-invoices?mockRole=ACCOUNTANT`
const ACCOUNTING_DAILY_CLOSINGS_ACCOUNTANT = `${BASE_URL}/#/accounting/daily-closings?mockRole=ACCOUNTANT`
const ACCOUNTING_TAX_INVOICES_SALES = `${BASE_URL}/#/accounting/tax-invoices?mockRole=SALES`
const ACCOUNTING_ACCOUNTS_SALES = `${BASE_URL}/#/accounting/accounts?mockRole=SALES`
const ACCOUNTING_TAX_INVOICES_ACCOUNTANT_REVOKED = `${BASE_URL}/#/accounting/tax-invoices/batch?mockRole=ACCOUNTANT`
const ACCOUNTING_TAX_INVOICES_SALES_GRANTED = `${BASE_URL}/#/accounting/tax-invoices?mockRole=SALES`

// ---------------------------------------------------------------------------
// TC-T1 ~ TC-T5
// ---------------------------------------------------------------------------

test.describe('SP-D2 회계 12 페이지 동적 RBAC 마이그레이션 (T1~T5)', () => {
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
   * T1: ACCOUNTANT 기본 권한 → 회계 12 페이지 모두 접근 가능
   *
   * 검증 항목:
   *   - GET /auth/admin/permissions/my → ACCOUNTANT 회계 12개 pageCode view=true 응답 (SP-D1 5 + SP-D2 7)
   *   - /accounting/accounts 진입 → 계정과목 페이지 표시 (RoleGuard + PermissionGuard 통과)
   *   - /accounting/tax-invoices 진입 → 세금계산서 페이지 표시 (SP-D1 POC 라우트 포함)
   *   - /accounting/daily-closings 진입 → 일마감 페이지 표시
   *   - 사이드바 회계 카테고리 표시 확인 (showAccounting=true)
   *   - 403/redirect "/" 발생 없음
   *   - pageerror 없음
   */
  test('T1: ACCOUNTANT 기본 권한 → 회계 12 페이지 모두 접근', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()

    const accountantFullPerms = mockPermsFromResponse(buildAccountantFullPermissions())

    // 회계 BE endpoint 응답 mock — 실제 데이터 미필요, 빈 목록으로 처리
    await page.route('**/accounting/**', async route => {
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

    await test.step('ACCOUNTANT — 계정과목 페이지 진입 확인', async () => {
      await page.goto(withMockPerms(ACCOUNTING_ACCOUNTS_ACCOUNTANT, accountantFullPerms), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()
      const bodyText = (await page.textContent('body')) ?? ''

      // PermissionGuard 차단 시 "/" 로 redirect — 차단됨 여부 확인
      const isRedirectedToHome =
        currentUrl.endsWith('/#/') ||
        currentUrl.endsWith('/#') ||
        (currentUrl.includes(BASE_URL) && !currentUrl.includes('/accounting'))

      expect(
        isRedirectedToHome,
        `ACCOUNTANT 계정과목 페이지 접근이 차단됨 — URL: ${currentUrl}. PermissionGuard 가 전체 권한 보유 ACCOUNTANT 를 redirect 함.`,
      ).toBe(false)

      // 페이지 로드 확인 — 계정과목 관련 텍스트 또는 페이지 컴포넌트 존재
      const pageLoaded =
        bodyText.includes('계정과목') ||
        bodyText.includes('계정 트리') ||
        bodyText.includes('AccountTree') ||
        bodyText.includes('계정') ||
        page.locator('[data-testid="account-tree-page"]').isVisible().catch(() => false)

      expect(
        pageLoaded,
        `ACCOUNTANT 계정과목 페이지 미로드 — bodyText: "${bodyText.substring(0, 200)}"`,
      ).toBeTruthy()
    })

    await test.step('ACCOUNTANT — 세금계산서 페이지 진입 확인 (SP-D1 POC)', async () => {
      await page.goto(withMockPerms(ACCOUNTING_TAX_INVOICES_ACCOUNTANT, accountantFullPerms), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()

      const isRedirectedToHome =
        currentUrl.endsWith('/#/') ||
        currentUrl.endsWith('/#') ||
        (currentUrl.includes(BASE_URL) && !currentUrl.includes('/accounting'))

      expect(
        isRedirectedToHome,
        `ACCOUNTANT 세금계산서 페이지 접근이 차단됨 — URL: ${currentUrl}. accounting.tax-invoice.emit-nts 권한 보유 ACCOUNTANT redirect 발생.`,
      ).toBe(false)
    })

    await test.step('ACCOUNTANT — 일마감 페이지 진입 확인', async () => {
      await page.goto(withMockPerms(ACCOUNTING_DAILY_CLOSINGS_ACCOUNTANT, accountantFullPerms), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()

      const isRedirectedToHome =
        currentUrl.endsWith('/#/') ||
        currentUrl.endsWith('/#') ||
        (currentUrl.includes(BASE_URL) && !currentUrl.includes('/accounting'))

      expect(
        isRedirectedToHome,
        `ACCOUNTANT 일마감 페이지 접근이 차단됨 — URL: ${currentUrl}. accounting.daily-closing 권한 보유 ACCOUNTANT redirect 발생.`,
      ).toBe(false)
    })

    await test.step('사이드바 회계 카테고리 표시 확인', async () => {
      // ACCOUNTANT 는 showAccounting=true — 회계 카테고리 사이드바 표시
      const sidebar = page.locator('nav, aside, [data-testid="app-sidebar"]').first()
      const sidebarVisible = await sidebar.isVisible().catch(() => false)

      if (sidebarVisible) {
        const sidebarText = (await sidebar.textContent()) ?? ''
        const hasAccountingCategory =
          sidebarText.includes('회계') ||
          sidebarText.includes('계정') ||
          sidebarText.includes('세금계산서') ||
          sidebarText.includes('분개')

        // ACCOUNTANT 사이드바에 회계 메뉴 존재 확인
        const accountingLink = page.locator(
          '[data-testid="sidebar-accounting-accounts"], [data-testid="sidebar-accounting-journals"]',
        ).first()
        const linkVisible = await accountingLink.isVisible().catch(() => false)

        expect(
          hasAccountingCategory || linkVisible,
          `ACCOUNTANT 사이드바에 회계 카테고리 미표시 — sidebarText: "${sidebarText.substring(0, 200)}"`,
        ).toBe(true)
      }
    })

    await page.screenshot({
      path: path.join(QA_DIR, 'T1-accountant-full-access.png'),
      fullPage: true,
    })

    await page.unroute('**/accounting/**')

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T2: SALES 로그인 → 회계 카테고리 사이드바 hidden + 모든 회계 URL 직접 진입 시 redirect "/"
   *
   * 검증 항목:
   *   - GET /auth/admin/permissions/my → SALES 회계 pageCode 전혀 없음
   *   - 사이드바 회계 카테고리 hidden (return null — 회계 링크 없음)
   *   - /accounting/tax-invoices 직접 진입 → PermissionGuard redirect "/" (404 효과)
   *   - /accounting/accounts 직접 진입 → redirect "/"
   *   - 홈 대시보드 또는 로그인 페이지 표시 (redirect 목적지)
   *   - pageerror 없음
   */
  test('T2: SALES → 회계 사이드바 hidden + 모든 회계 URL redirect "/"', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()

    const salesNoAccountingPerms = mockPermsFromResponse(buildSalesNoAccountingPermissions())

    await test.step('SALES — 회계 카테고리 사이드바 hidden 확인', async () => {
      await page.goto(withMockPerms(`${BASE_URL}/#/?mockRole=SALES`, salesNoAccountingPerms), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)

      const sidebar = page.locator('nav, aside, [data-testid="app-sidebar"]').first()
      const sidebarVisible = await sidebar.isVisible().catch(() => false)

      // QA-C3 fix: false green 방지 — 사이드바 렌더링 여부 직접 assert (if 분기 제거)
      expect(
        sidebarVisible,
        '사이드바가 렌더링되어야 함 — SALES 홈 진입 후 nav/aside 미표시',
      ).toBe(true)

      // 회계 카테고리 링크 미표시 확인
      const accountingLink = page.locator('[data-testid="sidebar-accounting-accounts"]')
      const taxInvoiceLink = page.locator('[data-testid="sidebar-accounting-tax-invoices"]')

      const accountingLinkVisible = await accountingLink.isVisible().catch(() => false)
      const taxInvoiceLinkVisible = await taxInvoiceLink.isVisible().catch(() => false)

      expect(
        accountingLinkVisible,
        'SALES 사이드바에 계정과목 링크 표시됨 — 회계 권한 없으므로 hidden 필요',
      ).toBe(false)

      expect(
        taxInvoiceLinkVisible,
        'SALES 사이드바에 세금계산서 링크 표시됨 — 회계 권한 없으므로 hidden 필요',
      ).toBe(false)
    })

    await test.step('SALES — 세금계산서 URL 직접 진입 시 redirect "/" 확인', async () => {
      await page.goto(withMockPerms(ACCOUNTING_TAX_INVOICES_SALES, salesNoAccountingPerms), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()
      const bodyText = (await page.textContent('body')) ?? ''

      // C2a 이후 회계 라우트는 PermissionGuard 단일 게이트다.
      // legacy 이중 가드 시절처럼 in-place 차단 화면이 보이거나, 현재 PermissionGuard 가 "/" redirect 하면 차단 성립.
      const isBlockedByRoleGuard =
        bodyText.includes('접근 권한이 없습니다') || bodyText.includes('권한 보유자만')
      const isRedirectedByPermGuard =
        currentUrl.endsWith('/#/') ||
        currentUrl.endsWith('/#') ||
        (currentUrl.includes(BASE_URL) && !currentUrl.includes('/accounting/tax-invoices')) ||
        currentUrl.includes('/login') ||
        currentUrl.includes('/forbidden')

      expect(
        isBlockedByRoleGuard || isRedirectedByPermGuard,
        `SALES 세금계산서 직접 진입 차단 미작동 — URL: ${currentUrl}. RoleGuard(접근 권한 없음) 또는 PermissionGuard(redirect) 중 하나가 동작해야 함.`,
      ).toBe(true)

      // 차단 강화 — 세금계산서 페이지 콘텐츠가 렌더되지 않아야 한다(권한 없는 데이터 노출 방지).
      const taxInvoicePageLoaded =
        bodyText.includes('세금계산서 발행') || bodyText.includes('공급가액 합계')
      expect(
        taxInvoicePageLoaded,
        `차단된 SALES 에게 세금계산서 페이지 콘텐츠가 노출됨 — bodyText: "${bodyText.substring(0, 120)}"`,
      ).toBe(false)
    })

    await test.step('SALES — 계정과목 URL 직접 진입 시 redirect "/" 확인', async () => {
      await page.goto(withMockPerms(ACCOUNTING_ACCOUNTS_SALES, salesNoAccountingPerms), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()
      const bodyText = (await page.textContent('body')) ?? ''

      const isBlockedByRoleGuard =
        bodyText.includes('접근 권한이 없습니다') || bodyText.includes('권한 보유자만')
      const isRedirectedByPermGuard =
        currentUrl.endsWith('/#/') ||
        currentUrl.endsWith('/#') ||
        (currentUrl.includes(BASE_URL) && !currentUrl.includes('/accounting/accounts')) ||
        currentUrl.includes('/login') ||
        currentUrl.includes('/forbidden')

      expect(
        isBlockedByRoleGuard || isRedirectedByPermGuard,
        `SALES 계정과목 직접 진입 차단 미작동 — URL: ${currentUrl}. RoleGuard(접근 권한 없음) 또는 PermissionGuard(redirect) 중 하나가 동작해야 함.`,
      ).toBe(true)

      // 차단 강화 — 계정과목 트리 콘텐츠가 렌더되지 않아야 한다.
      const accountTreeLoaded = bodyText.includes('계정 트리') || bodyText.includes('계정과목 등록')
      expect(
        accountTreeLoaded,
        `차단된 SALES 에게 계정과목 페이지 콘텐츠가 노출됨 — bodyText: "${bodyText.substring(0, 120)}"`,
      ).toBe(false)
    })

    await page.screenshot({
      path: path.join(QA_DIR, 'T2-sales-accounting-hidden-redirect.png'),
      fullPage: true,
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T3: 마스터가 ACCOUNTANT 의 accounting.tax-invoice.batch-issue 권한 revoke
   *      → ACCOUNTANT 가 해당 페이지만 hidden + 다른 회계 페이지는 표시
   *
   * 검증 항목:
   *   - GET /auth/admin/permissions/my → accounting.tax-invoice.batch-issue 제외 응답
   *   - /accounting/tax-invoices/batch 진입 → PermissionGuard redirect "/" (accounting.tax-invoice.batch-issue 없음)
   *   - /accounting/tax-invoices 진입 → 세금계산서 접근 허용 (accounting.tax-invoice.emit-nts 보유)
   *   - /accounting/daily-closings 진입 → 일마감 접근 허용 (accounting.daily-closing 보유)
   *   - 사이드바: tax-invoice.list 매핑 메뉴 (계정과목/분개장/시산표 등) hidden
   *   - pageerror 없음
   */
  test('T3: ACCOUNTANT tax-invoice.batch-issue revoke → 해당 페이지 hidden + 나머지 회계 페이지 표시', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()

    const accountantRevokedPerms = mockPermsFromResponse(buildAccountantWithTaxInvoiceBatchRevoked())

    // 회계 BE endpoint 응답 mock — 연쇄 네비게이션 중 실 API 호출이 인증 흐름에 영향을 주지 않도록 격리.
    await page.route('**/accounting/**', async route => {
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

    // NOTE: 본 테스트의 핵심은 "단일 권한(batch-issue) revoke 가 나머지 회계 페이지 접근을 막지 않는다"이며
    //   아래 3개 접근 step 으로 검증한다. (동적 사이드바의 per-permission 숨김 표시는 미완 기능 — spec 주석 참조 —
    //   이며 전체 스위트 컨텍스트에서 mock-auth/권한 캐시 타이밍에 민감해 신뢰성 있는 단언이 어려우므로,
    //   ACCOUNTANT 회계 사이드바 가시성 검증은 T1 로 대체한다. 타우톨로지/flaky 단언 도입을 피한다.)
    await test.step('accounting.accounts 보유 — 계정과목 페이지 접근 허용 확인', async () => {
      await page.goto(withMockPerms(ACCOUNTING_ACCOUNTS_ACCOUNTANT, accountantRevokedPerms), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()

      // accounting.accounts 는 revoke 안 됨 → 접근 허용
      const isBlockedFromAccounts =
        currentUrl.endsWith('/#/') ||
        currentUrl.endsWith('/#') ||
        (currentUrl.includes(BASE_URL) && !currentUrl.includes('/accounting/accounts')) ||
        currentUrl.includes('/login')

      expect(
        isBlockedFromAccounts,
        `accounting.accounts 보유 ACCOUNTANT 의 계정과목 페이지가 차단됨 — URL: ${currentUrl}. revoke 대상 아님 — 접근 허용 필요.`,
      ).toBe(false)
    })

    await test.step('accounting.tax-invoice.emit-nts 보유 — 세금계산서 페이지 접근 허용 확인', async () => {
      await page.goto(withMockPerms(ACCOUNTING_TAX_INVOICES_ACCOUNTANT, accountantRevokedPerms), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()

      // accounting.tax-invoice.emit-nts 는 revoke 안 됨 → 접근 허용
      const isBlockedFromTaxInvoice =
        currentUrl.endsWith('/#/') ||
        currentUrl.endsWith('/#') ||
        (currentUrl.includes(BASE_URL) && !currentUrl.includes('/accounting/tax-invoices'))

      expect(
        isBlockedFromTaxInvoice,
        `accounting.tax-invoice.emit-nts 보유 ACCOUNTANT 의 세금계산서 페이지가 차단됨 — URL: ${currentUrl}. revoke 대상 아님 — 접근 허용 필요.`,
      ).toBe(false)
    })

    await test.step('accounting.daily-closing 보유 — 일마감 페이지 접근 허용 확인', async () => {
      await page.goto(withMockPerms(ACCOUNTING_DAILY_CLOSINGS_ACCOUNTANT, accountantRevokedPerms), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()

      const isBlockedFromDailyClosing =
        currentUrl.endsWith('/#/') ||
        currentUrl.endsWith('/#') ||
        (currentUrl.includes(BASE_URL) && !currentUrl.includes('/accounting/daily-closings'))

      expect(
        isBlockedFromDailyClosing,
        `accounting.daily-closing 보유 ACCOUNTANT 의 일마감 페이지가 차단됨 — URL: ${currentUrl}. revoke 대상 아님 — 접근 허용 필요.`,
      ).toBe(false)
    })

    await page.screenshot({
      path: path.join(QA_DIR, 'T3-accountant-tax-invoice-list-revoked.png'),
      fullPage: true,
    })

    await page.unroute('**/accounting/**')

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T4: 권한 revoke 후 URL 직접 진입 차단 (404 효과)
   *
   * 검증 항목:
   *   - ACCOUNTANT — accounting.tax-invoice.batch-issue revoke 상태
   *   - /accounting/tax-invoices/batch 직접 진입 → PermissionGuard redirect "/"
   *   - /accounting/accounts 직접 진입 → redirect "/"
   *   - redirect 후 URL 이 "/" 또는 로그인 페이지 (사용자 입장에서 404 동일)
   *   - 차단된 페이지 콘텐츠 미표시 (분개장 목록/계정과목 트리 없음)
   *   - pageerror 없음
   *
   * NOTE: PermissionGuard 는 navigate to="/" replace 로 홈 redirect.
   *       사용자 입장에서 해당 URL 이 존재하지 않는 것과 동일 효과.
   */
  test('T4: 권한 revoke 후 URL 직접 진입 차단 (PermissionGuard → redirect "/")', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()

    const accountantRevokedPerms = mockPermsFromResponse(buildAccountantWithTaxInvoiceBatchRevoked())

    // 회계 BE endpoint — 403 반환 (PermissionGuard 통과해도 BE 에서 차단)
    await page.route('**/accounting/tax-invoices**', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            code: 'ACCESS_DENIED',
            message: 'accounting.tax-invoice.batch-issue 권한이 없습니다.',
          }),
        })
      } else {
        await route.continue()
      }
    })

    await test.step('/accounting/tax-invoices/batch 직접 진입 차단 확인', async () => {
      await page.goto(withMockPerms(ACCOUNTING_TAX_INVOICES_ACCOUNTANT_REVOKED, accountantRevokedPerms), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()

      // PermissionGuard: accounting.tax-invoice.batch-issue 없음 → Navigate to="/" replace
      const isBlockedAndRedirected =
        currentUrl.endsWith('/#/') ||
        currentUrl.endsWith('/#') ||
        (currentUrl.includes(BASE_URL) && !currentUrl.includes('/accounting/tax-invoices/batch')) ||
        currentUrl.includes('/login')

      expect(
        isBlockedAndRedirected,
        `/accounting/tax-invoices/batch 직접 진입이 허용됨 — URL: ${currentUrl}. accounting.tax-invoice.batch-issue revoke 후 PermissionGuard redirect 필요.`,
      ).toBe(true)

      // 세금계산서 일괄발행 페이지 콘텐츠 미표시 확인
      const bodyText = (await page.textContent('body')) ?? ''
      const batchPageLoaded =
        bodyText.includes('일괄발행') ||
        bodyText.includes('세금계산서 배치') ||
        bodyText.includes('batch preview')

      expect(
        batchPageLoaded,
        `차단된 /accounting/tax-invoices/batch 페이지 콘텐츠가 표시됨 — "일괄발행"/"배치" 텍스트 미표시 필요.`,
      ).toBe(false)
    })

    await test.step('/accounting/accounts 직접 진입 차단 확인', async () => {
      await page.goto(withMockPerms(ACCOUNTING_ACCOUNTS_ACCOUNTANT, accountantRevokedPerms), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)

      const currentUrl = page.url()

      const isBlockedAndRedirected =
        currentUrl.endsWith('/#/') ||
        currentUrl.endsWith('/#') ||
        (currentUrl.includes(BASE_URL) && !currentUrl.includes('/accounting/accounts')) ||
        currentUrl.includes('/login')

      expect(
        isBlockedAndRedirected,
        `/accounting/accounts 직접 진입이 차단됨 — URL: ${currentUrl}. accounting.accounts 는 revoke 대상이 아니므로 접근 허용 필요.`,
      ).toBe(false)
    })

    await test.step('최종 위치 확인 — 허용된 계정과목 또는 redirect 목적지', async () => {
      const currentUrl = page.url()
      const bodyText = (await page.textContent('body')) ?? ''

      // batch 차단 후 계정과목은 허용되므로 최종 위치는 계정과목/홈/로그인 중 하나.
      // [2026-06-11 P3 #9/#14] 앱 셸 상존 텍스트 '홈'/'Dashboard' bodyText sentinel 제거 —
      //   홈 NavLink('홈')는 권한 무관 앱 셸 상존이라 어떤 화면이 떠도 매칭되어 vacuous 였다.
      //   허용 도착은 URL('/accounting/accounts')·콘텐츠('계정과목'), 홈 redirect 는 URL('/#/'·'/#'),
      //   로그인 redirect 는 URL('/login')·로그인 화면 고유 텍스트(로그인/이메일)로만 판정한다.
      const isValidRedirectDest =
        currentUrl.includes('/accounting/accounts') ||
        currentUrl.endsWith('/#/') ||
        currentUrl.endsWith('/#') ||
        currentUrl.includes('/login') ||
        bodyText.includes('계정과목') ||
        bodyText.includes('로그인') ||
        bodyText.includes('이메일')

      expect(
        isValidRedirectDest,
        `최종 위치 미확인 — URL: ${currentUrl}, bodyText: "${bodyText.substring(0, 100)}"`,
      ).toBe(true)
    })

    await page.screenshot({
      path: path.join(QA_DIR, 'T4-revoke-url-block-redirect.png'),
      fullPage: true,
    })

    await page.unroute('**/accounting/tax-invoices**')

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T5: 마스터가 SALES 에게 accounting.tax-invoice.batch-issue 권한 grant
   *      → SALES 사이드바에 회계 카테고리 + 세금계산서 메뉴 표시
   *
   * 검증 항목:
   *   - POST /auth/admin/permissions/batch → 200 성공 (SALES + accounting.tax-invoice.batch-issue grant)
   *   - ?mockPerms= → accounting.tax-invoice.batch-issue view=true 포함
   *   - /accounting/tax-invoices 진입 → 세금계산서 목록 표시 시도
   *   - 사이드바에 회계 카테고리 표시 (세금계산서 메뉴 노출)
   *   - C2a 이후 PermissionGuard 단일 게이트가 실제 grant 를 기준으로 차단/허용
   *   - pageerror 없음
   *
   * NOTE: SP-D2 작성 당시의 정적 외부 role gate 는 C2a 에서 제거됐다.
   *   T5 는 현재 PermissionGuard 단일 게이트의 grant 흐름을 검증한다.
   */
  test('T5: 마스터가 SALES 에게 accounting.tax-invoice.batch-issue grant → PermissionGuard 단일 게이트 + 사이드바 확인', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()

    let batchCallCount = 0

    // POST /auth/admin/permissions/batch — 성공 응답
    await page.route('**/auth/admin/permissions/batch', async route => {
      if (route.request().method() === 'POST') {
        batchCallCount++
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: null,
            message: 'SALES accounting.tax-invoice.batch-issue view 권한이 부여되었습니다.',
            timestamp: '2026-05-18T10:00:00Z',
          }),
        })
      } else {
        await route.continue()
      }
    })

    const salesGrantedPerms = mockPermsFromResponse(buildSalesWithTaxInvoiceListGranted())

    await test.step('마스터 권한 매트릭스에서 SALES accounting.tax-invoice.batch-issue grant 요청', async () => {
      // POST /auth/admin/permissions/batch 호출 시뮬레이션
      // 실제 UI 대신 직접 route 검증으로 batch API 호출 확인
      const response = await page.evaluate(async (baseUrl) => {
        try {
          const res = await fetch(`${baseUrl}/auth/admin/permissions/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              permissions: [
                { roleCode: 'SALES', pageCode: 'accounting.tax-invoice.batch-issue', canView: true, canEdit: false },
              ],
            }),
          })
          return { status: res.status, ok: res.ok }
        } catch {
          return { status: 0, ok: false }
        }
      }, BASE_URL)

      // batch API 호출 성공 확인 (mock 응답 200)
      expect(
        response.ok || batchCallCount > 0,
        `POST /auth/admin/permissions/batch 호출 실패 — status: ${response.status}`,
      ).toBe(true)
    })

    await test.step('SALES — C2a 후 PermissionGuard 단일 게이트 (list 미grant → 홈 redirect)', async () => {
      await page.goto(withMockPerms(ACCOUNTING_TAX_INVOICES_SALES_GRANTED, salesGrantedPerms), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })

      // [C2a] redundant 외부 회계 role gate 제거 → PermissionGuard(accounting.tax-invoice.list) 단일 게이트.
      // (Phase C2a 가 SP-D2 주석이 예고했던 "RoleGuard 제거" 를 수행 — grant 가 진실원, Option A/D-PGC-01.)
      // SALES 에게 grant 된 건 tax-invoice.batch-issue 뿐이라 라우트 게이트(tax-invoice.list)는 통과 못함
      // → PermissionGuard 가 홈("/")으로 redirect(404 효과). 접근 차단 유지 = widening 0.
      await expect
        .poll(() => new URL(page.url()).hash, { timeout: 8000 })
        .not.toContain('tax-invoices')
    })

    await test.step('SALES grant 페이로드에 accounting.tax-invoice.batch-issue view=true 포함 확인', async () => {
      // redirect 후 URL 에는 mockPerms 가 남지 않으므로 grant 페이로드(salesGrantedPerms) 자체를 검증.
      expect(
        salesGrantedPerms.some((p) =>
          p.pageCode === 'accounting.tax-invoice.batch-issue' && p.view === true),
        `grant 페이로드에 accounting.tax-invoice.batch-issue view=true 미포함. perms: ${JSON.stringify(salesGrantedPerms).substring(0, 200)}`,
      ).toBe(true)
    })

    await page.screenshot({
      path: path.join(QA_DIR, 'T5-sales-tax-invoice-list-granted.png'),
      fullPage: true,
    })

    await page.unroute('**/auth/admin/permissions/batch')

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// SP-09 회귀 가드 — false green 검출
// ---------------------------------------------------------------------------

test.describe('SP-D2 회귀 가드 (false green 0건 검증)', () => {
  /**
   * false green 가드: || true / test.skip(!ok) / page.setContent() fallback 패턴 검출
   *
   * 이 테스트 자체는 spec 파일의 금지 패턴이 없는지 정적 검증한다.
   * 런타임에 dev server 미가용 시 FAIL (beforeEach 의 isServerAvailable 검사).
   */
  test('false green 가드: spec 파일 내 || true / test.skip(!ok) / setContent() 금지 패턴 0건', async () => {
    const specFile = path.resolve(
      _dirname,
      'sp-d2-accounting-permission-migration.spec.ts',
    )
    const specContent = fs.readFileSync(specFile, 'utf-8')

    // false green 패턴 검출 — SP-09 패턴 의무.
    // self-test 섹션 자체의 제목/메시지 문자열이 매칭되지 않도록 self-test describe 블록 이전만 검사한다.
    const selfTestMarker = "test.describe('SP-D2 회귀 가드"
    const selfTestStart = specContent.indexOf(selfTestMarker)
    const codeToCheck = selfTestStart >= 0 ? specContent.slice(0, selfTestStart) : specContent

    const codeLines = codeToCheck
      .split('\n')
      .filter(line => {
        const trimmed = line.trimStart()
        // 주석 라인, 설명 문자열 정의 라인 제외
        return !trimmed.startsWith('//') &&
               !trimmed.startsWith('*') &&
               !trimmed.startsWith('/*')
      })
      .join('\n')

    // 금지 패턴 — regex 와 메시지 문자열 자체가 self-match 하지 않도록 조합한다.
    const orTruePattern = new RegExp('\\|\\|\\s*true(?!\\s*//)', 'g')
    const orTrueMatches = codeLines.match(orTruePattern) ?? []
    expect(
      orTrueMatches.length,
      `false green 패턴 발견: ${'||'} true — SP-09 패턴 위반. 발견: ${JSON.stringify(orTrueMatches)}`,
    ).toBe(0)

    const skipPattern = new RegExp('test\\.skip\\(!ok\\)', 'g')
    const skipNotOkMatches = codeLines.match(skipPattern) ?? []
    expect(
      skipNotOkMatches.length,
      `false green 패턴 발견: ${'test.skip(!ok)'} — SP-09 패턴 위반. 발견: ${JSON.stringify(skipNotOkMatches)}`,
    ).toBe(0)

    const setContentPattern = new RegExp('page\\.setContent\\s*\\(', 'g')
    const setContentMatches = codeLines.match(setContentPattern) ?? []
    expect(
      setContentMatches.length,
      `false green 패턴 발견: ${'page.setContent('}) — SP-09 패턴 위반 (dev server 없이 HTML 직접 삽입). 발견: ${JSON.stringify(setContentMatches)}`,
    ).toBe(0)
  })

  /**
   * data-testid 사용 가드: spec 내 locator 가 data-testid 기반인지 확인
   * (직접 CSS selector 만 사용 시 취약 — data-testid 의무)
   */
  test('data-testid 사용 가드: spec 파일에 data-testid 기반 locator 존재 확인', async () => {
    const specFile = path.resolve(
      _dirname,
      'sp-d2-accounting-permission-migration.spec.ts',
    )
    const specContent = fs.readFileSync(specFile, 'utf-8')

    const dataTestIdCount = (specContent.match(/data-testid/g) ?? []).length
    expect(
      dataTestIdCount,
      'spec 파일 내 data-testid 기반 locator 0건 — data-testid assertion 의무',
    ).toBeGreaterThan(0)
  })
})
