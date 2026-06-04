/**
 * SP-D1 동적 RBAC 권한 매트릭스 — Playwright 스펙 (재게이트)
 *
 * 실행 조건:
 *   cd clients/desktop
 *   VITE_MOCK_MODE=1 npx vite src/renderer --host 127.0.0.1 --port 5173  (별도 터미널 or webServer)
 *   npx playwright test playwright/sp-d1-dynamic-rbac/sp-d1-dynamic-rbac.spec.ts --reporter=line
 *
 * dev server 미가용 시 테스트 FAIL (false green 방지 — SP-09 패턴 일관).
 * 스크린샷 저장: docs/qa/sp-d1-dynamic-rbac/screenshots/*.png
 *
 * TC 목록 (6건):
 *   T1 권한 매트릭스 진입(MASTER) → account-select 옵션 ≥3개 + permission-matrix-table 표시 + 셀 다수 렌더
 *   T2 임의 셀 체크박스 토글 → perm-matrix-change-count "변경 1건" + perm-matrix-save-btn 활성
 *   T3 토글 후 저장 → toast role="alert" "저장" 포함 메시지 표시
 *   T4 SALES 역할 → 사이드바 영수증 OCR 메뉴 표시 (mockPerms 주입)
 *   T5 존재하지 않는 URL → 404 (HashRouter 미매칭 — 회색 disabled 화면 X)
 *   T6 MANAGER 진입 → 403/forbidden 또는 redirect
 *
 * 규칙:
 *   - false green (|| true / test.skip(!ok) / page.setContent() fallback) 0건
 *   - data-testid 기반 strict assertion
 *   - page.route('**') 완전 제거 (in-process mock 원칙 — VITE_MOCK_MODE=1 환경에서 no-op)
 *   - URL HashRouter 정합: BASE_URL/#/...
 *   - dev server 미가용 시 expect(ok).toBe(true) 로 FAIL
 *
 * Mock 계정 (mock.ts 실제값):
 *   mock-account-manager  김관리  MANAGER
 *   mock-account-sales    이영업  SALES
 *   mock-account-dispatch 박배차  DISPATCH
 *   (총 3계정 → perm-matrix-account-select options ≥3 단언)
 *
 * Testid 체계 (PermissionMatrixPage.tsx 실측):
 *   perm-matrix-account-select         — 계정 드롭다운 <select>
 *   permission-matrix-table            — 매트릭스 표 wrapper
 *   perm-matrix-cell-{pageNorm}-{action} — 셀 체크박스 (pageCode의 '.' → '-', action 7종)
 *   perm-matrix-change-count           — role="status" 텍스트 "변경 N건"
 *   perm-matrix-save-btn               — 저장 버튼 (dirtyKeys.size===0 이면 disabled)
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
// URL 상수 — HashRouter
// ---------------------------------------------------------------------------

/** 권한 매트릭스 페이지 — MASTER (system.permission-admin 보유) */
const PERMISSION_MATRIX_URL_MASTER = `${BASE_URL}/#/admin/permission-matrix?mockRole=MASTER`

/** 권한 매트릭스 페이지 — MANAGER */
const PERMISSION_MATRIX_URL_MANAGER = `${BASE_URL}/#/admin/permission-matrix?mockRole=MANAGER`

/** OCR 영수증 페이지 — SALES (mockPerms 주입으로 OCR 권한 부여) */
const RECEIPT_OCR_URL_SALES = `${BASE_URL}/#/purchases/receipt-ocr?mockRole=SALES`

/** 존재하지 않는 URL — HashRouter 미매칭 → 404 */
const NONEXISTENT_URL = `${BASE_URL}/#/admin/nonexistent-page-xyz-404?mockRole=SALES`

// ---------------------------------------------------------------------------
// mockPerms 헬퍼 (URL 쿼리 주입용)
// ---------------------------------------------------------------------------

type MockPerm = { pageCode: string; view?: boolean; edit?: boolean }

function mockPerms(perms: MockPerm[]): string {
  return btoa(JSON.stringify(perms))
}

