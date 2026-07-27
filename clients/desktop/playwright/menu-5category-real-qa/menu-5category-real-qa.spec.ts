import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * 좌측 메뉴 5대분류 재편 (PR #462) Docker 실서버 QA Playwright spec.
 *
 * 대상: AppLayout.tsx IA 재편 — 홈 + 알림 내역 + 7그룹(판매/구매/회계/그룹웨어/인사/배차/창고 운영)
 *       동적 RBAC(usePermissions → /auth/admin/permissions/my) 기반 그룹/항목 hidden 필터 실 캡처.
 *       [Round B P2] 배차 그룹 헤더 라벨 'arologis'(코드명) → '배차'(업무 라벨) 변경 반영.
 *
 * 실서버:
 *   - api-gateway: http://localhost:8080 (실 권한 API)
 *   - FE renderer dev: http://localhost:5175 (mock OFF — VITE_API_BASE_URL=http://localhost:8080)
 *
 * 인증(실 dev 계정, 비밀번호 dev_p05_pass!):
 *   - dev_master     = MASTER     (7그룹 전부)
 *   - dev_sales      = SALES
 *   - dev_accountant = ACCOUNTANT
 *   - dev_warehouse  = WAREHOUSE
 *   - dev_dispatch   = DISPATCH
 *   - dev_manager    = MANAGER
 *   - dev_inventory  = INVENTORY
 *
 * 실행:
 *   cd C:\dev\Samhan-Public\clients\desktop
 *   node_modules\.bin\playwright test --config=playwright.real-qa.config.ts playwright/menu-5category-real-qa --reporter=line --timeout=90000
 *
 * 산출: docs/qa/menu-5category/roundA-<role>-menu.png (실 FE 풀렌더 사이드바)
 *
 * no-fake-data: 토큰/권한 매트릭스 모두 실 게이트웨이에서 취득. mock 없음.
 *   로그인 실패 시 해당 역할 test 는 정직하게 fail (가짜 통과 금지).
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url))

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5175'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'

const SCREENSHOTS_DIR = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/menu-5category'))
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })

/** 7대 그룹 카테고리 헤더 라벨(AppLayout SidebarCategory label 과 1:1). */
const GROUP_LABELS = ['판매', '구매', '회계', '그룹웨어', '인사', '배차', '창고 운영'] as const

/**
 * 실 게이트웨이 권한 매트릭스(/auth/admin/permissions/my) 로부터 역할별 기대 그룹 가시성을
 * 사전 계산 — 캡처 단언이 시드 데이터와 항상 정합하도록(하드코딩 기대값 drift 방지).
 *
 * 각 그룹은 AppLayout 의 그룹 헤더 노출 조건(그룹 내 PageCode 중 1개라도 view) 과 동일한
 * PageCode 집합으로 판정한다.
 */
const GROUP_GATE_CODES: Record<(typeof GROUP_LABELS)[number], string[]> = {
  판매: [
    'sales.slip.list',
    'estimates.list',
    'sales.partner-order.list',
    'sales.partner-dc-config',
    'partners.list',
    'partners.block',
    'slip.cleanup',
    'slip.print.next-day',
    'products.list',
    'products.sync',
  ],
  구매: [
    'purchases.slip.list',
    'inventory.stock-transfer',
    'inbound.inspection',
    'inventory.audit',
    'inventory.dps',
  ],
  회계: [
    'accounting.accounts',
    'accounting.journals',
    'accounting.balances',
    'accounting.reports',
    'accounting.period-close',
    'accounting.statement-batch',
    'accounting.sales-slip.list',
    'accounting.purchase-slip.list',
    'accounting.partner-ledger',
    'accounting.tax-invoice.list',
    // [Round C P3 #1] AppLayout showAccounting OR 식과 1:1 — batch-issue/inbound 단독 권한자도 회계 그룹.
    'accounting.tax-invoice.batch-issue',
    'accounting.tax-invoice.inbound',
    'accounting.daily-closing',
    'accounting.general-ledger',
    'ecount.mig14.order-list',
    'ecount.mig14.ledger',
    'ecount.mig.ops-dashboard',
    'accounting.edit-requests.decide',
  ],
  그룹웨어: ['slip.delivery-batch', 'aligo.address-book', 'messenger.admin'],
  // [Round C P3 #11] AppLayout showAdminHrGroup OR 식과 1:1 — admin.users 는 그룹 게이트에서 제외됨
  //   (admin.users 단독 권한자 빈 '인사' 헤더 방지, Round B #3). 게이트 코드도 제거해 정합.
  인사: ['admin.employees', 'system.permission-admin'],
  배차: [
    'dispatch.board',
    'arologis.dispatch.admin',
    'arologis.dispatch.ops',
    'dispatch.batch',
    'notification.dispatch-sms.send-audit',
    'arologis.admin',
    // [Round C P3 #5] AppLayout showArologisGroup 은 showRegionMgmt(arologis.region) 도 OR 구성원.
    'arologis.region',
  ],
  '창고 운영': [
    'inventory.warehouse',
    'inventory.stock-balance',
    'inventory.safety-stock',
    'inventory.list',
    'slip.edit-requests.decide',
    'slip.photo-audit',
  ],
}

