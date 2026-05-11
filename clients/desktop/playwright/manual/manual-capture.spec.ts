/**
 * 매뉴얼 PNG 자동 캡처 Playwright 스펙 — manual-capture.
 *
 * 목적: mock 모드(VITE_MOCK_MODE=1)에서 매뉴얼 본문 placeholder 를
 * 실제 PNG 로 교체하기 위해 각 라우트를 방문해 fullPage screenshot 저장.
 *
 * 캡처 대상 (우선순위):
 *   1. 회계 보고서 10건 (P0-1 Slice A/B/C — placeholder 잔존)
 *   2. P0-2 비밀번호 재설정 화면 2종
 *   3. P0-4 세금계산서 폼 / 인쇄 양식
 *   4. P0-5 관리자 화면 (사용자 관리)
 *   5. P0-6 거래처 4탭 등록
 *   6. P0-9 입고 검수 목록
 *   7. P1-3 안전재고 알림
 *   8. P1-5 배차 UI 3건 (신규 admin 라우트)
 *   9. P1-6 Excel 다운로드 버튼이 있는 list 페이지 4건
 *  10. P2 견적서 / 월말마감 / 매출마감 / 재고실사 대표 화면
 *
 * 실행:
 *   cd clients/desktop
 *   VITE_MOCK_MODE=1 npx vite --port 5173 &   # dev server
 *   npx playwright test playwright/manual/manual-capture.spec.ts \
 *     --reporter=line --timeout=60000
 *
 * 스크린샷 저장: docs/manual/screenshots/<섹션>/<파일명>.png
 *
 * 주의:
 *   - AUDIT_BASE_URL 환경 변수로 dev server 주소 재정의 가능.
 *   - Playwright 는 package.json devDependencies 에 없음.
 *     `npm i -D @playwright/test playwright` + `npx playwright install chromium` 필요.
 */
import { test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ---------------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------------

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5173'

/** docs/manual/screenshots 루트 (절대 경로) */
const MANUAL_SHOTS = path.resolve(
  __dirname,
  '../../../../docs/manual/screenshots',
)

const IDLE_TIMEOUT = 6_000
const SETTLE_WAIT = 1_500

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

/** hash 라우터 URL (mockRole query 포함, 추가 query 옵션) */
function url(routePath: string, role = 'MASTER', extraQuery = ''): string {
  const [pathPart, queryPart] = routePath.split('?')
  const base = `mockRole=${encodeURIComponent(role)}`
  const parts = [base, queryPart, extraQuery].filter(Boolean)
  return `${BASE_URL}/#${pathPart}?${parts.join('&')}`
}

/** 스크린샷 저장 (디렉토리 자동 생성) */
async function capture(
  page: Page,
  relPath: string,
): Promise<void> {
  const dest = path.join(MANUAL_SHOTS, relPath)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  await page.screenshot({ path: dest, fullPage: true })
}

/** 페이지 로드 후 settle 대기 */
async function gotoAndSettle(page: Page, targetUrl: string): Promise<void> {
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 })
  await page.waitForLoadState('networkidle', { timeout: IDLE_TIMEOUT }).catch(() => {})
  await page.waitForTimeout(SETTLE_WAIT)
}

// ---------------------------------------------------------------------------
// beforeAll: 디렉토리 생성
// ---------------------------------------------------------------------------

test.beforeAll(() => {
  fs.mkdirSync(MANUAL_SHOTS, { recursive: true })
})

// ===========================================================================
// 1. 회계 보고서 10건 (P0-1 Slice A/B/C)
//    placeholder 파일명: p0-1-*.png → docs/manual/screenshots/03-회계/
// ===========================================================================

