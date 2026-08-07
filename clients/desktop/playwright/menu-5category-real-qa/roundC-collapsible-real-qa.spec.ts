import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * Round C 접기/펼치기(collapsible) 좌측메뉴 (PR #462) Docker 실서버 QA Playwright spec.
 *
 * 검증 대상(Round C 변경 — AppLayout SidebarCategory 토글화, c0ae43ee):
 *  1) 기본 접힘: 7그룹 헤더(토글 버튼)만 노출, 자식 링크는 숨김(role=group 미렌더).
 *     → '과도 메뉴 최소화' 실증. (roundC-collapsed.png)
 *  2) 펼침 토글: 한 그룹('판매') 헤더 클릭 → aria-expanded=true → 자식 노출. (roundC-expanded.png)
 *  3) 활성 라우트 자동 펼침: /sales 진입 시 '판매' 그룹 자동 펼침(useEffect activeByRoute).
 *  4) localStorage 영속: 토글 후 새로고침해도 펼침 상태 유지(samhan.sidebar.group.<label>).
 *  5) pageerror 0.
 *
 * 실서버(mock OFF):
 *  - api-gateway: http://localhost:8080 (실 권한 API)
 *  - FE renderer dev: http://localhost:5178 (VITE_API_BASE_URL=http://localhost:8080, AUDIT_BASE_URL override)
 *
 * 인증(실 dev 계정, QA_DEV_DEFAULT_PASSWORD 환경변수): dev_master(MASTER).
 *
 * 산출: docs/qa/menu-5category/roundC-collapsed.png, roundC-expanded.png
 *
 * no-fake-data: 토큰/권한 모두 실 게이트웨이 취득. mock 없음. 실패 시 정직 fail.
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url))

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5178'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')

const SCREENSHOTS_DIR = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/menu-5category'))
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })

const GROUP_LABELS = ['판매', '구매', '회계', '그룹웨어', '인사', '배차', '창고 운영'] as const

interface LoginResult {
  token: string
  role: string
  userId: string
  displayName: string
}

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

async function loadSidebar(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/#/`)
  await page.waitForSelector('aside.app-sidebar', { timeout: 30000 })
  await page.waitForSelector('aside.app-sidebar a:has-text("홈")', { timeout: 15000 })
  await page
    .waitForSelector('aside.app-sidebar [data-testid="sidebar-category-toggle-판매"]', {
      timeout: 15000,
    })
    .catch(() => undefined)
  await page.waitForTimeout(1500)
}

function toggleLocator(page: Page, label: string) {
  return page.getByTestId(`sidebar-category-toggle-${label.replace(/\s+/g, '')}`)
}

test('Round C — MASTER 좌측메뉴 기본 접힘(7그룹 헤더만, 자식 숨김)', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  const login = await realLogin(page, 'dev_master')
  expect(login.role, 'dev_master 역할이 MASTER 가 아님').toBe('MASTER')
  await installAuthStub(page, login)
  // localStorage 초기화(영속 잔존 제거) — 기본 접힘 상태를 확정적으로 검증.
  await page.addInitScript(() => {
    try {
      Object.keys(window.localStorage)
        .filter((k) => k.startsWith('samhan.sidebar.group.'))
        .forEach((k) => window.localStorage.removeItem(k))
    } catch {
      /* ignore */
    }
  })
  await loadSidebar(page)

  const sidebar = page.locator('aside.app-sidebar')

  // 캡처 먼저(단언 전 증거 확보)
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'roundC-collapsed.png'),
    fullPage: true,
  })

  // (a) 7그룹 헤더(토글 버튼) 모두 노출 + aria-expanded=false(기본 접힘)
  for (const label of GROUP_LABELS) {
    const toggle = toggleLocator(page, label)
    await expect(toggle, `'${label}' 그룹 헤더 토글 노출`).toBeVisible()
    await expect(toggle, `'${label}' 그룹 기본 접힘(aria-expanded=false)`).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  }

  // (b) 자식 콘텐츠(role=group) 미렌더 — 접힘이므로 자식 숨김
  const expandedGroups = sidebar.locator('[role="group"][aria-labelledby^="sidebar-group-heading-"]')
  await expect(
    expandedGroups,
    '기본 접힘이면 펼쳐진 그룹 콘텐츠(role=group)가 0개여야 함',
  ).toHaveCount(0)

  // 대표 자식 링크('판매관리')도 숨김
  await expect(
    sidebar.locator('[data-testid="sidebar-sales"]'),
    '접힘 상태에서 판매관리 링크는 숨겨져야 함',
  ).toHaveCount(0)

  // (c) 홈 + 알림 내역은 토글 무관 항시 노출
  await expect(sidebar.getByRole('link', { name: '홈', exact: true }).first(), '홈 메뉴').toBeVisible()
  await expect(
    sidebar.locator('[data-testid="sidebar-notifications"]'),
    '알림 내역 메뉴',
  ).toBeVisible()

  expect(pageErrors, `pageerror 발생: ${pageErrors.join('; ')}`).toHaveLength(0)
})

