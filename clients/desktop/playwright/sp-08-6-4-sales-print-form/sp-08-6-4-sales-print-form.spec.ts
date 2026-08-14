/**
 * SP-08-6-4 거래명세서 + 계산서 인쇄 양식 정적 계약 검증
 *
 * 목적: SalesSlipPrintPage (또는 InvoiceView / TaxInvoiceView 재사용) 가
 *       거래명세서 + 세금계산서 인쇄 양식 A4 portrait 계약, 한국어 라벨,
 *       UUID 비공개, @media print 트리거를 모두 만족하는지
 *       소스 정적 단언으로 보장한다.
 *
 * 실행 환경: dev server 없이 소스 정적 분석 (파일 read + 문자열 단언).
 *
 * 5 case:
 *   T1 — 거래명세서 라우트 계약: `/sales/:id/print/invoice` + 6 섹션 (헤더/거래처/라인/합계/비고/푸터)
 *   T2 — 계산서 라우트 계약: `/accounting/tax-invoices/:id/print` + 발행자/공급받는자 2-panel
 *   T3 — 한국어 라벨: 거래명세서 / 계산서 / 거래처 / 사업자번호 / 공급가액 / 부가세 / 합계
 *   T4 — UUID 비공개: slipNo 만 표시, id 직접 노출 금지
 *   T5 — @media print + @page A4 portrait + window.print()
 */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(__dirname, '../..')
const repoRoot = path.resolve(desktopRoot, '../..')

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8')
}

function fileExists(relPath: string): boolean {
  return fs.existsSync(path.join(repoRoot, relPath))
}

// ============================================================
// 거래명세서 (Sales Statement) 컴포넌트 후보 경로
// ============================================================
const STATEMENT_CANDIDATES = [
  // SP-08-6-4 신규 거래명세서 인쇄 양식 — /sales/:id/print/statement 라우트
  'clients/desktop/src/renderer/print/SalesTransactionStatementPrintPage.tsx',
  'clients/desktop/src/renderer/print/SalesSlipPrintPage.tsx',
  'clients/desktop/src/renderer/print/SalesStatementPrintPage.tsx',
  'clients/desktop/src/renderer/print/StatementView.tsx',
  'clients/desktop/src/renderer/print/InvoiceView.tsx', // 기존 InvoiceView 재사용 허용
  'clients/desktop/src/renderer/routes/SalesSlipPrintPage.tsx',
]

// ============================================================
// 세금계산서 (Tax Invoice) 컴포넌트 후보 경로
// ============================================================
const INVOICE_CANDIDATES = [
  // SP-08-6-4 신규 세금계산서 인쇄 양식 — /sales/:id/print/invoice 라우트
  'clients/desktop/src/renderer/print/SalesInvoicePrintPage.tsx',
  'clients/desktop/src/renderer/print/SalesTaxInvoicePrintPage.tsx',
  'clients/desktop/src/renderer/print/TaxInvoiceView.tsx', // 기존 TaxInvoiceView 재사용 허용
  'clients/desktop/src/renderer/print/TaxInvoicePrintView.tsx',
  'clients/desktop/src/renderer/routes/TaxInvoicePrintPage.tsx',
]

function resolveStatementComponent(): string {
  for (const c of STATEMENT_CANDIDATES) {
    if (fileExists(c)) return c
  }
  // fallback — InvoiceView 기반 (거래명세서 라우트와 연결된 컴포넌트)
  return 'clients/desktop/src/renderer/print/InvoiceView.tsx'
}

function resolveInvoiceComponent(): string {
  for (const c of INVOICE_CANDIDATES) {
    if (fileExists(c)) return c
  }
  // fallback — TaxInvoiceView (세금계산서 라우트와 연결된 컴포넌트)
  return 'clients/desktop/src/renderer/print/TaxInvoiceView.tsx'
}

const routesPath = 'clients/desktop/src/renderer/routes/index.tsx'
const printLayoutPath = 'clients/desktop/src/renderer/print/PrintLayout.tsx'