interface RoleCase {
  loginId: string
  role: string
}

const ROLE_CASES: RoleCase[] = [
  { loginId: 'dev_master', role: 'MASTER' },
  { loginId: 'dev_sales', role: 'SALES' },
  { loginId: 'dev_accountant', role: 'ACCOUNTANT' },
  { loginId: 'dev_warehouse', role: 'WAREHOUSE' },
  { loginId: 'dev_dispatch', role: 'DISPATCH' },
  { loginId: 'dev_manager', role: 'MANAGER' },
  { loginId: 'dev_inventory', role: 'INVENTORY' },
]

interface LoginResult {
  token: string
  role: string
  userId: string
  displayName: string
}

/** 실 게이트웨이 로그인 → 토큰/역할 취득(가짜 없음). */
async function realLogin(page: Page, loginId: string): Promise<LoginResult> {
  const res = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId, password: PASSWORD },
  })
  expect(res.ok(), `로그인 실패(${loginId}): HTTP ${res.status()} — Docker 스택 미기동?`).toBeTruthy()
  const body = await res.json()
  return {
    token: body.data?.token ?? '',
    role: body.data?.role ?? '',
    userId: body.data?.userId ?? '',
    displayName: body.data?.displayName ?? loginId,
  }
}

/** client.ts axios interceptor 가 읽는 window.samhanAuth stub 주입(토큰 헤더 주입용). */
async function installAuthStub(page: Page, login: LoginResult): Promise<void> {
  await page.addInitScript(
    ({ tok, r, uid, name }: { tok: string; r: string; uid: string; name: string }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({
            token: tok,
            userId: uid,
            role: r,
            fullName: name,
            partnerCode: null,
          }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    { tok: login.token, r: login.role, uid: login.userId, name: login.displayName },
  )
}

/** 실 게이트웨이에서 역할별 권한 매트릭스 취득 → 그룹별 view 가시성 사전계산. */
async function fetchExpectedGroupVisibility(
  page: Page,
  token: string,
): Promise<Record<string, boolean>> {
  const res = await page.request.get(`${API_BASE}/auth/admin/permissions/my`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.ok(), `권한 매트릭스 조회 실패: HTTP ${res.status()}`).toBeTruthy()
  const body = await res.json()
  const matrix: Record<string, string[] | Record<string, unknown>> = body.data ?? {}

  const hasView = (code: string): boolean => {
    const raw = matrix[code]
    if (!raw) return false
    const arr = Array.isArray(raw) ? raw : Object.keys(raw)
    return arr.some((a) => String(a).toUpperCase().includes('VIEW') || String(a).toUpperCase().includes('READ'))
  }

  const out: Record<string, boolean> = {}
  for (const label of GROUP_LABELS) {
    out[label] = GROUP_GATE_CODES[label].some(hasView)
  }
  return out
}

async function openSidebarCategory(page: Page, label: string): Promise<void> {
  const toggle = page.getByTestId(`sidebar-category-toggle-${label.replace(/\s+/g, '')}`)
  await expect(toggle, `${label} 그룹 토글 버튼`).toBeVisible({ timeout: 10_000 })
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click()
  }
  await expect(toggle, `${label} 그룹 펼침 상태`).toHaveAttribute('aria-expanded', 'true')
}

// ---------------------------------------------------------------------------
// 역할별 좌측 메뉴 캡처 + 7그룹/홈/알림내역/권한필터 단언
// ---------------------------------------------------------------------------

for (const rc of ROLE_CASES) {
  test(`${rc.role} (${rc.loginId}) — 좌측 메뉴 5대분류 캡처 + 권한필터`, async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(e.message))

    const login = await realLogin(page, rc.loginId)
    expect(login.role, `${rc.loginId} 역할이 기대(${rc.role})와 다름`).toBe(rc.role)
    await installAuthStub(page, login)

    // 실 권한 매트릭스로 기대 그룹 가시성 사전계산
    const expectedGroups = await fetchExpectedGroupVisibility(page, login.token)

    // 대시보드(홈) 진입
    await page.goto(`${BASE_URL}/#/`)
    // 사이드바 셸 + 홈 NavLink 로드 대기
    await page.waitForSelector('aside.app-sidebar', { timeout: 30000 })
    await page.waitForSelector('aside.app-sidebar a:has-text("홈")', { timeout: 15000 })
    // 동적 RBAC 캐시 로드(권한 fetch 후 그룹 렌더) 안정화 대기 — 그룹 헤더 출현 또는 timeout.
    await page
      .waitForSelector('aside.app-sidebar .app-sidebar-group', { timeout: 15000 })
      .catch(() => undefined)
    await page.waitForTimeout(1500)

    const sidebar = page.locator('aside.app-sidebar')

    // (1) 홈 최상단
    // [Round C P3 #9] hasText('홈') 은 '홈택스 일괄 양식' 을 오매칭 → 정확 이름(exact) 로케이터로 한정.
    const homeLink = sidebar.getByRole('link', { name: '홈', exact: true }).first()
    await expect(homeLink, '홈 메뉴가 사이드바에 보여야 함').toBeVisible()

    // (2) 알림 내역 상단
    const notifLink = sidebar.locator('[data-testid="sidebar-notifications"]')
    await expect(notifLink, '알림 내역 메뉴가 사이드바에 보여야 함').toBeVisible()

    // (3) 7그룹 헤더 노출/미노출 — 실 권한 매트릭스 기대값과 대조(권한필터)
    const groupHeaders = sidebar.locator('.app-sidebar-group')
    const renderedGroupTexts = (await groupHeaders.allTextContents()).map((t) => t.trim())

    const actualGroups: Record<string, boolean> = {}
    for (const label of GROUP_LABELS) {
      actualGroups[label] = renderedGroupTexts.includes(label)
    }

    // 캡처(실 풀렌더) — 단언 전 항상 남겨 실패시에도 증거 확보
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, `roundA-${rc.role}-menu.png`),
      fullPage: true,
    })

    console.log(`[${rc.role}] 렌더된 그룹 헤더: ${JSON.stringify(renderedGroupTexts)}`)
    console.log(`[${rc.role}] 기대(권한 매트릭스): ${JSON.stringify(expectedGroups)}`)
    console.log(`[${rc.role}] 실제(DOM): ${JSON.stringify(actualGroups)}`)

    // 그룹별 실제 DOM == 권한 매트릭스 기대값 (권한필터 정합)
    for (const label of GROUP_LABELS) {
      expect(
        actualGroups[label],
        `[${rc.role}] '${label}' 그룹 노출이 권한 매트릭스 기대(${expectedGroups[label]})와 불일치`,
      ).toBe(expectedGroups[label])
    }

    // MASTER 는 7그룹 전부
    if (rc.role === 'MASTER') {
      for (const label of GROUP_LABELS) {
        expect(actualGroups[label], `MASTER 는 '${label}' 그룹이 보여야 함`).toBe(true)
      }
    }

    // pageerror 0건 (PR #156 회귀 가드)
    expect(pageErrors, `pageerror 발생: ${pageErrors.join('; ')}`).toHaveLength(0)
  })
}

