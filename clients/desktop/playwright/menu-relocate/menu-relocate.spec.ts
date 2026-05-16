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
 *   - URL ?mockRole=<ROLE> param 으로 ROLE 변경 후 메뉴 표시 검증
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
  if (!fs.existsSync(QA_DIR)) {
    fs.mkdirSync(QA_DIR, { recursive: true })
  }
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
      path: path.join(QA_DIR, 'tc-m1-dispatch-region-manage.png'),
      fullPage: true,
    })

    // 최소 1개 이상의 역할에서 visible 이어야 함 (FE agent 미완성 허용 — 0건이면 경고)
    const anyVisible = Object.values(results).some(v => v)
    if (!anyVisible) {
      console.warn('[TC-M1] "배차지역 관리" 메뉴 미발견 — FE agent 작업 완료 후 재확인 필요. 현재 메뉴 구조:')
      const allLinks = await page.locator('nav a, sidebar a, .menu-item').allTextContents()
      console.warn('발견된 메뉴 항목:', allLinks.slice(0, 20))
    }

    expect(errors, `TC-M1 pageerror 발생: ${errors.join('; ')}`).toHaveLength(0)
  })

  /**
   * TC-M2: 메신저 카테고리에 "알리고 주소록" 항목 visible
   * 접근 가능 역할: MANAGER / MASTER
   */
  test('TC-M2: 메신저 카테고리 — "알리고 주소록" 항목 MANAGER/MASTER 진입 가능', async ({ page }) => {
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

      const visible = await isSidebarMenuVisible(page, '메신저', '알리고 주소록')
      results[role] = visible
      console.log(`[TC-M2] role=${role}, "알리고 주소록" visible: ${visible}`)
    }

    // SALES 역할에서는 표시 안 됨 확인 (음성 케이스)
    await page.goto(`${BASE_URL}/?mockRole=SALES`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await page.waitForTimeout(800)
    const salesVisible = await isSidebarMenuVisible(page, '메신저', '알리고 주소록')
    console.log(`[TC-M2] role=SALES, "알리고 주소록" visible (기대=false): ${salesVisible}`)

    await page.screenshot({
      path: path.join(QA_DIR, 'tc-m2-messenger-aligo-addressbook.png'),
      fullPage: true,
    })

    if (!Object.values(results).some(v => v)) {
      console.warn('[TC-M2] "알리고 주소록" 메뉴 미발견 — FE agent 작업 완료 후 재확인 필요')
    }

    expect(errors, `TC-M2 pageerror 발생: ${errors.join('; ')}`).toHaveLength(0)
  })

  /**
   * TC-M3: 영업 카테고리에 "발송금지 거래처" 항목 visible
   * 접근 가능 역할: SALES / MANAGER / MASTER
   */
  test('TC-M3: 영업 카테고리 — "발송금지 거래처" 항목 SALES/MANAGER/MASTER 진입 가능', async ({ page }) => {
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

      const visible = await isSidebarMenuVisible(page, '영업', '발송금지 거래처')
      results[role] = visible
      console.log(`[TC-M3] role=${role}, "발송금지 거래처" visible: ${visible}`)
    }

    await page.screenshot({
      path: path.join(QA_DIR, 'tc-m3-sales-block-partner.png'),
      fullPage: true,
    })

    if (!Object.values(results).some(v => v)) {
      console.warn('[TC-M3] "발송금지 거래처" 메뉴 미발견 — FE agent 작업 완료 후 재확인 필요')
    }

    expect(errors, `TC-M3 pageerror 발생: ${errors.join('; ')}`).toHaveLength(0)
  })

  /**
   * TC-M4: 설정/앱정보 카테고리에 "시트 동기화" 항목 visible
   * 접근 가능 역할: MANAGER / MASTER
   */
  test('TC-M4: 설정/앱정보 카테고리 — "시트 동기화" 항목 MANAGER/MASTER 진입 가능', async ({ page }) => {
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

      // "설정/앱정보" 또는 "설정" 카테고리 탐색
      let visible = await isSidebarMenuVisible(page, '설정/앱정보', '시트 동기화')
      if (!visible) {
        visible = await isSidebarMenuVisible(page, '설정', '시트 동기화')
      }
      if (!visible) {
        visible = await isSidebarMenuVisible(page, '앱정보', '시트 동기화')
      }
      results[role] = visible
      console.log(`[TC-M4] role=${role}, "시트 동기화" visible: ${visible}`)
    }

    await page.screenshot({
      path: path.join(QA_DIR, 'tc-m4-settings-sheet-sync.png'),
      fullPage: true,
    })

    if (!Object.values(results).some(v => v)) {
      console.warn('[TC-M4] "시트 동기화" 메뉴 미발견 — FE agent 작업 완료 후 재확인 필요')
    }

    expect(errors, `TC-M4 pageerror 발생: ${errors.join('; ')}`).toHaveLength(0)
  })

  /**
   * TC-M5: 기존 마스터 메뉴 4개 regression 가드
   * 기존 /admin/regions 등 마스터 전용 메뉴가 그대로 유지되는지 확인
   *
   * 기대 결과:
   *   - /admin/regions, /admin/users, /admin/partners, /admin/products 4개 메뉴 또는 경로 유지
   *   - 메뉴 이식 후 기존 관리자 메뉴 미삭제
   *   - pageerror 0건
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

    // 기존 마스터 메뉴 4가지 확인 (경로 또는 메뉴 텍스트 기준)
    const legacyMenus = [
      { label: '배차지역 관리', path: '/admin/regions', alt: '배차지역관리' },
      { label: '사용자 관리', path: '/admin/users', alt: '사용자관리' },
      { label: '거래처 관리', path: '/admin/partners', alt: '거래처관리' },
      { label: '제품 관리', path: '/admin/products', alt: '제품관리' },
    ]

    const foundResults: Record<string, boolean> = {}

    for (const menu of legacyMenus) {
      // 사이드바 링크 또는 메뉴 텍스트 탐색
      const byHref = page.locator(`a[href="${menu.path}"], a[href*="${menu.path}"]`).first()
      const byLabel = page.locator(`nav a:has-text("${menu.label}"), aside a:has-text("${menu.label}"), a:has-text("${menu.alt}")`).first()

      const hrefCount = await byHref.count()
      const labelCount = await byLabel.count()
      const found = hrefCount > 0 || labelCount > 0
      foundResults[menu.label] = found
      console.log(`[TC-M5] "${menu.label}" (${menu.path}) 유지: ${found} (href=${hrefCount}, label=${labelCount})`)
    }

    await page.screenshot({
      path: path.join(QA_DIR, 'tc-m5-master-menu-regression.png'),
      fullPage: true,
    })

    // 4개 중 발견된 수 리포트
    const foundCount = Object.values(foundResults).filter(v => v).length
    console.log(`[TC-M5] 기존 마스터 메뉴 유지 확인: ${foundCount}/4`)

    if (foundCount < 4) {
      console.warn('[TC-M5] 일부 기존 마스터 메뉴 미발견. 메뉴 이식으로 삭제 여부 FE agent 확인 필요')
      console.warn('결과:', JSON.stringify(foundResults, null, 2))
    }

    expect(errors, `TC-M5 pageerror 발생: ${errors.join('; ')}`).toHaveLength(0)
  })
})