test.describe('P0-1 회계 보고서 10건 캡처', () => {

  test('손익계산서 /accounting/reports/income-statement', async ({ page }) => {
    await gotoAndSettle(page, url('/accounting/reports/income-statement'))
    await capture(page, '03-회계/p0-1-income-statement.png')
  })

  test('재무상태표 /accounting/reports/balance-sheet', async ({ page }) => {
    await gotoAndSettle(page, url('/accounting/reports/balance-sheet'))
    await capture(page, '03-회계/p0-1-balance-sheet.png')
  })

  test('시산표 /accounting/balances', async ({ page }) => {
    await gotoAndSettle(page, url('/accounting/balances'))
    await capture(page, '03-회계/p0-1-trial-balance.png')
  })

  test('부가세 신고서 /accounting/reports/vat', async ({ page }) => {
    await gotoAndSettle(page, url('/accounting/reports/vat'))
    await capture(page, '03-회계/p0-1-vat-report.png')
  })

  test('법인세 신고서 /accounting/reports/corporate-tax', async ({ page }) => {
    await gotoAndSettle(page, url('/accounting/reports/corporate-tax'))
    await capture(page, '03-회계/p0-1-corporate-tax.png')
  })

  test('미수금 /accounting/reports/partner-aging?type=RECEIVABLE', async ({ page }) => {
    await gotoAndSettle(
      page,
      url('/accounting/reports/partner-aging', 'MASTER', 'type=RECEIVABLE'),
    )
    await capture(page, '03-회계/p0-1-partner-aging-receivable.png')
  })

  test('미지급금 /accounting/reports/partner-aging?type=PAYABLE', async ({ page }) => {
    await gotoAndSettle(
      page,
      url('/accounting/reports/partner-aging', 'MASTER', 'type=PAYABLE'),
    )
    await capture(page, '03-회계/p0-1-partner-aging-payable.png')
  })

  test('현금흐름표 /accounting/reports/cash-flow', async ({ page }) => {
    await gotoAndSettle(page, url('/accounting/reports/cash-flow'))
    await capture(page, '03-회계/p0-1-cash-flow.png')
  })

  test('자본변동표 /accounting/reports/equity-changes', async ({ page }) => {
    await gotoAndSettle(page, url('/accounting/reports/equity-changes'))
    await capture(page, '03-회계/p0-1-equity-changes.png')
  })

  test('일계표 /accounting/reports/daily-summary', async ({ page }) => {
    await gotoAndSettle(page, url('/accounting/reports/daily-summary'))
    await capture(page, '03-회계/p0-1-daily-summary.png')
  })

  test('월계표 /accounting/reports/monthly-summary', async ({ page }) => {
    await gotoAndSettle(page, url('/accounting/reports/monthly-summary'))
    await capture(page, '03-회계/p0-1-monthly-summary.png')
  })

})

// ===========================================================================
// 2. P0-2 비밀번호 재설정 (00-시작하기/01-로그인)
// ===========================================================================

