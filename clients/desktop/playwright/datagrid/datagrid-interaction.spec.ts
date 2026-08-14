/**
 * datagrid-interaction.spec.ts
 *
 * DataGrid Excel-like 인터랙션 mock 회귀 hard gate (#851 슬라이스 1 재작성).
 *
 * ── 재작성 배경 (2026-07-26, #851 G2) ─────────────────────────────────────
 * 구 버전은 두 가지 이유로 "실행되는데 아무것도 검증하지 않는 게이트"였다:
 *   1. 경로만으로 goto (`/accounting/tax-invoices/batch?...`) — 렌더러는
 *      VITE_PLATFORM='web' 이 아니면 createHashRouter 라 해시가 비어
 *      대시보드로 떨어졌고, 7개 TC 전부 "DataGrid 셀 미발견" 상태였다.
 *   2. 셀 미발견 시 console.warn + body 길이 검사로 soft-pass — 커밋된 캡처
 *      파일명(TC-DG-1-no-grid-cells.png 등)이 그 증거였다.
 * 본 재작성은 해시 네비게이션(`/#/경로`)으로 실제 DataGrid 에 도달하고,
 * 모든 검증을 hard expect(셀 미발견 = RED)로 바꾼다. soft-pass 분기 금지.
 *
 * 대상 화면 (PR #161 이후 현행):
 *   - 4탭 일괄발행 워크플로는 HometaxExportPage(/accounting/hometax-export)로
 *     흡수됨. Tab 2 결과 페이지의 "Excel 보기" 토글이 DataGrid(enableMultiSelect
 *     + enableCopy)를 마운트한다. mock 미리보기 250행 → 파일당 100행 표시.
 *   - SalesQueryPage(/sales)의 "Excel 보기" 토글 (TC-DG-7 회귀 가드).
 *
 * 실행:
 *   cd clients/desktop
 *   npx playwright test playwright/datagrid/datagrid-interaction.spec.ts --reporter=line
 *   (playwright.config.ts webServer 가 VITE_MOCK_MODE=1 vite 를 자동 기동)
 *
 * 스크린샷: docs/qa/supplier-profile-and-grid-ux/_local/ (gitignore — 커밋된
 * 확정 증거 PNG 를 덮어쓰지 않는다. 승격은 QA_SHOTS_DIR 로 opt-in.)
 *
 * PR #156 회귀 가드: page.on('pageerror') 훅 의무 적용.
 *
 * TC 목록 (8건):
 *   TC-DG-1: 결과 탭 Excel 보기 → 셀 단일 클릭 → 정확히 1셀 선택
 *   TC-DG-2: Shift+클릭 → 사각형 범위 선택 (10행×3열 = 정확히 30셀)
 *   TC-DG-3: Ctrl+클릭 → 선택 토글 (1 → 2 → 1셀, 정확 수치)
 *   TC-DG-4: Ctrl+A → 현재 페이지 전체 셀 선택 (100행×17열 = 1,700셀)
 *   TC-DG-5: Ctrl+C → clipboard TSV 형식 + 셀 값 검증 (3×3 사각형)
 *   TC-DG-6: 열헤더 "공급받는자" 필터 → 텍스트 입력 → 정확히 20행으로 축소
 *   TC-DG-7: SalesQueryPage Excel 보기 동일 셀 선택 (회귀 가드)
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

// ---------------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------------

const _filename = fileURLToPath(import.meta.url)
const _dirname = path.dirname(_filename)

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

/** 스크린샷 저장 디렉토리 — 커밋 캡처 오염 방지(_local, gitignore). */
const QA_DIR = resolveQaShotsDir(
  path.resolve(_dirname, '../../../../docs/qa/2026-08-10-1156-r12'),
)