test('Round C — MASTER 펼침 토글: 판매 그룹 클릭 → 자식 노출', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)
  await page.addInitScript(() => {
    try {
      Object.keys(window.localStorage)
        .filter((k) => k.startsWith('samhan.sidebar.group.'))
        .forEach((k) => window.localStorage.removeItem(k))
    } catch {
      /* ignore */
    }
  })
  await loadSidebar(page)

  const sidebar = page.locator('aside.app-sidebar')
  const salesToggle = toggleLocator(page, '판매')

  // 클릭 전: 접힘
  await expect(salesToggle).toHaveAttribute('aria-expanded', 'false')
  await expect(sidebar.locator('[data-testid="sidebar-sales"]')).toHaveCount(0)

  // 토글 클릭 → 펼침
  await salesToggle.click()
  await expect(salesToggle, '판매 그룹 펼침(aria-expanded=true)').toHaveAttribute(
    'aria-expanded',
    'true',
  )
  // 자식 링크 노출
  await expect(
    sidebar.locator('[data-testid="sidebar-sales"]'),
    '펼침 후 판매관리 링크 노출',
  ).toBeVisible()

  // 펼쳐진 콘텐츠가 판매 헤더에 aria-labelledby 로 연결됨(접근성)
  const salesHeadingId = await salesToggle.getAttribute('id')
  expect(salesHeadingId, '판매 헤더 id').toBeTruthy()
  await expect(
    sidebar.locator(`[role="group"][aria-labelledby="${salesHeadingId}"]`),
    '판매 그룹 콘텐츠(role=group) 노출',
  ).toHaveCount(1)

  // 다른 그룹은 여전히 접힘(독립 토글)
  await expect(
    toggleLocator(page, '회계'),
    '회계 그룹은 독립적으로 접힘 유지',
  ).toHaveAttribute('aria-expanded', 'false')

  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'roundC-expanded.png'),
    fullPage: true,
  })

  expect(pageErrors, `pageerror 발생: ${pageErrors.join('; ')}`).toHaveLength(0)
})

test('Round C — 활성 라우트 자동 펼침: /sales 진입 시 판매 그룹 자동 펼침', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)
  await page.addInitScript(() => {
    try {
      Object.keys(window.localStorage)
        .filter((k) => k.startsWith('samhan.sidebar.group.'))
        .forEach((k) => window.localStorage.removeItem(k))
    } catch {
      /* ignore */
    }
  })

  // 직접 /sales 진입(localStorage 비어있으므로 자동펼침만이 펼침 사유)
  await page.goto(`${BASE_URL}/#/sales`)
  await page.waitForSelector('aside.app-sidebar', { timeout: 30000 })
  await page.waitForSelector('aside.app-sidebar [data-testid="sidebar-category-toggle-판매"]', {
    timeout: 15000,
  })
  await page.waitForTimeout(1500)

  const sidebar = page.locator('aside.app-sidebar')
  const salesToggle = toggleLocator(page, '판매')

  // 판매 그룹 자동 펼침
  await expect(salesToggle, '/sales 진입 시 판매 그룹 자동 펼침').toHaveAttribute(
    'aria-expanded',
    'true',
  )
  await expect(
    sidebar.locator('[data-testid="sidebar-sales"]'),
    '/sales 진입 시 판매관리 링크 노출',
  ).toBeVisible()

  // 비활성 그룹(회계)은 접힘 유지
  await expect(
    toggleLocator(page, '회계'),
    '/sales 진입 시 비활성 회계 그룹은 접힘',
  ).toHaveAttribute('aria-expanded', 'false')

  expect(pageErrors, `pageerror 발생: ${pageErrors.join('; ')}`).toHaveLength(0)
})

test('Round C — cross-group 회귀가드: /sales/closing 진입 시 회계만 펼침, 판매는 접힘', async ({ page }) => {
  // [2026-06-11 P2 #1/#5] 판매 activeTargets 의 bare '/sales' 가 prefix 매칭으로
  //   '/sales/closing'(회계 자식)·'/sales/link-dispatch'(그룹웨어 자식) 진입 시 판매 그룹까지
  //   동시 자동펼침되던 cross-group 오탐을 박제한다. 활성 그룹만 펼쳐야 한다(spec).
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)
  await page.addInitScript(() => {
    try {
      Object.keys(window.localStorage)
        .filter((k) => k.startsWith('samhan.sidebar.group.'))
        .forEach((k) => window.localStorage.removeItem(k))
    } catch {
      /* ignore */
    }
  })

  // 직접 /sales/closing(매출 마감 — 회계 그룹 자식) 진입.
  await page.goto(`${BASE_URL}/#/sales/closing`)
  await page.waitForSelector('aside.app-sidebar', { timeout: 30000 })
  await page.waitForSelector('aside.app-sidebar [data-testid="sidebar-category-toggle-회계"]', {
    timeout: 15000,
  })
  await page.waitForTimeout(1500)

  // 회계 그룹은 자동 펼침
  await expect(
    toggleLocator(page, '회계'),
    '/sales/closing 진입 시 회계 그룹 자동 펼침',
  ).toHaveAttribute('aria-expanded', 'true')

  // 판매 그룹은 접힘 유지(bare /sales prefix 오매칭 회귀 차단)
  await expect(
    toggleLocator(page, '판매'),
    '/sales/closing 진입 시 판매 그룹은 접힘 유지(cross-group 오탐 차단)',
  ).toHaveAttribute('aria-expanded', 'false')

  expect(pageErrors, `pageerror 발생: ${pageErrors.join('; ')}`).toHaveLength(0)
})

