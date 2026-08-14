import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repo = resolve(__dirname, '../../../../..')
const read = (relativePath: string) => readFileSync(resolve(repo, relativePath), 'utf8')

describe('detail window and list column contracts', () => {
  it('confirmed display-only date keys remain absent', () => {
    const removed = [
      ['clients/desktop/src/renderer/routes/TaxInvoiceListPage.tsx', "key: 'supplyDate'"],
      ['clients/desktop/src/renderer/routes/accounting/TaxInvoiceBatchIssuePage.tsx', "key: 'slipDate'"],
      ['clients/desktop/src/renderer/routes/accounting/TaxInvoiceInboundPage.tsx', "key: 'slipDate'"],
      ['clients/desktop/src/renderer/routes/accounting/SalesAccountingSlipPage.tsx', "key: 'slipDate'"],
      ['clients/desktop/src/renderer/routes/accounting/PurchaseAccountingSlipPage.tsx', "key: 'slipDate'"],
      ['clients/desktop/src/renderer/routes/JournalListPage.tsx', "key: 'journalDate'"],
      ['clients/desktop/src/renderer/routes/GeneralLedgerPage.tsx', "key: 'date'"],
    ] as const
    for (const [file, token] of removed) expect(read(file), file).not.toContain(token)
  })

  it('period filters, sort keys and exports remain present', () => {
    expect(read('clients/desktop/src/renderer/routes/sales-query/SalesQueryPage.tsx')).toContain('slipDate')
    expect(read('clients/desktop/src/renderer/routes/purchase-query/PurchaseQueryPage.tsx')).toContain('slipDate')
    expect(read('clients/desktop/src/renderer/routes/accounting/SalesAccountingSlipPage.tsx')).toContain('from')
    expect(read('clients/desktop/src/renderer/routes/accounting/SalesAccountingSlipPage.tsx')).toContain('to')
    expect(read('clients/desktop/src/renderer/routes/GeneralLedgerPage.tsx')).toContain('filterFrom')
    expect(read('clients/desktop/src/renderer/routes/GeneralLedgerPage.tsx')).toContain('filterTo')
    expect(read('clients/desktop/src/renderer/routes/PartnerLedgerPage.tsx')).toContain('ln.date')
    expect(read('clients/desktop/src/renderer/routes/SlipCleanupPage.tsx')).toContain('e.slipDate')
    expect(read('services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipExcelExportService.java')).toContain('slipDate')
    expect(read('services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/JournalExcelExportService.java')).toContain('journalDate')
  })

  it('sales and purchase query number links use the detail-window bridge', () => {
    expect(read('clients/desktop/src/renderer/routes/sales-query/SalesQueryPage.tsx')).toContain("documentType: 'OUTBOUND_SLIP'")
    expect(read('clients/desktop/src/renderer/routes/purchase-query/PurchaseQueryPage.tsx')).toContain("documentType: 'INBOUND_SLIP'")
  })

  it('the rendered estimate source table displays web-origin writtenAt', () => {
    const source = read('clients/desktop/src/renderer/routes/EstimateListPage.tsx')
    expect(source).toContain("key: 'writtenAt'")
    expect(source).toContain("header: '작성일'")
    expect(source).toContain('columns={sourceColumns}')
  })
})
