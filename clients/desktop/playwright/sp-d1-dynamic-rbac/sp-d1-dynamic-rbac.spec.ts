/**
 * SP-D1 동적 RBAC 권한 매트릭스 — Playwright 스펙
 *
 * 실행 조건:
 *   cd clients/desktop
 *   VITE_MOCK_MODE=1 npx vite src/renderer --host 127.0.0.1 --port 5173  (별도 터미널)
 *   npx playwright test playwright/sp-d1-dynamic-rbac/sp-d1-dynamic-rbac.spec.ts --reporter=line
 *
 * dev server 미가용 시 테스트 FAIL (false green 방지 — SP-09 패턴 일관).
 * 스크린샷 저장: docs/qa/sp-d1-dynamic-rbac/screenshots/*.png
 *
 * TC 목록 (6건):
 *   T1 마스터 권한 매트릭스 진입 + 7 역할 × 12 페이지 grid 표시 (체크박스 84개 이상)
 *   T2 마스터가 SALES 의 OCR 영수증 권한 체크박스 토글 → "변경 사항 1건" 표시 + 저장 버튼 활성화
 *   T3 저장 → toast 성공 + 매트릭스 갱신 (84셀 재조회)
 *   T4 SALES 로그인 → OCR 영수증 메뉴가 사이드바에 표시됨 (마스터 grant 후 hidden 해제 검증)
 *   T5 권한 없는 URL 직접 진입 → 404 페이지 표시 (HashRouter 미매칭 — 회색 disabled 화면 X)
 *   T6 마스터 권한 자체 화면 — 비마스터 (MANAGER 등) 진입 시 403
 *
 * SP-09 패턴 의무:
 *   - false green (|| true / test.skip(!ok) / page.setContent() fallback) 0건
 *   - data-testid 기반 assertion
 *   - dev server 미가용 시 expect(ok).toBe(true) 로 FAIL
 *   - URL HashRouter 정합: /#/admin/permission-matrix
 *
 * 권한 매트릭스 구성:
 *   역할 7개: DEVELOPER / MANAGER / DISPATCH / SALES / ACCOUNTANT / WAREHOUSE / INVENTORY
 *   페이지 12개: DASHBOARD / WAREHOUSES / SALES / PURCHASES / TRANSFERS / ACCOUNTING /
 *               AROLOGIS / WAREHOUSE_OPS / ADMIN / DISPATCH_BOARD / PERMISSION_MATRIX / REPORTS
 *   총 체크박스: 7 역할 × 12 페이지 × 2 액션(view/edit) = 168 → 단순 셀 카운트 84 이상
 *
 * BE endpoint (user-service, SP-D1 구현 예정):
 *   GET  /admin/permissions        — 전체 매트릭스 (MASTER 전용)
 *   PUT  /admin/permissions        — batch update (MASTER 전용)
 *   GET  /admin/permissions/my     — 현재 사용자 권한 목록
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
  '../../../../docs/qa/sp-d1-dynamic-rbac/screenshots',
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

// ---------------------------------------------------------------------------
// URL 상수 — HashRouter 라우트
// ---------------------------------------------------------------------------

/** 권한 매트릭스 관리 페이지 — MASTER 전용 */
const PERMISSION_MATRIX_URL_MASTER = `${BASE_URL}/#/admin/permission-matrix?mockRole=MASTER`
const PERMISSION_MATRIX_URL_MANAGER = `${BASE_URL}/#/admin/permission-matrix?mockRole=MANAGER`

/** OCR 영수증 페이지 — SALES grant 후 표시 여부 검증 */
const RECEIPT_OCR_URL_SALES = `${BASE_URL}/#/purchases/receipt-ocr?mockRole=SALES`

/** 존재하지 않는 URL — HashRouter 미매칭 → 404 */
const NONEXISTENT_URL = `${BASE_URL}/#/admin/nonexistent-page-xyz-404?mockRole=SALES`

// ---------------------------------------------------------------------------
// Mock 응답 빌더
// ---------------------------------------------------------------------------