/** mock 미리보기(생성기 generateMockBatchRows) 고정 상수 — 검증 기대값의 근거. */
const HOMETAX = {
  /** Tab 2 파일당 표시 행 수 (HometaxExportPage PAGE_SIZE). */
  pageRows: 100,
  /** HOMETAX_GRID_COLUMNS 컬럼 수. */
  cols: 17,
  /** mock 거래처 5개 순환 → 100행 중 '○○종합건설' 은 정확히 20행. */
  filterName: '○○종합건설',
  filterMatch: 20,
  /** col index: 0=rowNo, 1=slipNo, 2=issueDate, 3=supplierName. */
      firstSlipNo: '2026/05/01-1',
  supplierName: '(주)삼한로지스',
} as const

// ---------------------------------------------------------------------------
// pageerror 훅 — PR #156 회귀 가드 의무
// ---------------------------------------------------------------------------

function attachPageErrorHook(page: Page, errors: string[]): void {
  page.on('pageerror', err => {
    errors.push(err.message)
  })
}

// ---------------------------------------------------------------------------
// DataGrid locator 헬퍼 — design-system DataGrid 실제 마크업 기준
//   wrapper: [data-testid="data-grid"] / td: data-row·data-col 속성
//   선택 셀: CSS module 클래스 `tdSelected` (해시 포함 → 부분 일치로 매칭)
// ---------------------------------------------------------------------------

const GRID = '[data-testid="data-grid"]'

function gridCells(page: Page) {
  return page.locator(`${GRID} tbody td[data-row]`)
}

function cellAt(page: Page, row: number, col: number) {
  return page.locator(`${GRID} tbody td[data-row="${row}"][data-col="${col}"]`)
}

function selectedCells(page: Page) {
  return page.locator(`${GRID} tbody td[data-row][class*="tdSelected"]`)
}

function gridRows(page: Page) {
  return page.locator(`${GRID} tbody tr`)
}

/** 클립보드 읽기/쓰기 권한 부여 (127.0.0.1 은 secure context). */
async function grantClipboardPermissions(context: BrowserContext): Promise<void> {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
}

/**
 * HometaxExportPage 결과 탭의 Excel 보기 DataGrid 를 연다.
 *
 * 1) 해시 라우팅으로 진입 (경로만 goto 하면 대시보드로 떨어진다 — 구 결함의 원인)
 * 2) Tab 1 미리보기 실행 (mock 250행) → 결과 탭 자동 전환 strict 검증
 * 3) "Excel 보기" 토글 → DataGrid 마운트 + 셀 로드 hard gate
 */
async function openHometaxResultGrid(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/#/accounting/hometax-export?mockRole=ACCOUNTANT`, {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  })

  // Tab 1 — 미리보기 생성 (tax-invoice-batch.spec runPreview 와 동일 절차)
  await page.getByTestId('hometax-export-tab-preview').click()
  await page.getByTestId('batch-preview-from').fill('2026-05-01')
  await page.getByTestId('batch-preview-to').fill('2026-05-31')
  await page.getByTestId('batch-preview-execute').click()
  await expect(
    page.getByTestId('hometax-export-tab-result'),
    '미리보기 실행 후 결과 탭 자동 활성 실패',
  ).toHaveAttribute('aria-selected', 'true', { timeout: 8000 })

  // Excel 보기 전환 → DataGrid 마운트
  await page.getByTestId('batch-result-grid-mode-btn').click()
  await expect(
    page.getByTestId('batch-result-datagrid'),
    'Excel 보기 DataGrid 컨테이너 미표시',
  ).toBeVisible({ timeout: 5000 })

  // 셀 로드 hard gate — 여기서 못 찾으면 RED (구 soft-pass 제거의 핵심)
  await expect(
    gridCells(page).first(),
    'DataGrid 셀 미발견 — 네비게이션/데이터 로드 실패는 RED',
  ).toBeVisible({ timeout: 10000 })
  await expect(
    gridCells(page),
    `결과 탭 1페이지 셀 수는 ${HOMETAX.pageRows}×${HOMETAX.cols} 이어야 함`,
  ).toHaveCount(HOMETAX.pageRows * HOMETAX.cols)
}

// ---------------------------------------------------------------------------
// TC-DG-1 ~ TC-DG-7
// ---------------------------------------------------------------------------

