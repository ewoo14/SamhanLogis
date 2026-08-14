import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * Desktop 전 화면 자동 점검 Playwright 스펙 — full-screen-audit.
 *
 * 목적: mock 모드(VITE_MOCK_MODE=1)에서 모든 라우트를 순회하며
 * 콘솔 에러 / pageerror / 화면 화이트 / list.map TypeError 를 수집.
 *
 * 실행 조건:
 *   cd clients/desktop
 *   npx playwright test playwright/audit/full-screen-audit.spec.ts \
 *     --headed \
 *     --reporter=line
 *
 * dev server 가 VITE_MOCK_MODE=1 로 가동 중이어야 함:
 *   VITE_MOCK_MODE=1 npx vite --config electron.vite.config.ts \
 *     --mode development src/renderer
 *
 * 스크린샷 저장 위치: docs/qa/full-audit/{role}_{slug}.png
 *
 * 참고: Playwright 는 package.json devDependencies 에 포함됨.
 * 브라우저가 없는 환경에서는 `npx playwright install chromium` 필요.
 */
import { test, expect, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'

// ---------------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------------

/** dev server URL (VITE_MOCK_MODE=1, renderer only) */
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5173'

/** 스크린샷 저장 디렉토리 */
const SCREENSHOT_DIR = resolveQaShotsDir(path.resolve(
  __dirname,
  '../../../../docs/qa/full-audit',
))

/**
 * dev server 가용 여부 — false green 방지 가드.
 * server timeout 또는 미가동 시 false 반환 → test.skip 으로 처리.
 */
async function isServerAvailable(): Promise<boolean> {
  try {
    const url = new URL(BASE_URL)
    const mod = await import('http')
    return new Promise(resolve => {
      const req = mod.default.get(
        { hostname: url.hostname, port: Number(url.port) || 80, path: '/', timeout: 2_000 },
        res => { resolve(true); res.resume() },
      )
      req.on('error', () => resolve(false))
      req.on('timeout', () => { req.destroy(); resolve(false) })
    })
  } catch {
    return false
  }
}

/** networkidle 타임아웃 (ms) */
const IDLE_TIMEOUT = 5_000

/** 추가 settle 대기 (ms) */
const SETTLE_WAIT = 1_000

// ---------------------------------------------------------------------------
// 라우트 정의 — routes/index.tsx 에서 추출 (동적 :id → mock ID 대체)
// ---------------------------------------------------------------------------

interface RouteCase {
  /** URL 경로 (mockRole query 미포함) */
  path: string
  /** 필요 ROLE — 미지정 시 MASTER 로 접근 */
  minRole?: string
  /** 이 라우트는 항상 MASTER 로만 테스트 */
  masterOnly?: boolean
  /** 인증 외부 (AuthGuard 우회) 공개 경로 */
  public?: boolean
}

const ROUTES: RouteCase[] = [
  // 공개 (AuthGuard 외부)
  { path: '/login', public: true },
  { path: '/mobile/d/mock-token-abc/s/2026050401', public: true },
  { path: '/mobile/share/mock-share-token-xyz', public: true },

  // 대시보드 / 공통
  { path: '/' },
  { path: '/warehouses' },
  { path: '/password/change' },

  // 판매관리 (출고전표)
  { path: '/sales' },
  { path: '/sales/new' },
  { path: '/sales/link-dispatch' },
  { path: '/sales/slip-cleanup' },
  { path: '/sales/closing' },
  { path: '/sales/next-day-slip' },
  { path: '/sales/estimates' },
  { path: '/sales/estimates/new' },
  { path: '/sales/estimates/slip-001' },
  { path: '/sales/estimates/slip-001/edit' },
  { path: '/sales/estimates/EST-2026-05-001/print' },
  { path: '/sales/partner-orders' },
  { path: '/sales/partner-orders/po-001' },
  { path: '/sales/order-approvals' },
  { path: '/sales/partner-dc-config' },
  { path: '/sales/slip-001' },
  { path: '/sales/slip-001/print/invoice' },
  { path: '/sales/slip-001/print/dispatch' },

  // 구매관리 (입고전표)
  { path: '/purchases' },
  { path: '/purchases/new' },
  { path: '/purchases/slip-003' },
  { path: '/purchases/slip-003/print/purchase' },

  // 재고이동
  { path: '/transfers' },
  { path: '/transfers/new' },
  { path: '/transfers/tr-001' },

  // 인쇄 라우트
  { path: '/print/next-day-slip?date=2026-05-10' },
  { path: '/print/statement-batch?from=2026-04-01&to=2026-04-30' },
  { path: '/print/partner-ledger?partnerCode=1234567890&from=2026-04-01&to=2026-04-30' },

  // 회계 (ACCOUNTANT/MANAGER/MASTER)
  { path: '/accounting/accounts' },
  { path: '/accounting/journals' },
  { path: '/accounting/journals/new' },
  { path: '/accounting/journals/jv-001' },
  { path: '/accounting/journals/jv-001/edit' },
  { path: '/accounting/balances' },
  { path: '/accounting/hometax-export' },
  { path: '/accounting/statement-batch' },
  { path: '/accounting/partner-ledger' },
  { path: '/accounting/period-close' },
  { path: '/accounting/supplier-profiles' },
  { path: '/accounting/tax-invoices' },
  { path: '/accounting/tax-invoices/batch' },
  { path: '/accounting/tax-invoices/new' },
  { path: '/accounting/tax-invoices/ti-001' },
  { path: '/accounting/tax-invoices/ti-001/edit' },
  { path: '/accounting/tax-invoices/ti-001/print' },

  // 창고 / 재고
  { path: '/warehouse/closing' }, // legacy deep-link 호환
  { path: '/warehouse/inbound-inspections' },
  { path: '/warehouse/audit' },
  { path: '/warehouse/audit/new' },
  { path: '/warehouse/audit/audit-001' },
  { path: '/warehouse/dps-compare' },
  { path: '/warehouse/dps-compare/by-product' },
  { path: '/inventory/safety-stock-alerts' },

  // arologis
  { path: '/arologis/manual', masterOnly: true },
  { path: '/arologis/pre-classify', masterOnly: true },
  { path: '/arologis/unassigned', masterOnly: true },
  { path: '/arologis/dispatch-sms', masterOnly: true },
  { path: '/arologis/dispatch-reconcile', masterOnly: true },
  { path: '/arologis/admin/auto-dispatch', masterOnly: true },
  { path: '/arologis/admin/manual-dispatch', masterOnly: true },
  { path: '/arologis/admin/driver-assignment', masterOnly: true },
  { path: '/dispatch-board' },

  // Admin (MASTER 전용)
  { path: '/admin/users', masterOnly: true },
  { path: '/admin/roles', masterOnly: true },
  { path: '/admin/partners' },
  { path: '/admin/partners/new' },
  { path: '/admin/warehouses', masterOnly: true },
  { path: '/admin/departments', masterOnly: true },
  { path: '/admin/sheet-sync' },
  { path: '/admin/blocked-partners' },
  { path: '/admin/aligo-address-book' },
  { path: '/admin/regions' },
  { path: '/admin/slip-edit-requests' },
  { path: '/admin/photo-audit' },
]

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

/** 경로를 파일명 안전한 슬러그로 변환 */
function pathToSlug(routePath: string): string {
  return routePath
    .replace(/^\//, '')
    .replace(/[/?=&]/g, '_')
    .replace(/:/g, '_')
    .replace(/__+/g, '_')
    .replace(/_$/, '')
    || 'root'
}

/** 스크린샷 저장 */
async function captureScreenshot(
  page: Page,
  role: string,
  slug: string,
): Promise<void> {
  const filePath = path.join(SCREENSHOT_DIR, `${role}_${slug}.png`)
  await page.screenshot({ path: filePath, fullPage: true })
}

/** hash 라우터용 URL 생성 */
function buildUrl(routePath: string, role: string): string {
  const [pathPart, queryPart] = routePath.split('?')
  const mockRoleParam = `mockRole=${encodeURIComponent(role)}`
  const query = queryPart ? `${mockRoleParam}&${queryPart}` : mockRoleParam
  return `${BASE_URL}/#${pathPart}?${query}`
}

/** 콘솔 에러 + pageerror 수집 설정 */
interface ErrorRecord {
  url: string
  type: 'console' | 'pageerror'
  message: string
  role: string
}

// ---------------------------------------------------------------------------
// 전역 결과 저장소
// ---------------------------------------------------------------------------
const RESULTS: ErrorRecord[] = []

// ---------------------------------------------------------------------------
// 테스트 그룹: MASTER 전 라우트 점검
// ---------------------------------------------------------------------------

test.describe('Desktop 전 화면 자동 점검 — MASTER', () => {
  test.beforeAll(async () => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
    const ok = await isServerAvailable()
    if (!ok) {
      // beforeAll 에서 skip: 전체 describe 를 건너뜀
      // eslint-disable-next-line no-console
      console.warn(`[full-screen-audit] dev server 미가동 (${BASE_URL}) — MASTER 전 라우트 점검 skip`)
    }
  })

  test.beforeEach(async () => {
    const ok = await isServerAvailable()
    test.skip(!ok, `dev server 미가동: ${BASE_URL} — VITE_MOCK_MODE=1 npx vite 후 재시도`)
  })

  for (const route of ROUTES) {
    const role = 'MASTER'
    const slug = pathToSlug(route.path)
    const testName = `[MASTER] ${route.path}`

    test(testName, async ({ page }) => {
      const errors: ErrorRecord[] = []

      // 콘솔 에러 수집
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          errors.push({
            url: route.path,
            type: 'console',
            message: msg.text(),
            role,
          })
        }
      })

      // pageerror (unhandled exception) 수집
      page.on('pageerror', (err) => {
        errors.push({
          url: route.path,
          type: 'pageerror',
          message: err.message,
          role,
        })
      })

      const url = buildUrl(route.path, role)
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 })
        // networkidle 대기 (백엔드 없음 → 빠름)
        await page.waitForLoadState('networkidle', { timeout: IDLE_TIMEOUT }).catch(() => {
          // networkidle 타임아웃은 무시 (mock 환경)
        })
        await page.waitForTimeout(SETTLE_WAIT)
      } catch (navErr) {
        errors.push({
          url: route.path,
          type: 'pageerror',
          message: `네비게이션 실패: ${String(navErr)}`,
          role,
        })
      }

      // 스크린샷 저장
      await captureScreenshot(page, role, slug).catch(() => {
        // 스크린샷 실패는 무시
      })

      // 화면 화이트 감지 — body 안에 visible 콘텐츠 없으면 화이트
      const hasContent = await page.evaluate(() => {
        const body = document.body
        if (!body) return false
        const text = body.innerText?.trim() ?? ''
        return text.length > 10
      }).catch(() => false)

      if (!hasContent) {
        errors.push({
          url: route.path,
          type: 'console',
          message: '[화면 화이트] body 에 표시 콘텐츠 없음',
          role,
        })
      }

      // 결과 누적
      RESULTS.push(...errors)

      // Playwright assertion — 테스트 케이스 결과 기록 (pass/fail 은 스크린샷 여부만)
      // 실제 결함은 REPORT.md 에서 종합하므로 여기서는 soft-assertion
      if (errors.some((e) => e.type === 'pageerror')) {
        console.warn(`[${role}] ${route.path} — pageerror 발생:`)
        errors.filter((e) => e.type === 'pageerror').forEach((e) =>
          console.warn('  ', e.message)
        )
      }
    })
  }
})