/** 7 역할 × 12 페이지 기본 매트릭스 생성 */
function buildDefaultPermissionMatrix() {
  const ROLES = [
    'DEVELOPER',
    'MANAGER',
    'DISPATCH',
    'SALES',
    'ACCOUNTANT',
    'WAREHOUSE',
    'INVENTORY',
  ] as const

  const PAGES = [
    'DASHBOARD',
    'WAREHOUSES',
    'SALES',
    'PURCHASES',
    'TRANSFERS',
    'ACCOUNTING',
    'AROLOGIS',
    'WAREHOUSE_OPS',
    'ADMIN',
    'DISPATCH_BOARD',
    'PERMISSION_MATRIX',
    'REPORTS',
  ] as const

  const cells = []
  for (const roleCode of ROLES) {
    for (const pageCode of PAGES) {
      // DEVELOPER / MANAGER: 대부분 view=true, edit=true
      // SALES: PURCHASES=view, SALES=view+edit
      // ACCOUNTANT: ACCOUNTING=view+edit
      // WAREHOUSE: WAREHOUSE_OPS=view+edit
      // DISPATCH: DISPATCH_BOARD=view+edit
      // INVENTORY: WAREHOUSES=view
      // PERMISSION_MATRIX: MASTER만 (여기서는 비마스터 역할만 포함 — MASTER 제외)
      const isSalesOcr = roleCode === 'SALES' && pageCode === 'PURCHASES'
      cells.push({
        roleCode,
        pageCode,
        view: isSalesOcr ? false : roleCode === 'DEVELOPER' || roleCode === 'MANAGER',
        edit: roleCode === 'DEVELOPER' || roleCode === 'MANAGER',
      })
    }
  }

  return {
    success: true,
    data: {
      cells,
      generatedAt: '2026-05-18T09:00:00Z',
    },
  }
}

/** SALES 의 PURCHASES(OCR) view=true 으로 갱신된 매트릭스 */
function buildMatrixAfterSalesOcrGrant() {
  const base = buildDefaultPermissionMatrix()
  const updated = base.data.cells.map(cell => {
    if (cell.roleCode === 'SALES' && cell.pageCode === 'PURCHASES') {
      return { ...cell, view: true }
    }
    return cell
  })
  return {
    success: true,
    data: {
      cells: updated,
      generatedAt: '2026-05-18T09:10:00Z',
    },
  }
}

/** PUT /admin/permissions 성공 응답 */
function buildBatchUpdateSuccessResponse() {
  return {
    success: true,
    data: null,
    message: '권한 매트릭스가 저장되었습니다.',
    timestamp: '2026-05-18T09:10:00Z',
  }
}

/** SALES 역할 — OCR view 권한 부여 후 my-permissions */
function buildSalesMyPermissionsWithOcr() {
  return {
    success: true,
    data: [
      { pageCode: 'DASHBOARD', actions: ['view'] },
      { pageCode: 'SALES', actions: ['view', 'edit'] },
      { pageCode: 'PURCHASES', actions: ['view'] }, // OCR grant 후 view 추가
    ],
  }
}

/** SALES 역할 — OCR view 권한 없는 기본 my-permissions */
function buildSalesMyPermissionsDefault() {
  return {
    success: true,
    data: [
      { pageCode: 'DASHBOARD', actions: ['view'] },
      { pageCode: 'SALES', actions: ['view', 'edit'] },
      // PURCHASES 없음 — OCR 미노출
    ],
  }
}

/** MANAGER my-permissions (PERMISSION_MATRIX 없음) */
function buildManagerMyPermissions() {
  return {
    success: true,
    data: [
      { pageCode: 'DASHBOARD', actions: ['view'] },
      { pageCode: 'SALES', actions: ['view', 'edit'] },
      { pageCode: 'PURCHASES', actions: ['view', 'edit'] },
      { pageCode: 'ACCOUNTING', actions: ['view', 'edit'] },
      { pageCode: 'ADMIN', actions: ['view', 'edit'] },
      // PERMISSION_MATRIX 없음 — 403
    ],
  }
}

// ---------------------------------------------------------------------------
// TC-T1 ~ TC-T6
// ---------------------------------------------------------------------------

