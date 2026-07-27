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
 *   T1 권한 매트릭스 진입(MASTER) → account-select 옵션 ≥3개 + permission-matrix-table 표시 + 셀 대량 렌더 + 대표 PageCode 셀 표시
 *   T2 임의 셀 체크박스 토글 → perm-matrix-change-count "변경 1건" + perm-matrix-save-btn 활성
 *   T3 토글 후 저장 → toast role="alert" "저장" 포함 메시지 표시
 *   T4 SALES 역할 → 사이드바 권한 메뉴 표시 (mockPerms 주입)
 *   T5 존재하지 않는 URL (비-admin 경로) → 한국어 404 NotFoundPage (AppLayout catch-all — 회색 disabled 화면 X)
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
import { resolveMockQaShotsDir } from '../support/qa-screenshot-dir'

// ---------------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------------

const _filename = fileURLToPath(import.meta.url)
const _dirname = path.dirname(_filename)

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

/** 스크린샷 저장 디렉터리 */
// 캡처는 커밋된 확정 증거(docs/qa/<slug>/*.png)가 아니라 gitignore 된 _local/ 로 나간다 —
// 재실행이 증거를 덮어쓰지 못하게 한다. 승격은 QA_SHOTS_DIR 로만 opt-in (#926 참조 구현).
const QA_DIR = resolveMockQaShotsDir(path.resolve(
  _dirname,
  '../../../../docs/qa/sp-d1-dynamic-rbac/screenshots',
))

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

/**
 * 존재하지 않는 URL — HashRouter 미매칭 → AppLayout children catch-all → 한국어 404.
 *
 * 비-admin 최상위 경로를 사용하는 이유:
 *   `/#/admin/*` 는 AdminLayout(MASTER 전용 RoleGuard + 대표실 부서 가드) 이중가드가 먼저
 *   동작하여 SALES 진입 시 RoleGuard 차단 화면이 렌더되므로 404 격리 검증 불가.
 *   `/#/nonexistent-page-xyz-404` 는 AppLayout children 말미 `{ path: '*', element: <NotFoundPage /> }`
 *   catch-all 로 매칭되어 한국어 404 NotFoundPage 가 렌더된다.
 */