test.describe('P0-2 비밀번호 재설정 화면 2종', () => {

  test('비밀번호 재설정 요청 /auth/password-reset', async ({ page }) => {
    // 공개 라우트 — mockRole 불필요
    await page.goto(`${BASE_URL}/#/auth/password-reset`, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    })
    await page.waitForLoadState('networkidle', { timeout: IDLE_TIMEOUT }).catch(() => {})
    await page.waitForTimeout(SETTLE_WAIT)
    await capture(page, '00-시작하기/p0-2-password-reset-request.png')
  })

  test('비밀번호 재설정 인증번호 /auth/password-reset/confirm', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/auth/password-reset/confirm`, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    })
    await page.waitForLoadState('networkidle', { timeout: IDLE_TIMEOUT }).catch(() => {})
    await page.waitForTimeout(SETTLE_WAIT)
    await capture(page, '00-시작하기/p0-2-password-reset-confirm.png')
  })

})

// ===========================================================================
// 3. P0-4 세금계산서 (03-회계/03-세금계산서)
// ===========================================================================

test.describe('P0-4 세금계산서 화면', () => {

  test('세금계산서 발행 폼 /accounting/tax-invoices/new', async ({ page }) => {
    await gotoAndSettle(page, url('/accounting/tax-invoices/new'))
    await capture(page, '03-회계/p0-4-tax-invoice-form.png')
  })

  test('세금계산서 인쇄 /accounting/tax-invoices/ti-001/print', async ({ page }) => {
    await gotoAndSettle(page, url('/accounting/tax-invoices/ti-001/print'))
    await capture(page, '03-회계/p0-4-tax-invoice-print.png')
  })

})

// ===========================================================================
// 4. P0-5 관리자 — 사용자 관리 모달 (00-시작하기 + 06-트러블슈팅)
// ===========================================================================

test.describe('P0-5 사용자 관리 화면', () => {

  test('사용자 목록 /admin/users', async ({ page }) => {
    await gotoAndSettle(page, url('/admin/users'))
    await capture(page, '00-시작하기/p0-5-admin-users.png')
  })

})

// ===========================================================================
// 5. P0-6 거래처 4탭 (01-영업/01-거래처-등록)
// ===========================================================================

test.describe('P0-6 거래처 4탭 등록', () => {

  test('거래처 목록 /admin/partners', async ({ page }) => {
    await gotoAndSettle(page, url('/admin/partners'))
    await capture(page, '01-영업/p0-6-partner-list.png')
  })

  test('거래처 신규 등록 /admin/partners/new', async ({ page }) => {
    await gotoAndSettle(page, url('/admin/partners/new', 'SALES'))
    await capture(page, '01-영업/p0-6-partner-new.png')
  })

})

// ===========================================================================
// 6. P0-9 입고 검수 (02-창고/01-입고-처리)
// ===========================================================================

test.describe('P0-9 입고 검수 dialog', () => {

  test('입고 검수 목록 /warehouse/inbound-inspections', async ({ page }) => {
    await gotoAndSettle(page, url('/warehouse/inbound-inspections', 'WAREHOUSE'))
    await capture(page, '02-창고/p0-9-inbound-inspection-list.png')
  })

})

// ===========================================================================
// 7. P1-3 안전재고 알림 (02-창고/03-재고-조회)
// ===========================================================================

test.describe('P1-3 안전재고 알림', () => {

  test('안전재고 알림 목록 /inventory/safety-stock-alerts', async ({ page }) => {
    await gotoAndSettle(page, url('/inventory/safety-stock-alerts'))
    await capture(page, '02-창고/p1-3-safety-stock-alerts.png')
  })

})

// ===========================================================================
// 8. P1-5 배차 UI 3건 (05-arologis)
// ===========================================================================

test.describe('P1-5 배차 admin 3건', () => {

  test('카카오톡 자동 배차 /arologis/admin/auto-dispatch', async ({ page }) => {
    await gotoAndSettle(page, url('/arologis/admin/auto-dispatch'))
    await capture(page, '05-arologis/p1-5-kakao-auto-dispatch.png')
  })

  test('수동 배차 admin /arologis/admin/manual-dispatch', async ({ page }) => {
    await gotoAndSettle(page, url('/arologis/admin/manual-dispatch'))
    await capture(page, '05-arologis/p1-5-manual-dispatch-admin.png')
  })

  test('기사 배정 /arologis/admin/driver-assignment', async ({ page }) => {
    await gotoAndSettle(page, url('/arologis/admin/driver-assignment'))
    await capture(page, '05-arologis/p1-5-driver-assignment.png')
  })

})

// ===========================================================================
// 9. P1-6 Excel 다운로드 버튼이 있는 list 페이지 4건
// ===========================================================================

test.describe('P1-6 Excel 다운로드 list 페이지', () => {

  test('출고전표 목록 /sales (Excel 버튼)', async ({ page }) => {
    await gotoAndSettle(page, url('/sales'))
    await capture(page, '01-영업/p1-6-sales-list-excel.png')
  })

  test('입고전표 목록 /purchases (Excel 버튼)', async ({ page }) => {
    await gotoAndSettle(page, url('/purchases', 'WAREHOUSE'))
    await capture(page, '02-창고/p1-6-purchases-list-excel.png')
  })

  test('분개 목록 /accounting/journals (Excel 버튼)', async ({ page }) => {
    await gotoAndSettle(page, url('/accounting/journals'))
    await capture(page, '03-회계/p1-6-journals-list-excel.png')
  })

  test('시산표 /accounting/balances (Excel 버튼)', async ({ page }) => {
    await gotoAndSettle(page, url('/accounting/balances'))
    await capture(page, '03-회계/p1-6-trial-balance-excel.png')
  })

})

// ===========================================================================
// 10. P2 4건 — 견적서 / 월말마감 / 매출마감 / 재고실사 대표 화면
// ===========================================================================

test.describe('P2 4건 대표 화면', () => {

  test('P2-1 견적서 목록 /sales/estimates', async ({ page }) => {
    await gotoAndSettle(page, url('/sales/estimates'))
    await capture(page, '01-영업/p2-1-estimate-list.png')
  })

  test('P2-1 견적서 신규 /sales/estimates/new', async ({ page }) => {
    await gotoAndSettle(page, url('/sales/estimates/new'))
    await capture(page, '01-영업/p2-1-estimate-form.png')
  })

  test('P2-3 월말 마감 /accounting/period-close', async ({ page }) => {
    await gotoAndSettle(page, url('/accounting/period-close'))
    await capture(page, '03-회계/p2-3-period-close.png')
  })

  test('P2-4 매출 마감 /sales/closing', async ({ page }) => {
    await gotoAndSettle(page, url('/sales/closing'))
    await capture(page, '02-창고/p2-4-sales-closing.png')
  })

  test('P2-6 재고 실사 목록 /warehouse/audit', async ({ page }) => {
    await gotoAndSettle(page, url('/warehouse/audit', 'WAREHOUSE'))
    await capture(page, '02-창고/p2-6-inventory-audit-list.png')
  })

  test('P2-6 재고 실사 신규 /warehouse/audit/new', async ({ page }) => {
    await gotoAndSettle(page, url('/warehouse/audit/new', 'WAREHOUSE'))
    await capture(page, '02-창고/p2-6-inventory-audit-form.png')
  })

})
