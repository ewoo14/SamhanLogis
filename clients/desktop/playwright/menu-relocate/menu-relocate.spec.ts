/**
 * admin GAS 이식 메뉴 일반 카테고리 노출 Playwright 스펙
 *
 * 실행 조건:
 *   cd clients/desktop
 *   VITE_MOCK_MODE=1 npx vite --port 5173 (별도 터미널)
 *   npx playwright test playwright/menu-relocate/menu-relocate.spec.ts --reporter=line
 *
 * dev server 미가용 시 모든 UI 테스트 자동 SKIP.
 * 스크린샷 저장: docs/qa/slip-form-v20-and-menu-relocate/*.png
 *
 * PR #156 회귀 가드: page.on('pageerror') 훅 의무 적용.
 *
 * 역할별 테스트:
 *   - mockRole=DISPATCH / MANAGER / MASTER / SALES
 *   - URL ?mockRole=<ROLE> param 으로 ROLE 변경 후 7그룹 메뉴 표시 검증
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

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5173'

/** 스크린샷 저장 디렉토리 */
// 캡처는 커밋된 확정 증거(docs/qa/<slug>/*.png)가 아니라 gitignore 된 _local/ 로 나간다 —
// 재실행이 증거를 덮어쓰지 못하게 한다. 승격은 QA_SHOTS_DIR 로만 opt-in (#926 참조 구현).
const QA_DIR = resolveQaShotsDir(path.resolve(
  _dirname,
  '../../../../docs/qa/slip-form-v20-and-menu-relocate',
))

function ensureQaDir(): void {
  // Mock 계약 스펙은 Playwright test-results 아래에 스크린샷을 남긴다.
  // docs/qa 는 PC별 파일 권한 차이로 EPERM 이 날 수 있어 real QA 산출물 전용으로 둔다.
}

/** dev server 가용 여부 확인 */
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

// ---------------------------------------------------------------------------
// pageerror 훅 — PR #156 회귀 가드
// ---------------------------------------------------------------------------

function attachPageErrorHook(page: Page, errors: string[]): void {
  page.on('pageerror', err => {
    errors.push(err.message)
  })
}

const SIDEBAR_GROUP_LABELS = ['판매', '구매', '회계', '그룹웨어', '인사', '배차', '창고 운영'] as const

async function clearSidebarGroupStorage(page: Page): Promise<void> {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 })
  await page.evaluate((labels: readonly string[]) => {
    for (const label of labels) {
      localStorage.removeItem(`samhan.sidebar.group.${label}`)
    }
  }, SIDEBAR_GROUP_LABELS)
}

async function waitForSidebar(page: Page): Promise<void> {
  await page.waitForSelector('aside.app-sidebar', { timeout: 20_000 })
}

function sidebarCategoryToggle(page: Page, label: string) {
  return page.getByTestId(`sidebar-category-toggle-${label.replace(/\s+/g, '')}`)
}

async function openSidebarCategory(page: Page, label: string): Promise<void> {
  const toggle = sidebarCategoryToggle(page, label)
  await expect(toggle, `${label} 그룹 토글 버튼이 보여야 함`).toBeVisible({ timeout: 10_000 })
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click()
    await expect(toggle, `${label} 그룹 토글 후 펼침 상태`).toHaveAttribute('aria-expanded', 'true')
  }
}

// ---------------------------------------------------------------------------
// 사이드바 메뉴 헬퍼
// ---------------------------------------------------------------------------

/**
 * 사이드바에서 특정 카테고리 + 메뉴 항목 visible 여부 확인.
 * 카테고리가 접혀 있으면 먼저 클릭해서 펼친다.
 *
 * [Round C P3 #14] 그룹 소속 검증 — 기존엔 categoryLabel 펼침만 하고 메뉴 항목은 사이드바 전역에서
 *   검색해 "어느 그룹에 있든" 통과했다(장식 파라미터). 이제 펼친 그룹의 content 블록
 *   (role=group, aria-labelledby == 카테고리 토글 id) 안으로 스코프를 좁혀, 해당 항목이 정확히
 *   그 그룹 소속일 때만 visible 로 판정한다.
 */