test.describe('DataGrid Excel-like 인터랙션 (TC-DG-1~8)', () => {

  /**
   * TC-DG-1: 셀 단일 클릭 → 정확히 1셀 선택.
   *
   * 기대 결과:
   *   - (0,1) 셀 클릭 → 선택 셀 수 == 1, 선택 셀 == 클릭한 셀
   *   - pageerror 없음
   */
  test('TC-DG-1: 셀 단일 클릭 → 1셀 선택', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await openHometaxResultGrid(page)

    await cellAt(page, 0, 1).click()
    await expect(
      selectedCells(page),
      '단일 클릭 시 선택 셀 수는 정확히 1',
    ).toHaveCount(1)
    await expect(
      cellAt(page, 0, 1),
      '클릭한 (0,1) 셀 자신이 선택 상태여야 함',
    ).toHaveClass(/tdSelected/)

    await page.screenshot({
      path: path.join(QA_DIR, 'TC-DG-1-cell-single-click-selected.png'),
      fullPage: true,
    })

    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-DG-2: Shift+클릭 → 사각형 범위 선택.
   *
   * 기대 결과:
   *   - (0,1) 클릭(anchor) → (9,3) Shift+클릭 → 10행×3열 = 정확히 30셀 선택
   *   - 사각형 꼭짓점 4개 모두 선택 상태
   *   - pageerror 없음
   */
  test('TC-DG-2: Shift+클릭 → 사각형 범위 선택', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await openHometaxResultGrid(page)

    await cellAt(page, 0, 1).click()
    await cellAt(page, 9, 3).click({ modifiers: ['Shift'] })

    await expect(
      selectedCells(page),
      'Shift+클릭 사각형 (0,1)-(9,3) 은 정확히 30셀',
    ).toHaveCount(30)
    for (const [r, c] of [[0, 1], [0, 3], [9, 1], [9, 3]] as const) {
      await expect(
        cellAt(page, r, c),
        `사각형 꼭짓점 (${r},${c}) 미선택`,
      ).toHaveClass(/tdSelected/)
    }

    await page.screenshot({
      path: path.join(QA_DIR, 'TC-DG-2-shift-click-range-select.png'),
      fullPage: true,
    })

    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-DG-3: Ctrl+클릭 → 선택 토글.
   *
   * 기대 결과:
   *   - (0,1) 클릭 → 1셀 → (2,2) Ctrl+클릭 → 2셀 → (2,2) 재 Ctrl+클릭 → 1셀
   *   - 토글 후 남는 선택은 (0,1)
   *   - pageerror 없음
   */
  test('TC-DG-3: Ctrl+클릭 → 선택 토글', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await openHometaxResultGrid(page)

    await cellAt(page, 0, 1).click()
    await expect(selectedCells(page), '기준 클릭 후 1셀').toHaveCount(1)

    await cellAt(page, 2, 2).click({ modifiers: ['ControlOrMeta'] })
    await expect(selectedCells(page), 'Ctrl+클릭 추가 후 2셀').toHaveCount(2)

    await cellAt(page, 2, 2).click({ modifiers: ['ControlOrMeta'] })
    await expect(selectedCells(page), 'Ctrl+클릭 토글 해제 후 1셀').toHaveCount(1)
    await expect(
      cellAt(page, 0, 1),
      '토글 해제 후 남는 선택은 (0,1) 이어야 함',
    ).toHaveClass(/tdSelected/)

    await page.screenshot({
      path: path.join(QA_DIR, 'TC-DG-3-ctrl-click-toggle.png'),
      fullPage: true,
    })

    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-DG-4: Ctrl+A → 현재 페이지 전체 셀 선택.
   *
   * 기대 결과:
   *   - 셀 클릭으로 그리드 focus 확보 → Ctrl+A → 100×17 = 정확히 1,700셀 선택
   *   - pageerror 없음
   */
  test('TC-DG-4: Ctrl+A → 전체 셀 선택', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await openHometaxResultGrid(page)

    // 셀 클릭 → wrapper focus (키보드 리스너는 focus 시에만 활성)
    await cellAt(page, 0, 1).click()
    await page.keyboard.press('Control+a')

    await expect(
      selectedCells(page),
      `Ctrl+A 는 현재 페이지 전체 ${HOMETAX.pageRows * HOMETAX.cols}셀을 선택해야 함`,
    ).toHaveCount(HOMETAX.pageRows * HOMETAX.cols)

    await page.screenshot({
      path: path.join(QA_DIR, 'TC-DG-4-ctrl-a-select-all.png'),
      fullPage: true,
    })

    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-DG-5: Ctrl+C → clipboard TSV 형식 + 값 검증.
   *
   * 기대 결과:
   *   - (0,1)-(2,3) 3×3 사각형 선택 → Ctrl+C
   *   - clipboard == 3행(\n 구분) × 각 행 3필드(\t 구분)
   *   - 1행 == [전표번호, 발행일자, 공급자] mock 고정값
   *   - pageerror 없음
   */
  test('TC-DG-5: Ctrl+C → clipboard TSV 형식 검증', async ({ page, context }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await grantClipboardPermissions(context)
    await openHometaxResultGrid(page)

    await cellAt(page, 0, 1).click()
    await cellAt(page, 2, 3).click({ modifiers: ['Shift'] })
    await expect(selectedCells(page), '3×3 사각형 = 9셀').toHaveCount(9)

    await page.keyboard.press('Control+c')

    // clipboard 쓰기는 비동기 — poll 로 TSV 도착을 기다린다 (soft-catch 금지)
    await expect
      .poll(
        async () => page.evaluate(() => navigator.clipboard.readText()),
        { message: 'Ctrl+C 후 clipboard 에 TSV 미도착', timeout: 5000 },
      )
      .toContain('\t')

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
    // useClipboard 는 \n 으로 쓰지만 Windows OS 클립보드 왕복이 \r\n 으로
    // 정규화한다(로컬 실측) — 플랫폼 무관 정확 검증을 위해 \r?\n 으로 분리.
    const lines = clipboardText.split(/\r?\n/)
    expect(lines, 'TSV 행 수는 정확히 3').toHaveLength(3)
    for (const line of lines) {
      expect(line.split('\t'), 'TSV 각 행 필드 수는 정확히 3').toHaveLength(3)
    }
    // mock 1행 고정값 — 전표번호 / 발행일자 / 공급자
    expect(lines[0], 'TSV 1행 셀 값 불일치').toBe(
      `${HOMETAX.firstSlipNo}\t20260501\t${HOMETAX.supplierName}`,
    )

    await page.screenshot({
      path: path.join(QA_DIR, 'TC-DG-5-ctrl-c-clipboard-tsv.png'),
      fullPage: true,
    })

    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-DG-6: 열헤더 필터 → 공급받는자(거래처) 텍스트 필터링.
   *
   * 기대 결과:
   *   - recipientName 열 필터 버튼 → 팝오버 → mock 거래처명 입력 → 적용
   *   - 100행 → 정확히 20행 (mock 5거래처 순환)으로 축소
   *   - 전체 셀에 해당 거래처명 노출, 타 거래처명 미노출
   *   - pageerror 없음
   */
  test('TC-DG-6: 열헤더 필터 → 공급받는자 필터링', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await openHometaxResultGrid(page)
    await expect(gridRows(page), '필터 전 100행').toHaveCount(HOMETAX.pageRows)

    await page.getByTestId('dg-filter-btn-buyerName').click()
    await expect(
      page.getByTestId('dg-filter-popover'),
      '열 필터 팝오버 미표시',
    ).toBeVisible({ timeout: 5000 })

    await page.getByTestId('dg-filter-text-input').fill(HOMETAX.filterName)
    await page.getByTestId('dg-filter-apply').click()

    await expect(
      gridRows(page),
      `'${HOMETAX.filterName}' 필터 후 정확히 ${HOMETAX.filterMatch}행`,
    ).toHaveCount(HOMETAX.filterMatch)
    // 필터 결과 무결성 — 남은 행은 전부 해당 거래처, 타 거래처는 0
    await expect(
      page.locator(`${GRID} tbody td[data-col="5"]`, { hasText: HOMETAX.filterName }),
      '필터 후 공급받는자 열은 전행 일치해야 함',
    ).toHaveCount(HOMETAX.filterMatch)
    await expect(
      page.locator(`${GRID} tbody td`, { hasText: '△△인테리어' }),
      '타 거래처 행이 필터를 통과하면 안 됨',
    ).toHaveCount(0)

    await page.screenshot({
      path: path.join(QA_DIR, 'TC-DG-6-column-filter-partner-name.png'),
      fullPage: true,
    })

    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-DG-7: SalesQueryPage Excel 보기 셀 선택 (회귀 가드).
   *
   * 기대 결과:
   *   - /sales 해시 진입 → 기간을 mock 데이터 구간(2026-05)으로 설정
   *   - "Excel 보기" 토글 → DataGrid 마운트 + 셀 존재 (미발견 = RED)
   *   - 번호 링크가 아닌 첫 데이터 셀(0,1) 클릭 → 정확히 1셀 선택
   *   - pageerror 없음
   */
  test('TC-DG-7: SalesQueryPage 셀 선택 동작 (회귀 가드)', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(`${BASE_URL}/#/sales?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })

    // mock 전표는 2026-05 월 구간에 고정 시드 — 기본 ±15일 범위와 무관하게 고정
    await page.getByLabel('시작 날짜').fill('2026-05-01')
    await page.getByLabel('종료 날짜').fill('2026-05-31')

    await page.getByTestId('sales-query-grid-mode-btn').click()
    await expect(
      page.getByTestId('sales-query-datagrid'),
      'SalesQuery Excel 보기 DataGrid 컨테이너 미표시',
    ).toBeVisible({ timeout: 5000 })

    await expect(
      gridCells(page).first(),
      'SalesQuery DataGrid 셀 미발견 — 데이터 로드 실패는 RED',
    ).toBeVisible({ timeout: 10000 })

    // (0,0)은 S2 번호 링크가 있는 액션 셀이다. 번호 클릭은 상세 이동 계약이고
    // 일반 DataGrid 셀 선택 계약과 겹치지 않으므로, 평문 거래처 셀(0,1)을 선택한다.
    const firstCell = cellAt(page, 0, 1)
    await firstCell.click()
    await expect(
      selectedCells(page),
      'SalesQuery 셀 단일 클릭 시 선택 셀 수는 정확히 1',
    ).toHaveCount(1)

    await page.screenshot({
      path: path.join(QA_DIR, 'TC-DG-7-sales-query-cell-select.png'),
      fullPage: true,
    })

    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  test('TC-DG-8: PurchaseQueryPage 평문 셀 선택 동작', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(`${BASE_URL}/#/purchases?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })

    await page.getByLabel('시작 날짜').fill('2026-05-01')
    await page.getByLabel('종료 날짜').fill('2026-05-31')
    await page.getByTestId('purchase-query-grid-mode-btn').click()
    await expect(page.getByTestId('purchase-query-datagrid')).toBeVisible({ timeout: 5000 })
    await expect(
      gridCells(page).first(),
      'PurchaseQuery DataGrid 셀 미발견 — 데이터 로드 실패는 RED',
    ).toBeVisible({ timeout: 10000 })

    const selectedCell = cellAt(page, 0, 1)
    await selectedCell.click()
    await expect(
      selectedCells(page),
      'PurchaseQuery 평문 셀 단일 클릭 시 선택 셀 수는 정확히 1',
    ).toHaveCount(1)
    await expect(selectedCell).toHaveClass(/tdSelected/)

    await page.screenshot({
      path: path.join(QA_DIR, 'TC-DG-8-purchase-query-cell-select.png'),
      fullPage: true,
    })
    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })
})
