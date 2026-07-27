import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
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
 * 에러 보고서:  docs/qa/manual-page-errors.md
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

/**
 * dev server 가용 여부 — false green 방지 가드.
 */
async function isServerAvailable(): Promise<boolean> {
  try {
    const url = new URL(BASE_URL)
    const http = await import('http')
    return new Promise(resolve => {
      const req = http.default.get(
        { hostname: url.hostname, port: Number(url.port) || 80, path: '/', timeout: 2_000 },
        res => { resolve(true); res.resume() },
      )
      req.on('error', () => resolve(false))
      req.on('timeout', () => { req.destroy(); resolve(false) })
    })
  } catch {
    return false
  }
}

/** docs/manual/screenshots 루트 (절대 경로) */
const MANUAL_SHOTS = resolveQaShotsDir(path.resolve(
  __dirname,
  '../../../../docs/manual/screenshots',
))

/** 페이지 에러 누적 보고서 경로 */
const ERROR_REPORT = path.join(
  resolveQaShotsDir(path.resolve(__dirname, '../../../../docs/qa')),
  'manual-page-errors.md',
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

/**
 * 콘솔/페이지 에러 수집기 — page.on 등록 후 수집된 에러 배열 반환 함수를 돌려줌.
 * 각 test 내에서 gotoAndSettle 이전에 호출하여 에러를 추적.
 */
function attachErrorCollector(page: Page): () => string[] {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`)
  })
  return () => errors
}

/**
 * 페이지 에러를 docs/qa/manual-page-errors.md 에 누적 기록.
 * 에러가 없으면 아무 것도 기록하지 않음.
 */
function reportErrors(routeName: string, errors: string[]): void {
  if (errors.length === 0) return
  fs.mkdirSync(path.dirname(ERROR_REPORT), { recursive: true })
  fs.appendFileSync(
    ERROR_REPORT,
    `\n## ${routeName}\n${errors.map((e) => `- ${e}`).join('\n')}\n`,
    'utf8',
  )
}

/** 페이지 로드 후 settle 대기 */
async function gotoAndSettle(page: Page, targetUrl: string): Promise<void> {
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 })
  await page.waitForLoadState('networkidle', { timeout: IDLE_TIMEOUT }).catch(() => {})
  await page.waitForTimeout(SETTLE_WAIT)
}

// ---------------------------------------------------------------------------
// beforeAll: 디렉토리 생성 + 보고서 초기화
// ---------------------------------------------------------------------------

test.beforeAll(async () => {
  fs.mkdirSync(MANUAL_SHOTS, { recursive: true })
  fs.mkdirSync(path.dirname(ERROR_REPORT), { recursive: true })
  // 실행마다 보고서 초기화
  fs.writeFileSync(
    ERROR_REPORT,
    '# 매뉴얼 페이지 런타임 에러 보고서\n\n생성일: ' + new Date().toISOString() + '\n',
    'utf8',
  )
  const ok = await isServerAvailable()
  if (!ok) {
    // eslint-disable-next-line no-console
    console.warn(`[manual-capture] dev server 미가동 (${BASE_URL}) — 전체 캡처 skip 예정`)
  }
})

// dev server 가용성 가드 — 모든 describe 에 공통 적용
// (최상위 beforeEach 는 모든 test 에 적용됨)
test.beforeEach(async () => {
  const ok = await isServerAvailable()
  test.skip(!ok, `dev server 미가동: ${BASE_URL} — VITE_MOCK_MODE=1 npx vite --port 5173 후 재시도`)
})

// ===========================================================================
// 1. 회계 보고서 10건 (P0-1 Slice A/B/C)
//    placeholder 파일명: p0-1-*.png → docs/manual/screenshots/03-회계/
// ===========================================================================