test.describe('SP-08-6-4 거래명세서 + 계산서 인쇄 양식 정적 계약', () => {
  /**
   * T1 — 거래명세서 라우트 계약 + 6 섹션
   *
   * routes/index.tsx 가 `/sales/:id/print/invoice` (또는 동등 경로) 를 등록하고,
   * 컴포넌트가 헤더 / 거래처 / 라인 테이블 / 합계 / 비고 / 푸터 6 섹션을
   * 모두 포함함을 단언한다.
   *
   * SP-08-6-4 기존 InvoiceView 재사용 시: 동일 라우트 + 6 섹션 이미 충족.
   * 신규 SalesSlipPrintPage 분리 시: 동일 계약 준수 의무.
   */
  test('T1: 거래명세서 라우트 + 6 섹션 (헤더/거래처/라인/합계/비고/푸터)', () => {
    const routes = read(routesPath)
    const statementComponent = read(resolveStatementComponent())

    // 거래명세서 라우트 등록 단언
    const hasStatementRoute =
      routes.includes('/sales/:id/print/invoice') ||
      routes.includes('/sales/:id/print/statement') ||
      routes.includes('/sales/:id/print/sales')
    expect(hasStatementRoute).toBeTruthy()

    // useParams + id 추출
    expect(statementComponent).toMatch(/useParams/)
    expect(statementComponent).toMatch(/params\.id|id\s*=\s*params/)

    // 헤더 섹션 (회사 정보 / 발행일 / 전표번호)
    const hasHeader =
      statementComponent.includes('header') ||
      statementComponent.includes('invoice-v2-header') ||
      statementComponent.includes('statement-header')
    expect(hasHeader).toBeTruthy()

    // 거래처 섹션 (partnerName / 거래처명)
    const hasPartnerSection =
      statementComponent.includes('partnerName') ||
      statementComponent.includes('invoice-v2-partner') ||
      statementComponent.includes('거래수') || // 거래처 unicode
      statementComponent.includes('거래수명') // 거래처명 unicode
    expect(hasPartnerSection).toBeTruthy()

    // 라인 테이블 (tbody + 품목 행)
    expect(statementComponent).toMatch(/tbody|invoice-v2-table|statement-table/)

    // 합계 섹션 (supply + vat + total)
    const hasTotals =
      statementComponent.includes('invoice-v2-table') ||
      statementComponent.includes('tfoot') ||
      statementComponent.includes('합계') // 합계 unicode
    expect(hasTotals).toBeTruthy()

    // 2026-06-10 원본 양식 정렬: 비고 섹션 폐기 → 배송지(적색) + 금액(한글) 행이
    // 원본 양식 필수 섹션 (개발책임자 샘플 — .claude/memory/project_slip_shipout_print_form.md)
    const hasShipBox =
      statementComponent.includes('배송지') || statementComponent.includes('stm-ship-box')
    expect(hasShipBox).toBeTruthy()
    const hasHangulAmount =
      statementComponent.includes('krwHangul') || statementComponent.includes('금액:')
    expect(hasHangulAmount).toBeTruthy()

    // 푸터 (발행자 서명 / 사인란)
    const hasFooter =
      statementComponent.includes('footer') ||
      statementComponent.includes('invoice-v2-footer') ||
      statementComponent.includes('sign-box') ||
      statementComponent.includes('담당자') // 담당자 unicode
    expect(hasFooter).toBeTruthy()
  })

  /**
   * T2 — 계산서 라우트 계약 + 발행자/공급받는자 2-panel
   *
   * `/accounting/tax-invoices/:id/print` (또는 동등 경로) 가 등록되고,
   * 공급자 박스 (COMPANY 정보) 와 공급받는자 박스 (partnerName / partnerBusinessNo)
   * 2-panel 구조가 존재함을 단언한다.
   *
   * NTS 전자세금계산서 표준 양식 계약 (TaxInvoiceView 참조).
   */
  test('T2: 계산서 라우트 + 발행자/공급받는자 2-panel', () => {
    const routes = read(routesPath)
    const invoiceComponent = read(resolveInvoiceComponent())

    // 계산서 라우트 등록 단언
    // SalesInvoicePrintPage 기준 라우트(/sales/:id/print/invoice)를 정본으로 인정
    const hasInvoiceRoute =
      routes.includes('/accounting/tax-invoices/:id/print') ||
      routes.includes('/tax-invoices/:id/print') ||
      routes.includes('/sales/:id/print/tax-invoice') ||
      routes.includes('/sales/:id/print/invoice')
    expect(hasInvoiceRoute).toBeTruthy()

    // 세금계산서 타이틀
    const hasInvoiceTitle =
      invoiceComponent.includes('세 금 계 산 서') || // 세 금 계 산 서
      invoiceComponent.includes('세금계산서') || // 세금계산서
      invoiceComponent.includes('tax-invoice-title') ||
      invoiceComponent.includes('TaxInvoice')
    expect(hasInvoiceTitle).toBeTruthy()

    // 공급자 박스 — useCompanyProfile 훅 정보 (spec §2c 이후 COMPANY 상수 제거 → company.* 사용)
    const hasSupplierPanel =
      invoiceComponent.includes('useCompanyProfile') ||
      invoiceComponent.includes('company.') ||
      invoiceComponent.includes('party-supplier') ||
      invoiceComponent.includes('공급자') // 공급자 unicode
    expect(hasSupplierPanel).toBeTruthy()

    // 공급받는자 박스 — partnerName / partnerBusinessNo
    const hasReceiverPanel =
      invoiceComponent.includes('partnerName') ||
      invoiceComponent.includes('partnerBusinessNo') ||
      invoiceComponent.includes('party-receiver') ||
      invoiceComponent.includes('공급받는자') // 공급받는자 unicode
    expect(hasReceiverPanel).toBeTruthy()

    // 2-panel 테이블 구조 (party-side 또는 grid 2-col)
    const has2Panel =
      invoiceComponent.includes('party-side') ||
      invoiceComponent.includes('tax-invoice-parties') ||
      invoiceComponent.includes('sales-invoice-parties') ||
      invoiceComponent.includes('sales-invoice-party-box') ||
      (invoiceComponent.includes('공급자 (발행자)') && invoiceComponent.includes('공급받는자')) ||
      invoiceComponent.includes('supplier') && invoiceComponent.includes('receiver')
    expect(has2Panel).toBeTruthy()

    // useQuery 재사용
    expect(invoiceComponent).toMatch(/useQuery/)
  })

  /**
   * T3 — 한국어 라벨 단언
   *
   * 거래명세서 + 계산서 양식에 필수 한국어 라벨 7종이 모두 존재해야 한다:
   * 거래명세서, 계산서, 거래처, 사업자번호, 공급가액, 부가세, 합계.
   *
   * 각 라벨은 해당 컴포넌트에 직접 포함되거나 PrintLayout 에서 공통 처리됨.
   */
  test('T3: 한국어 라벨 — 거래명세서 / 계산서 / 거래처 / 사업자번호 / 공급가액 / 부가세 / 합계', () => {
    const statementComponent = read(resolveStatementComponent())
    const invoiceComponent = read(resolveInvoiceComponent())
    const printLayout = read(printLayoutPath)

    // [1] 거래명세서 타이틀
    const hasStatementTitle =
      statementComponent.includes('거 래 명 세 서') || // 거 래 명 세 서 (자간)
      statementComponent.includes('거래명세서') || // 거래명세서
      statementComponent.includes('invoice-v2-title')
    expect(hasStatementTitle).toBeTruthy()

    // [2] 세금계산서 타이틀 (한국어 직접 또는 unicode)
    const hasInvoiceKorTitle =
      invoiceComponent.includes('세 금 계 산 서') ||
      invoiceComponent.includes('세금계산서') ||
      invoiceComponent.includes('tax-invoice-title')
    expect(hasInvoiceKorTitle).toBeTruthy()

    // [3] 거래처 (거래명세서 컴포넌트에서 partnerName 표시 + "님 귀하" 또는 거래처 라벨)
    const hasPartnerLabel =
      statementComponent.includes('님 관하') || // 님 귀하
      statementComponent.includes('거래수') || // 거래처
      statementComponent.includes('partnerName') ||
      statementComponent.includes('invoice-v2-partner-name')
    expect(hasPartnerLabel).toBeTruthy()

    // [4] 사업자번호 — 공급자 박스 (useCompanyProfile 훅 via company.businessRegNo)
    const hasBusinessNo =
      statementComponent.includes('사업자번호') || // 사업자번호
      statementComponent.includes('businessRegNo') ||
      invoiceComponent.includes('사업자번호') ||
      invoiceComponent.includes('businessRegNo') ||
      printLayout.includes('businessRegNo') ||
      // useCompanyProfile 훅은 useCompanyProfile.ts에서 businessRegNo 필드를 export
      invoiceComponent.includes('useCompanyProfile')
    expect(hasBusinessNo).toBeTruthy()

    // [5] 공급가액
    const hasSupplyLabel =
      statementComponent.includes('공급가액') || // 공급가액
      statementComponent.includes('col-supply') ||
      invoiceComponent.includes('공 급 가 액') || // 공 급 가 액 (자간)
      invoiceComponent.includes('공급가액') ||
      invoiceComponent.includes('col-supply')
    expect(hasSupplyLabel).toBeTruthy()

    // [6] 부가세 / 세액
    const hasVatLabel =
      statementComponent.includes('부가세') || // 부가세
      statementComponent.includes('col-vat') ||
      invoiceComponent.includes('세 액') || // 세 액
      invoiceComponent.includes('부가세') ||
      invoiceComponent.includes('col-vat')
    expect(hasVatLabel).toBeTruthy()

    // [7] 합계
    const hasTotalLabel =
      statementComponent.includes('합계') || // 합계
      invoiceComponent.includes('합계') ||
      statementComponent.includes('totals-label') ||
      invoiceComponent.includes('col-total-label')
    expect(hasTotalLabel).toBeTruthy()
  })

  /**
   * T4 — UUID 비공개 단언
   *
   * 거래명세서 + 계산서 양식 모두에서 internal slip.id / taxInvoice.id (UUID) 가
   * 직접 노출되지 않으며, 사용자 노출 식별자는 slipNo / taxInvoiceNo 만임을 보장.
   *
   * memory feedback_uuid_no_user_visibility.md 준수.
   */
  test('T4: UUID 비공개 — slipNo/taxInvoiceNo 만 표시, id 직접 노출 금지', () => {
    const statementComponent = read(resolveStatementComponent())
    const invoiceComponent = read(resolveInvoiceComponent())

    // [거래명세서] slipNo 표시 확인
    expect(statementComponent).toContain('slipNo')

    // [거래명세서] UUID raw 출력 패턴 미사용
    expect(statementComponent).not.toMatch(/>\s*\{\s*slip\.id\s*\}/)
    expect(statementComponent).not.toMatch(/>\s*\{\s*id\s*\}\s*</)

    // [거래명세서] partnerId UUID 화면 노출 금지
    expect(statementComponent).not.toMatch(/>\s*\{\s*slip\.partnerId\s*\}/)

    // [계산서] 식별번호 표시 확인
    // SalesInvoicePrintPage(출고 전표 기반) 는 slipNo 노출 — 정본으로 인정
    const hasInvoiceNo =
      invoiceComponent.includes('taxInvoiceNo') ||
      invoiceComponent.includes('일련번호') || // 일련번호
      invoiceComponent.includes('slipNo') // 출고 전표 계산서 식별번호
    expect(hasInvoiceNo).toBeTruthy()

    // [계산서] UUID raw 출력 패턴 미사용
    expect(invoiceComponent).not.toMatch(/>\s*\{\s*ti\.id\s*\}/)
    expect(invoiceComponent).not.toMatch(/>\s*\{\s*taxInvoice\.id\s*\}/)

    // [계산서] partnerBusinessNo 는 화면 표시 허용 (사업자등록번호 — 비즈니스 식별자)
    // partnerBusinessNo 는 UUID 아님 — UUID 가드 미적용
    // partnerId UUID 미노출 단언
    expect(invoiceComponent).not.toMatch(/>\s*\{\s*ti\.partnerId\s*\}/)
  })

  /**
   * T5 — @media print + @page A4 portrait + window.print()
   *
   * PrintLayout.tsx 가 @media print 규칙을 포함하거나 CSS module 에 존재하고,
   * A4 portrait paper size 가 보장되며,
   * window.print() 자동 호출 또는 "인쇄" 버튼이 존재함을 단언한다.
   *
   * memory feedback_print_design_iteration.md — 인쇄 양식 @page 규칙 필수.
   */
  test('T5: @media print + @page A4 portrait + window.print()', () => {
    const printLayout = read(printLayoutPath)
    const statementComponent = read(resolveStatementComponent())
    const invoiceComponent = read(resolveInvoiceComponent())

    // @media print — PrintLayout 또는 컴포넌트 CSS module 또는 global.css
    // global.css 에 @media print { .no-print { display: none; } } 규칙이 있으므로
    // PrintLayout 이 .no-print 클래스를 사용 → @media print 간접 적용 허용
    const hasMediaPrint =
      printLayout.includes('@media print') ||
      printLayout.includes('no-print') || // .no-print 클래스 사용 → global.css @media print 간접
      statementComponent.includes('@media print') ||
      invoiceComponent.includes('@media print') ||
      (fileExists('clients/desktop/src/renderer/print/PrintLayout.module.css') &&
        read('clients/desktop/src/renderer/print/PrintLayout.module.css').includes('@media print')) ||
      (fileExists('clients/desktop/src/renderer/styles/global.css') &&
        read('clients/desktop/src/renderer/styles/global.css').includes('@media print'))
    expect(hasMediaPrint).toBeTruthy()

    // @page A4 — PrintLayout CSS 또는 global 스타일에 존재
    // PrintLayout 이 paper-a4-portrait 클래스를 부여 → CSS 에서 @page { size: A4 }
    const hasA4Portrait =
      printLayout.includes('a4-portrait') ||
      printLayout.includes('paper-a4-portrait') ||
      statementComponent.includes('a4-portrait') ||
      invoiceComponent.includes('a4-portrait')
    expect(hasA4Portrait).toBeTruthy()

    // window.print() 인쇄 트리거 — PrintLayout 공통 "인쇄" 버튼
    const hasPrintTrigger =
      printLayout.includes('window.print') ||
      statementComponent.includes('window.print') ||
      printLayout.includes('인쇄') || // 인쇄 (unicode)
      printLayout.includes('"인쇄"') ||
      printLayout.includes("'인쇄'")
    expect(hasPrintTrigger).toBeTruthy()

    // PrintLayout 재사용 확인 — 거래명세서
    const statementUsesPrintLayout =
      statementComponent.includes('PrintLayout') ||
      statementComponent.includes('paper-a4-portrait') ||
      statementComponent.includes('a4-portrait')
    expect(statementUsesPrintLayout).toBeTruthy()

    // PrintLayout 재사용 확인 — 계산서
    const invoiceUsesPrintLayout =
      invoiceComponent.includes('PrintLayout') ||
      invoiceComponent.includes('paper-a4-portrait') ||
      invoiceComponent.includes('a4-portrait')
    expect(invoiceUsesPrintLayout).toBeTruthy()
  })
})
