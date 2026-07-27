/**
 * 세금계산서 일괄발행 (GAS 이식) Playwright 스펙 — tax-invoice-batch-gas-port
 *
 * 실행 조건:
 *   cd clients/desktop
 *   VITE_MOCK_MODE=1 npx vite --port 5173  (별도 터미널)
 *   npx playwright test playwright/tax-invoice-batch/tax-invoice-batch.spec.ts --reporter=line
 *
 * dev server 미가용 시 모든 UI 테스트 자동 SKIP.
 * 스크린샷 저장: docs/qa/tax-invoice-batch-gas-port/*.png
 *
 * PR #156 회귀 가드: page.on('pageerror') 훅 의무 적용.
 *
 * TC 목록 (7건):
 *   TC-TIB-1: /accounting/tax-invoices/batch 진입 → 4탭 visible
 *   TC-TIB-2: Tab 1 날짜 + 처리 실행 → totalRowCount + Tab 2 자동 이동
 *   TC-TIB-3: Tab 2 250 mock row → splitFileCount=3 + 페이지 navigation + Excel 다운로드
 *   TC-TIB-4: Tab 3 제외 거래처 add/list/delete 인터랙션
 *   TC-TIB-5: Tab 4 이력 목록 표시 + 행 클릭 → Tab 2 복원
 *   TC-TIB-6: 사이드바 "세금계산서 일괄발행" NavLink visible (ACCOUNTANT 이상)
 *   TC-TIB-7: TaxInvoiceListPage 우측 상단 "일괄 발행" 버튼 → 클릭 시 /accounting/tax-invoices/batch 이동
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

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5173'

/** 스크린샷 저장 디렉토리 */
// 캡처는 커밋된 확정 증거(docs/qa/<slug>/*.png)가 아니라 gitignore 된 _local/ 로 나간다 —
// 재실행이 증거를 덮어쓰지 못하게 한다. 승격은 QA_SHOTS_DIR 로만 opt-in (#926 참조 구현).
const QA_DIR = resolveMockQaShotsDir(path.resolve(
  _dirname,
  '../../../../docs/qa/tax-invoice-batch-gas-port',
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
// pageerror 훅 — PR #156 회귀 가드
// ---------------------------------------------------------------------------

/** 각 테스트 페이지에 pageerror 훅 등록 */
function attachPageErrorHook(page: Page, errors: string[]): void {
  page.on('pageerror', err => {
    errors.push(err.message)
  })
}

// ---------------------------------------------------------------------------
// 공통 탭 레이블 (4탭)
// ---------------------------------------------------------------------------

// PR #161 4탭 워크플로는 HometaxExportPage(/accounting/hometax-export)로 흡수됨.
// 탭 라벨도 HometaxExportPage 기준('전표 필터'→'거래처 필터링').
const HOMETAX_URL = `${BASE_URL}/#/accounting/hometax-export`

const TAB_LABELS = [
  '미리보기 생성',
  '결과 페이지',
  '거래처 필터링',
  '저장 내역',
]

/** hometax-export 미리보기 생성 실행 → 결과 탭 자동 전환까지 수행. */
async function runPreview(page: Page): Promise<void> {
  await page.getByTestId('hometax-export-tab-preview').click()
  await page.waitForTimeout(400)
  await page.getByTestId('batch-preview-from').fill('2026-05-01')
  await page.getByTestId('batch-preview-to').fill('2026-05-31')
  await page.getByTestId('batch-preview-execute').click()
  // 성공 시 결과 탭 자동 활성 (handlePreviewSuccess → setActiveTab('result')).
  await expect(
    page.getByTestId('hometax-export-tab-result'),
    '미리보기 실행 후 결과 탭 자동 활성 실패',
  ).toHaveAttribute('aria-selected', 'true', { timeout: 8000 })
}

// ---------------------------------------------------------------------------
// TC-TIB-1 ~ TC-TIB-7
// ---------------------------------------------------------------------------

test.describe('세금계산서 일괄발행 페이지 (TC-TIB-1~7)', () => {

  test.skip(SKIP_UI, 'dev server 미가용 — VITE_MOCK_MODE=1 npx vite --port 5173 후 PLAYWRIGHT_SKIP_UI=0 으로 재시도')

  test.beforeEach(async () => {
    const ok = await isServerAvailable()
    // false green 방지(SP-09 패턴) — dev server 미가용 시 skip 이 아닌 FAIL.
    expect(ok, `dev server 미접근: ${BASE_URL}`).toBe(true)
  })

  /**
   * TC-TIB-1: /accounting/tax-invoices/batch 진입 → 4탭 모두 visible
   *
   * 기대 결과:
   *   - 탭 영역에 "미리보기 생성" / "결과 페이지" / "전표 필터" / "저장 내역" 4개 탭 텍스트 노출
   *   - pageerror 없음
   */
  test('TC-TIB-1: hometax-export 워크플로 4탭 visible', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(`${HOMETAX_URL}?mockRole=ACCOUNTANT`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await page.waitForTimeout(1200)

    // 워크플로 4탭 버튼 testid 가시 (result 탭은 미리보기 전 disabled 이나 렌더는 됨).
    for (const id of ['preview', 'result', 'exclusions', 'history']) {
      await expect(
        page.getByTestId(`hometax-export-tab-${id}`),
        `탭 버튼 미표시: hometax-export-tab-${id}`,
      ).toBeVisible({ timeout: 5000 })
    }
    // 4탭 라벨 텍스트 검증 (PR #161 이후 라벨: 거래처 필터링).
    for (const label of TAB_LABELS) {
      await expect(
        page.getByText(label, { exact: false }).first(),
        `탭 라벨 미표시: ${label}`,
      ).toBeVisible({ timeout: 5000 })
    }

    ensureQaDir()
    await page.screenshot({
      path: path.join(QA_DIR, 'TC-TIB-1-batch-4tabs-visible.png'),
      fullPage: true,
    })

    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-TIB-2: Tab 1 → 날짜 from/to + "처리 실행" → BE 호출 → totalRowCount 표시 → Tab 2 자동 이동
   *
   * 기대 결과:
   *   - fromDate / toDate 입력 후 "처리 실행" 버튼 클릭
   *   - 응답 후 totalRowCount 숫자 노출 (mock 데이터 기준)
   *   - "결과 페이지" 탭이 활성화되거나 결과 테이블 영역 노출
   *   - pageerror 없음
   */
  test('TC-TIB-2: 미리보기 생성 → totalRowCount 250 + 결과 탭 자동 이동', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(`${HOMETAX_URL}?mockRole=ACCOUNTANT`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await page.waitForTimeout(1200)

    // 미리보기 실행 → 결과 탭 자동 전환(헬퍼 내 strict 검증).
    await runPreview(page)

    // 결과 탭에 전체 250건(mock MOCK_BATCH_ROWS=250) 표시 — strict.
    const body = (await page.textContent('body')) ?? ''
    expect(
      body.includes('250건'),
      `미리보기 totalRowCount 250건 미표시 — body 일부: "${body.slice(0, 200)}"`,
    ).toBe(true)

    ensureQaDir()
    await page.screenshot({
      path: path.join(QA_DIR, 'TC-TIB-2-batch-execute-result.png'),
      fullPage: true,
    })

    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-TIB-3: Tab 2 → 250 mock row → splitFileCount=3 → 페이지 navigation 검증 + Excel 다운로드
   *
   * 기대 결과:
   *   - "결과 페이지" 탭 활성 시 행 목록 표시
   *   - splitFileCount=3 → "파일 1", "파일 2", "파일 3" 또는 파일 인덱스 navigation 노출
   *   - "Excel 다운로드" 버튼 클릭 → download 이벤트 발생 (blob)
   *   - pageerror 없음
   */
  test('TC-TIB-3: 결과 splitFileCount=3 + Excel 다운로드', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(`${HOMETAX_URL}?mockRole=ACCOUNTANT`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await page.waitForTimeout(1200)

    // 미리보기 실행 → 결과 탭. mock MOCK_BATCH_ROWS=250 → splitFileCount=3.
    // 다운로드 버튼은 현재 fileIndex 1개만 렌더되고 ◄ ► 네비게이션으로 전환된다(0-based).
    await runPreview(page)

    // splitFileCount=3 표시 검증 ("파일 3개" + "1 / 3" 네비게이션).
    const body = (await page.textContent('body')) ?? ''
    expect(body.includes('파일 3개'), 'splitFileCount=3(파일 3개) 미표시').toBe(true)
    await expect(
      page.getByTestId('batch-result-download-0'),
      '현재 분할 파일(1/3) 다운로드 버튼 미표시',
    ).toBeVisible({ timeout: 8000 })

    // 첫 분할 파일 다운로드 이벤트 캡처 + .xlsx 파일명 검증.
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 8000 }),
      page.getByTestId('batch-result-download-0').click(),
    ])
    expect(
      download.suggestedFilename(),
      `다운로드 파일명 Excel(.xlsx) 아님: ${download.suggestedFilename()}`,
    ).toContain('.xlsx')

    // 다음 파일(2/3) 네비게이션 → download-1 노출(분할 navigation 동작 검증).
    await page.getByRole('button', { name: '다음 파일' }).click()
    await expect(
      page.getByTestId('batch-result-download-1'),
      '다음 파일 네비게이션 후 2/3 다운로드 버튼 미표시',
    ).toBeVisible({ timeout: 5000 })

    ensureQaDir()
    await page.screenshot({
      path: path.join(QA_DIR, 'TC-TIB-3-batch-tab2-split-excel.png'),
      fullPage: true,
    })

    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-TIB-4: Tab 3 → 제외 거래처 add / list / delete 인터랙션
   *
   * 기대 결과:
   *   - "전표 필터" 탭 클릭 → 제외 거래처 입력 폼 또는 목록 노출
   *   - 거래처 코드 입력 → 추가 버튼 클릭 → 목록에 코드 노출
   *   - 삭제 버튼 클릭 → 목록에서 제거
   *   - pageerror 없음
   */
  test('TC-TIB-4: 거래처 필터링 add/list/delete', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(`${HOMETAX_URL}?mockRole=ACCOUNTANT`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await page.waitForTimeout(1200)

    // 거래처 필터링(제외 거래처) 탭 → seed 제외 거래처(P-EX-001) 표시.
    await page.getByTestId('hometax-export-tab-exclusions').click()
    await page.waitForTimeout(600)
    await expect(
      page.getByText('P-EX-001', { exact: false }).first(),
      'seed 제외 거래처(P-EX-001) 미표시',
    ).toBeVisible({ timeout: 5000 })

    // 신규 제외 거래처 추가 → stateful mock 목록 반영.
    const NEW_CODE = 'P-QA-9001'
    await page.getByTestId('exclusion-add-code').fill(NEW_CODE)
    await page.getByTestId('exclusion-add-name').fill('큐에이제외상사')
    await page.getByTestId('exclusion-add-reason').fill('QA 테스트 제외')
    await page.getByTestId('exclusion-add-submit').click()
    await page.waitForTimeout(800)
    await expect(
      page.getByText(NEW_CODE, { exact: false }).first(),
      `추가한 제외 거래처(${NEW_CODE}) 목록 미표시`,
    ).toBeVisible({ timeout: 5000 })

    // 삭제 → 목록에서 제거.
    await page.getByTestId(`exclusion-delete-${NEW_CODE}`).click()
    await page.waitForTimeout(800)
    await expect(
      page.getByText(NEW_CODE, { exact: false }),
      `삭제 후에도 제외 거래처(${NEW_CODE}) 잔존`,
    ).toHaveCount(0)

    ensureQaDir()
    await page.screenshot({
      path: path.join(QA_DIR, 'TC-TIB-4-batch-tab3-exclusion.png'),
      fullPage: true,
    })

    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-TIB-5: Tab 4 → 이력 목록 표시 + 행 클릭 → Tab 2 데이터 복원
   *
   * 기대 결과:
   *   - "저장 내역" 탭 클릭 → 이력 목록 테이블 노출
   *   - 이력 행(배치번호 / 처리일시 / 행 수) 표시
   *   - 이력 행 클릭 → "결과 페이지" 탭이 활성화되거나 row 데이터 복원
   *   - pageerror 없음
   */
  test('TC-TIB-5: 저장 내역 행 클릭 → 결과 탭 복원', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(`${HOMETAX_URL}?mockRole=ACCOUNTANT`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await page.waitForTimeout(1200)

    // 저장 내역 탭 → 이력 행(mock MOCK_BATCH_HISTORIES 10건) 표시.
    await page.getByTestId('hometax-export-tab-history').click()
    await page.waitForTimeout(800)
    const firstRow = page.locator('[data-testid^="history-row-"]').first()
    await expect(firstRow, '저장 내역 이력 행(history-row-*) 미표시').toBeVisible({ timeout: 5000 })

    // 행 클릭 → 단건 복원(GET /history/{id}) → 결과 탭 자동 활성(handleHistoryRestore).
    await firstRow.click()
    await expect(
      page.getByTestId('hometax-export-tab-result'),
      '이력 복원 후 결과 탭 자동 활성 실패',
    ).toHaveAttribute('aria-selected', 'true', { timeout: 8000 })

    // 복원된 결과에 전체 250건 표시.
    const body = (await page.textContent('body')) ?? ''
    expect(
      body.includes('250건'),
      `복원된 결과 totalRowCount 250건 미표시 — body 일부: "${body.slice(0, 200)}"`,
    ).toBe(true)

    ensureQaDir()
    await page.screenshot({
      path: path.join(QA_DIR, 'TC-TIB-5-batch-tab4-history.png'),
      fullPage: true,
    })

    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-TIB-6: 사이드바 → 회계 카테고리 "세금계산서 일괄발행" NavLink visible (ACCOUNTANT 이상)
   *
   * 기대 결과:
   *   - mockRole=ACCOUNTANT 로 진입 시 사이드바에 "세금계산서 일괄발행" 링크 노출
   *   - href 또는 data-testid 가 /accounting/tax-invoices/batch 를 가리킴
   *   - pageerror 없음
   */
  test('TC-TIB-6: 사이드바 "홈택스 일괄 양식" NavLink visible (ACCOUNTANT)', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    // 회계 카테고리가 펼쳐지도록 회계 하위 페이지로 진입.
    await page.goto(`${BASE_URL}/#/accounting/tax-invoices?mockRole=ACCOUNTANT`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await page.waitForTimeout(1200)

    // PR #161 이후 4탭 워크플로 진입점은 사이드바 "홈택스 일괄 양식"(→ /accounting/hometax-export).
    const navLink = page.getByTestId('sidebar-accounting-hometax-export')
    await expect(
      navLink,
      '사이드바 "홈택스 일괄 양식" NavLink 미노출 (ACCOUNTANT — accounting.partner-ledger 권한)',
    ).toBeVisible({ timeout: 5000 })
    await expect(navLink, 'NavLink 라벨 불일치').toContainText('홈택스 일괄 양식')

    // 클릭 → hometax-export 4탭 페이지 진입.
    await navLink.click()
    await page.waitForURL(/hometax-export/, { timeout: 5000 })
    await expect(
      page.getByTestId('hometax-export-tab-preview'),
      'NavLink 클릭 후 hometax-export 워크플로 페이지 미진입',
    ).toBeVisible({ timeout: 5000 })

    ensureQaDir()
    await page.screenshot({
      path: path.join(QA_DIR, 'TC-TIB-6-sidebar-batch-navlink.png'),
      fullPage: true,
    })

    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-TIB-7: TaxInvoiceListPage 우측 상단 "일괄 발행" 버튼 → /accounting/tax-invoices/batch 이동
   *
   * 기대 결과:
   *   - /accounting/tax-invoices 페이지 진입 → "일괄 발행" 버튼 노출
   *   - 클릭 시 /accounting/tax-invoices/batch 로 navigate
   *   - pageerror 없음
   */
  test('TC-TIB-7: TaxInvoiceListPage 일괄 발행 버튼 → hometax-export 이동', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(`${BASE_URL}/#/accounting/tax-invoices?mockRole=ACCOUNTANT`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await page.waitForTimeout(1200)

    // "일괄 발행 (홈택스 양식)" 버튼 — PR #161 이후 /accounting/hometax-export 로 navigate.
    const batchBtn = page.getByTestId('tax-invoice-batch-button')
    await expect(batchBtn, '일괄 발행 버튼(tax-invoice-batch-button) 미표시').toBeVisible({ timeout: 5000 })

    await batchBtn.click()
    await page.waitForURL(/hometax-export/, { timeout: 5000 })
    // 4탭 워크플로 페이지 진입 확인.
    await expect(
      page.getByTestId('hometax-export-tab-preview'),
      '일괄 발행 버튼 클릭 후 hometax-export 워크플로 페이지 미진입',
    ).toBeVisible({ timeout: 5000 })

    ensureQaDir()
    await page.screenshot({
      path: path.join(QA_DIR, 'TC-TIB-7-list-to-batch-navigate.png'),
      fullPage: true,
    })

    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })
})