// ---------------------------------------------------------------------------
// 링크 동작 샘플 — MASTER 가 그룹 내 메뉴 클릭 → 라우트 정상 진입(redirect 없음)
// ---------------------------------------------------------------------------

test('MASTER 링크 동작 샘플 — 판매관리/계정과목 클릭 → 정상 라우트(redirect 없음)', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)

  await page.goto(`${BASE_URL}/#/`)
  await page.waitForSelector('aside.app-sidebar', { timeout: 30000 })
  await page.waitForTimeout(1500)

  const sidebar = page.locator('aside.app-sidebar')

  // 샘플 1: 판매 그룹 — 판매관리(/sales)
  await openSidebarCategory(page, '판매')
  const salesLink = sidebar.locator('[data-testid="sidebar-sales"]')
  await expect(salesLink, '판매관리 링크가 보여야 함').toBeVisible({ timeout: 10000 })
  await salesLink.click()
  await page.waitForTimeout(1500)
  const salesUrl = page.url()
  console.log(`[링크샘플] 판매관리 클릭 후 URL: ${salesUrl}`)
  expect(salesUrl, '판매관리 클릭 시 login/forbidden 으로 redirect 되면 안 됨').not.toMatch(
    /login|forbidden/,
  )
  expect(salesUrl, '판매관리 라우트(/sales)로 진입해야 함').toContain('/sales')
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'roundA-link-sample-sales.png'),
    fullPage: false,
  })

  // 샘플 2: 회계 그룹 — 계정과목(/accounting/accounts)
  await page.goto(`${BASE_URL}/#/`)
  await page.waitForSelector('aside.app-sidebar', { timeout: 30000 })
  await page.waitForTimeout(1200)
  await openSidebarCategory(page, '회계')
  const acctLink = sidebar.locator('[data-testid="sidebar-accounting-accounts"]')
  await expect(acctLink, '계정과목 링크가 보여야 함').toBeVisible({ timeout: 10000 })
  await acctLink.click()
  await page.waitForTimeout(1500)
  const acctUrl = page.url()
  console.log(`[링크샘플] 계정과목 클릭 후 URL: ${acctUrl}`)
  expect(acctUrl, '계정과목 클릭 시 login/forbidden 으로 redirect 되면 안 됨').not.toMatch(
    /login|forbidden/,
  )
  expect(acctUrl, '계정과목 라우트(/accounting/accounts)로 진입해야 함').toContain('/accounting/accounts')
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'roundA-link-sample-accounting.png'),
    fullPage: false,
  })

  expect(pageErrors, `pageerror 발생: ${pageErrors.join('; ')}`).toHaveLength(0)
})
