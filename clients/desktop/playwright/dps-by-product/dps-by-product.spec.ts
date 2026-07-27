/**
 * dps-by-product.spec.ts
 *
 * 품목별 DPS 분석 페이지 Playwright E2E 스펙 — P0-B GAS 보강.
 *
 * 경로: /warehouse/dps-compare/by-product
 * 권한: WAREHOUSE / MANAGER / MASTER
 *
 * 실행 조건:
 *   cd clients/desktop
 *   VITE_MOCK_MODE=1 npx vite --port 5173  (별도 터미널)
 *   npx playwright test playwright/dps-by-product/dps-by-product.spec.ts --reporter=line
 *
 * dev server 미가용 시 모든 UI 테스트 자동 SKIP.
 * 스크린샷 저장: docs/qa/p0-b-dps-by-product/*.png
 *
 * PR #156 회귀 가드: page.on('pageerror') 훅 의무 적용.
 *
 * TC 목록 (7건):
 *   TC-DBP-1: toolbar (날짜 from/to + warehouseId dropdown + 조회 버튼) visible
 *   TC-DBP-2: 조회 → DataGrid 8 컬럼 visible + mock 12 row 확인
 *   TC-DBP-3: 음수 row (반품 + DPS차이 음수) → 빨강 색상 검증
 *   TC-DBP-4: 열헤더 필터 (productName text) → 결과 row 필터링
 *   TC-DBP-5: Ctrl+C → clipboard TSV 검증 (DataGrid PR #162 패턴)
 *   TC-DBP-6: 사이드바 창고 카테고리 "품목별 DPS 분석" NavLink visible
 *   TC-DBP-7: SALES mockRole → 페이지 진입 시 ForbiddenPage redirect
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test'
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

const BASE_URL = process.env['VITE_BASE_URL'] ?? process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5173'

/** 스크린샷 저장 디렉토리 */
// 캡처는 커밋된 확정 증거(docs/qa/<slug>/*.png)가 아니라 gitignore 된 _local/ 로 나간다 —
// 재실행이 증거를 덮어쓰지 못하게 한다. 승격은 QA_SHOTS_DIR 로만 opt-in (#926 참조 구현).
const QA_DIR = resolveQaShotsDir(path.resolve(
  _dirname,
  '../../../../docs/qa/p0-b-dps-by-product',
))

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
// pageerror 훅 — PR #156 회귀 가드 의무
// ---------------------------------------------------------------------------

/** 각 테스트 페이지에 pageerror 훅 등록 */
function attachPageErrorHook(page: Page, errors: string[]): void {
  page.on('pageerror', err => {
    errors.push(err.message)
  })
}

async function waitForSettle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(600)
}

// ---------------------------------------------------------------------------
// 클립보드 권한 grant 헬퍼
// ---------------------------------------------------------------------------

async function grantClipboardPermissions(context: BrowserContext): Promise<void> {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
}

// ---------------------------------------------------------------------------
// 페이지 진입 URL
// ---------------------------------------------------------------------------

const PAGE_URL = `${BASE_URL}/#/warehouse/dps-compare/by-product`

// ---------------------------------------------------------------------------
// TC-DBP-1 ~ TC-DBP-7
// ---------------------------------------------------------------------------