test('Round C — cross-group 회귀가드: /sales/link-dispatch 진입 시 그룹웨어만 펼침, 판매는 접힘', async ({ page }) => {
  // [2026-06-11 P2 #1/#5] '/sales/link-dispatch'(그룹웨어 자식) 진입 시 판매 그룹이 bare '/sales'
  //   prefix 오매칭으로 동시 펼쳐지지 않아야 한다.
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)
  await page.addInitScript(() => {
    try {
      Object.keys(window.localStorage)
        .filter((k) => k.startsWith('samhan.sidebar.group.'))
        .forEach((k) => window.localStorage.removeItem(k))
    } catch {
      /* ignore */
    }
  })

  // 직접 /sales/link-dispatch(링크발송 — 그룹웨어 그룹 자식) 진입.
  await page.goto(`${BASE_URL}/#/sales/link-dispatch`)
  await page.waitForSelector('aside.app-sidebar', { timeout: 30000 })
  await page.waitForSelector('aside.app-sidebar [data-testid="sidebar-category-toggle-그룹웨어"]', {
    timeout: 15000,
  })
  await page.waitForTimeout(1500)

  // 그룹웨어 그룹은 자동 펼침
  await expect(
    toggleLocator(page, '그룹웨어'),
    '/sales/link-dispatch 진입 시 그룹웨어 그룹 자동 펼침',
  ).toHaveAttribute('aria-expanded', 'true')

  // 판매 그룹은 접힘 유지(cross-group 오탐 차단)
  await expect(
    toggleLocator(page, '판매'),
    '/sales/link-dispatch 진입 시 판매 그룹은 접힘 유지(cross-group 오탐 차단)',
  ).toHaveAttribute('aria-expanded', 'false')

  expect(pageErrors, `pageerror 발생: ${pageErrors.join('; ')}`).toHaveLength(0)
})

test('Round C — localStorage 영속: 토글 후 새로고침해도 펼침 유지', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)
  await loadSidebar(page)

  // 첫 로드 후 localStorage 1회 초기화(이전 테스트 잔존 제거).
  // 주의: addInitScript 는 reload 마다 재실행되어 토글 기록을 지워버리므로 사용 금지.
  await page.evaluate(() => {
    try {
      Object.keys(window.localStorage)
        .filter((k) => k.startsWith('samhan.sidebar.group.'))
        .forEach((k) => window.localStorage.removeItem(k))
    } catch {
      /* ignore */
    }
  })

  const sidebar = page.locator('aside.app-sidebar')
  // 회계 그룹을 펼침(활성 라우트와 무관하게 사용자 토글만으로 영속 확인 → /#/ 홈에서 회계 토글)
  const acctToggle = toggleLocator(page, '회계')
  await expect(acctToggle).toHaveAttribute('aria-expanded', 'false')
  await acctToggle.click()
  await expect(acctToggle, '회계 그룹 펼침').toHaveAttribute('aria-expanded', 'true')

  // localStorage 기록 확인
  const stored = await page.evaluate(() => window.localStorage.getItem('samhan.sidebar.group.회계'))
  expect(stored, 'localStorage 에 회계 그룹 펼침(true) 기록').toBe('true')

  // 새로고침(홈 유지) — 영속 상태 복원
  await page.reload()
  await page.waitForSelector('aside.app-sidebar [data-testid="sidebar-category-toggle-회계"]', {
    timeout: 15000,
  })
  await page.waitForTimeout(1500)

  await expect(
    toggleLocator(page, '회계'),
    '새로고침 후에도 회계 그룹 펼침 유지(localStorage 영속)',
  ).toHaveAttribute('aria-expanded', 'true')
  await expect(
    sidebar.locator('[data-testid="sidebar-accounting-accounts"]'),
    '새로고침 후 회계 자식(계정과목) 노출 유지',
  ).toBeVisible()

  // 다른 그룹(판매)은 여전히 접힘(개별 영속)
  await expect(
    toggleLocator(page, '판매'),
    '판매 그룹은 토글하지 않았으므로 접힘 유지',
  ).toHaveAttribute('aria-expanded', 'false')

  expect(pageErrors, `pageerror 발생: ${pageErrors.join('; ')}`).toHaveLength(0)
})
