import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

test.describe('print preview standardization slice 1 source contract', () => {
  test('PrintLayout exposes opt-in approval document slots only', () => {
    const source = read('clients/desktop/src/renderer/print/PrintLayout.tsx')

    expect(source).toContain('approvalDoc?: boolean')
    expect(source).toContain('docHeader?:')
    expect(source).toContain('approvalSteps?:')
    expect(source).toContain('useCompanyProfile')
    expect(source).toContain('SignatureViewer')
    expect(source).toContain('approvalDoc = false')
    expect(source).toContain('print-approval-doc-header')
    expect(source).toContain('print-approval-grid')
    expect(source).not.toContain('company.logoPath')
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

  test('InboundView and QuoteView opt into approvalDoc and remove legacy seal marks', () => {
    const inbound = read('clients/desktop/src/renderer/print/InboundView.tsx')
    const quote = read('clients/desktop/src/renderer/print/QuoteView.tsx')

    expect(inbound).toContain('approvalDoc')
    expect(inbound).toContain('approvalSteps')
    expect(inbound).toContain('title: \'입 고 전 표\'')
    expect(inbound).not.toContain('[인]')
    expect(inbound).not.toContain('inbound-logo')

    expect(quote).toContain('approvalDoc')
    expect(quote).toContain('approvalSteps')
    expect(quote).toContain('title: \'견 적 서\'')
    expect(quote).not.toContain('[직인]')
    expect(quote).not.toContain('quote-logo')
  })

  test('excluded print views do not opt into the approval document layout', () => {
    for (const file of [
      'clients/desktop/src/renderer/print/OutboundView.tsx',
      'clients/desktop/src/renderer/print/InvoiceView.tsx',
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