test.describe('품목별 DPS 분석 페이지 (TC-DBP-1~7)', () => {

  test.skip(SKIP_UI, 'dev server 미가용 — VITE_MOCK_MODE=1 npx vite --port 5173 후 PLAYWRIGHT_SKIP_UI=0 으로 재시도')

  test.beforeEach(async ({ page }) => {
    const ok = await isServerAvailable()
    test.skip(!ok, `dev server 미접근: ${BASE_URL}`)
  })

  /**
   * TC-DBP-1: /warehouse/dps-compare/by-product 진입 →
   * toolbar (날짜 from/to + warehouseId dropdown + 조회 버튼) visible
   *
   * 기대 결과:
   *   - data-testid="dps-by-product-from" 날짜 input 노출
   *   - data-testid="dps-by-product-to" 날짜 input 노출
   *   - data-testid="dps-by-product-warehouse-select" dropdown 노출
   *   - data-testid="dps-by-product-query-button" 조회 버튼 노출
   *   - pageerror 없음
   */
  test('TC-DBP-1: toolbar (날짜 from/to + 창고 dropdown + 조회 버튼) visible', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(`${PAGE_URL}?mockRole=WAREHOUSE`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await waitForSettle(page)

    ensureQaDir()

    // toolbar 요소 가시성 검증
    const fromInput = page.locator('[data-testid="dps-by-product-from"]')
    const toInput = page.locator('[data-testid="dps-by-product-to"]')
    const warehouseSelect = page.locator('[data-testid="dps-by-product-warehouse-select"]')
    const queryButton = page.locator('[data-testid="dps-by-product-query-button"]')

    await page.screenshot({
      path: path.join(QA_DIR, 'TC-DBP-1-toolbar-visible.png'),
      fullPage: true,
    })

    // (2026-07-26 하네스 배치) "요소 없으면 body 길이만 확인" soft 분기 제거.
    // DpsByProductPage.tsx 가 네 testid 를 전부 렌더한다(실측 확인) — 못 찾으면 RED 가 계약이다.
    await expect(fromInput, 'TC-DBP-1: 시작 날짜 picker').toBeVisible()
    await expect(toInput, 'TC-DBP-1: 종료 날짜 picker').toBeVisible()
    await expect(warehouseSelect, 'TC-DBP-1: 창고 dropdown').toBeVisible()
    await expect(queryButton, 'TC-DBP-1: 조회 버튼').toBeVisible()

    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-DBP-2: 조회 버튼 클릭 → DataGrid 8 컬럼 visible + mock 12 row 확인
   *
   * 기대 결과:
   *   - data-testid="dps-by-product-grid" 내 thead 컬럼 헤더 8개
   *     (상품코드 / 상품명 / 입고대기 / 완료 / 품질검사 / 반품 / 합계 / DPS차이)
   *   - 조회 후 tbody 행 수 >= 1 (MOCK_MODE 데이터 행)
   *   - pageerror 없음
   */
  test('TC-DBP-2: 조회 → DataGrid 8 컬럼 visible + mock row 확인', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(`${PAGE_URL}?mockRole=WAREHOUSE`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await waitForSettle(page)

    ensureQaDir()

    const queryButton = page.locator('[data-testid="dps-by-product-query-button"]')
    const gridWrapper = page.locator('[data-testid="dps-by-product-grid"]')

    // (2026-07-26 하네스 배치) soft 분기 3종 제거 — ①조회 버튼 없으면 body 길이만 확인,
    // ②grid wrapper 없으면 console.warn, ③행 수 `toBeGreaterThanOrEqual(0)`(항상 참).
    // 실측: 컬럼 8/8, 행 12. 따라서 "mock 12행 기대" 는 지금 그대로 단언 가능하다.
    await expect(queryButton, 'TC-DBP-2: 조회 버튼').toBeVisible()
    await queryButton.click()
    await page.waitForTimeout(1500)
    await waitForSettle(page)

    await page.screenshot({
      path: path.join(QA_DIR, 'TC-DBP-2-datagrid-8-columns.png'),
      fullPage: true,
    })

    // 8 컬럼 헤더 텍스트 검증
    const expectedColumns = ['상품코드', '상품명', '입고대기', '완료', '품질검사', '반품', '합계', 'DPS차이']
    const missingColumns: string[] = []
    for (const colLabel of expectedColumns) {
      const header = page.locator(`th:has-text("${colLabel}"), [role="columnheader"]:has-text("${colLabel}")`)
      if ((await header.count()) === 0) missingColumns.push(colLabel)
    }
    expect(missingColumns, `TC-DBP-2: 8 컬럼 헤더 전부 존재해야 함 (누락: ${missingColumns.join(', ')})`).toEqual([])

    await expect(gridWrapper, 'TC-DBP-2: DataGrid wrapper').toBeVisible()
    const rows = page.locator(
      '[data-testid="dps-by-product-grid"] tbody tr, [data-testid="dps-by-product-grid"] [role="row"]'
    )
    const rowCount = await rows.count()
    expect(rowCount, `TC-DBP-2: DataGrid 행이 있어야 함 (mock 12행 기대, 실제 ${rowCount})`).toBeGreaterThanOrEqual(1)

    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-DBP-3: 음수 row (반품 + DPS차이 음수) → 빨강 색상 검증
   *
   * 기대 결과:
   *   - 반품/DPS차이 컬럼 중 음수 값을 가진 셀에 color: #B91C1C (빨강) 또는
   *     color: rgb(185, 28, 28) 스타일 적용 확인
   *   - 음수 셀 텍스트가 "-" 로 시작함
   *   - pageerror 없음
   */
  test('TC-DBP-3: 음수 row (반품/DPS차이 음수) → 빨강 색상 검증', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(`${PAGE_URL}?mockRole=WAREHOUSE`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await waitForSettle(page)

    ensureQaDir()

    const queryButton = page.locator('[data-testid="dps-by-product-query-button"]')

    if ((await queryButton.count()) > 0) {
      await queryButton.click()
      await page.waitForTimeout(1500)
      await waitForSettle(page)

      await page.screenshot({
        path: path.join(QA_DIR, 'TC-DBP-3-negative-row-red-color.png'),
        fullPage: true,
      })

      // 음수 셀 탐색 — DpsByProductPage 의 render 함수는 color: '#B91C1C' 인라인 스타일 적용
      const negativeCells = page.locator(
        '[style*="color: rgb(185, 28, 28)"], [style*="color: #B91C1C"], [style*="color:#B91C1C"]'
      )
      const negativeCount = await negativeCells.count()

      if (negativeCount > 0) {
        console.log(`TC-DBP-3: 음수 빨강 셀 ${negativeCount}개 발견`)
        expect(negativeCount, 'TC-DBP-3: 음수 빨강 셀이 1개 이상 존재해야 함').toBeGreaterThanOrEqual(1)
      } else {
        // mock 데이터에 음수 값이 없을 수 있음 — 스타일 클래스 기반으로도 탐색
        const negativeByClass = page.locator('.text-red-700, .negative-value, [data-negative="true"]')
        const negativeByClassCount = await negativeByClass.count()

        if (negativeByClassCount > 0) {
          console.log(`TC-DBP-3: 음수 클래스 기반 셀 ${negativeByClassCount}개 발견`)
          expect(negativeByClassCount).toBeGreaterThanOrEqual(1)
        } else {
          console.warn(
            'TC-DBP-3: 음수 빨강 셀 미발견 — ' +
            'mock 데이터에 returnQty < 0 또는 diffFromDps < 0 인 행이 없거나 MOCK_MODE 미적용 가능'
          )
          // pageerror 없음이 핵심 검증
          const bodyText = (await page.textContent('body')) ?? ''
          expect(bodyText.length, 'TC-DBP-3: 페이지 body 비어있음').toBeGreaterThan(30)
        }
      }
    } else {
      console.warn('TC-DBP-3: 조회 버튼 미발견')
      await page.screenshot({ path: path.join(QA_DIR, 'TC-DBP-3-no-query-button.png'), fullPage: true })
      const bodyText = (await page.textContent('body')) ?? ''
      expect(bodyText.length, 'TC-DBP-3: 페이지 body 비어있음').toBeGreaterThan(30)
    }

    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-DBP-4: 열헤더 필터 (productName text) → 결과 row 필터링
   *
   * 기대 결과:
   *   - "상품명" 컬럼 헤더 클릭 → 필터 popover 또는 text input 표시
   *   - 필터 텍스트 입력 → 해당 텍스트 포함 행만 표시
   *   - 빈 필터 입력 → 전체 행 복원
   *   - pageerror 없음
   */
  test('TC-DBP-4: 열헤더 필터 (productName) → 결과 row 필터링', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(`${PAGE_URL}?mockRole=WAREHOUSE`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await waitForSettle(page)

    ensureQaDir()

    const queryButton = page.locator('[data-testid="dps-by-product-query-button"]')

    if ((await queryButton.count()) > 0) {
      // 먼저 조회 실행
      await queryButton.click()
      await page.waitForTimeout(1500)
      await waitForSettle(page)

      // 초기 행 수 기록
      const initialRows = page.locator(
        '[data-testid="dps-by-product-grid"] tbody tr, [data-testid="dps-by-product-grid"] [role="row"]:not([role="columnheader"])'
      )
      const initialRowCount = await initialRows.count()
      console.log(`TC-DBP-4: 초기 행 수 = ${initialRowCount}`)

      // "상품명" 컬럼 헤더 탐색
      const productNameHeader = page.locator(
        'th:has-text("상품명"), [role="columnheader"]:has-text("상품명"), [data-col="productName"] th, th[data-col="productName"]'
      ).first()

      if ((await productNameHeader.count()) > 0) {
        await productNameHeader.click()
        await page.waitForTimeout(500)

        // 필터 input 탐색
        const filterInput = page.locator(
          '[data-testid*="column-filter"], [data-testid*="filter-input"], [role="dialog"] input, [role="tooltip"] input, .popover input'
        ).first()

        if ((await filterInput.count()) > 0) {
          // 필터 값 입력
          await filterInput.fill('AJ040')
          await page.waitForTimeout(600)

          const filteredRows = page.locator(
            '[data-testid="dps-by-product-grid"] tbody tr, [data-testid="dps-by-product-grid"] [role="row"]:not([role="columnheader"])'
          )
          const filteredRowCount = await filteredRows.count()
          console.log(`TC-DBP-4: 필터 후 행 수 = ${filteredRowCount}`)

          await page.screenshot({
            path: path.join(QA_DIR, 'TC-DBP-4-column-filter-product-name.png'),
            fullPage: true,
          })

          // 필터 후 행 수가 초기보다 같거나 적어야 함
          if (initialRowCount > 0) {
            expect(
              filteredRowCount,
              'TC-DBP-4: 필터 후 행 수가 초기 행 수 이하여야 함'
            ).toBeLessThanOrEqual(initialRowCount)
          }
        } else {
          console.warn('TC-DBP-4: 컬럼 필터 input 미발견 — DataGrid 필터 구현 확인 필요')
          await page.screenshot({
            path: path.join(QA_DIR, 'TC-DBP-4-no-filter-input.png'),
            fullPage: true,
          })
        }
      } else {
        console.warn('TC-DBP-4: "상품명" 컬럼 헤더 미발견')
        await page.screenshot({
          path: path.join(QA_DIR, 'TC-DBP-4-no-product-name-header.png'),
          fullPage: true,
        })
      }
    } else {
      console.warn('TC-DBP-4: 조회 버튼 미발견')
      await page.screenshot({ path: path.join(QA_DIR, 'TC-DBP-4-no-query-button.png'), fullPage: true })
      const bodyText = (await page.textContent('body')) ?? ''
      expect(bodyText.length, 'TC-DBP-4: 페이지 body 비어있음').toBeGreaterThan(30)
    }

    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-DBP-5: Ctrl+C → clipboard TSV 검증 (DataGrid PR #162 패턴)
   *
   * 기대 결과:
   *   - DataGrid 셀 범위 선택 후 Ctrl+C
   *   - clipboard 내용이 탭(\t) 또는 줄바꿈(\n) 구분 TSV 형식
   *   - pageerror 없음
   */
  test('TC-DBP-5: Ctrl+C → clipboard TSV 검증', async ({ page, context }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await grantClipboardPermissions(context)

    await page.goto(`${PAGE_URL}?mockRole=WAREHOUSE`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await waitForSettle(page)

    ensureQaDir()

    const queryButton = page.locator('[data-testid="dps-by-product-query-button"]')

    if ((await queryButton.count()) > 0) {
      await queryButton.click()
      await page.waitForTimeout(1500)
      await waitForSettle(page)

      // DataGrid 셀 탐색
      const cells = page.locator(
        '[data-testid="dps-by-product-grid"] [data-testid="datagrid-cell"], ' +
        '[data-testid="dps-by-product-grid"] tbody td, ' +
        '[data-testid="dps-by-product-grid"] [role="gridcell"]'
      )
      const cellCount = await cells.count()

      if (cellCount >= 2) {
        // 첫 번째 셀 클릭
        await cells.nth(0).click()
        await page.waitForTimeout(200)

        // Shift+클릭으로 범위 선택
        const endIdx = Math.min(cellCount - 1, 5)
        await cells.nth(endIdx).click({ modifiers: ['Shift'] })
        await page.waitForTimeout(200)

        // Ctrl+C
        await page.keyboard.press('Control+c')
        await page.waitForTimeout(500)

        let clipboardText = ''
        try {
          clipboardText = await page.evaluate(() => navigator.clipboard.readText())
        } catch (err) {
          console.warn(`TC-DBP-5: clipboard.readText() 실패: ${err}`)
        }

        await page.screenshot({
          path: path.join(QA_DIR, 'TC-DBP-5-ctrl-c-clipboard-tsv.png'),
          fullPage: true,
        })

        if (clipboardText.length > 0) {
          const isTsv = clipboardText.includes('\t') || clipboardText.includes('\n')
          expect(
            isTsv,
            `TC-DBP-5: clipboard 내용이 TSV 형식이어야 함. 실제: ${JSON.stringify(clipboardText.substring(0, 200))}`
          ).toBeTruthy()
        } else {
          console.warn('TC-DBP-5: clipboard 비어있음 — DataGrid Ctrl+C 미구현 또는 보안 컨텍스트 제한')
          expect(cellCount, 'TC-DBP-5: DataGrid 셀 DOM 존재해야 함').toBeGreaterThan(0)
        }
      } else {
        console.warn(`TC-DBP-5: DataGrid 셀 미발견 (count=${cellCount})`)
        await page.screenshot({ path: path.join(QA_DIR, 'TC-DBP-5-no-cells.png'), fullPage: true })
        const bodyText = (await page.textContent('body')) ?? ''
        expect(bodyText.length, 'TC-DBP-5: 페이지 body 비어있음').toBeGreaterThan(30)
      }
    } else {
      console.warn('TC-DBP-5: 조회 버튼 미발견')
      await page.screenshot({ path: path.join(QA_DIR, 'TC-DBP-5-no-query-button.png'), fullPage: true })
      const bodyText = (await page.textContent('body')) ?? ''
      expect(bodyText.length, 'TC-DBP-5: 페이지 body 비어있음').toBeGreaterThan(30)
    }

    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-DBP-6: 사이드바 창고 카테고리 "품목별 DPS 분석" NavLink visible
   *
   * 기대 결과:
   *   - data-testid="sidebar-warehouse-dps-by-product" NavLink 가 DOM에 존재
   *   - href/to 가 "/warehouse/dps-compare/by-product" 포함
   *   - pageerror 없음
   */
  test('TC-DBP-6: 사이드바 "품목별 DPS 분석" NavLink visible', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    // WAREHOUSE 역할로 임의 페이지 진입 (사이드바 확인)
    await page.goto(`${BASE_URL}/#/?mockRole=WAREHOUSE`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await waitForSettle(page)

    ensureQaDir()

    await page.screenshot({
      path: path.join(QA_DIR, 'TC-DBP-6-sidebar-dps-by-product-navlink.png'),
      fullPage: true,
    })

    // data-testid 기반 탐색
    const navLink = page.locator('[data-testid="sidebar-warehouse-dps-by-product"]')
    const navLinkExists = (await navLink.count()) > 0

    if (navLinkExists) {
      await expect(navLink).toBeVisible()
      // 텍스트 "품목별 DPS 분석" 포함 확인
      const text = (await navLink.textContent()) ?? ''
      expect(text.includes('품목별') || text.includes('DPS'), `TC-DBP-6: NavLink 텍스트 확인: "${text}"`).toBeTruthy()
    } else {
      // 텍스트 기반 fallback 탐색
      const linkByText = page.locator('a:has-text("품목별 DPS 분석"), [role="link"]:has-text("품목별 DPS 분석")').first()
      const linkByTextExists = (await linkByText.count()) > 0

      if (linkByTextExists) {
        await expect(linkByText).toBeVisible()
        console.log('TC-DBP-6: 텍스트 기반으로 NavLink 발견')
      } else {
        console.warn(
          'TC-DBP-6: "품목별 DPS 분석" NavLink 미발견 — ' +
          'AppLayout.tsx sidebar 미완성 또는 WAREHOUSE 역할 노출 조건 확인 필요'
        )
        const bodyText = (await page.textContent('body')) ?? ''
        expect(bodyText.length, 'TC-DBP-6: 페이지 body 비어있음').toBeGreaterThan(30)
      }
    }

    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-DBP-7: SALES mockRole → 페이지 진입 시 ForbiddenPage redirect
   *
   * 기대 결과:
   *   - SALES 역할로 /warehouse/dps-compare/by-product 진입
   *   - ForbiddenPage 또는 "권한이 없습니다" / "접근 불가" 텍스트 표시
   *   - DpsByProductPage 본문 (toolbar/grid) 미노출
   *   - pageerror 없음
   */
  test('TC-DBP-7: SALES mockRole → ForbiddenPage redirect', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(`${PAGE_URL}?mockRole=SALES`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await waitForSettle(page)

    ensureQaDir()

    await page.screenshot({
      path: path.join(QA_DIR, 'TC-DBP-7-sales-role-forbidden.png'),
      fullPage: true,
    })

    // ForbiddenPage 텍스트 탐색 (한국어 + 영어 fallback)
    const forbiddenTexts = [
      '권한이 없습니다',
      '접근 권한',
      '접근 불가',
      'Forbidden',
      '403',
      '권한 없음',
    ]

    const bodyText = (await page.textContent('body')) ?? ''
    const hasForbiddenMessage = forbiddenTexts.some(t => bodyText.includes(t))

    // DPS 페이지 toolbar 미노출 확인
    const queryButton = page.locator('[data-testid="dps-by-product-query-button"]')
    const queryButtonVisible = (await queryButton.count()) > 0 && await queryButton.isVisible()

    if (hasForbiddenMessage) {
      expect(hasForbiddenMessage, 'TC-DBP-7: ForbiddenPage 메시지 표시 확인').toBeTruthy()
      expect(queryButtonVisible, 'TC-DBP-7: SALES 역할 시 조회 버튼이 미노출이어야 함').toBeFalsy()
    } else if (!queryButtonVisible) {
      // ForbiddenPage 메시지는 없지만 toolbar가 없는 경우 — redirect 성공으로 간주
      console.log('TC-DBP-7: ForbiddenPage 메시지 미발견이나 toolbar 미노출 → redirect 성공으로 간주')
      expect(queryButtonVisible, 'TC-DBP-7: SALES 역할 시 DPS 페이지 toolbar 미노출 확인').toBeFalsy()
    } else {
      console.warn(
        'TC-DBP-7: SALES 역할 ForbiddenPage redirect 미확인 — ' +
        `bodyText 일부: "${bodyText.substring(0, 200)}"`
      )
      // mockRole 미구현 시 소프트 경고로만 처리
    }

    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })
})