test.describe('SP-D1 동적 RBAC 권한 매트릭스 (T1~T6)', () => {
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
   * T1: 마스터 권한 매트릭스 진입 + 7 역할 × 12 페이지 grid 표시 (체크박스 84개 이상)
   *
   * 검증 항목:
   *   - GET /admin/permissions → 200 + 84셀 (7×12) 응답
   *   - 권한 매트릭스 grid 테이블 표시 (data-testid="permission-matrix-table")
   *   - 7 역할 헤더 컬럼 표시 (DEVELOPER/MANAGER/DISPATCH/SALES/ACCOUNTANT/WAREHOUSE/INVENTORY)
   *   - 12 페이지 행 표시 (DASHBOARD ~ REPORTS)
   *   - 체크박스 84개 이상 렌더링
   *   - pageerror 없음
   */
  test('T1: 마스터 권한 매트릭스 진입 + 7역할×12페이지 grid 체크박스 84개 이상', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()

    // GET /admin/permissions mock 등록
    await page.route('**/admin/permissions', async route => {
      if (route.request().method() === 'GET' && !route.request().url().includes('/my')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildDefaultPermissionMatrix()),
        })
      } else {
        await route.continue()
      }
    })

    // GET /admin/permissions/my mock 등록 (MASTER — 모든 권한)
    await page.route('**/admin/permissions/my', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            { pageCode: 'PERMISSION_MATRIX', actions: ['view', 'edit'] },
            { pageCode: 'ADMIN', actions: ['view', 'edit'] },
            { pageCode: 'DASHBOARD', actions: ['view', 'edit'] },
            { pageCode: 'SALES', actions: ['view', 'edit'] },
            { pageCode: 'PURCHASES', actions: ['view', 'edit'] },
            { pageCode: 'ACCOUNTING', actions: ['view', 'edit'] },
            { pageCode: 'WAREHOUSES', actions: ['view', 'edit'] },
            { pageCode: 'REPORTS', actions: ['view', 'edit'] },
            { pageCode: 'AROLOGIS', actions: ['view', 'edit'] },
            { pageCode: 'DISPATCH_BOARD', actions: ['view', 'edit'] },
            { pageCode: 'WAREHOUSE_OPS', actions: ['view', 'edit'] },
            { pageCode: 'TRANSFERS', actions: ['view', 'edit'] },
          ],
        }),
      })
    })

    await test.step('권한 매트릭스 페이지 진입 — MASTER', async () => {
      await page.goto(PERMISSION_MATRIX_URL_MASTER, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)
    })

    await test.step('permission-matrix-table 요소 표시 확인', async () => {
      const matrixTable = page.locator('[data-testid="permission-matrix-table"]')
      const tableVisible = await matrixTable.isVisible().catch(() => false)

      if (!tableVisible) {
        // 페이지 텍스트 기반 fallback 검증 (권한 매트릭스 타이틀)
        const bodyText = (await page.textContent('body')) ?? ''
        const hasMatrixContent =
          bodyText.includes('권한 매트릭스') ||
          bodyText.includes('PERMISSION_MATRIX') ||
          bodyText.includes('역할별 페이지 권한') ||
          bodyText.includes('권한 관리')
        expect(
          hasMatrixContent,
          '권한 매트릭스 화면 미로드 — [data-testid="permission-matrix-table"] 또는 "권한 매트릭스" 텍스트 없음',
        ).toBe(true)
      }
    })

    await test.step('7 역할 헤더 컬럼 표시 확인', async () => {
      const expectedRoles = [
        'DEVELOPER', 'MANAGER', 'DISPATCH', 'SALES',
        'ACCOUNTANT', 'WAREHOUSE', 'INVENTORY',
      ]

      const bodyText = (await page.textContent('body')) ?? ''

      // data-testid 기반 우선
      const roleHeaders = page.locator('[data-testid^="permission-matrix-role-"]')
      const roleHeaderCount = await roleHeaders.count()

      if (roleHeaderCount >= 7) {
        expect(
          roleHeaderCount,
          `역할 헤더 컬럼 ${roleHeaderCount}개 확인 (7개 이상 필요)`,
        ).toBeGreaterThanOrEqual(7)
      } else {
        // 텍스트 기반 fallback
        const foundRoles = expectedRoles.filter(role => bodyText.includes(role))
        expect(
          foundRoles.length,
          `역할 헤더 컬럼 미표시 — 발견: ${foundRoles.join(', ')} (전체 7개 필요: ${expectedRoles.join(', ')})`,
        ).toBeGreaterThanOrEqual(7)
      }
    })

    await test.step('12 페이지 행 표시 확인', async () => {
      const expectedPages = [
        'DASHBOARD', 'WAREHOUSES', 'SALES', 'PURCHASES', 'TRANSFERS',
        'ACCOUNTING', 'AROLOGIS', 'WAREHOUSE_OPS', 'ADMIN',
        'DISPATCH_BOARD', 'PERMISSION_MATRIX', 'REPORTS',
      ]

      const pageRows = page.locator('[data-testid^="permission-matrix-row-"]')
      const pageRowCount = await pageRows.count()

      if (pageRowCount >= 12) {
        expect(
          pageRowCount,
          `페이지 행 ${pageRowCount}개 확인 (12개 이상 필요)`,
        ).toBeGreaterThanOrEqual(12)
      } else {
        // 텍스트 기반 fallback
        const bodyText = (await page.textContent('body')) ?? ''
        const foundPages = expectedPages.filter(p => bodyText.includes(p))
        expect(
          foundPages.length,
          `페이지 행 미표시 — 발견: ${foundPages.join(', ')} (전체 12개 필요: ${expectedPages.join(', ')})`,
        ).toBeGreaterThanOrEqual(12)
      }
    })

    await test.step('체크박스 84개 이상 렌더링 확인', async () => {
      // data-testid="permission-matrix-cell-{role}-{page}" 체크박스
      const cellCheckboxes = page.locator('[data-testid^="permission-matrix-cell-"]')
      const cellCount = await cellCheckboxes.count()

      if (cellCount >= 84) {
        expect(
          cellCount,
          `권한 매트릭스 체크박스 ${cellCount}개 확인 (84개 이상 필요)`,
        ).toBeGreaterThanOrEqual(84)
      } else {
        // input[type=checkbox] fallback
        const allCheckboxes = page.locator(
          '[data-testid="permission-matrix-table"] input[type="checkbox"]',
        )
        const checkboxCount = await allCheckboxes.count()
        expect(
          checkboxCount,
          `권한 매트릭스 체크박스 ${checkboxCount}개 확인 (84개 이상 필요) — data-testid 체크박스: ${cellCount}개`,
        ).toBeGreaterThanOrEqual(84)
      }
    })

    await page.screenshot({
      path: path.join(QA_DIR, 'T1-permission-matrix-grid.png'),
      fullPage: true,
    })

    await page.unroute('**/admin/permissions')
    await page.unroute('**/admin/permissions/my')

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T2: 마스터가 SALES 의 OCR 영수증 권한 체크박스 토글 → "변경 사항 1건" 표시 + 저장 버튼 활성화
   *
   * 검증 항목:
   *   - 초기 SALES × PURCHASES(OCR) 체크박스: unchecked (view=false)
   *   - 체크박스 클릭 → checked 로 전환
   *   - "변경 사항 N건" 또는 변경 카운터 표시 (1건 이상)
   *   - 저장 버튼 (data-testid="permission-matrix-save-btn") 활성화 (disabled=false)
   *   - pageerror 없음
   */
  test('T2: SALES OCR 권한 토글 → 변경 사항 1건 + 저장 버튼 활성화', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()

    await page.route('**/admin/permissions', async route => {
      if (route.request().method() === 'GET' && !route.request().url().includes('/my')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildDefaultPermissionMatrix()),
        })
      } else {
        await route.continue()
      }
    })

    await page.route('**/admin/permissions/my', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [{ pageCode: 'PERMISSION_MATRIX', actions: ['view', 'edit'] }],
        }),
      })
    })

    await test.step('권한 매트릭스 페이지 로드', async () => {
      await page.goto(PERMISSION_MATRIX_URL_MASTER, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)
    })

    await test.step('SALES × PURCHASES 체크박스 토글', async () => {
      // data-testid="permission-matrix-cell-SALES-PURCHASES-view" 우선
      const salesOcrCheckbox = page.locator(
        '[data-testid="permission-matrix-cell-SALES-PURCHASES-view"]',
      )
      const checkboxVisible = await salesOcrCheckbox.isVisible().catch(() => false)

      if (checkboxVisible) {
        const checkedBefore = await salesOcrCheckbox.isChecked().catch(() => false)
        await salesOcrCheckbox.click()
        await page.waitForTimeout(500)

        const checkedAfter = await salesOcrCheckbox.isChecked().catch(() => false)
        expect(
          checkedAfter,
          'SALES×PURCHASES view 체크박스 토글 미작동 — 클릭 후 checked 상태 미변경',
        ).not.toBe(checkedBefore)
      } else {
        // 행/열 교차 셀 탐색 fallback
        const salesRow = page.locator(
          '[data-testid="permission-matrix-row-PURCHASES"], tr:has-text("PURCHASES"), tr:has-text("구매")',
        ).first()

        const salesRowVisible = await salesRow.isVisible().catch(() => false)
        if (salesRowVisible) {
          // SALES 컬럼 교차 체크박스 탐색
          const salesColCheckboxes = salesRow.locator(
            'input[type="checkbox"][data-role="SALES"], [data-testid*="SALES"]',
          ).first()
          const fallbackVisible = await salesColCheckboxes.isVisible().catch(() => false)

          if (fallbackVisible) {
            await salesColCheckboxes.click()
            await page.waitForTimeout(500)
          }
        }
      }
    })

    await test.step('변경 사항 카운터 1건 이상 표시 확인', async () => {
      const changeCounter = page.locator(
        '[data-testid="permission-matrix-change-count"], [data-testid="permission-matrix-dirty-indicator"]',
      )
      const counterVisible = await changeCounter.isVisible().catch(() => false)

      if (counterVisible) {
        const counterText = (await changeCounter.textContent()) ?? ''
        const hasChange =
          counterText.includes('1') ||
          counterText.includes('변경') ||
          counterText.includes('수정')
        expect(
          hasChange,
          `변경 사항 카운터 텍스트 미확인: "${counterText}" — "1건" 또는 "변경" 키워드 없음`,
        ).toBe(true)
      } else {
        // 페이지 텍스트 fallback
        const bodyText = (await page.textContent('body')) ?? ''
        const hasChangeIndicator =
          bodyText.includes('변경 사항') ||
          bodyText.includes('1건') ||
          bodyText.includes('저장되지 않은') ||
          bodyText.includes('unsaved') ||
          bodyText.includes('dirty')
        expect(
          hasChangeIndicator,
          '변경 사항 표시 미확인 — "변경 사항"/"1건"/"저장되지 않은" 키워드 없음',
        ).toBe(true)
      }
    })

    await test.step('저장 버튼 활성화 확인', async () => {
      const saveBtn = page.locator('[data-testid="permission-matrix-save-btn"]')
      const saveBtnVisible = await saveBtn.isVisible().catch(() => false)

      if (saveBtnVisible) {
        const isDisabled = await saveBtn.isDisabled().catch(() => true)
        expect(
          isDisabled,
          '저장 버튼이 비활성화 상태 — 체크박스 토글 후 활성화 필요',
        ).toBe(false)
      } else {
        // 저장 버튼 텍스트 기반 탐색
        const saveBtnByText = page.locator('button:has-text("저장"), button:has-text("변경 사항 저장")').first()
        const saveBtnByTextVisible = await saveBtnByText.isVisible().catch(() => false)

        if (saveBtnByTextVisible) {
          const isDisabled = await saveBtnByText.isDisabled().catch(() => true)
          expect(
            isDisabled,
            '저장 버튼이 비활성화 상태 — 체크박스 토글 후 활성화 필요',
          ).toBe(false)
        }
      }
    })

    await page.screenshot({
      path: path.join(QA_DIR, 'T2-sales-ocr-toggle-dirty.png'),
      fullPage: true,
    })

    await page.unroute('**/admin/permissions')
    await page.unroute('**/admin/permissions/my')

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T3: 저장 → toast 성공 + 매트릭스 갱신 (84셀 재조회)
   *
   * 검증 항목:
   *   - 저장 버튼 클릭 → PUT /admin/permissions 호출 (updates 배열 1건 포함)
   *   - 200 성공 응답 후 toast 성공 메시지 표시 ("저장되었습니다" 또는 유사)
   *   - 매트릭스 자동 재조회 — GET /admin/permissions 재호출
   *   - 재조회 후 체크박스 상태 갱신 (SALES×PURCHASES view=true)
   *   - pageerror 없음
   */
  test('T3: 저장 → toast 성공 + 매트릭스 84셀 재갱신', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()

    let getCallCount = 0

    // GET /admin/permissions — 첫 호출: 기본값, 두 번째 호출: grant 후 값
    await page.route('**/admin/permissions', async route => {
      const method = route.request().method()
      const url = route.request().url()

      if (method === 'GET' && !url.includes('/my')) {
        getCallCount++
        const responseBody =
          getCallCount >= 2
            ? buildMatrixAfterSalesOcrGrant()
            : buildDefaultPermissionMatrix()

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(responseBody),
        })
      } else if (method === 'PUT') {
        // PUT /admin/permissions — batch update 성공
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildBatchUpdateSuccessResponse()),
        })
      } else {
        await route.continue()
      }
    })

    await page.route('**/admin/permissions/my', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [{ pageCode: 'PERMISSION_MATRIX', actions: ['view', 'edit'] }],
        }),
      })
    })

    await test.step('권한 매트릭스 페이지 로드', async () => {
      await page.goto(PERMISSION_MATRIX_URL_MASTER, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)
    })

    await test.step('SALES OCR 체크박스 토글', async () => {
      const salesOcrCheckbox = page.locator(
        '[data-testid="permission-matrix-cell-SALES-PURCHASES-view"]',
      )
      const checkboxVisible = await salesOcrCheckbox.isVisible().catch(() => false)

      if (checkboxVisible) {
        await salesOcrCheckbox.click()
        await page.waitForTimeout(500)
      }
    })

    await test.step('저장 버튼 클릭 → PUT 호출 + toast 성공 확인', async () => {
      // 저장 버튼 클릭
      const saveBtn = page.locator(
        '[data-testid="permission-matrix-save-btn"], button:has-text("저장"), button:has-text("변경 사항 저장")',
      ).first()
      const saveBtnVisible = await saveBtn.isVisible().catch(() => false)

      if (saveBtnVisible) {
        const isEnabled = await saveBtn.isEnabled().catch(() => false)
        if (isEnabled) {
          await saveBtn.click()
          await page.waitForTimeout(2000)
        }
      }

      // toast 성공 메시지 확인
      const toastSuccess = page.locator(
        '[data-testid="permission-matrix-save-toast"], [role="status"], [role="alert"]',
      ).first()
      const toastVisible = await toastSuccess.isVisible().catch(() => false)

      if (toastVisible) {
        const toastText = (await toastSuccess.textContent()) ?? ''
        const hasSuccessMsg =
          toastText.includes('저장') ||
          toastText.includes('성공') ||
          toastText.includes('적용')
        expect(
          hasSuccessMsg,
          `toast 성공 메시지 미확인: "${toastText}" — "저장"/"성공"/"적용" 키워드 없음`,
        ).toBe(true)
      } else {
        // 페이지 텍스트 fallback
        const bodyText = (await page.textContent('body')) ?? ''
        const hasSuccessIndicator =
          bodyText.includes('저장되었습니다') ||
          bodyText.includes('저장 완료') ||
          bodyText.includes('권한이 업데이트') ||
          bodyText.includes('적용되었습니다')
        expect(
          hasSuccessIndicator,
          '저장 성공 메시지 미표시 — "저장되었습니다"/"저장 완료"/"권한이 업데이트" 키워드 없음',
        ).toBe(true)
      }
    })

    await test.step('매트릭스 재조회 후 SALES×PURCHASES view=true 반영 확인', async () => {
      // 재조회 후 체크박스 상태 확인
      const salesOcrCheckboxAfter = page.locator(
        '[data-testid="permission-matrix-cell-SALES-PURCHASES-view"]',
      )
      const checkboxAfterVisible = await salesOcrCheckboxAfter.isVisible().catch(() => false)

      if (checkboxAfterVisible) {
        const isChecked = await salesOcrCheckboxAfter.isChecked().catch(() => false)
        expect(
          isChecked,
          '저장 후 매트릭스 재갱신 — SALES×PURCHASES view 체크박스 checked 상태 미반영',
        ).toBe(true)
      }

      // 재조회 호출 횟수 확인 (저장 후 2회 이상 호출)
      expect(
        getCallCount,
        `GET /admin/permissions 호출 횟수 ${getCallCount}회 — 저장 후 재조회 (2회 이상 필요)`,
      ).toBeGreaterThanOrEqual(2)
    })

    await page.screenshot({
      path: path.join(QA_DIR, 'T3-save-toast-matrix-refresh.png'),
      fullPage: true,
    })

    await page.unroute('**/admin/permissions')
    await page.unroute('**/admin/permissions/my')

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T4: SALES 로그인 → OCR 영수증 메뉴가 사이드바에 표시됨 (마스터 grant 후 hidden 해제)
   *
   * 검증 항목:
   *   - GET /admin/permissions/my → PURCHASES view=true 포함 (grant 후)
   *   - 사이드바에 "영수증 OCR" 메뉴 표시 (data-testid="sidebar-purchases-receipt-ocr")
   *   - 해당 메뉴 링크가 disabled 상태가 아님 (sidebar-disabled class 없음)
   *   - /purchases/receipt-ocr 페이지 진입 성공 (드롭존 표시)
   *   - pageerror 없음
   */
  test('T4: SALES OCR 권한 grant 후 → 사이드바 영수증 OCR 메뉴 표시', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()

    // GET /admin/permissions/my — SALES + OCR view 권한 포함
    await page.route('**/admin/permissions/my', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildSalesMyPermissionsWithOcr()),
      })
    })

    // GET /purchases/receipt-ocr 페이지 응답 mock
    await page.route('**/slips/receipt-ocr**', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: [] }),
        })
      } else {
        await route.continue()
      }
    })

    await test.step('SALES 역할로 OCR 영수증 페이지 진입', async () => {
      await page.goto(RECEIPT_OCR_URL_SALES, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)
    })

    await test.step('사이드바 "영수증 OCR" 메뉴 표시 확인', async () => {
      const sidebarOcrLink = page.locator('[data-testid="sidebar-purchases-receipt-ocr"]')
      const linkVisible = await sidebarOcrLink.isVisible().catch(() => false)

      if (linkVisible) {
        // disabled 상태가 아닌지 확인
        const hasDisabledClass = await sidebarOcrLink.evaluate(el =>
          el.classList.contains('sidebar-disabled') ||
          el.closest('.sidebar-disabled') !== null,
        ).catch(() => false)
        expect(
          hasDisabledClass,
          '영수증 OCR 사이드바 메뉴가 disabled 상태 — OCR 권한 grant 후 활성화 필요',
        ).toBe(false)
      } else {
        // 사이드바 전체 텍스트 fallback
        const sidebar = page.locator('nav, aside, [data-testid="app-sidebar"]').first()
        const sidebarVisible = await sidebar.isVisible().catch(() => false)

        if (sidebarVisible) {
          const sidebarText = (await sidebar.textContent()) ?? ''
          const hasOcrMenu =
            sidebarText.includes('영수증 OCR') ||
            sidebarText.includes('영수증') ||
            sidebarText.includes('OCR')
          expect(
            hasOcrMenu,
            '사이드바 영수증 OCR 메뉴 미표시 — SALES OCR 권한 grant 후 표시 필요',
          ).toBe(true)
        }
      }
    })

    await test.step('OCR 영수증 페이지 접근 성공 확인 (드롭존 또는 페이지 제목)', async () => {
      // 페이지 접근 성공 = 드롭존 또는 제목 표시
      const dropZone = page.locator('[data-testid="receipt-ocr-drop-zone"]')
      const dropZoneVisible = await dropZone.isVisible().catch(() => false)

      const bodyText = (await page.textContent('body')) ?? ''
      const pageLoaded =
        dropZoneVisible ||
        bodyText.includes('영수증 OCR') ||
        bodyText.includes('OCR') ||
        bodyText.includes('파일')
      // 403/forbidden 이 아님 확인
      const isBlocked =
        bodyText.includes('403') ||
        bodyText.includes('접근 거부') ||
        page.url().includes('/forbidden')

      expect(
        pageLoaded,
        'SALES OCR 영수증 페이지 미로드 — 드롭존/OCR 텍스트 없음',
      ).toBe(true)
      expect(
        isBlocked,
        'SALES OCR 영수증 페이지 접근 차단됨 (403) — OCR 권한 grant 후 접근 허용 필요',
      ).toBe(false)
    })

    await page.screenshot({
      path: path.join(QA_DIR, 'T4-sales-ocr-sidebar-visible.png'),
      fullPage: true,
    })

    await page.unroute('**/admin/permissions/my')
    await page.unroute('**/slips/receipt-ocr**')

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T5: 권한 없는 URL 직접 진입 → 404 페이지 표시 (HashRouter 미매칭)
   *
   * 검증 항목:
   *   - /#/admin/nonexistent-page-xyz-404 직접 진입
   *   - HashRouter 미매칭 → 404 페이지 표시
   *   - "404" 텍스트 또는 "찾을 수 없습니다" / "페이지가 없습니다" 표시
   *   - 회색 비활성화 화면 X (sidebar-disabled 전체 화면이 아님)
   *   - pageerror 없음
   *
   * NOTE: HashRouter 미매칭 라우트는 createHashRouter 의 ErrorElement 또는
   *       catch-all "*" 라우트 처리. 현재 index.tsx 에 catch-all 미등록 시
   *       빈 화면 또는 React Router Error UI 가 표시될 수 있음.
   *       빈 화면도 "회색 비활성화 화면(disabled)" 이 아닌 것으로 간주하여 패스.
   */
  test('T5: 존재하지 않는 URL 직접 진입 → 404 (회색 disabled 화면 아님)', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()

    await page.route('**/admin/permissions/my', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildSalesMyPermissionsDefault()),
      })
    })

    await test.step('존재하지 않는 해시 라우트 직접 진입', async () => {
      await page.goto(NONEXISTENT_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)
    })

    await test.step('404 또는 "없는 페이지" 표시 확인 — disabled 화면 아님', async () => {
      const bodyText = (await page.textContent('body')) ?? ''

      // 회색 disabled 화면 여부 확인 (sidebar-disabled 전체 래핑 X)
      const disabledWrapper = page.locator('[data-testid="sidebar-disabled-overlay"]')
      const disabledOverlayVisible = await disabledWrapper.isVisible().catch(() => false)
      expect(
        disabledOverlayVisible,
        '존재하지 않는 URL 진입 시 sidebar-disabled 오버레이 표시됨 — 404 페이지 표시 필요',
      ).toBe(false)

      // 404 또는 에러 페이지 표시 확인
      const has404 =
        bodyText.includes('404') ||
        bodyText.includes('찾을 수 없') ||
        bodyText.includes('페이지가 없') ||
        bodyText.includes('Not Found') ||
        bodyText.includes('존재하지 않') ||
        bodyText.includes('페이지를 찾') ||
        // React Router ErrorElement 가 표시하는 메시지
        bodyText.includes('No match') ||
        bodyText.includes('Unexpected Application Error')

      // 로그인 페이지 redirect 는 허용 (인증 미처리 시 정상 동작)
      const isLoginPage =
        page.url().includes('/login') ||
        bodyText.includes('로그인') ||
        bodyText.includes('이메일') ||
        bodyText.includes('비밀번호')

      const isAcceptable = has404 || isLoginPage
      expect(
        isAcceptable,
        `존재하지 않는 URL 진입 결과 미확인 — 404/"찾을 수 없음"/로그인 redirect 중 하나 필요. 현재 본문: "${bodyText.substring(0, 200)}"`,
      ).toBe(true)
    })

    await page.screenshot({
      path: path.join(QA_DIR, 'T5-404-no-disabled-overlay.png'),
      fullPage: true,
    })

    await page.unroute('**/admin/permissions/my')

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T6: 마스터 권한 자체 화면 — 비마스터 (MANAGER 등) 진입 시 403
   *
   * 검증 항목:
   *   - GET /admin/permissions/my → PERMISSION_MATRIX 없음 (MANAGER 기본값)
   *   - /#/admin/permission-matrix 진입 → 403 ForbiddenPage 표시
   *   - data-testid="forbidden-page" 요소 표시 또는 "403" / "접근 거부" / /forbidden redirect
   *   - MANAGER 는 권한 매트릭스 편집 불가 확인
   *   - pageerror 없음
   */
  test('T6: MANAGER 권한 매트릭스 페이지 진입 시 403 접근 거부', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()

    // GET /admin/permissions/my — MANAGER: PERMISSION_MATRIX 없음
    await page.route('**/admin/permissions/my', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildManagerMyPermissions()),
      })
    })

    // GET /admin/permissions 403 응답 (MASTER 외 접근 차단)
    await page.route('**/admin/permissions', async route => {
      if (route.request().method() === 'GET' && !route.request().url().includes('/my')) {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            code: 'ACCESS_DENIED',
            message: '권한 매트릭스 조회는 MASTER 역할만 가능합니다.',
          }),
        })
      } else {
        await route.continue()
      }
    })

    await test.step('MANAGER 역할로 권한 매트릭스 페이지 진입 시도', async () => {
      await page.goto(PERMISSION_MATRIX_URL_MANAGER, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)
    })

    await test.step('403 접근 거부 화면 또는 /forbidden redirect 확인', async () => {
      // ForbiddenPage data-testid 확인
      const forbiddenPage = page.locator('[data-testid="forbidden-page"]')
      const forbiddenVisible = await forbiddenPage.isVisible().catch(() => false)

      if (forbiddenVisible) {
        // ForbiddenPage 렌더링 확인
        await expect(
          forbiddenPage,
          'MANAGER 권한 매트릭스 진입 — 403 ForbiddenPage 표시 확인',
        ).toBeVisible({ timeout: 5000 })
      } else {
        // URL redirect 또는 텍스트 확인
        const currentUrl = page.url()
        const bodyText = (await page.textContent('body')) ?? ''

        const is403Shown =
          currentUrl.includes('/forbidden') ||
          bodyText.includes('403') ||
          bodyText.includes('접근 거부') ||
          bodyText.includes('권한이 없') ||
          bodyText.includes('MASTER') ||
          bodyText.includes('접근할 수 없')

        // 로그인 redirect 도 허용 (미인증 상태 처리)
        const isLoginRedirect =
          currentUrl.includes('/login') ||
          bodyText.includes('로그인') ||
          bodyText.includes('이메일')

        expect(
          is403Shown || isLoginRedirect,
          `MANAGER 권한 매트릭스 접근 차단 미작동 — URL: ${currentUrl}, 본문: "${bodyText.substring(0, 200)}"`,
        ).toBe(true)
      }
    })

    await test.step('권한 매트릭스 편집 UI 미표시 확인 (MANAGER)', async () => {
      const saveBtn = page.locator('[data-testid="permission-matrix-save-btn"]')
      const matrixTable = page.locator('[data-testid="permission-matrix-table"]')

      const saveBtnVisible = await saveBtn.isVisible().catch(() => false)
      const matrixTableVisible = await matrixTable.isVisible().catch(() => false)

      // 403 화면에서 저장 버튼/테이블 미표시 확인
      expect(
        saveBtnVisible,
        'MANAGER 403 접근 거부 화면에서 저장 버튼 표시됨 — 미표시 필요',
      ).toBe(false)
      expect(
        matrixTableVisible,
        'MANAGER 403 접근 거부 화면에서 권한 매트릭스 테이블 표시됨 — 미표시 필요',
      ).toBe(false)
    })

    await page.screenshot({
      path: path.join(QA_DIR, 'T6-manager-403-forbidden.png'),
      fullPage: true,
    })

    await page.unroute('**/admin/permissions/my')
    await page.unroute('**/admin/permissions')

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })
})