async function isSidebarMenuVisible(
  page: Page,
  categoryLabel: string,
  menuItemLabel: string,
): Promise<boolean> {
  // 사이드바 전체 컨테이너 로케이터
  const sidebar = page.locator(
    '[data-testid="sidebar"], nav[aria-label="사이드바"], aside, .sidebar'
  ).first()

  // 카테고리 헤더 탐색 — 미존재 시(권한 없음 등) 그룹 자체가 없으므로 항목도 없음.
  const categoryToggle = sidebarCategoryToggle(page, categoryLabel)
  if (await categoryToggle.count() === 0) {
    return false
  }
  await openSidebarCategory(page, categoryLabel)

  // 펼친 그룹의 content 블록(role=group, aria-labelledby==토글 id)으로 스코프 한정 → 그룹 소속 단언.
  const headingId = await categoryToggle.getAttribute('id')
  const groupScope = headingId
    ? sidebar.locator(`[role="group"][aria-labelledby="${headingId}"]`)
    : sidebar

  // 메뉴 항목 탐색 (그룹 블록 내부 한정)
  const menuItem = groupScope.locator(
    `[data-testid="menu-${menuItemLabel}"], a:has-text("${menuItemLabel}"), li:has-text("${menuItemLabel}"), span:has-text("${menuItemLabel}")`
  ).first()

  return await menuItem.count() > 0 && await menuItem.isVisible()
}

// ---------------------------------------------------------------------------
// Collapsible sidebar category 계약
// ---------------------------------------------------------------------------