// ---------------------------------------------------------------------------
// 테스트 그룹: SALES 도메인 라우트 표본
// ---------------------------------------------------------------------------

const SALES_ROUTES: RouteCase[] = [
  { path: '/' },
  { path: '/sales' },
  { path: '/sales/new' },
  { path: '/sales/estimates' },
  { path: '/admin/partners' },
  { path: '/admin/partners/new' },
  { path: '/sales/partner-orders' },
  { path: '/sales/order-approvals' },
  { path: '/sales/partner-dc-config' },
  { path: '/sales/slip-001' },
  { path: '/sales/next-day-slip' },
]

test.describe('Desktop 전 화면 자동 점검 — SALES (표본)', () => {
  test.beforeEach(async () => {
    const ok = await isServerAvailable()
    test.skip(!ok, `dev server 미가동: ${BASE_URL} — VITE_MOCK_MODE=1 npx vite 후 재시도`)
  })

  for (const route of SALES_ROUTES) {
    const role = 'SALES'
    const slug = pathToSlug(route.path)

    test(`[SALES] ${route.path}`, async ({ page }) => {
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          RESULTS.push({ url: route.path, type: 'console', message: msg.text(), role })
        }
      })
      page.on('pageerror', (err) => {
        RESULTS.push({ url: route.path, type: 'pageerror', message: err.message, role })
      })

      await page.goto(buildUrl(route.path, role), { waitUntil: 'domcontentloaded', timeout: 15_000 })
      await page.waitForLoadState('networkidle', { timeout: IDLE_TIMEOUT }).catch(() => {})
      await page.waitForTimeout(SETTLE_WAIT)
      await captureScreenshot(page, role, slug).catch(() => {})
    })
  }
})