test.describe('P0-1 회계 보고서 10건 캡처', () => {

  test('손익계산서 /accounting/reports/income-statement', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/accounting/reports/income-statement'))
    await capture(page, '03-회계/p0-1-income-statement.png')
    reportErrors('손익계산서 /accounting/reports/income-statement', getErrors())
  })

  test('재무상태표 /accounting/reports/balance-sheet', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/accounting/reports/balance-sheet'))
    await capture(page, '03-회계/p0-1-balance-sheet.png')
    reportErrors('재무상태표 /accounting/reports/balance-sheet', getErrors())
  })

  test('시산표 /accounting/balances', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/accounting/balances'))
    await capture(page, '03-회계/p0-1-trial-balance.png')
    reportErrors('시산표 /accounting/balances', getErrors())
  })

  test('부가세 신고서 /accounting/reports/vat', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/accounting/reports/vat'))
    await capture(page, '03-회계/p0-1-vat-report.png')
    reportErrors('부가세 신고서 /accounting/reports/vat', getErrors())
  })

  test('법인세 신고서 /accounting/reports/corporate-tax', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/accounting/reports/corporate-tax'))
    await capture(page, '03-회계/p0-1-corporate-tax.png')
    reportErrors('법인세 신고서 /accounting/reports/corporate-tax', getErrors())
  })

  test('미수금 /accounting/reports/partner-aging?type=RECEIVABLE', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(
      page,
      url('/accounting/reports/partner-aging', 'MASTER', 'type=RECEIVABLE'),
    )
    await capture(page, '03-회계/p0-1-partner-aging-receivable.png')
    reportErrors('미수금 /accounting/reports/partner-aging?type=RECEIVABLE', getErrors())
  })

  test('미지급금 /accounting/reports/partner-aging?type=PAYABLE', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(
      page,
      url('/accounting/reports/partner-aging', 'MASTER', 'type=PAYABLE'),
    )
    await capture(page, '03-회계/p0-1-partner-aging-payable.png')
    reportErrors('미지급금 /accounting/reports/partner-aging?type=PAYABLE', getErrors())
  })

  test('현금흐름표 /accounting/reports/cash-flow', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/accounting/reports/cash-flow'))
    await capture(page, '03-회계/p0-1-cash-flow.png')
    reportErrors('현금흐름표 /accounting/reports/cash-flow', getErrors())
  })

  test('자본변동표 /accounting/reports/equity-changes', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/accounting/reports/equity-changes'))
    await capture(page, '03-회계/p0-1-equity-changes.png')
    reportErrors('자본변동표 /accounting/reports/equity-changes', getErrors())
  })

  test('일계표 /accounting/reports/daily-summary', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/accounting/reports/daily-summary'))
    await capture(page, '03-회계/p0-1-daily-summary.png')
    reportErrors('일계표 /accounting/reports/daily-summary', getErrors())
  })

  test('월계표 /accounting/reports/monthly-summary', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/accounting/reports/monthly-summary'))
    await capture(page, '03-회계/p0-1-monthly-summary.png')
    reportErrors('월계표 /accounting/reports/monthly-summary', getErrors())
  })

})

// ===========================================================================
// 2. P0-2 비밀번호 재설정 (00-시작하기/01-로그인)
// ===========================================================================

test.describe('P0-2 비밀번호 재설정 화면 2종', () => {

  test('비밀번호 재설정 요청 /auth/password-reset', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    // 공개 라우트 — mockRole 불필요
    await page.goto(`${BASE_URL}/#/auth/password-reset`, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    })
    await page.waitForLoadState('networkidle', { timeout: IDLE_TIMEOUT }).catch(() => {})
    await page.waitForTimeout(SETTLE_WAIT)
    await capture(page, '00-시작하기/p0-2-password-reset-request.png')
    reportErrors('비밀번호 재설정 요청 /auth/password-reset', getErrors())
  })

  test('비밀번호 재설정 인증번호 /auth/password-reset/confirm', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await page.goto(`${BASE_URL}/#/auth/password-reset/confirm`, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    })
    await page.waitForLoadState('networkidle', { timeout: IDLE_TIMEOUT }).catch(() => {})
    await page.waitForTimeout(SETTLE_WAIT)
    await capture(page, '00-시작하기/p0-2-password-reset-confirm.png')
    reportErrors('비밀번호 재설정 인증번호 /auth/password-reset/confirm', getErrors())
  })

})

// ===========================================================================
// 3. P0-4 세금계산서 (03-회계/03-세금계산서)
// ===========================================================================