test.describe('좌측 메뉴 7그룹 collapsible 계약', () => {

  test.skip(SKIP_UI, 'dev server 미가용 — VITE_MOCK_MODE=1 && npx vite --port 5173 후 PLAYWRIGHT_SKIP_UI=0 으로 재시도')

  test.beforeEach(async ({ page }) => {
    const ok = await isServerAvailable()
    test.skip(!ok, `dev server 미접근: ${BASE_URL}`)
    await clearSidebarGroupStorage(page)
  })

  test('기본 접힘: 권한 있는 그룹 헤더는 보이고 자식 메뉴는 펼치기 전 미렌더된다', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(`${BASE_URL}/#/?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await waitForSidebar(page)

    const salesToggle = sidebarCategoryToggle(page, '판매')
    await expect(salesToggle).toBeVisible()
    await expect(salesToggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByTestId('sidebar-sales')).toHaveCount(0)

    await openSidebarCategory(page, '판매')
    await expect(page.getByTestId('sidebar-sales')).toBeVisible()
    expect(errors, `pageerror 발생: ${errors.join('; ')}`).toHaveLength(0)
  })

  test('사용자가 펼친 그룹 상태는 localStorage 에 영속된다', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(`${BASE_URL}/#/?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await waitForSidebar(page)
    await openSidebarCategory(page, '구매')

    await expect.poll(
      () => page.evaluate(() => localStorage.getItem('samhan.sidebar.group.구매')),
      { message: '구매 그룹 open 상태가 localStorage 에 저장되어야 함' },
    ).toBe('true')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForSidebar(page)
    await expect(sidebarCategoryToggle(page, '구매')).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId('sidebar-purchases')).toBeVisible()
    expect(errors, `pageerror 발생: ${errors.join('; ')}`).toHaveLength(0)
  })

  test('현재 활성 라우트가 속한 그룹은 저장값이 접힘이어도 자동 펼침된다', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    await page.addInitScript(() => {
      localStorage.setItem('samhan.sidebar.group.회계', 'false')
    })

    await page.goto(`${BASE_URL}/#/accounting/accounts?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await waitForSidebar(page)

    await expect(sidebarCategoryToggle(page, '회계')).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId('sidebar-accounting-accounts')).toBeVisible()
    expect(errors, `pageerror 발생: ${errors.join('; ')}`).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// TC-M1 ~ TC-M5
// ---------------------------------------------------------------------------

test.describe('admin GAS 메뉴 일반 카테고리 노출 (TC-M1~M5)', () => {

  test.skip(SKIP_UI, 'dev server 미가용 — VITE_MOCK_MODE=1 && npx vite --port 5173 후 PLAYWRIGHT_SKIP_UI=0 으로 재시도')

  test.beforeEach(async ({ page }) => {
    const ok = await isServerAvailable()
    test.skip(!ok, `dev server 미접근: ${BASE_URL}`)
  })

  /**
   * TC-M1: 배차(arologis) 카테고리에 "배차지역 관리" 항목 visible
   * 접근 가능 역할: DISPATCH / MANAGER / MASTER
   */
  test('TC-M1: 배차(arologis) 카테고리 — "배차지역 관리" 항목 DISPATCH/MANAGER/MASTER 진입 가능', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()

    const roles = ['DISPATCH', 'MANAGER', 'MASTER']
    const results: Record<string, boolean> = {}

    for (const role of roles) {
      await page.goto(`${BASE_URL}/?mockRole=${role}`, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1000)

      const visible = await isSidebarMenuVisible(page, '배차', '배차지역 관리')
      results[role] = visible
      console.log(`[TC-M1] role=${role}, "배차지역 관리" visible: ${visible}`)
    }

    await page.screenshot({
      path: test.info().outputPath('tc-m1-dispatch-region-manage.png'),
      fullPage: true,
    })

    // (2026-07-26 하네스 배치) "0건이면 console.warn" 진단 블록 제거 — 바로 아래 hard
    // assert 가 이미 3역할 전부를 강제하고 실패 시 실제 results 를 출력하므로, warn 은
    // "soft-pass 처럼 보이는" 노이즈일 뿐이었다. soft 분기 0건 유지가 이 배치의 계약이다.
    expect(results, 'TC-M1: DISPATCH/MANAGER/MASTER 모두 배차 그룹의 배차지역 관리가 보여야 함').toEqual({
      DISPATCH: true,
      MANAGER: true,
      MASTER: true,
    })
    expect(errors, `TC-M1 pageerror 발생: ${errors.join('; ')}`).toHaveLength(0)
  })

  /**
   * TC-M2: 그룹웨어 카테고리에 "알리고 주소록" 항목 visible
   * 접근 가능 역할: MANAGER / MASTER
   */
  test('TC-M2: 그룹웨어 카테고리 — "알리고 주소록" 항목 MANAGER/MASTER 진입 가능', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()

    const roles = ['MANAGER', 'MASTER']
    const results: Record<string, boolean> = {}

    for (const role of roles) {
      await page.goto(`${BASE_URL}/?mockRole=${role}`, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1000)

      const visible = await isSidebarMenuVisible(page, '그룹웨어', '알리고 주소록')
      results[role] = visible
      console.log(`[TC-M2] role=${role}, "알리고 주소록" visible: ${visible}`)
    }

    // SALES 역할에서는 표시 안 됨 확인 (음성 케이스)
    await page.goto(`${BASE_URL}/?mockRole=SALES`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await page.waitForTimeout(800)
    const salesVisible = await isSidebarMenuVisible(page, '그룹웨어', '알리고 주소록')
    console.log(`[TC-M2] role=SALES, "알리고 주소록" visible (기대=false): ${salesVisible}`)

    await page.screenshot({
      path: test.info().outputPath('tc-m2-groupware-aligo-addressbook.png'),
      fullPage: true,
    })

    expect(results, 'TC-M2: MANAGER/MASTER 는 그룹웨어의 알리고 주소록이 보여야 함').toEqual({
      MANAGER: true,
      MASTER: true,
    })
    expect(salesVisible, 'TC-M2: SALES 는 알리고 주소록 권한이 없으므로 hidden').toBe(false)
    expect(errors, `TC-M2 pageerror 발생: ${errors.join('; ')}`).toHaveLength(0)
  })

  /**
   * TC-M3: 판매 카테고리에 "발송금지 거래처" 항목 visible
   * 접근 가능 역할: MANAGER / MASTER
   */
  test('TC-M3: 판매 카테고리 — "발송금지 거래처" 항목 MANAGER/MASTER visible, SALES hidden', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()

    const roles = ['SALES', 'MANAGER', 'MASTER']
    const results: Record<string, boolean> = {}

    for (const role of roles) {
      await page.goto(`${BASE_URL}/?mockRole=${role}`, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1000)

      const visible = await isSidebarMenuVisible(page, '판매', '발송금지 거래처')
      results[role] = visible
      console.log(`[TC-M3] role=${role}, "발송금지 거래처" visible: ${visible}`)
    }

    await page.screenshot({
      path: test.info().outputPath('tc-m3-sales-block-partner.png'),
      fullPage: true,
    })

    expect(results, 'TC-M3: partners.block 권한에 따라 판매 그룹 발송금지 거래처 노출이 갈려야 함').toEqual({
      SALES: false,
      MANAGER: true,
      MASTER: true,
    })
    expect(errors, `TC-M3 pageerror 발생: ${errors.join('; ')}`).toHaveLength(0)
  })

  /**
   * TC-M4: 판매 카테고리에 "시트 동기화" 항목 visible
   * 접근 가능 역할: MANAGER / MASTER
   */
  test('TC-M4: 판매 카테고리 — "시트 동기화" 항목 MANAGER/MASTER 진입 가능', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()

    const roles = ['MANAGER', 'MASTER']
    const results: Record<string, boolean> = {}

    for (const role of roles) {
      await page.goto(`${BASE_URL}/?mockRole=${role}`, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1000)

      const visible = await isSidebarMenuVisible(page, '판매', '시트 동기화')
      results[role] = visible
      console.log(`[TC-M4] role=${role}, "시트 동기화" visible: ${visible}`)
    }

    await page.screenshot({
      path: test.info().outputPath('tc-m4-sales-sheet-sync.png'),
      fullPage: true,
    })

    expect(results, 'TC-M4: MANAGER/MASTER 는 판매 그룹의 시트 동기화가 보여야 함').toEqual({
      MANAGER: true,
      MASTER: true,
    })
    expect(errors, `TC-M4 pageerror 발생: ${errors.join('; ')}`).toHaveLength(0)
  })

  /**
   * TC-M5: 기존 마스터 메뉴 4개 regression 가드
   * 기존 /admin/regions 등 마스터 전용 메뉴가 그대로 유지되는지 확인
   *
   * 기대 결과:
   *   - /admin/regions, /admin/users, /admin/partners, /products/catalog 4개 메뉴 또는 경로 유지
   *   - 메뉴 이식 후 기존 관리자 메뉴 미삭제
   *   - pageerror 0건
   *
   * [Round A P3] '제품 관리'/'/admin/products' → 현행 '기초품목 관리'/'/products/catalog' 로 갱신.
   *   MASTER 는 products.list bypass 라 품목 관리 메뉴가 항상 visible → soft warn 을 hard 단언으로 승격.
   */
  test('TC-M5: 기존 마스터 메뉴 5개 regression 가드 — 메뉴 이식 후에도 유지', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()

    await page.goto(`${BASE_URL}/?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await page.waitForTimeout(1500)

    // 기존 마스터 메뉴 5가지 확인 (정확 경로 AND 메뉴 텍스트 기준).
    // [Round A P3] '제품 관리'/'/admin/products' → 현행 '기초품목 관리'/'/products/catalog'.
    // [Round B P2] '사용자 관리' 라벨은 현행 사이드바 표기 '인사 관리'(admin.employees 게이트)와 일치시킨다
    //   (구 라벨 'admin-nav-users-new' 신규인사 와 혼동 금지). alt 로 구 표기 '사용자 관리' 보존.
    const legacyMenus = [
      { label: '배차지역 관리', path: '/admin/regions', alt: '배차지역관리' },
      { label: '인사 관리', path: '/admin/users', alt: '사용자 관리' },
      { label: '거래처 관리', path: '/admin/partners', alt: '거래처관리' },
      { label: '기초품목 관리', path: '/products/catalog', alt: '기초품목관리' },
      { label: '견적품목 관리', path: '/products/estimate-items', alt: '견적품목관리' },
    ]

    // 기본 접힘 도입 후 자식 anchor 는 그룹을 펼친 뒤에만 DOM 에 존재한다.
    await openSidebarCategory(page, '배차')
    await openSidebarCategory(page, '인사')
    await openSidebarCategory(page, '판매')

    const foundResults: Record<string, boolean> = {}
    const detailResults: Record<string, { hrefMatch: number; labelPresent: boolean }> = {}

    for (const menu of legacyMenus) {
      // [Round B P2] 정확 path href 존재 AND 라벨/alt 포함을 함께 요구(기존 href OR label false-green 제거).
      //   path 가 깨져도 라벨만 있으면 통과하던 OR 가드를 AND 로 강화한다. HashRouter 라 실제 href 는
      //   '#/admin/regions' 형태이므로 path 를 포함(*=)하는 anchor 가 정확히 1건이어야 한다(중복 셸 미마운트).
      //   라벨/alt 도 동반 노출되어야 한다.
      const byHrefPath = page.locator(`a[href*="${menu.path}"]`)
      const byLabel = page.locator(
        `nav a:has-text("${menu.label}"), aside a:has-text("${menu.label}"), a:has-text("${menu.alt}")`,
      ).first()

      const hrefMatch = await byHrefPath.count()
      const labelPresent = (await byLabel.count()) > 0
      const found = hrefMatch === 1 && labelPresent
      foundResults[menu.label] = found
      detailResults[menu.label] = { hrefMatch, labelPresent }
      console.log(`[TC-M5] "${menu.label}" (${menu.path}) 유지: ${found} (hrefMatch=${hrefMatch}, labelPresent=${labelPresent})`)
    }

    await page.screenshot({
      path: test.info().outputPath('tc-m5-master-menu-regression.png'),
      fullPage: true,
    })

    // 5개 중 발견된 수 리포트
    const foundCount = Object.values(foundResults).filter(v => v).length
    console.log(`[TC-M5] 기존 마스터 메뉴 유지 확인: ${foundCount}/5`)

    // [Round A P3 → Round B P2] soft warn → hard AND 단언.
    //   MASTER 는 모든 page-code bypass 라 5개 메뉴(배차지역/인사/거래처/기초품목/견적품목) 가 전부 visible 이어야 한다.
    //   정확 path href 1건 AND 라벨/alt 포함을 각각 단언해 어느 차원이 빠졌는지 메시지로 드러낸다.
    for (const menu of legacyMenus) {
      const d = detailResults[menu.label]
      expect(
        d.hrefMatch,
        `TC-M5: MASTER 는 "${menu.label}" path href(${menu.path})를 포함하는 anchor 가 정확히 1건이어야 함 (실제: ${d.hrefMatch})`,
      ).toBe(1)
      expect(
        d.labelPresent,
        `TC-M5: MASTER 는 "${menu.label}"(또는 alt "${menu.alt}") 라벨이 사이드바에 노출되어야 함`,
      ).toBe(true)
      expect(
        foundResults[menu.label],
        `TC-M5: MASTER 는 "${menu.label}"(${menu.path}) 메뉴가 정확 path href+라벨 모두로 유지되어야 함`,
      ).toBe(true)
    }
    expect(foundCount, 'TC-M5: 기존 마스터 메뉴 5개 모두 유지되어야 함').toBe(5)

    expect(errors, `TC-M5 pageerror 발생: ${errors.join('; ')}`).toHaveLength(0)
  })
})