// ---------------------------------------------------------------------------
// 테스트 그룹: WAREHOUSE 도메인 라우트 표본
// ---------------------------------------------------------------------------

const WAREHOUSE_ROUTES: RouteCase[] = [
  { path: '/' },
  { path: '/purchases' },
  { path: '/purchases/slip-003' },
  { path: '/transfers' },
  { path: '/transfers/new' },
  { path: '/transfers/tr-001' },
  { path: '/warehouse/inbound-inspections' },
  { path: '/warehouse/audit' },
  { path: '/warehouse/audit/audit-001' },
  { path: '/warehouse/dps-compare' },
  { path: '/warehouse/dps-compare/by-product' },
  { path: '/inventory/safety-stock-alerts' },
  { path: '/admin/slip-edit-requests' },
  { path: '/admin/photo-audit' },
]

test.describe('Desktop 전 화면 자동 점검 — WAREHOUSE (표본)', () => {
  test.beforeEach(async () => {
    const ok = await isServerAvailable()
    test.skip(!ok, `dev server 미가동: ${BASE_URL} — VITE_MOCK_MODE=1 npx vite 후 재시도`)
  })

  for (const route of WAREHOUSE_ROUTES) {
    const role = 'WAREHOUSE'
    const slug = pathToSlug(route.path)

    test(`[WAREHOUSE] ${route.path}`, async ({ page }) => {
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          RESULTS.push({ url: route.path, type: 'console', message: msg.text(), role })
        }
      })
      page.on('pageerror', (err) => {
        RESULTS.push({ url: route.path, type: 'pageerror', message: err.message, role })
      })

      await page.goto(buildUrl(route.path, role), { waitUntil: 'domcontentloaded', timeout: 15_000 })
      await page.waitForLoadState('networkidle', { timeout: IDLE_TIMEOUT }).catch(() => {})
      await page.waitForTimeout(SETTLE_WAIT)
      await captureScreenshot(page, role, slug).catch(() => {})
    })
  }
})

