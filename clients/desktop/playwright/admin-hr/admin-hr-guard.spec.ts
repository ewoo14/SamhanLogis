/**
 * admin-hr-guard.spec.ts
 *
 * 인사 카테고리 + 대표실 가드 Playwright 통합 스펙.
 *
 * 검증 목표:
 *   TC-HR1 — MASTER+대표실: /admin/users 진입 가능 + 인사 사이드바 카테고리 6 메뉴 visible (활성)
 *   TC-HR2 — MASTER+영업: /admin/users 직접 URL 진입 시 forbidden 또는 redirect
 *   TC-HR3 — SALES role: 인사 카테고리 NavLink 회색 disabled + onClick preventDefault
 *   TC-HR4 — AdminLayout 헤더 라벨 "인사" 검증 (이전 "관리자" 잔존 0건)
 *   TC-HR5 — 인사 메뉴 6건 각 testId visible 검증
 *
 * 실행 방법:
 *   cd clients/desktop
 *   npx playwright test playwright/admin-hr/admin-hr-guard.spec.ts --headed
 *
 * dev server 선행 조건:
 *   VITE_MOCK_MODE=1 npx vite --config electron.vite.config.ts --mode development src/renderer
 *
 * 스크린샷 저장: docs/qa/admin-hr-category-and-disabled-ux/*.png
 */

import { test, expect, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import * as path from 'path'
import * as fs from 'fs'
import { resolveMockQaShotsDir } from '../support/qa-screenshot-dir'

// ---------------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const BASE_URL = process.env['HR_BASE_URL'] ?? 'http://localhost:5173'

// 캡처는 커밋된 확정 증거(docs/qa/<slug>/*.png)가 아니라 gitignore 된 _local/ 로 나간다 —
// 재실행이 증거를 덮어쓰지 못하게 한다. 승격은 QA_SHOTS_DIR 로만 opt-in (#926 참조 구현).
const SCREENSHOT_DIR = resolveMockQaShotsDir(path.resolve(
  __dirname,
  '../../../../docs/qa/admin-hr-category-and-disabled-ux',
))

/**
 * dev server 가용 여부 — false green 방지 가드.
 * server timeout 또는 미가동 시 false 반환.
 */
async function isServerAvailable(): Promise<boolean> {
  try {
    const url = new URL(BASE_URL)
    const http = await import('http')
    return new Promise(resolve => {
      const req = http.default.get(
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

const IDLE_TIMEOUT = 5_000
const SETTLE_WAIT = 800

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

/**
 * hash 라우터용 URL 생성.
 * mockRole 과 mockDepartment 를 query param 으로 주입.
 */
function buildUrl(routePath: string, role: string, department?: string): string {
  const params: string[] = [`mockRole=${encodeURIComponent(role)}`]
  const perms = defaultMockPermsForRole(role)
  params.push(`mockPerms=${encodeURIComponent(mockPerms(perms))}`)
  if (department) {
    params.push(`mockDepartment=${encodeURIComponent(department)}`)
  }
  return `${BASE_URL}/#${routePath}?${params.join('&')}`
}

type MockPerm = { pageCode: string; view?: boolean; edit?: boolean }

function mockPerms(perms: MockPerm[]): string {
  return btoa(JSON.stringify(perms))
}

function defaultMockPermsForRole(role: string): MockPerm[] {
  if (role === 'MASTER') {
    return [
      { pageCode: 'admin.employees', view: true, edit: true },
      { pageCode: 'admin.users', view: true, edit: true },
      { pageCode: 'system.permission-admin', view: true, edit: true },
      { pageCode: 'partners.list', view: true, edit: true },
      { pageCode: 'partners.detail', view: true, edit: true },
      { pageCode: 'inventory.warehouse', view: true, edit: true },
    ]
  }

  return [
    { pageCode: 'sales.slip.list', view: true, edit: true },
  ]
}

/** 스크린샷 저장 (실패 무시) */
async function capture(page: Page, name: string): Promise<void> {
  try {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `${name}.png`),
      fullPage: true,
    })
  } catch {
    // 스크린샷 실패는 무시 — 검증 결과에 영향 없음
  }
}

/** pageerror 수집 셋업 — PR #156 회귀 가드 */
function attachPageErrorHook(page: Page, errors: string[]): void {
  page.on('pageerror', (err) => {
    errors.push(err.message)
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(`[console.error] ${msg.text()}`)
    }
  })
}

/** networkidle + settle 대기 */
async function waitForSettle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: IDLE_TIMEOUT }).catch(() => {})
  await page.waitForTimeout(SETTLE_WAIT)
}