function withMockPerms(url: string, perms: MockPerm[]): string {
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}mockPerms=${encodeURIComponent(mockPerms(perms))}`
}

// ---------------------------------------------------------------------------
// TC-T1 ~ TC-T6
// ---------------------------------------------------------------------------

test.describe('SP-D1 동적 RBAC 권한 매트릭스 (T1~T6)', () => {
  test.skip(SKIP_UI, 'PLAYWRIGHT_SKIP_UI=1 — UI 테스트 전체 skip')

  test.beforeEach(async () => {
    const ok = await isServerAvailable()
    expect(
      ok,
      `dev server 미접근: ${BASE_URL} — VITE_MOCK_MODE=1 npx vite src/renderer --host 127.0.0.1 --port 5173 실행 후 재시도`,
    ).toBe(true)
  })

  // -------------------------------------------------------------------------
  /**
   * T1: 권한 매트릭스 진입(MASTER) → account-select 옵션 ≥3개 + permission-matrix-table 표시 + 셀 다수 렌더
   *
   * 검증 항목 (신 UI — account-select 기반):
   *   - perm-matrix-account-select <select> 표시
   *   - 옵션 개수 ≥3 (mock 3계정: 김관리/이영업/박배차)
   *   - permission-matrix-table 표시
   *   - perm-matrix-cell-{pageNorm}-{action} 셀 체크박스 ≥10개 렌더
   *   - pageerror 없음
   *
   * NOTE: page.route() 미사용 — in-process mock (VITE_MOCK_MODE=1) 직접 반환.
   */
  test('T1: 권한 매트릭스 진입 → account-select ≥3옵션 + 매트릭스 테이블 + 셀 ≥10개', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()

    await test.step('MASTER 역할로 권한 매트릭스 페이지 진입', async () => {
      await page.goto(PERMISSION_MATRIX_URL_MASTER, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      // 계정 목록 로드(비동기 fetchAccounts) 완료 대기
      await page.waitForTimeout(2000)
    })

    await test.step('perm-matrix-account-select 표시 + 옵션 ≥3개 확인', async () => {
      const accountSelect = page.locator('[data-testid="perm-matrix-account-select"]')
      await expect(
        accountSelect,
        'perm-matrix-account-select <select> 미표시',
      ).toBeVisible({ timeout: 5000 })

      const optionCount = await accountSelect.locator('option').count()
      expect(
        optionCount,
        `perm-matrix-account-select 옵션 ${optionCount}개 — mock 3계정(김관리/이영업/박배차) 이상 필요`,
      ).toBeGreaterThanOrEqual(3)
    })

    await test.step('permission-matrix-table 표시 확인', async () => {
      // 첫 계정이 자동 선택되고 매트릭스 데이터 로드 대기
      const matrixTable = page.locator('[data-testid="permission-matrix-table"]')
      await expect(
        matrixTable,
        'permission-matrix-table 미표시 — 계정 선택 후 매트릭스 로드 실패',
      ).toBeVisible({ timeout: 8000 })
    })

    await test.step('셀 체크박스 ≥10개 렌더 확인', async () => {
      // perm-matrix-cell-{pageNorm}-{action} 형식 (pageNorm = pageCode '.' → '-')
      const cellCheckboxes = page.locator('[data-testid^="perm-matrix-cell-"]')
      const cellCount = await cellCheckboxes.count()
      expect(
        cellCount,
        `perm-matrix-cell-* 체크박스 ${cellCount}개 — 10개 이상 렌더 필요`,
      ).toBeGreaterThanOrEqual(10)
    })

    await page.screenshot({
      path: path.join(QA_DIR, 'T1-account-select-matrix.png'),
      fullPage: true,
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T2: 임의 셀 체크박스 토글 → perm-matrix-change-count "변경 1건" + perm-matrix-save-btn 활성
   *
   * 검증 항목:
   *   - 매트릭스 로드 후 perm-matrix-cell-* 셀 중 첫 번째 체크박스 토글
   *   - perm-matrix-change-count role="status" 텍스트에 "변경" + "1" 포함 (= "변경 1건")
   *   - perm-matrix-save-btn isDisabled() === false (활성화)
   *   - pageerror 없음
   *
   * NOTE: page.route() 미사용 — in-process mock 직접 응답.
   */
  test('T2: 셀 체크박스 토글 → 변경 1건 + 저장 버튼 활성', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()

    await test.step('MASTER 역할로 권한 매트릭스 페이지 진입', async () => {
      await page.goto(PERMISSION_MATRIX_URL_MASTER, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(2000)
    })

    await test.step('permission-matrix-table 로드 확인', async () => {
      const matrixTable = page.locator('[data-testid="permission-matrix-table"]')
      await expect(
        matrixTable,
        'permission-matrix-table 미표시 — 계정 선택 후 매트릭스 로드 실패',
      ).toBeVisible({ timeout: 8000 })
    })

    await test.step('perm-matrix-cell-* 첫 번째 체크박스 토글', async () => {
      const cellCheckboxes = page.locator('[data-testid^="perm-matrix-cell-"]')
      const cellCount = await cellCheckboxes.count()
      expect(
        cellCount,
        `perm-matrix-cell-* 체크박스가 없음 (${cellCount}개) — 매트릭스 미로드`,
      ).toBeGreaterThanOrEqual(1)

      const firstCell = cellCheckboxes.first()
      await firstCell.click()
      await page.waitForTimeout(300)
    })

    await test.step('perm-matrix-change-count "변경 1건" 확인', async () => {
      const changeCount = page.locator('[data-testid="perm-matrix-change-count"]')
      await expect(
        changeCount,
        'perm-matrix-change-count 미표시',
      ).toBeVisible({ timeout: 3000 })

      const text = (await changeCount.textContent()) ?? ''
      expect(
        text,
        `perm-matrix-change-count 텍스트 "${text}" — "변경" + 숫자 포함 필요`,
      ).toMatch(/변경\s*\d+건/)
      // 1건 이상임을 확인 (0건이면 토글 미반영)
      expect(
        text,
        `perm-matrix-change-count "${text}" — 토글 후 변경 0건이면 안 됨`,
      ).not.toMatch(/변경\s*0건/)
    })

    await test.step('perm-matrix-save-btn 활성화 확인', async () => {
      const saveBtn = page.locator('[data-testid="perm-matrix-save-btn"]')
      await expect(
        saveBtn,
        'perm-matrix-save-btn 미표시',
      ).toBeVisible({ timeout: 3000 })

      await expect(
        saveBtn,
        'perm-matrix-save-btn 비활성 — 체크박스 토글 후 활성화 필요',
      ).toBeEnabled()
    })

    await page.screenshot({
      path: path.join(QA_DIR, 'T2-toggle-dirty-save-enabled.png'),
      fullPage: true,
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T3: 토글 후 저장 → toast role="alert" 성공 메시지("저장" 포함) 표시
   *
   * 검증 항목:
   *   - 셀 토글 후 perm-matrix-save-btn 클릭
   *   - PUT /auth/admin/permissions/account/{id} mock 응답: { changedCount: N }
   *   - toast role="alert" 표시 + 텍스트에 "저장" 포함
   *   - mock PUT 응답: changedCount = updates.length → "N건의 권한 변경을 저장했습니다." 패턴
   *   - 저장 후 perm-matrix-change-count "변경 0건" 복귀 (invalidateQueries 재조회)
   *   - pageerror 없음
   *
   * NOTE: page.route() 미사용 — in-process mock 직접 응답.
   *       mock PUT: changedCount = Array.isArray(updates) ? updates.length : 0
   */
  test('T3: 저장 → toast 성공 메시지 + change-count 0건 복귀', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()

    await test.step('MASTER 역할로 권한 매트릭스 페이지 진입', async () => {
      await page.goto(PERMISSION_MATRIX_URL_MASTER, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(2000)
    })

    await test.step('permission-matrix-table 로드 확인', async () => {
      const matrixTable = page.locator('[data-testid="permission-matrix-table"]')
      await expect(
        matrixTable,
        'permission-matrix-table 미표시',
      ).toBeVisible({ timeout: 8000 })
    })

    await test.step('셀 체크박스 토글', async () => {
      const cellCheckboxes = page.locator('[data-testid^="perm-matrix-cell-"]')
      const cellCount = await cellCheckboxes.count()
      expect(
        cellCount,
        `perm-matrix-cell-* 체크박스 없음 (${cellCount}개)`,
      ).toBeGreaterThanOrEqual(1)

      await cellCheckboxes.first().click()
      await page.waitForTimeout(300)
    })

    await test.step('perm-matrix-save-btn 클릭', async () => {
      const saveBtn = page.locator('[data-testid="perm-matrix-save-btn"]')
      await expect(saveBtn, 'perm-matrix-save-btn 미표시').toBeVisible({ timeout: 3000 })
      await expect(saveBtn, 'perm-matrix-save-btn 비활성 — 저장 불가').toBeEnabled()
      await saveBtn.click()
    })

    await test.step('toast role="alert" 성공 메시지 확인', async () => {
      // PermissionMatrixPage.tsx: toast message = "${changedCount}건의 권한 변경을 저장했습니다."
      const toast = page.locator('[role="alert"]')
      await expect(
        toast,
        'toast role="alert" 미표시 — 저장 후 성공 메시지 필요',
      ).toBeVisible({ timeout: 5000 })

      const toastText = (await toast.textContent()) ?? ''
      expect(
        toastText,
        `toast 텍스트 "${toastText}" — "저장" 키워드 포함 필요`,
      ).toContain('저장')
    })

    await test.step('저장 후 perm-matrix-change-count "변경 0건" 복귀 확인', async () => {
      // invalidateQueries 후 재조회 완료 대기
      await page.waitForTimeout(2000)

      const changeCount = page.locator('[data-testid="perm-matrix-change-count"]')
      await expect(
        changeCount,
        'perm-matrix-change-count 미표시',
      ).toBeVisible({ timeout: 5000 })

      const text = (await changeCount.textContent()) ?? ''
      expect(
        text,
        `저장 후 perm-matrix-change-count "${text}" — "변경 0건" 복귀 필요`,
      ).toContain('변경 0건')
    })

    await page.screenshot({
      path: path.join(QA_DIR, 'T3-save-toast-change-count-reset.png'),
      fullPage: true,
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T4: SALES 역할 + OCR 권한 주입 → 사이드바 영수증 OCR 메뉴 표시
   *
   * 검증 항목 (현행 유지):
   *   - mockPerms 주입으로 purchases.receipt-ocr view=true 부여
   *   - 사이드바 영수증 OCR 메뉴(data-testid="sidebar-purchases-receipt-ocr") 표시
   *   - 해당 링크 disabled 아님
   *   - pageerror 없음
   */
  test('T4: SALES OCR 권한 주입 → 사이드바 영수증 OCR 메뉴 표시', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()

    const ocrGrantUrl = withMockPerms(RECEIPT_OCR_URL_SALES, [
      { pageCode: 'sales.slip.list', view: true, edit: true },
      { pageCode: 'purchases.receipt-ocr', view: true, edit: false },
    ])

    await test.step('SALES+OCR권한으로 OCR 영수증 페이지 진입', async () => {
      await page.goto(ocrGrantUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)
    })

    await test.step('사이드바 영수증 OCR 메뉴 표시 확인', async () => {
      const sidebarOcrLink = page.locator('[data-testid="sidebar-purchases-receipt-ocr"]')
      const linkVisible = await sidebarOcrLink.isVisible().catch(() => false)

      if (linkVisible) {
        await expect(
          sidebarOcrLink,
          '사이드바 영수증 OCR 링크 미표시',
        ).toBeVisible()

        const hasDisabledClass = await sidebarOcrLink.evaluate(el =>
          el.classList.contains('sidebar-disabled') ||
          el.closest('.sidebar-disabled') !== null,
        ).catch(() => false)
        expect(
          hasDisabledClass,
          '영수증 OCR 사이드바 메뉴가 disabled 상태',
        ).toBe(false)
      } else {
        // 사이드바 텍스트 fallback (OCR 텍스트 존재 여부)
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
            '사이드바 영수증 OCR 메뉴 미표시 — SALES OCR 권한 주입 후 표시 필요',
          ).toBe(true)
        } else {
          // 사이드바 자체 미표시 — 페이지 로드 실패로 간주하여 FAIL
          expect(
            sidebarVisible,
            '사이드바(nav/aside) 미표시 — 페이지 로드 실패',
          ).toBe(true)
        }
      }
    })

    await test.step('OCR 페이지 접근 성공 + 403 아님 확인', async () => {
      const bodyText = (await page.textContent('body')) ?? ''
      const isBlocked =
        bodyText.includes('403') ||
        bodyText.includes('접근 거부') ||
        page.url().includes('/forbidden')

      expect(
        isBlocked,
        'SALES OCR 영수증 페이지 접근 차단(403) — mockPerms OCR 권한 주입 후 접근 허용 필요',
      ).toBe(false)

      const pageLoaded =
        bodyText.includes('OCR') ||
        bodyText.includes('영수증') ||
        bodyText.includes('파일')
      expect(
        pageLoaded,
        'OCR 영수증 페이지 미로드 — OCR/영수증/파일 텍스트 없음',
      ).toBe(true)
    })

    await page.screenshot({
      path: path.join(QA_DIR, 'T4-sales-ocr-sidebar-visible.png'),
      fullPage: true,
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T5: 존재하지 않는 URL 직접 진입 → 404 (HashRouter 미매칭)
   *
   * 검증 항목 (현행 유지):
   *   - /#/admin/nonexistent-page-xyz-404 직접 진입
   *   - HashRouter 미매칭 → 404/에러 페이지 또는 login redirect
   *   - sidebar-disabled-overlay 미표시
   *   - pageerror 없음
   */
  test('T5: 존재하지 않는 URL → 404 (회색 disabled 화면 아님)', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()

    await test.step('존재하지 않는 해시 라우트 직접 진입', async () => {
      await page.goto(NONEXISTENT_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)
    })

    await test.step('404 또는 "없는 페이지" 표시 확인 — disabled 화면 아님', async () => {
      const bodyText = (await page.textContent('body')) ?? ''

      // sidebar-disabled-overlay 미표시 확인
      const disabledWrapper = page.locator('[data-testid="sidebar-disabled-overlay"]')
      const disabledOverlayVisible = await disabledWrapper.isVisible().catch(() => false)
      expect(
        disabledOverlayVisible,
        '존재하지 않는 URL 진입 시 sidebar-disabled-overlay 표시됨 — 404 페이지 필요',
      ).toBe(false)

      // 404 또는 login redirect 중 하나 허용
      const has404 =
        bodyText.includes('404') ||
        bodyText.includes('찾을 수 없') ||
        bodyText.includes('페이지가 없') ||
        bodyText.includes('Not Found') ||
        bodyText.includes('존재하지 않') ||
        bodyText.includes('No match') ||
        bodyText.includes('Unexpected Application Error')

      const isLoginPage =
        page.url().includes('/login') ||
        bodyText.includes('로그인') ||
        bodyText.includes('이메일') ||
        bodyText.includes('비밀번호')

      expect(
        has404 || isLoginPage,
        `존재하지 않는 URL 진입 결과 미확인 — 404/로그인 redirect 중 하나 필요. 본문: "${bodyText.substring(0, 200)}"`,
      ).toBe(true)
    })

    await page.screenshot({
      path: path.join(QA_DIR, 'T5-404-no-disabled-overlay.png'),
      fullPage: true,
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T6: MANAGER 권한 매트릭스 진입 → 403 또는 login redirect
   *
   * 검증 항목 (현행 유지):
   *   - mockRole=MANAGER 로 /#/admin/permission-matrix 진입
   *   - PermissionGuard(system.permission-admin) 차단 → 403/forbidden 또는 login redirect
   *   - permission-matrix-table / perm-matrix-save-btn 미표시
   *   - pageerror 없음
   *
   * NOTE: page.route() 미사용 — in-process mock 직접 처리.
   *       mock.ts: MANAGER 의 system.permission-admin { view: true } 로 설정돼 있어
   *       RoleGuard(MASTER 전용 여부) 에 따라 결과 달라질 수 있으므로 403/login 양쪽 허용.
   */
  test('T6: MANAGER 권한 매트릭스 진입 → 403 또는 login redirect', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()

    await test.step('MANAGER 역할로 권한 매트릭스 페이지 진입', async () => {
      await page.goto(PERMISSION_MATRIX_URL_MANAGER, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1500)
    })

    await test.step('403 접근 거부 또는 login redirect 확인', async () => {
      const forbiddenPage = page.locator('[data-testid="forbidden-page"]')
      const forbiddenVisible = await forbiddenPage.isVisible().catch(() => false)

      if (forbiddenVisible) {
        await expect(
          forbiddenPage,
          'MANAGER — 403 ForbiddenPage 표시 확인',
        ).toBeVisible({ timeout: 5000 })
      } else {
        const currentUrl = page.url()
        const bodyText = (await page.textContent('body')) ?? ''

        const is403 =
          currentUrl.includes('/forbidden') ||
          bodyText.includes('403') ||
          bodyText.includes('접근 거부') ||
          bodyText.includes('권한이 없') ||
          bodyText.includes('접근할 수 없')

        const isLoginRedirect =
          currentUrl.includes('/login') ||
          bodyText.includes('로그인') ||
          bodyText.includes('이메일')

        expect(
          is403 || isLoginRedirect,
          `MANAGER 권한 매트릭스 접근 차단 미작동 — URL: ${currentUrl}, 본문: "${bodyText.substring(0, 200)}"`,
        ).toBe(true)
      }
    })

    await test.step('권한 매트릭스 편집 UI 미표시 확인 (MANAGER)', async () => {
      const saveBtn = page.locator('[data-testid="perm-matrix-save-btn"]')
      const matrixTable = page.locator('[data-testid="permission-matrix-table"]')

      const saveBtnVisible = await saveBtn.isVisible().catch(() => false)
      const matrixTableVisible = await matrixTable.isVisible().catch(() => false)

      expect(
        saveBtnVisible,
        'MANAGER 403 화면에서 perm-matrix-save-btn 표시됨 — 미표시 필요',
      ).toBe(false)
      expect(
        matrixTableVisible,
        'MANAGER 403 화면에서 permission-matrix-table 표시됨 — 미표시 필요',
      ).toBe(false)
    })

    await page.screenshot({
      path: path.join(QA_DIR, 'T6-manager-403-forbidden.png'),
      fullPage: true,
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })
})