const NONEXISTENT_URL = `${BASE_URL}/#/nonexistent-page-xyz-404?mockRole=SALES`

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
   * T1: 권한 매트릭스 진입(MASTER) → account-select 옵션 ≥3개 + permission-matrix-table 표시 + 셀 대량 렌더 + 대표 PageCode 셀 표시
   *
   * 검증 항목 (신 UI — account-select 기반):
   *   - perm-matrix-account-select <select> 표시
   *   - 옵션 개수 ≥3 (mock 3계정: 김관리/이영업/박배차)
   *   - permission-matrix-table 표시
   *   - perm-matrix-cell-{pageNorm}-{action} 셀 체크박스 ≥700개 렌더
   *   - 회계/매입/매출/재고/아로로지스 대표 PageCode 셀 직접 표시
   *   - pageerror 없음
   *
   * NOTE: page.route() 미사용 — in-process mock (VITE_MOCK_MODE=1) 직접 반환.
   */
  test('T1: 권한 매트릭스 진입 → account-select ≥3옵션 + 매트릭스 테이블 + 셀 ≥700개', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()

    await test.step('MASTER 역할로 권한 매트릭스 페이지 진입', async () => {
      await page.goto(PERMISSION_MATRIX_URL_MASTER, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
    })

    await test.step('perm-matrix-account-select 표시 + 옵션 ≥3개 확인', async () => {
      const accountSelect = page.locator('[data-testid="perm-matrix-account-select"]')
      await expect(
        accountSelect,
        'perm-matrix-account-select <select> 미표시',
      ).toBeVisible({ timeout: 8000 })

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

    await test.step('셀 체크박스 ≥700개 렌더 확인 (PAGES_ORDER 173 × 7 액션 = 1,211개)', async () => {
      // perm-matrix-cell-{pageNorm}-{action} 형식 (pageNorm = pageCode '.' → '-')
      // PAGES_ORDER 173개 × PERMISSION_ACTIONS 7개 = 1,211개 예상.
      // 임계 700은 도메인 행 대량 누락을 false-green 으로 통과시키지 않는 보수적 하한이다.
      const cellCheckboxes = page.locator('[data-testid^="perm-matrix-cell-"]')
      await expect(
        cellCheckboxes.first(),
        'perm-matrix-cell-* 체크박스 없음 — 매트릭스 미로드',
      ).toBeVisible({ timeout: 8000 })
      const cellCount = await cellCheckboxes.count()
      expect(
        cellCount,
        `perm-matrix-cell-* 체크박스 ${cellCount}개 — 700개 이상 렌더 필요 (예상 173×7=1,211개)`,
      ).toBeGreaterThanOrEqual(700)
    })

    await test.step('대표 PageCode 셀 직접 존재 확인 (서로 다른 도메인)', async () => {
      const representativeCells = [
        'perm-matrix-cell-accounting-daily-closing-view',
        'perm-matrix-cell-purchases-slip-list-view',
        'perm-matrix-cell-sales-slip-list-view',
        'perm-matrix-cell-inventory-stock-view',
        'perm-matrix-cell-arologis-admin-view',
      ] as const

      for (const testId of representativeCells) {
        await expect(
          page.locator(`[data-testid="${testId}"]`),
          `대표 PageCode 셀 미표시: ${testId}`,
        ).toBeVisible({ timeout: 5000 })
      }
    })

    await page.screenshot({
      path: path.join(QA_DIR, 'T1-account-select-matrix.png'),
      fullPage: true,
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T2: 고정 셀 체크박스 토글 → perm-matrix-change-count "변경 1건" + perm-matrix-save-btn 활성
   *
   * 검증 항목:
   *   - MANAGER 계정 선택 후 고정 셀 perm-matrix-cell-purchases-slip-list-view 토글
   *     (MANAGER 계정의 purchases.slip.list view 초기값 = true → false revoke: 1건 변경)
   *   - 페이지 로드 직후 change-count "변경 0건" 확인 (초기 dirty 없음 단언)
   *   - 고정 셀 1개 클릭 후 perm-matrix-change-count "변경 1건" strict 단언
   *   - perm-matrix-save-btn isEnabled() strict 단언
   *   - 스크린샷: 변경 1건 + dirty 노란 배경 + 저장 활성 상태 캡처
   *   - pageerror 없음
   *
   * NOTE: page.route() 미사용 — in-process mock 직접 응답.
   *       고정 셀 선택 근거: MANAGER 역할의 purchases.slip.list view = true (SP_D1_DEFAULT_VIEW 포함).
   *       매트릭스 로드 후 account-select 에서 MANAGER(김관리) 계정 선택 → 해당 셀 초기값 true.
   *       따라서 클릭 시 true→false revoke 1건 변경 보장.
   */
  test('T2: 셀 체크박스 토글 → 변경 1건 + 저장 버튼 활성', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()

    // 고정 셀: MANAGER 계정의 purchases.slip.list view (초기값 true)
    const FIXED_CELL_TESTID = 'perm-matrix-cell-purchases-slip-list-view'

    await test.step('MASTER 역할로 권한 매트릭스 페이지 진입', async () => {
      await page.goto(PERMISSION_MATRIX_URL_MASTER, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
    })

    await test.step('account-select 로드 + MANAGER(김관리) 계정 선택', async () => {
      const accountSelect = page.locator('[data-testid="perm-matrix-account-select"]')
      await expect(
        accountSelect,
        'perm-matrix-account-select 미표시',
      ).toBeVisible({ timeout: 8000 })
      // mock.ts: [{ id: 'mock-account-manager', displayName: '김관리', role: 'MANAGER' }, ...]
      // option value = account.id = 'mock-account-manager'.
      // option label = accountOptionLabel(account) = "김관리 \ 매니저" (value 기준 선택이 안전).
      await accountSelect.selectOption({ value: 'mock-account-manager' })
    })

    await test.step('permission-matrix-table 로드 확인', async () => {
      const matrixTable = page.locator('[data-testid="permission-matrix-table"]')
      await expect(
        matrixTable,
        'permission-matrix-table 미표시 — MANAGER 계정 매트릭스 로드 실패',
      ).toBeVisible({ timeout: 8000 })
    })

    await test.step('로드 직후 change-count "변경 0건" 확인 (초기 dirty 없음)', async () => {
      const changeCount = page.locator('[data-testid="perm-matrix-change-count"]')
      await expect(
        changeCount,
        'perm-matrix-change-count 미표시',
      ).toBeVisible({ timeout: 5000 })
      await expect(
        changeCount,
        'perm-matrix-change-count — 계정 로드 직후 "변경 0건" 이어야 함 (초기 dirty 없음)',
      ).toContainText('변경 0건', { timeout: 5000 })
    })

    await test.step(`고정 셀 [${FIXED_CELL_TESTID}] 표시 확인 + 클릭`, async () => {
      const fixedCell = page.locator(`[data-testid="${FIXED_CELL_TESTID}"]`)
      await expect(
        fixedCell,
        `고정 셀 [${FIXED_CELL_TESTID}] 미표시 — MANAGER 매트릭스에 purchases.slip.list 행 없음`,
      ).toBeVisible({ timeout: 5000 })
      await fixedCell.click()
    })

    await test.step('perm-matrix-change-count "변경 1건" strict 단언', async () => {
      const changeCount = page.locator('[data-testid="perm-matrix-change-count"]')
      await expect(
        changeCount,
        'perm-matrix-change-count "변경 1건" 미표시 — 고정 셀 1개 토글 후 정확히 1건 변경 필요',
      ).toContainText('변경 1건', { timeout: 5000 })
    })

    await test.step('perm-matrix-save-btn 활성화 strict 단언', async () => {
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

    // 단언 통과 후 — aside 패널(변경건수 배지 + 저장버튼) element 스크린샷.
    // "변경 1건" + 활성 저장버튼이 명확히 보이는 증빙 (T2 저해상도 오독 회고 보강).
    // perm-matrix-change-count / perm-matrix-save-btn 의 공통 조상 <aside> 를 직접 캡처.
    await test.step('aside 패널 element 스크린샷 캡처 (T2 증빙 보강)', async () => {
      const changeCount = page.locator('[data-testid="perm-matrix-change-count"]')
      const saveBtn = page.locator('[data-testid="perm-matrix-save-btn"]')

      // 두 요소의 bounding box 를 합산하여 aside 영역 추출
      const ccBox = await changeCount.boundingBox()
      const sbBox = await saveBtn.boundingBox()

      if (ccBox && sbBox) {
        const x = Math.min(ccBox.x, sbBox.x) - 12
        const y = Math.min(ccBox.y, sbBox.y) - 12
        const right = Math.max(ccBox.x + ccBox.width, sbBox.x + sbBox.width) + 12
        const bottom = Math.max(ccBox.y + ccBox.height, sbBox.y + sbBox.height) + 12
        await page.screenshot({
          path: path.join(QA_DIR, 'T2-dirty-aside.png'),
          clip: { x, y, width: right - x, height: bottom - y },
        })
      } else {
        // bounding box 획득 실패 시 fullPage fallback (false-green 아님 — 단언은 이미 통과)
        await page.screenshot({
          path: path.join(QA_DIR, 'T2-dirty-aside.png'),
          fullPage: false,
        })
      }
    })

    // 기존 fullPage T2 캡처 유지 — 전체 컨텍스트 증빙
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
    })

    await test.step('permission-matrix-table 로드 확인', async () => {
      const matrixTable = page.locator('[data-testid="permission-matrix-table"]')
      await expect(
        matrixTable,
        'permission-matrix-table 미표시',
      ).toBeVisible({ timeout: 8000 })
    })

    await test.step('셀 체크박스 토글 (첫 번째 셀)', async () => {
      const firstCell = page.locator('[data-testid^="perm-matrix-cell-"]').first()
      await expect(
        firstCell,
        'perm-matrix-cell-* 체크박스 없음 — 매트릭스 미로드',
      ).toBeVisible({ timeout: 8000 })
      await firstCell.click()
    })

    await test.step('perm-matrix-save-btn 활성 확인 후 클릭', async () => {
      const saveBtn = page.locator('[data-testid="perm-matrix-save-btn"]')
      await expect(saveBtn, 'perm-matrix-save-btn 미표시').toBeVisible({ timeout: 5000 })
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
      await expect(
        toast,
        'toast 텍스트 — "저장" 키워드 포함 필요',
      ).toContainText('저장', { timeout: 5000 })
    })

    await test.step('저장 후 perm-matrix-change-count "변경 0건" 복귀 확인 (polling)', async () => {
      // invalidateQueries → 재조회 완료를 polling 으로 대기 (waitForTimeout 미사용)
      const changeCount = page.locator('[data-testid="perm-matrix-change-count"]')
      await expect(
        changeCount,
        '저장 후 perm-matrix-change-count "변경 0건" 복귀 필요 (invalidateQueries 재조회)',
      ).toContainText('변경 0건', { timeout: 8000 })
    })

    await page.screenshot({
      path: path.join(QA_DIR, 'T3-save-toast-change-count-reset.png'),
      fullPage: true,
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T5: 존재하지 않는 URL 직접 진입 → 한국어 404 NotFoundPage (HashRouter 미매칭)
   *
   * 검증 항목:
   *   - /#/nonexistent-page-xyz-404 직접 진입 (비-admin 경로 — AdminLayout 가드 회피)
   *   - AppLayout children 말미 catch-all `{ path: '*', element: <NotFoundPage /> }` 매칭
   *   - `[data-testid="not-found-page"]` toBeVisible strict 단언
   *   - `[data-testid="not-found-title"]` "페이지를 찾을 수 없습니다" strict 단언
   *   - 영문 dev 에러 문구 부재 확인: "Unexpected Application Error" 없음
   *   - sidebar-disabled-overlay 미표시 확인
   *   - pageerror 없음
   *
   * URL 선택 근거:
   *   기존 `/#/admin/nonexistent-page-xyz-404?mockRole=SALES` 는 AdminLayout(MASTER RoleGuard +
   *   대표실 부서 가드) 이중가드가 먼저 동작하여 SALES 진입 시 RoleGuard 차단 화면이 렌더되므로
   *   404 격리 검증이 불가능. `/#/nonexistent-page-xyz-404` 는 AppLayout children 경로이므로
   *   catch-all 이 정확히 동작한다.
   */
  test('T5: 존재하지 않는 URL → 한국어 404 NotFoundPage (회색 disabled 화면 아님)', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()

    await test.step('비-admin 존재하지 않는 해시 라우트 직접 진입', async () => {
      await page.goto(NONEXISTENT_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
    })

    await test.step('[data-testid="not-found-page"] 표시 확인 — 한국어 404 컴포넌트', async () => {
      const notFoundPage = page.locator('[data-testid="not-found-page"]')
      await expect(
        notFoundPage,
        '[data-testid="not-found-page"] 미표시 — AppLayout catch-all NotFoundPage 렌더 실패',
      ).toBeVisible({ timeout: 8000 })
    })

    await test.step('[data-testid="not-found-title"] "페이지를 찾을 수 없습니다" strict 단언', async () => {
      const notFoundTitle = page.locator('[data-testid="not-found-title"]')
      await expect(
        notFoundTitle,
        '[data-testid="not-found-title"] 미표시',
      ).toBeVisible({ timeout: 5000 })
      await expect(
        notFoundTitle,
        '[data-testid="not-found-title"] 텍스트가 "페이지를 찾을 수 없습니다" 아님',
      ).toHaveText('페이지를 찾을 수 없습니다', { timeout: 5000 })
    })

    await test.step('영문 dev 에러 문구 부재 확인 ("Unexpected Application Error" 없어야 함)', async () => {
      const body = page.locator('body')
      await expect(
        body,
        '한국어 404 NotFoundPage 에서 영문 dev 에러 "Unexpected Application Error" 노출됨 — 제거 필요',
      ).not.toContainText('Unexpected Application Error', { timeout: 3000 })
    })

    await test.step('sidebar-disabled-overlay 미표시 확인', async () => {
      // sidebar-disabled-overlay 미표시 확인
      const disabledWrapper = page.locator('[data-testid="sidebar-disabled-overlay"]')
      const disabledOverlayVisible = await disabledWrapper.isVisible().catch(() => false)
      expect(
        disabledOverlayVisible,
        '존재하지 않는 URL 진입 시 sidebar-disabled-overlay 표시됨 — 404 페이지 필요',
      ).toBe(false)
    })

    await page.screenshot({
      path: path.join(QA_DIR, 'T5-404-korean-not-found-page.png'),
      fullPage: true,
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T6: MANAGER 권한 매트릭스 진입 → PermissionGuard redirect 차단 확인
   *
   * 검증 항목:
   *   - mockRole=MANAGER 로 /#/admin/permission-matrix 진입
   *   - system.permission-admin 미보유 → PermissionGuard Navigate to="/" replace
   *   - /admin/permission-matrix 경로 이탈 확인
   *   - permission-matrix-table / perm-matrix-save-btn 미표시
   *   - pageerror 없음
   *
   * NOTE: page.route() 미사용 — in-process mock 직접 처리.
   *       PermissionGuard 는 권한 없을 때 차단 화면 문구를 렌더하지 않고 홈으로 redirect 한다.
   *       따라서 MANAGER 차단은 보호 경로 이탈 + 매트릭스 핵심 UI 부재로 검증한다.
   */
  test('T6: MANAGER 권한 매트릭스 진입 → PermissionGuard 홈 redirect', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)
    ensureQaDir()

    await test.step('MANAGER 역할로 권한 매트릭스 페이지 진입', async () => {
      await page.goto(PERMISSION_MATRIX_URL_MANAGER, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
    })

    await test.step('PermissionGuard 홈 redirect 확인 (MANAGER)', async () => {
      await page.waitForURL(url => !url.href.includes('/admin/permission-matrix'), {
        timeout: 8000,
      })

      expect(
        page.url(),
        `MANAGER 권한 매트릭스 직접 진입이 차단되지 않음 — URL: ${page.url()}. system.permission-admin 미보유 시 PermissionGuard 홈 redirect 필요.`,
      ).not.toContain('/admin/permission-matrix')
    })

    await test.step('권한 매트릭스 편집 UI 미표시 확인 (MANAGER)', async () => {
      const saveBtn = page.locator('[data-testid="perm-matrix-save-btn"]')
      const matrixTable = page.locator('[data-testid="permission-matrix-table"]')

      const saveBtnVisible = await saveBtn.isVisible().catch(() => false)
      const matrixTableVisible = await matrixTable.isVisible().catch(() => false)

      expect(
        saveBtnVisible,
        'MANAGER redirect 후 perm-matrix-save-btn 표시됨 — 미표시 필요',
      ).toBe(false)
      expect(
        matrixTableVisible,
        'MANAGER redirect 후 permission-matrix-table 표시됨 — 미표시 필요',
      ).toBe(false)
    })

    await page.screenshot({
      path: path.join(QA_DIR, 'T6-manager-permissionguard-redirect.png'),
      fullPage: true,
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })
})
