import { expect, test } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const specDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(specDir, '../../../..')

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8')
}

// 정적 파일 계약 검증 — dev server 불필요.
// page.goto() 미사용 → isServerAvailable 가드 적용 대상 외.
test.describe('SP-08-6-5 일마감 + 원장 정적 계약', () => {
  /**
   * T1: BE 일마감 계약
   *
   * AccountingReportController 에
   *   - GET /accounting/closings/daily  (BE-A12) — ACCOUNTANT/MANAGER/MASTER
   *   - MonthEndCloseController POST /accounting/closings — ACCOUNTANT/MASTER
   * 가 선언되어 있어야 하고, Flyway V15 마이그레이션이 존재해야 한다.
   */
  test('T1 BE 일마감 계약: AccountingReportController + Flyway V15', () => {
    const reportCtrl = read(
      'services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java',
    )
    const closeCtrl = read(
      'services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/MonthEndCloseController.java',
    )
    const v15 = read(
      'services/accounting-service/src/main/resources/db/migration/V15__add_daily_closings.sql',
    )
    const dailyDetailDto = read(
      'services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/DailyClosingDetailResponse.java',
    )

    // BE-A12 endpoint 선언
    expect(reportCtrl).toContain('@GetMapping("/accounting/closings/daily")')
    expect(reportCtrl).toContain('@RequirePermission(page = REPORTS_PAGE_CODE')
    expect(reportCtrl).toContain('REPORTS_PAGE_CODE = "accounting.reports"')
    expect(reportCtrl).toContain('DailyClosingDetailResponse')
    expect(reportCtrl).toContain('getDailyDetail(date, kind, sourceKind)')

    // 마감 실행 권한 (ACCOUNTANT/MASTER 만, MANAGER 미포함)
    expect(closeCtrl).toContain('@RequirePermission(page = PAGE_CODE')
    expect(closeCtrl).toContain('PAGE_CODE = "accounting.period-close"')
    expect(closeCtrl).toContain('PermissionAction.CREATE')
    expect(closeCtrl).toContain('@PostMapping')
    expect(closeCtrl).toContain('@ResponseStatus(HttpStatus.CREATED)')

    // Flyway V15 daily_closings 테이블
    expect(v15).toContain('CREATE TABLE IF NOT EXISTS daily_closings')
    expect(v15).toContain('closing_date')
    expect(v15).toContain('total_supply')
    expect(v15).toContain('total_vat')
    expect(v15).toContain('total_amount')
    expect(v15).toContain('is_locked')
    // BaseEntity 7 audit 컬럼 포함 확인
    expect(v15).toContain('created_at')
    expect(v15).toContain('is_deleted')

    // DailyClosingDetailResponse UUID 비공개 — taxInvoiceNo/partnerName 만 노출
    expect(dailyDetailDto).toContain('String taxInvoiceNo')
    expect(dailyDetailDto).toContain('String partnerName')
    expect(dailyDetailDto).not.toContain('UUID')
  })

  /**
   * T2: BE 원장 계약
   *
   * AccountingReportController 에
   *   - GET /accounting/journals/ledger-data (BE-A9) — ACCOUNTANT/MANAGER/MASTER
   * 가 선언되어 있고, LedgerImageResponse 는 UUID 를 노출하지 않아야 한다.
   */
  test('T2 BE 원장 계약: LedgerController + 거래처 필터 + UUID 비공개', () => {
    const reportCtrl = read(
      'services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java',
    )
    const ledgerDto = read(
      'services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/LedgerImageResponse.java',
    )

    // BE-A9 endpoint
    expect(reportCtrl).toContain('@GetMapping("/accounting/journals/ledger-data")')
    expect(reportCtrl).toContain('LedgerImageResponse')
    // R41: 구형 응답 shape만 유지하고 수집·분류는 신규 원장 read contract를 소비한다.
    expect(reportCtrl).toContain('partnerLedgerReadService.read(partnerCode, from, to)')
    expect(reportCtrl).toContain('toLegacyLedgerResponse')

    // partnerCode 필수 파라미터 — 거래처 필터
    expect(reportCtrl).toContain('@RequestParam String partnerCode')
    expect(reportCtrl).toContain('@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from')
    expect(reportCtrl).toContain('@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to')

    // LedgerImageResponse UUID 비공개 — 필드 선언에 UUID 타입 없음
    expect(ledgerDto).toContain('String partnerCode')
    expect(ledgerDto).toContain('String partnerName')
    expect(ledgerDto).toContain('String journalNo')
    // 실제 UUID 타입 필드가 record 파라미터로 선언되지 않아야 함 (주석 언급은 허용)
    expect(ledgerDto).not.toMatch(/^\s*(UUID|java\.util\.UUID)\s+\w+/m)

    // 원장 라인 필드
    expect(ledgerDto).toContain('BigDecimal debit')
    expect(ledgerDto).toContain('BigDecimal credit')
    expect(ledgerDto).toContain('BigDecimal balance')
  })

  /**
   * T3: FE 일마감 화면 계약
   *
   * MonthEndClosingPage.tsx 에
   *   - 날짜 input, 거래처(periodType) 선택
   *   - closing-new-button (마감 처리 버튼)
   *   - closing-daily-detail-table (일별 세금계산서 detail)
   *   - getDailyClosingDetail 호출
   *   - closingApi.ts 의 DailyClosingDetail/getDailyClosingDetail 타입 정의
   * 가 있어야 한다.
   */
  test('T3 FE 일마감 화면: 라우트 + 날짜 + 거래처 + 처리 버튼', () => {
    const page = read('clients/desktop/src/renderer/routes/MonthEndClosingPage.tsx')
    const api = read('clients/desktop/src/renderer/api/closingApi.ts')

    // data-testid 계약
    expect(page).toContain('closing-new-button')
    expect(page).toContain('closing-daily-detail-table')
    expect(page).toContain('closing-daily-detail-totals')
    expect(page).toContain('closing-list-table')
    expect(page).toContain('closing-daily-detail-csv-button')

    // 날짜 + periodType 상태
    expect(page).toContain('periodDate')
    expect(page).toContain("periodType === 'DAILY'")
    expect(page).toContain('getDailyClosingDetail')

    // closingApi 타입 계약
    expect(api).toContain('DailyClosingDetail')
    expect(api).toContain('getDailyClosingDetail')
    expect(api).toContain('/accounting/closings/daily')

    // UUID 비공개 가드 — closing 의 id 는 path 에만 사용
    expect(page).not.toMatch(/\{closing\.id\}|closing\.id\s*===/)
    // [C5 후속] 마감 실행 가시성 — canAccess page-code 판정 사용 여부
    expect(page).toContain('canExecute')
  })

  /**
   * T4: FE 원장 화면 계약
   *
   * PartnerLedgerPage.tsx 에
   *   - 기간 필터 from/to, 거래처 필터 partner-ledger-partner
   *   - partner-ledger-search (조회 버튼)
   *   - partner-ledger-aggregate-table (집계 표)
   *   - partner-ledger-detail-table (원장 라인 표)
   *   - partner-ledger-print-button (출력 버튼)
   *   - getLedgerData 호출
   * 가 있어야 한다.
   */
  test('T4 FE 원장 화면: 기간 + 거래처 + 라인 + 출력', () => {
    const page = read('clients/desktop/src/renderer/routes/PartnerLedgerPage.tsx')
    const api = read('clients/desktop/src/renderer/api/partnerLedgerApi.ts')

    // data-testid 계약
    expect(page).toContain('partner-ledger-from')
    expect(page).toContain('partner-ledger-to')
    expect(page).toContain('partner-ledger-partner')
    expect(page).toContain('partner-ledger-search')
    expect(page).toContain('partner-ledger-aggregate-table')
    expect(page).toContain('partner-ledger-detail-table')
    expect(page).toContain('partner-ledger-print-button')
    expect(page).toContain('partner-ledger-csv-download')

    // API 연결
    expect(page).toContain('getLedgerData')
    expect(page).toContain('getSalesAggregate')

    // API 타입 계약
    expect(api).toContain('LedgerData')
    expect(api).toContain('LedgerLine')
    expect(api).toContain('SalesAggregateRow')
    expect(api).toContain('/accounting/journals/partner-ledger')
    expect(api).toContain('/accounting/sales/aggregate')

    // UUID 비공개 — 인터페이스 필드에 partnerId 없음 (주석 언급은 허용)
    // 실제 export interface 에 partnerId 필드 선언이 없어야 함
    expect(api).not.toMatch(/^\s*partnerId\s*:/m)
    expect(page).toContain('partnerCode')
    expect(page).toContain('partnerName')
  })

  /**
   * T5: 권한 가드 — 마감 실행/역마감 page-code 계약
   *
   * - [C5 후속] closingApi.ts 의 role 헬퍼(canExecuteClosing/canReverseClosing)는 제거 —
   *   마감 페이지가 usePermissions().canAccess page-code 로 BE @RequirePermission 과 1:1 판정.
   * - partnerLedgerApi.ts 의 role 문자열 helper 제거
   * - 역마감은 accounting.period-close.reverse UPDATE (seed MASTER 독점)
   * - 마감 실행은 accounting.period-close CREATE (seed ACCOUNTANT/MASTER — MANAGER 불가)
   */
  test('T5 권한 가드: ACCOUNTANT/MANAGER/MASTER 접근 + MASTER 역마감 독점', () => {
    const closeCtrl = read(
      'services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/MonthEndCloseController.java',
    )
    const reportCtrl = read(
      'services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java',
    )
    const closingApi = read('clients/desktop/src/renderer/api/closingApi.ts')
    const ledgerApi = read('clients/desktop/src/renderer/api/partnerLedgerApi.ts')
    const routes = read('clients/desktop/src/renderer/routes/index.tsx')
    const appLayout = read('clients/desktop/src/renderer/components/AppLayout.tsx')

    // BE 역마감 MASTER 독점
    expect(closeCtrl).toContain('@RequirePermission(page = "accounting.period-close.reverse"')
    expect(closeCtrl).toContain('PermissionAction.UPDATE')
    expect(closeCtrl).toContain('@PostMapping("/{id}/reverse")')

    // BE 마감 실행 ACCOUNTANT/MASTER — MANAGER 제외
    expect(closeCtrl).toContain('@RequirePermission(page = PAGE_CODE')
    expect(closeCtrl).toContain('PAGE_CODE = "accounting.period-close"')
    expect(closeCtrl).toContain('PermissionAction.CREATE')

    // BE 원장/일마감 조회 ACCOUNTANT/MANAGER/MASTER
    expect(reportCtrl).toContain('@RequirePermission(page = REPORTS_PAGE_CODE')
    expect(reportCtrl).toContain('REPORTS_PAGE_CODE = "accounting.reports"')

    // FE 권한 — [C5 후속] role 헬퍼 제거, 마감 페이지는 canAccess page-code 판정
    expect(closingApi).not.toContain('export function canExecuteClosing')
    expect(closingApi).not.toContain('export function canReverseClosing')
    const salesClosingPage = read('clients/desktop/src/renderer/routes/SalesClosingPage.tsx')
    expect(salesClosingPage).toMatch(/canAccess\('accounting\.period-close',\s*'create'\)/)
    expect(salesClosingPage).toMatch(/canAccess\('accounting\.period-close\.reverse',\s*'update'\)/)
    expect(ledgerApi).not.toMatch(/PARTNER_LEDGER_[A-Z]+/)
    expect(ledgerApi).not.toMatch(new RegExp('canAccess' + 'PartnerLedger'))
    expect(appLayout).toMatch(/const showAccountingPartnerLedger = dynamicCanAccess\('accounting\.partner-ledger',\s*'view'\)/)
    expect(routes).toMatch(/path: '\/accounting\/partner-ledger'[\s\S]*<PermissionGuard pageCode="accounting\.partner-ledger" action="view">/)

    // auth-service V37 seed: accounting.period-close.reverse 는 MASTER 에게만 can_view/can_edit TRUE
    // (V37__seed_sp_d6_7_accounting_page_codes.sql line 72 확인)
    const v37seed = read(
      'services/auth-service/src/main/resources/db/migration/V37__seed_sp_d6_7_accounting_page_codes.sql',
    )
    expect(v37seed).toContain("'accounting.period-close.reverse'")
    // MASTER TRUE 행 실재
    expect(v37seed).toContain("('accounting.period-close.reverse',    'MASTER',     TRUE, TRUE)")
    // MANAGER/ACCOUNTANT 등 비-MASTER 에 대한 명시적 grant 행 없음 → CROSS JOIN LEFT JOIN COALESCE FALSE
    expect(v37seed).not.toMatch(/'accounting\.period-close\.reverse',\s*'MANAGER'/)
    expect(v37seed).not.toMatch(/'accounting\.period-close\.reverse',\s*'ACCOUNTANT'/)
  })
})
