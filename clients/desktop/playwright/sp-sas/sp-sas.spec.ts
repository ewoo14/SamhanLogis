import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../../..')

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8')
}

test.describe('SP-SAS-5 admin UI and daily closing revision contract', () => {
  const dailyClosing = read('services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/DailyClosing.java')
  const migration = read('services/accounting-service/src/main/resources/db/migration/V21__alter_daily_closings_add_kinds.sql')
  const dailyService = read('services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/DailyClosingService.java')
  const monthEndService = read('services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java')
  const controller = read('services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/DailyClosingController.java')
  const reportController = read('services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java')
  const createDto = read('services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/CreateDailyClosingRequest.java')
  const responseDto = read('services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/DailyClosingResponse.java')
  const detailDto = read('services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/DailyClosingDetailResponse.java')
  const salesApi = read('clients/desktop/src/renderer/api/salesAccountingSlipApi.ts')
  const purchaseApi = read('clients/desktop/src/renderer/api/purchaseAccountingSlipApi.ts')
  const taxAdminApi = read('clients/desktop/src/renderer/api/taxInvoiceAdminApi.ts')
  const allocationEditor = read('clients/desktop/src/renderer/components/SlipLineAllocationEditor.tsx')
  const salesPage = read('clients/desktop/src/renderer/routes/accounting/SalesAccountingSlipPage.tsx')
  const salesForm = read('clients/desktop/src/renderer/routes/accounting/SalesAccountingSlipFormPage.tsx')
  const purchasePage = read('clients/desktop/src/renderer/routes/accounting/PurchaseAccountingSlipPage.tsx')
  const purchaseForm = read('clients/desktop/src/renderer/routes/accounting/PurchaseAccountingSlipFormPage.tsx')
  const batchPage = read('clients/desktop/src/renderer/routes/accounting/TaxInvoiceBatchIssuePage.tsx')
  const inboundPage = read('clients/desktop/src/renderer/routes/accounting/TaxInvoiceInboundPage.tsx')
  const closingApi = read('clients/desktop/src/renderer/api/closingApi.ts')
  const accountingApi = read('clients/desktop/src/renderer/api/accounting.ts')
  const dailyPage = read('clients/desktop/src/renderer/routes/DailyClosingPage.tsx')
  const routes = read('clients/desktop/src/renderer/routes/index.tsx')
  const layout = read('clients/desktop/src/renderer/components/AppLayout.tsx')
  const permissionsApi = read('clients/desktop/src/renderer/api/permissionsApi.ts')
  const permissionMatrix = read('clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx')
  const mockApi = read('clients/desktop/src/renderer/api/mock.ts')

  test('1 BE daily closing kind enums are present', () => {
    expect(read('services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/DailyClosingKind.java')).toContain('SALES')
    expect(read('services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/DailyClosingSourceKind.java')).toContain('PURCHASE_SLIP')
  })

  test('2 V21 migration backfills and constrains daily closing kind/source', () => {
    expect(migration).toContain('closing_kind')
    expect(migration).toContain('source_kind')
    expect(migration).toContain("'SALES'")
    expect(migration).toContain("'TAX_INVOICE'")
    expect(migration).toContain('idx_dc_kind_source')
  })

  test('3 DailyClosing domain keeps create backward compatibility and adds createV2', () => {
    expect(dailyClosing).toContain('@Deprecated')
    expect(dailyClosing).toContain('createV2')
    expect(dailyClosing).toContain('DailyClosingKind.SALES')
    expect(dailyClosing).toContain('DailyClosingSourceKind.TAX_INVOICE')
  })

  test('4 daily closing DTOs expose kind/source and detail slip columns', () => {
    expect(createDto).toContain('DailyClosingKind closingKind')
    expect(createDto).toContain('DailyClosingSourceKind sourceKind')
    expect(responseDto).toContain('DailyClosingKind closingKind')
    expect(detailDto).toContain('String salesSlipNo')
    expect(detailDto).toContain('String sourceSlipNo')
  })

  test('5 DailyClosingService branches source kinds and rejects impossible pairings', () => {
    expect(dailyService).toContain('case TAX_INVOICE')
    expect(dailyService).toContain('case SALES_SLIP')
    expect(dailyService).toContain('case PURCHASE_SLIP')
    expect(dailyService).toContain('SALES + PURCHASE_SLIP')
    expect(dailyService).toContain('PURCHASE + SALES_SLIP')
  })

  test('6 controllers expose kind/source query parameters', () => {
    expect(controller).toContain('@RequestParam(required = false) DailyClosingKind kind')
    expect(controller).toContain('@RequestParam(required = false) DailyClosingSourceKind sourceKind')
    expect(reportController).toContain('getDailyDetail(date, kind, sourceKind)')
  })

  test('7 MonthEndClose detail supports tax invoice, sales slip, and purchase slip sources', () => {
    expect(monthEndService).toContain('getTaxInvoiceDailyDetail')
    expect(monthEndService).toContain('getSalesSlipDailyDetail')
    expect(monthEndService).toContain('getPurchaseSlipDailyDetail')
    expect(monthEndService).toContain('firstSalesSourceSlipNo')
    expect(monthEndService).toContain('firstPurchaseSourceSlipNo')
  })

  test('8 sales and purchase accounting slip API clients expose draft and post calls', () => {
    expect(salesApi).toContain('createSalesSlipDraft')
    expect(salesApi).toContain('postSalesSlip')
    expect(salesApi).toContain('/admin/sales-slips')
    expect(purchaseApi).toContain('createPurchaseSlipDraft')
    expect(purchaseApi).toContain('postPurchaseSlip')
    expect(purchaseApi).toContain('/admin/purchase-slips')
  })

  test('9 allocation editor provides outbound/inbound search fixtures and over-allocation warning', () => {
    expect(allocationEditor).toContain('SlipLineAllocationEditor')
    expect(allocationEditor).toContain('OUTBOUND')
    expect(allocationEditor).toContain('INBOUND')
    expect(allocationEditor).toContain('type="range"')
    expect(allocationEditor).toContain('원천 금액보다 많이 배분')
  })

  test('10 sales accounting slip pages are routed and connected to allocation editor', () => {
    expect(salesPage).toContain('sales-accounting-slip-page')
    expect(salesForm).toContain('sales-accounting-slip-form-page')
    expect(salesForm).toContain('SlipLineAllocationEditor')
    expect(routes).toContain("path: '/accounting/sales-slips'")
    expect(routes).toContain("path: '/accounting/sales-slips/new'")
  })

  test('11 purchase accounting slip pages mirror sales pages', () => {
    expect(purchasePage).toContain('purchase-accounting-slip-page')
    expect(purchaseForm).toContain('purchase-accounting-slip-form-page')
    expect(purchaseForm).toContain('SlipLineAllocationEditor')
    expect(routes).toContain("path: '/accounting/purchase-slips'")
    expect(routes).toContain("path: '/accounting/purchase-slips/new'")
  })

  test('12 tax invoice batch issue and inbound pages call SP-SAS endpoints', () => {
    expect(taxAdminApi).toContain('/admin/tax-invoices/batch-from-sales-slips')
    expect(taxAdminApi).toContain('/admin/tax-invoices/inbound')
    expect(taxAdminApi).toContain('uploadInboundTaxInvoiceAttachment')
    expect(batchPage).toContain('tax-invoice-batch-issue-page')
    expect(inboundPage).toContain('tax-invoice-inbound-page')
  })

  test('13 DailyClosingPage is single-day, has kind toggle, and exposes detail slip columns', () => {
    expect(dailyPage).toContain('daily-closing-filter-date')
    expect(dailyPage).not.toContain('daily-closing-filter-from')
    expect(dailyPage).not.toContain('daily-closing-filter-to')
    expect(dailyPage).toContain('closing-kind-toggle')
    expect(dailyPage).toContain('salesSlipNo')
    expect(dailyPage).toContain('sourceSlipNo')
    expect(closingApi).toContain('sourceKind?: DailyClosingSourceKind')
    expect(accountingApi).toContain("params['sourceKind']")
  })

  test('14 accounting sidebar integrates the 17 accounting menu contracts', () => {
    const expectedRoutes = [
      '/accounting/sales-slips',
      '/accounting/purchase-slips',
      '/accounting/tax-invoices',
      '/accounting/tax-invoices/batch',
      '/accounting/tax-invoices/inbound',
      '/accounting/hometax-export',
      '/accounting/daily-closing',
      '/accounting/period-close',
      '/accounting/ledgers',
      '/accounting/partner-ledger',
      '/accounting/journals',
      '/accounting/balances',
      '/accounting/accounts',
      '/accounting/statement-batch',
      '/accounting/reports',
    ]
    for (const route of expectedRoutes) expect(layout).toContain(route)
  })

  test('15 new PageCodes are represented in permissions API, matrix, and mock cache', () => {
    for (const code of [
      'accounting.sales-slip.list',
      'accounting.purchase-slip.list',
      'accounting.tax-invoice.batch-issue',
      'accounting.tax-invoice.inbound',
    ]) {
      expect(permissionsApi).toContain(code)
      expect(permissionMatrix).toContain(code)
      expect(mockApi).toContain(code)
    }
  })
})