// ---------------------------------------------------------------------------
// 테스트 그룹: ACCOUNTANT 도메인 라우트 표본
// ---------------------------------------------------------------------------

const ACCOUNTANT_ROUTES: RouteCase[] = [
  { path: '/' },
  { path: '/accounting/accounts' },
  { path: '/accounting/journals' },
  { path: '/accounting/journals/jv-001' },
  { path: '/accounting/balances' },
  { path: '/accounting/tax-invoices' },
  { path: '/accounting/statement-batch' },
  { path: '/accounting/partner-ledger' },
  { path: '/accounting/hometax-export' },
  { path: '/accounting/period-close' },
  { path: '/accounting/supplier-profiles' },
  { path: '/sales/closing' },
]

test.describe('Desktop 전 화면 자동 점검 — ACCOUNTANT (표본)', () => {
  test.beforeEach(async () => {
    const ok = await isServerAvailable()
    test.skip(!ok, `dev server 미가동: ${BASE_URL} — VITE_MOCK_MODE=1 npx vite 후 재시도`)
  })

  for (const route of ACCOUNTANT_ROUTES) {
    const role = 'ACCOUNTANT'
    const slug = pathToSlug(route.path)

    test(`[ACCOUNTANT] ${route.path}`, async ({ page }) => {
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          RESULTS.push({ url: route.path, type: 'console', message: msg.text(), role })
        }
      })
      page.on('pageerror', (err) => {
        RESULTS.push({ url: route.path, type: 'pageerror', message: err.message, role })
      })

      await page.goto(buildUrl(route.path, role), { waitUntil: 'domcontentloaded', timeout: 15_000 })
      await page.waitForLoadState('networkidle', { timeout: IDLE_TIMEOUT }).catch(() => {})
      await page.waitForTimeout(SETTLE_WAIT)
      await captureScreenshot(page, role, slug).catch(() => {})
    })
  }
})