test.describe('P0-4 세금계산서 화면', () => {

  test('세금계산서 발행 폼 /accounting/tax-invoices/new', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/accounting/tax-invoices/new'))
    await capture(page, '03-회계/p0-4-tax-invoice-form.png')
    reportErrors('세금계산서 발행 폼 /accounting/tax-invoices/new', getErrors())
  })

  test('세금계산서 인쇄 /accounting/tax-invoices/ti-001/print', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/accounting/tax-invoices/ti-001/print'))
    await capture(page, '03-회계/p0-4-tax-invoice-print.png')
    reportErrors('세금계산서 인쇄 /accounting/tax-invoices/ti-001/print', getErrors())
  })

})

// ===========================================================================
// 4. P0-5 관리자 — 사용자 관리 모달 (00-시작하기 + 06-트러블슈팅)
// ===========================================================================

test.describe('P0-5 사용자 관리 화면', () => {

  test('사용자 목록 /admin/users', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/admin/users'))
    await capture(page, '00-시작하기/p0-5-admin-users.png')
    reportErrors('사용자 목록 /admin/users', getErrors())
  })

})

// ===========================================================================
// 5. P0-6 거래처 4탭 (01-영업/01-거래처-등록)
// ===========================================================================

test.describe('P0-6 거래처 4탭 등록', () => {

  test('거래처 목록 /admin/partners', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/admin/partners'))
    await capture(page, '01-영업/p0-6-partner-list.png')
    reportErrors('거래처 목록 /admin/partners', getErrors())
  })

  test('거래처 신규 등록 /admin/partners/new', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/admin/partners/new', 'SALES'))
    await capture(page, '01-영업/p0-6-partner-new.png')
    reportErrors('거래처 신규 등록 /admin/partners/new', getErrors())
  })

})

// ===========================================================================
// 6. P0-9 입고 검수 (02-창고/01-입고-처리)
// ===========================================================================

test.describe('P0-9 입고 검수 dialog', () => {

  test('입고 검수 목록 /warehouse/inbound-inspections', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/warehouse/inbound-inspections', 'WAREHOUSE'))
    await capture(page, '02-창고/p0-9-inbound-inspection-list.png')
    reportErrors('입고 검수 목록 /warehouse/inbound-inspections', getErrors())
  })

})

// ===========================================================================
// 7. P1-3 안전재고 알림 (02-창고/03-재고-조회)
// ===========================================================================

test.describe('P1-3 안전재고 알림', () => {

  test('안전재고 알림 목록 /inventory/safety-stock-alerts', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/inventory/safety-stock-alerts'))
    await capture(page, '02-창고/p1-3-safety-stock-alerts.png')
    reportErrors('안전재고 알림 목록 /inventory/safety-stock-alerts', getErrors())
  })

})

// ===========================================================================
// 8. P1-5 배차 UI 3건 (05-arologis)
// ===========================================================================

test.describe('P1-5 배차 admin 3건', () => {

  test('카카오톡 자동 배차 /arologis/admin/auto-dispatch', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/arologis/admin/auto-dispatch'))
    await capture(page, '05-arologis/p1-5-kakao-auto-dispatch.png')
    reportErrors('카카오톡 자동 배차 /arologis/admin/auto-dispatch', getErrors())
  })

  test('수동 배차 admin /arologis/admin/manual-dispatch', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/arologis/admin/manual-dispatch'))
    await capture(page, '05-arologis/p1-5-manual-dispatch-admin.png')
    reportErrors('수동 배차 admin /arologis/admin/manual-dispatch', getErrors())
  })

  test('기사 배정 /arologis/admin/driver-assignment', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/arologis/admin/driver-assignment'))
    await capture(page, '05-arologis/p1-5-driver-assignment.png')
    reportErrors('기사 배정 /arologis/admin/driver-assignment', getErrors())
  })

})

// ===========================================================================
// 9. P1-6 Excel 다운로드 버튼이 있는 list 페이지 4건
// ===========================================================================

test.describe('P1-6 Excel 다운로드 list 페이지', () => {

  test('출고전표 목록 /sales (Excel 버튼)', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/sales'))
    await capture(page, '01-영업/p1-6-sales-list-excel.png')
    reportErrors('출고전표 목록 /sales', getErrors())
  })

  test('입고전표 목록 /purchases (Excel 버튼)', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/purchases', 'WAREHOUSE'))
    await capture(page, '02-창고/p1-6-purchases-list-excel.png')
    reportErrors('입고전표 목록 /purchases', getErrors())
  })

  test('분개 목록 /accounting/journals (Excel 버튼)', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/accounting/journals'))
    await capture(page, '03-회계/p1-6-journals-list-excel.png')
    reportErrors('분개 목록 /accounting/journals', getErrors())
  })

  test('시산표 /accounting/balances (Excel 버튼)', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/accounting/balances'))
    await capture(page, '03-회계/p1-6-trial-balance-excel.png')
    reportErrors('시산표 /accounting/balances (Excel)', getErrors())
  })

})