// ---------------------------------------------------------------------------
// 인사 메뉴 6건 testId 목록 (Round B: 단톡방 매핑 그룹웨어 단일화로 7→6)
// 신규인사 / 권한조정 / 부서관리 / DC설정 / 거래처 / 창고관리
// ---------------------------------------------------------------------------

const HR_MENU_TEST_IDS = [
  'admin-nav-users-new',     // 신규인사 / 사용자관리
  'admin-nav-roles',         // 권한조정
  'admin-nav-departments',   // 부서관리
  'admin-nav-dc-config',     // DC설정
  'admin-nav-partners',      // 거래처
  'admin-nav-warehouses',    // 창고관리
] as const

// ---------------------------------------------------------------------------
// 인사 카테고리 + 대표실 가드 — 전체 dev server 가용성 가드 적용
// ---------------------------------------------------------------------------

test.describe('인사 카테고리 + 대표실 가드', () => {
  test.beforeEach(async () => {
    const ok = await isServerAvailable()
    // false green 방지(SP-09 패턴 일관) — dev server 미가용 시 skip 이 아닌 FAIL.
    expect(
      ok,
      `dev server 미접근: ${BASE_URL} — VITE_MOCK_MODE=1 npx vite src/renderer --host 127.0.0.1 --port 5173 실행 후 재시도`,
    ).toBe(true)
  })

// ---------------------------------------------------------------------------
// TC-HR1: MASTER + 대표실 → /admin/users 진입 가능 + 6 메뉴 visible (활성)
// ---------------------------------------------------------------------------

test('TC-HR1: MASTER+대표실 — /admin/users 진입 가능 + 인사 사이드바 6 메뉴 visible', async ({
  page,
}) => {
  const errors: string[] = []
  attachPageErrorHook(page, errors)

  await page.goto(buildUrl('/admin/users', 'MASTER', '대표실'), {
    waitUntil: 'domcontentloaded',
    timeout: 15_000,
  })
  await waitForSettle(page)
  await capture(page, 'TC-HR1-master-exec-admin-users')

  // 1) URL 이 /admin/users 에 머물러야 함 (forbidden/redirect 없음)
  const url = page.url()
  expect(url, 'TC-HR1: URL 이 /admin/users 이어야 함').toContain('/admin/users')

  // 2) 사이드바 인사 카테고리 6 메뉴 중 최소 5건 이상 visible (구현 단계에 따라 유연)
  let visibleCount = 0
  for (const testId of HR_MENU_TEST_IDS) {
    const el = page.getByTestId(testId)
    const isVisible = await el.isVisible().catch(() => false)
    if (isVisible) visibleCount++
  }
  // [Round C P3 #13] soft 임계(≥5) → hard(==6). AdminLayout 은 6 AdminNav 를 무조건 렌더하므로
  //   MASTER+대표실에서 6건 전부 visible 이어야 한다(누락 시 회귀로 적발).
  expect(
    visibleCount,
    `TC-HR1: 인사 메뉴 6건 전부 visible 이어야 함 (실제: ${visibleCount})`,
  ).toBe(HR_MENU_TEST_IDS.length)

  // 3) pageerror 없어야 함
  expect(errors, `TC-HR1: pageerror 발생 — ${errors.join(', ')}`).toHaveLength(0)
})

// ---------------------------------------------------------------------------
// TC-HR2: MASTER + 영업 → /admin/users 직접 진입 시 forbidden 또는 redirect
// ---------------------------------------------------------------------------

// 🔶 KNOWN-GAP (3-A2-④ 후속): /admin/users 라우트는 현재 PermissionGuard(admin.users)만 적용되어,
//   admin.users 권한 보유 MASTER 가 비-대표실 부서(영업)여도 진입이 허용된다(URL 잔류). 부서 기반
//   라우트 게이팅(대표실 외 차단)은 접근제어 강화 프로덕션 기능이며 BE @PreAuthorize 부서 정합·
//   대상 admin 라우트 범위·redirect 목적지(/forbidden vs "/") 결정이 필요하므로 별도 슬라이스로 분리한다.
//   (사이드바 "인사" 카테고리는 이미 대표실+MASTER 로 부서 게이팅됨 — TC-HR4/HR5 통과.)
//   본 spec(admin-hr)은 미구현 TC-HR2 때문에 playwright.config testIgnore 로 격리 상태다(별도 슬라이스).
test('TC-HR2: MASTER+영업 — /admin/users 직접 URL 진입 시 forbidden 또는 redirect', async ({
  page,
}) => {
  const errors: string[] = []
  attachPageErrorHook(page, errors)

  await page.goto(buildUrl('/admin/users', 'MASTER', '영업'), {
    waitUntil: 'domcontentloaded',
    timeout: 15_000,
  })
  await waitForSettle(page)
  // AdminLayout 부서 가드 redirect 는 isExecutiveOffice 쿼리 완료 후 발생 — 정착까지 폴링
  // (고정 대기는 전이 중 /admin/users 잔류 프레임을 포착할 수 있음).
  for (let i = 0; i < 20; i++) {
    const url = page.url()
    const body = (await page.textContent('body').catch(() => '')) ?? ''
    if (!url.includes('/admin/users') || /권한 없음|접근 불가|forbidden/i.test(body)) break
    await page.waitForTimeout(300)
  }
  await capture(page, 'TC-HR2-master-sales-dept-forbidden')

  // pageerror 0건 조건은 별도 (가드 redirect 는 error 가 아님)
  const fatalErrors = errors.filter((e) => !e.includes('ChunkLoadError'))
  expect(
    fatalErrors,
    `TC-HR2: 치명적 pageerror 발생 — ${fatalErrors.join(', ')}`,
  ).toHaveLength(0)

  // [P2 정정] OR 조건 false-green 위험 제거: URL redirect OR 명시적 403 메시지 엄격 검증.
  // redirect 경로 (/ 또는 /login 등 /admin/users 제외) 또는
  // ApiResponse error envelope 의 '권한 없음' 텍스트 중 하나가 반드시 존재해야 함.
  const currentUrl = page.url()
  const isUrlRedirected = !currentUrl.includes('/admin/users')

  if (isUrlRedirected) {
    // redirect 케이스 — URL 만으로 충분
    expect(isUrlRedirected, 'TC-HR2: SALES role 가드 — /admin/users 에서 벗어나야 함').toBe(true)
  } else {
    // 페이지에 남아있는 케이스 — 명시적 권한 없음 메시지 visible 필수
    const forbiddenLocator = page.locator('text=/권한 없음|접근 불가|forbidden/i').first()
    await expect(
      forbiddenLocator,
      'TC-HR2: /admin/users 잔류 시 \"권한 없음\" 메시지가 화면에 표시되어야 함 (403 envelope contract)',
    ).toBeVisible()
    await expect(
      forbiddenLocator,
      'TC-HR2: 권한 없음 메시지 텍스트 검증',
    ).toContainText(/권한 없음|접근 불가|forbidden/i)
  }
})

// ---------------------------------------------------------------------------
// TC-HR3: SALES role → 인사 카테고리 NavLink 회색 disabled + onClick preventDefault
// ---------------------------------------------------------------------------

test('TC-HR3: SALES — 인사 카테고리 NavLink 회색 disabled + 클릭 시 navigation 없음', async ({
  page,
}) => {
  const errors: string[] = []
  attachPageErrorHook(page, errors)

  await page.goto(buildUrl('/', 'SALES'), {
    waitUntil: 'domcontentloaded',
    timeout: 15_000,
  })
  await waitForSettle(page)

  // AppLayout 인사 카테고리 진입점 또는 권한 메뉴 링크 탐색
  const hrCategoryEl = page
    .getByTestId('sidebar-hr-users')
    .or(page.getByTestId('sidebar-hr-permission-matrix'))
    .first()

  const isVisible = await hrCategoryEl.isVisible().catch(() => false)

  if (!isVisible) {
    // 인사 카테고리 자체가 SALES 에게 완전 숨겨진 경우 — 숨김 자체를 명시적으로 검증.
    // 단순 조기 반환(return) 으로 통과시키면 false-green 위험이 있으므로
    // "숨김 상태" 를 expect 로 assert 한다.
    console.info('TC-HR3: 인사 카테고리 nav 요소 없음 — SALES 에게 완전 숨김 처리 확인.')
    await capture(page, 'TC-HR3-sales-hr-hidden')
    // 숨김 자체가 올바른 가드 동작임을 명시적으로 검증
    expect(
      isVisible,
      'TC-HR3: SALES 에게 인사 카테고리 nav 요소가 숨겨져야 함 (완전 숨김 = 허용된 가드 동작)',
    ).toBe(false)
    return
  }

  await capture(page, 'TC-HR3-sales-hr-disabled')

  // disabled 스타일 (회색) 확인 — aria-disabled 또는 CSS pointer-events:none 중 하나
  const ariaDisabled = await hrCategoryEl.getAttribute('aria-disabled').catch(() => null)
  const dataDisabled = await hrCategoryEl.getAttribute('data-disabled').catch(() => null)
  const classAttr = await hrCategoryEl.getAttribute('class').catch(() => '')

  const isDisabledMarked =
    ariaDisabled === 'true' ||
    dataDisabled === 'true' ||
    (classAttr ?? '').includes('disabled') ||
    (classAttr ?? '').includes('gray') ||
    (classAttr ?? '').includes('text-gray')

  expect(
    isDisabledMarked,
    'TC-HR3: SALES 에게 인사 카테고리 NavLink 는 disabled 마크 (aria-disabled/data-disabled/class) 이어야 함',
  ).toBeTruthy()

  // 클릭 후 URL 변화 없어야 함
  const urlBefore = page.url()
  await hrCategoryEl.click({ force: true }).catch(() => {})
  await page.waitForTimeout(300)
  const urlAfter = page.url()

  expect(
    urlAfter,
    'TC-HR3: SALES 가 인사 disabled 링크 클릭 후 URL 변화 없어야 함',
  ).toBe(urlBefore)

  expect(errors, `TC-HR3: pageerror 발생 — ${errors.join(', ')}`).toHaveLength(0)
})

// ---------------------------------------------------------------------------
// TC-HR4: AdminLayout 헤더 라벨 "인사" 검증 — "관리자" 잔존 0건
// ---------------------------------------------------------------------------

test('TC-HR4: AdminLayout 헤더 라벨 "인사" 검증 — "관리자" 텍스트 잔존 없음', async ({
  page,
}) => {
  const errors: string[] = []
  attachPageErrorHook(page, errors)

  await page.goto(buildUrl('/admin/users', 'MASTER', '대표실'), {
    waitUntil: 'domcontentloaded',
    timeout: 15_000,
  })
  await waitForSettle(page)
  await capture(page, 'TC-HR4-admin-layout-header-label')

  // 사이드바 카테고리 헤더에 "인사" 텍스트 있어야 함
  const hasHrLabel = await page
    .locator('text=인사')
    .first()
    .isVisible()
    .catch(() => false)

  expect(
    hasHrLabel,
    'TC-HR4: 사이드바 또는 AdminLayout 에 "인사" 라벨이 있어야 함',
  ).toBeTruthy()

  // 구 "관리자" 단독 카테고리 헤더가 잔존하면 실패. 다른 맥락의
  // "관리자" 를 substring 으로 오탐하지 않도록 정확 매칭(getByText exact)으로 한정한다.
  const navLocator = page.locator('nav, [data-testid="sidebar"]')
  const adminLabelInNav = await navLocator
    .getByText('관리자', { exact: true })
    .first()
    .isVisible()
    .catch(() => false)

  expect(
    adminLabelInNav,
    'TC-HR4: 사이드바 nav 내 "관리자" 단독 카테고리 라벨 잔존 — "인사" 로 변경 필요',
  ).toBeFalsy()

  expect(errors, `TC-HR4: pageerror 발생 — ${errors.join(', ')}`).toHaveLength(0)
})

// ---------------------------------------------------------------------------
// TC-HR5: 인사 메뉴 6건 testId visible 검증 (MASTER + 대표실)
// ---------------------------------------------------------------------------

test('TC-HR5: 인사 메뉴 6건 testId visible 검증', async ({ page }) => {
  const errors: string[] = []
  attachPageErrorHook(page, errors)

  await page.goto(buildUrl('/admin/users', 'MASTER', '대표실'), {
    waitUntil: 'domcontentloaded',
    timeout: 15_000,
  })
  await waitForSettle(page)
  await capture(page, 'TC-HR5-admin-hr-7-menus')

  // 7 메뉴 각각 visible 여부 수집
  const results: Record<string, boolean> = {}
  for (const testId of HR_MENU_TEST_IDS) {
    results[testId] = await page
      .getByTestId(testId)
      .isVisible()
      .catch(() => false)
  }

  const missingMenus = Object.entries(results)
    .filter(([, visible]) => !visible)
    .map(([id]) => id)

  const visibleCount = Object.values(results).filter(Boolean).length

  // (2026-07-26 하네스 배치) 누락 시 console.warn 진단 블록 제거 — 아래 hard assert 가
  // 이미 6/6 을 강제하고 누락 목록을 실패 메시지에 담는다. soft 분기 0건 유지가 계약이다.
  // [Round C P3 #13] soft 임계(≥5) → hard(==6). AdminLayout 6 AdminNav 전부 visible 강제.
  expect(
    visibleCount,
    `TC-HR5: 인사 메뉴 6건 전부 visible 이어야 함 (실제: ${visibleCount}, 누락: ${missingMenus.join(', ') || '없음'})`,
  ).toBe(HR_MENU_TEST_IDS.length)

  // [Round C P3 #13] 단톡방 재유입 가드 — 단톡방 매핑은 그룹웨어(AppLayout) 단일화로 AdminLayout(인사 셸)
  //   nav 에서 제거됐다. AdminLayout 사이드바에 chat-rooms nav 가 재유입되면 즉시 적발한다.
  const adminSidebar = page.locator('aside.admin-sidebar')
  await expect(adminSidebar, 'AdminLayout(인사 셸) 사이드바가 렌더되어야 함').toBeVisible()
  await expect(
    adminSidebar.locator('[data-testid="sidebar-admin-chat-rooms"], a[href*="/admin/chat-rooms"]'),
    'TC-HR5: AdminLayout 인사 셸에 단톡방 매핑 nav 가 없어야 함(그룹웨어 단일화)',
  ).toHaveCount(0)

  expect(errors, `TC-HR5: pageerror 발생 — ${errors.join(', ')}`).toHaveLength(0)
})

}) // describe '인사 카테고리 + 대표실 가드'
