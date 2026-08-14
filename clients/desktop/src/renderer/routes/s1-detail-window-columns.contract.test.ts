import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repo = resolve(__dirname, '../../../../..')
const read = (relativePath: string) => readFileSync(resolve(repo, relativePath), 'utf8')

describe('S1 작성일 표시 열 제거 계약', () => {
  it('확정 삭제 표면은 표시용 날짜 열 없이 번호와 업무 열만 렌더링한다', () => {
    const displayColumns = [
      ['clients/desktop/src/renderer/routes/EstimateListPage.tsx', "key: 'estimateDate'", "header: '작성일'"],
      ['clients/desktop/src/renderer/routes/EstimateListPage.tsx', "key: 'writtenAt'", "header: '작성일'"],
      ['clients/desktop/src/renderer/routes/TaxInvoiceListPage.tsx', "key: 'supplyDate'", "header: '작성일'"],
      ['clients/desktop/src/renderer/routes/accounting/TaxInvoiceBatchIssuePage.tsx', "key: 'slipDate'", "header: '일자'"],
      ['clients/desktop/src/renderer/routes/accounting/TaxInvoiceInboundPage.tsx', "key: 'slipDate'", "header: '일자'"],
      ['clients/desktop/src/renderer/routes/accounting/SalesAccountingSlipPage.tsx', "key: 'slipDate'", "header: '일자'"],
      ['clients/desktop/src/renderer/routes/accounting/PurchaseAccountingSlipPage.tsx', "key: 'slipDate'", "header: '일자'"],
      ['clients/desktop/src/renderer/routes/sales-query/SalesQueryPage.tsx', '<Th width="100px">출고일자</Th>', '<Td>{row.slipDate ?? \'—\'}</Td>'],
      ['clients/desktop/src/renderer/routes/purchase-query/PurchaseQueryPage.tsx', "key: 'slipDate'", "label: '전표일자'"],
      ['clients/desktop/src/renderer/routes/JournalListPage.tsx', "key: 'journalDate'", "header: '일자'"],
      ['clients/desktop/src/renderer/routes/GeneralLedgerPage.tsx', "key: 'date'", "header: '일자'"],
      ['clients/desktop/src/renderer/routes/PartnerLedgerPage.tsx', '<th style={{ ...thStyle, width: 110 }}>일자</th>', '<td style={tdStyle}>{ln.date}</td>'],
      ['clients/desktop/src/renderer/routes/SlipCleanupPage.tsx', '<th style={thStyle}>전표일자</th>', '<td style={tdStyle}>{entry.slipDate}</td>'],
    ] as const

    for (const [file, first, second] of displayColumns) {
      const source = read(file)
      expect(source, file).not.toContain(first)
      expect(source, file).not.toContain(second)
    }
  })

  it('날짜 필터·정렬·내보내기 계약은 표시 열 제거와 무관하게 보존한다', () => {
    const salesQuery = read('clients/desktop/src/renderer/routes/sales-query/SalesQueryPage.tsx')
    const purchaseQuery = read('clients/desktop/src/renderer/routes/purchase-query/PurchaseQueryPage.tsx')
    const accountingSlip = read('clients/desktop/src/renderer/routes/accounting/SalesAccountingSlipPage.tsx')
    const journal = read('clients/desktop/src/renderer/routes/JournalListPage.tsx')
    const ledger = read('clients/desktop/src/renderer/routes/GeneralLedgerPage.tsx')
    const partnerLedger = read('clients/desktop/src/renderer/routes/PartnerLedgerPage.tsx')
    const cleanup = read('clients/desktop/src/renderer/routes/SlipCleanupPage.tsx')
    const slipExport = read('services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipExcelExportService.java')
    const journalExport = read('services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/JournalExcelExportService.java')

    expect(salesQuery).toContain('slipDate')
    expect(purchaseQuery).toContain('slipDate')
    expect(accountingSlip).toContain('from')
    expect(accountingSlip).toContain('to')
    expect(ledger).toContain('filterFrom')
    expect(ledger).toContain('filterTo')
    expect(partnerLedger).toContain('ln.date')
    expect(cleanup).toContain('e.slipDate')
    expect(slipExport).toContain('Sort.by(Sort.Direction.DESC, "slipDate")')
    expect(slipExport).toContain('ExcelColumn.text("전표일자"')
    expect(journalExport).toContain('Sort.by(Sort.Direction.DESC, "journalDate")')
    expect(journalExport).toContain('ExcelColumn.text("분개일자"')
  })
})
