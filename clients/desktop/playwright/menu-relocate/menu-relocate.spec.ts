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

// ---------------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------------

const _filename = fileURLToPath(import.meta.url)
const _dirname = path.dirname(_filename)

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5173'

/** 스크린샷 저장 디렉토리 */
const QA_DIR = path.resolve(
  _dirname,
  '../../../../docs/qa/slip-form-v20-and-menu-relocate',
)

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

// ---------------------------------------------------------------------------
// 사이드바 메뉴 헬퍼
// ---------------------------------------------------------------------------

/**
 * 사이드바에서 특정 카테고리 + 메뉴 항목 visible 여부 확인.
 * 카테고리가 접혀 있으면 먼저 클릭해서 펼친다.
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

  // 카테고리 헤더 탐색
  const categoryHeader = sidebar.locator(
    `[data-testid="sidebar-category-${categoryLabel}"], button:has-text("${categoryLabel}"), span:has-text("${categoryLabel}")`
  ).first()

  if (await categoryHeader.count() > 0) {
    // 접혀있으면 펼치기
    const isExpanded = await categoryHeader.getAttribute('aria-expanded')
    if (isExpanded === 'false') {
      await categoryHeader.click()
      await page.waitForTimeout(300)
    }
  }

  // 메뉴 항목 탐색
  const menuItem = sidebar.locator(
    `[data-testid="menu-${menuItemLabel}"], a:has-text("${menuItemLabel}"), li:has-text("${menuItemLabel}"), span:has-text("${menuItemLabel}")`
  ).first()

  return await menuItem.count() > 0 && await menuItem.isVisible()
}

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

    // 최소 1개 이상의 역할에서 visible 이어야 함 (FE agent 미완성 허용 — 0건이면 경고)
    const anyVisible = Object.values(results).some(v => v)
    if (!anyVisible) {
      console.warn('[TC-M1] "배차지역 관리" 메뉴 미발견 — FE agent 작업 완료 후 재확인 필요. 현재 메뉴 구조:')
      const allLinks = await page.locator('nav a, sidebar a, .menu-item').allTextContents()
      console.warn('발견된 메뉴 항목:', allLinks.slice(0, 20))
    }

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
   * [Round A P3] '제품 관리'/'/admin/products' → 현행 '품목 관리'/'/products/catalog' 로 갱신.
   *   MASTER 는 products.list bypass 라 품목 관리가 항상 visible → soft warn 을 hard 단언으로 승격.
   */
  test('TC-M5: 기존 마스터 메뉴 4개 regression 가드 — 메뉴 이식 후에도 유지', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()

    await page.goto(`${BASE_URL}/?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await page.waitForTimeout(1500)

    // 기존 마스터 메뉴 4가지 확인 (정확 경로 AND 메뉴 텍스트 기준).
    // [Round A P3] '제품 관리'/'/admin/products' → 현행 '품목 관리'/'/products/catalog'.
    // [Round B P2] '사용자 관리' 라벨은 현행 사이드바 표기 '인사 관리'(admin.employees 게이트)와 일치시킨다
    //   (구 라벨 'admin-nav-users-new' 신규인사 와 혼동 금지). alt 로 구 표기 '사용자 관리' 보존.
    const legacyMenus = [
      { label: '배차지역 관리', path: '/admin/regions', alt: '배차지역관리' },
      { label: '인사 관리', path: '/admin/users', alt: '사용자 관리' },
      { label: '거래처 관리', path: '/admin/partners', alt: '거래처관리' },
      { label: '품목 관리', path: '/products/catalog', alt: '품목관리' },
    ]

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

    // 4개 중 발견된 수 리포트
    const foundCount = Object.values(foundResults).filter(v => v).length
    console.log(`[TC-M5] 기존 마스터 메뉴 유지 확인: ${foundCount}/4`)

    // [Round A P3 → Round B P2] soft warn → hard AND 단언.
    //   MASTER 는 모든 page-code bypass 라 4개 메뉴(배차지역/인사/거래처/품목) 가 전부 visible 이어야 한다.
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
    expect(foundCount, 'TC-M5: 기존 마스터 메뉴 4개 모두 유지되어야 함').toBe(4)

    expect(errors, `TC-M5 pageerror 발생: ${errors.join('; ')}`).toHaveLength(0)
  })
})