// ===========================================================================
// 10. P2 4건 — 견적서 / 월말마감 / 매출마감 / 재고실사 대표 화면
// ===========================================================================

test.describe('P2 4건 대표 화면', () => {

  test('P2-1 견적서 목록 /sales/estimates', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/sales/estimates'))
    await capture(page, '01-영업/p2-1-estimate-list.png')
    reportErrors('P2-1 견적서 목록 /sales/estimates', getErrors())
  })

  test('P2-1 견적서 신규 /sales/estimates/new', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/sales/estimates/new'))
    await capture(page, '01-영업/p2-1-estimate-form.png')
    reportErrors('P2-1 견적서 신규 /sales/estimates/new', getErrors())
  })

  test('P2-3 월말 마감 /accounting/period-close', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/accounting/period-close'))
    await capture(page, '03-회계/p2-3-period-close.png')
    reportErrors('P2-3 월말 마감 /accounting/period-close', getErrors())
  })

  test('P2-4 매출 마감 /sales/closing', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/sales/closing'))
    await capture(page, '02-창고/p2-4-sales-closing.png')
    reportErrors('P2-4 매출 마감 /sales/closing', getErrors())
  })

  test('P2-6 재고 실사 목록 /warehouse/audit', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/warehouse/audit', 'WAREHOUSE'))
    await capture(page, '02-창고/p2-6-inventory-audit-list.png')
    reportErrors('P2-6 재고 실사 목록 /warehouse/audit', getErrors())
  })

  test('P2-6 재고 실사 신규 /warehouse/audit/new', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/warehouse/audit/new', 'WAREHOUSE'))
    await capture(page, '02-창고/p2-6-inventory-audit-form.png')
    reportErrors('P2-6 재고 실사 신규 /warehouse/audit/new', getErrors())
  })

})

// ===========================================================================
// 11. 잔여 placeholder 17건 — 파일명 정합성 신규 캡처 + placeholder 교체
//     대상: 견적서 상세/인쇄, 매출 마감 2종, 세금계산서 취소 modal,
//            월말마감 2종, 재고실사 3종, 04-모바일 사진첨부 4종,
//            비밀번호 재설정 2종 (00-시작하기/01-로그인.md placeholder 잔존)
// ===========================================================================

test.describe('잔여 placeholder — 견적서 상세/인쇄 2종', () => {

  test('견적서 상세 /sales/estimates/est-001', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/sales/estimates/est-001'))
    await capture(page, '01-영업/06-estimate-detail.png')
    reportErrors('견적서 상세 /sales/estimates/est-001', getErrors())
  })

  test('견적서 인쇄 /sales/estimates/est-001/print', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/sales/estimates/est-001/print'))
    await capture(page, '01-영업/06-estimate-print.png')
    reportErrors('견적서 인쇄 /sales/estimates/est-001/print', getErrors())
  })

})

test.describe('잔여 placeholder — 매출 마감 2종', () => {

  test('매출 마감 월별 /sales/closing (monthly view)', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/sales/closing'))
    await capture(page, '02-창고/04-sales-closing-monthly.png')
    reportErrors('매출 마감 월별 /sales/closing', getErrors())
  })

  test('매출 마감 일별 detail /sales/closing/daily', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/sales/closing/daily'))
    await capture(page, '02-창고/04-sales-closing-daily-detail.png')
    reportErrors('매출 마감 일별 /sales/closing/daily', getErrors())
  })

})

test.describe('잔여 placeholder — 세금계산서 취소 modal', () => {

  test('세금계산서 취소 modal /accounting/tax-invoices/ti-001', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/accounting/tax-invoices/ti-001'))
    // 취소 버튼 클릭 후 modal 캡처
    const cancelBtn = page.locator('button:has-text("취소"), button:has-text("발행취소"), [data-testid="cancel-btn"]').first()
    await cancelBtn.click({ timeout: 5_000 }).catch(() => {})
    await page.waitForTimeout(800)
    await capture(page, '03-회계/03-tax-invoice-cancel-modal.png')
    reportErrors('세금계산서 취소 modal /accounting/tax-invoices/ti-001', getErrors())
  })

})

