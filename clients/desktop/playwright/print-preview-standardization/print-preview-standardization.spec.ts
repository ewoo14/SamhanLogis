import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { stripSlipNoZeros } from '../../src/renderer/utils/orderNo'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

test.describe('print preview standardization slice 1 source contract', () => {
  test('stripSlipNoZeros keeps date zeros and strips only the final slip number zeros', () => {
    // Playwright mock hard gate에서 전표번호 인쇄 표시 계약을 직접 검증한다.
    expect(stripSlipNoZeros('2026/04/08-001')).toBe('2026/04/08-1')
    expect(stripSlipNoZeros('2026/02/18-010')).toBe('2026/02/18-10')
    expect(stripSlipNoZeros('-000')).toBe('-0')

    expect(stripSlipNoZeros(null)).toBe('')
    expect(stripSlipNoZeros(undefined)).toBe('')
    expect(stripSlipNoZeros('')).toBe('')
    expect(stripSlipNoZeros('2026/04/08')).toBe('2026/04/08')
    expect(stripSlipNoZeros('2026/04/08-ABC')).toBe('2026/04/08-ABC')
  })

  test('PrintLayout exposes opt-in approval document slots only', () => {
    const source = read('clients/desktop/src/renderer/print/PrintLayout.tsx')

    expect(source).toContain('approvalDoc?: boolean')
    expect(source).toContain('docHeader?:')
    expect(source).toContain('approvalSteps?:')
    expect(source).toContain('closingNote?: string')
    expect(source).toContain('SignatureViewer')
    expect(source).toContain('approvalDoc = false')
    expect(source).toContain('print-approval-doc-header')
    expect(source).toContain('print-approval-grid')
    expect(source).toContain('print-approval-closing')
    expect(source).not.toContain('company.logoPath')
    // 2026-06-14 iteration 2 — 결재문서 헤더에서 회사명/사업자번호 블록 제거.
    // useCompanyProfile 훅과 회사명 DOM(print-approval-company)을 더 이상 렌더하지 않는다.
    expect(source).not.toContain('print-approval-company')
    expect(source).not.toContain('company.legalName')
  })

  test('design-system exposes the approval print tokens required by DESIGN.md', () => {
    const source = read('clients/web/design-system/src/tokens/tokens.css')

    for (const token of [
      '--print-approval-w-std:         40mm',
      '--print-approval-h-std:         32mm',
      '--print-approval-sig-h:         18mm',
      '--print-approval-name-h:        8mm',
      '--print-signature-img-max-h-approval: 16mm',
    ]) {
      expect(source).toContain(token)
    }
  })

  test('PurchaseSlipPrintPage and QuoteView keep non-approval document layouts', () => {
    const purchase = read('clients/desktop/src/renderer/print/PurchaseSlipPrintPage.tsx')
    const quote = read('clients/desktop/src/renderer/print/QuoteView.tsx')

    // 입고 전표는 설정기반 결재란을 사용하지만 결재문서 골격(PrintLayout approvalDoc)은 사용하지 않는다.
    expect(purchase).not.toContain('approvalDoc')
    expect(purchase).not.toContain('approvalSteps')
    expect(purchase).not.toContain('closingNote')
    expect(purchase).toContain('매 입 전 표')
    expect(purchase).toContain('purchase-print-page')
    expect(purchase).toContain('purchase-print-table')
    expect(purchase).toContain('ApprovalRoleCells')
    expect(purchase).not.toContain('[인]')

    // 견적 인쇄는 origin 견적서 양식으로 보존하고 종합견적서 에픽에서 재작업한다.
    expect(quote).not.toContain('approvalDoc')
    expect(quote).not.toContain('approvalSteps')
    expect(quote).not.toContain('closingNote')
    expect(quote).toContain('견 적 서')
    expect(quote).toContain('quote-supplier-table')
    expect(quote).toContain('quote-meta-table')
    expect(quote).toContain('[직인]')
    for (const header of ['품목 / 모델', '출고가', '납품가', '수량', '소계', '비고']) {
      expect(quote).toContain(header)
    }
  })

  test('excluded print views do not opt into the approval document layout', () => {
    // 라우트 테이블의 실연결 인쇄 컴포넌트만 검사한다.
    for (const file of [
      'clients/desktop/src/renderer/print/QuoteView.tsx',
      'clients/desktop/src/renderer/print/SalesTransactionStatementPrintPage.tsx',
      'clients/desktop/src/renderer/print/SalesInvoicePrintPage.tsx',
      'clients/desktop/src/renderer/print/TaxInvoiceView.tsx',
      'clients/desktop/src/renderer/print/DispatchView.tsx',
      'clients/desktop/src/renderer/print/PurchaseSlipPrintPage.tsx',
    ]) {
      expect(read(file), file).not.toContain('approvalDoc')
    }
  })

  test('accounting print layouts reuse PrintLayout without the approval document form', () => {
    // 회계 인쇄 레이아웃 9종은 모두 PrintLayout(paper="a4-portrait")을 재사용하되
    // 결재문서 형식(approvalDoc)을 opt-in 하지 않아야 한다 — 결재란 회귀 유입 방지.
    for (const file of [
      'clients/desktop/src/renderer/routes/accounting/print/BalanceSheetPrintLayout.tsx',
      'clients/desktop/src/renderer/routes/accounting/print/CashFlowStatementPrintLayout.tsx',
      'clients/desktop/src/renderer/routes/accounting/print/CorporateTaxReportPrintLayout.tsx',
      'clients/desktop/src/renderer/routes/accounting/print/DailySummaryPrintLayout.tsx',
      'clients/desktop/src/renderer/routes/accounting/print/EquityChangesPrintLayout.tsx',
      'clients/desktop/src/renderer/routes/accounting/print/IncomeStatementPrintLayout.tsx',
      'clients/desktop/src/renderer/routes/accounting/print/MonthlySummaryPrintLayout.tsx',
      'clients/desktop/src/renderer/routes/accounting/print/PartnerAgingPrintLayout.tsx',
      'clients/desktop/src/renderer/routes/accounting/print/VatReportPrintLayout.tsx',
    ]) {
      const source = read(file)
      expect(source, file).toContain('PrintLayout')
      expect(source, file).not.toContain('approvalDoc')
    }
  })
})