test.describe('잔여 placeholder — 월말 마감 2종', () => {

  test('월말 마감 실행 폼 /accounting/period-close/new', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/accounting/period-close/new'))
    await capture(page, '03-회계/04-period-close-form.png')
    reportErrors('월말 마감 실행 폼 /accounting/period-close/new', getErrors())
  })

  test('월말 마감 이력 목록 /accounting/period-close', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/accounting/period-close'))
    await capture(page, '03-회계/04-period-close-list.png')
    reportErrors('월말 마감 이력 목록 /accounting/period-close', getErrors())
  })

})

test.describe('잔여 placeholder — 재고 실사 3종 (정식 파일명)', () => {

  test('재고 실사 목록 /warehouse/audit (05-audit-list)', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/warehouse/audit', 'WAREHOUSE'))
    await capture(page, '02-창고/05-audit-list.png')
    reportErrors('재고 실사 목록 /warehouse/audit', getErrors())
  })

  test('재고 실사 등록 /warehouse/audit/new (05-audit-form)', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/warehouse/audit/new', 'WAREHOUSE'))
    await capture(page, '02-창고/05-audit-form.png')
    reportErrors('재고 실사 등록 /warehouse/audit/new', getErrors())
  })

  test('재고 실사 상세 /warehouse/audit/audit-001 (05-audit-detail)', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/warehouse/audit/audit-001', 'WAREHOUSE'))
    await capture(page, '02-창고/05-audit-detail.png')
    reportErrors('재고 실사 상세 /warehouse/audit/audit-001', getErrors())
  })

})

test.describe('잔여 placeholder — 04-모바일 사진 첨부 4종 (desktop viewer + Storybook fallback)', () => {

  // 모바일 native 앱은 Detox 환경 필요. desktop 뷰어 / stub 화면으로 대체 캡처.
  // VITE_MOCK_MODE=1 에서 mock 사진 첨부 화면이 라우팅되는 경우 fallback 캡처.

  test('검수 사진 첨부 fallback /warehouse/inbound-inspections/insp-001', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/warehouse/inbound-inspections/insp-001', 'WAREHOUSE'))
    await capture(page, '04-모바일/04-inspection-photo.png')
    reportErrors('검수 사진 첨부 fallback /warehouse/inbound-inspections/insp-001', getErrors())
  })

  test('배송 완료 사진 fallback /arologis/deliveries/del-001', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/arologis/deliveries/del-001'))
    await capture(page, '04-모바일/04-delivery-photo.png')
    reportErrors('배송 완료 사진 fallback /arologis/deliveries/del-001', getErrors())
  })

  test('방문 사진 fallback /sales/visits/visit-001', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/sales/visits/visit-001', 'SALES'))
    await capture(page, '04-모바일/04-visit-photo.png')
    reportErrors('방문 사진 fallback /sales/visits/visit-001', getErrors())
  })

  test('Desktop 검수 사진 viewer /warehouse/inbound-inspections/insp-001/photos', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/warehouse/inbound-inspections/insp-001/photos', 'WAREHOUSE'))
    await capture(page, '04-모바일/04-inspection-viewer-desktop.png')
    reportErrors('Desktop 검수 사진 viewer /warehouse/inbound-inspections/insp-001/photos', getErrors())
  })

})

test.describe('잔여 placeholder — 견적서 파일명 정합성 (06- prefix)', () => {
  // 06-견적서.md 가 06-estimate-list/form 참조 → p2-1 파일 복사하여 06- 파일명 동기화

  test('견적서 목록 06-estimate-list alias', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/sales/estimates'))
    await capture(page, '01-영업/06-estimate-list.png')
    reportErrors('견적서 목록 06-estimate-list alias', getErrors())
  })

  test('견적서 작성 06-estimate-form alias', async ({ page }) => {
    const getErrors = attachErrorCollector(page)
    await gotoAndSettle(page, url('/sales/estimates/new'))
    await capture(page, '01-영업/06-estimate-form.png')
    reportErrors('견적서 작성 06-estimate-form alias', getErrors())
  })

})
