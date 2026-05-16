import { expect, test } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const specDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(specDir, '../../../..')

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8')
}

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1
}

function ymlRouteBlock(text: string, routeId: string): string {
  const start = text.indexOf(`- id: ${routeId}`)
  if (start < 0) return ''
  const next = text.indexOf('\n        - id:', start + 1)
  return text.slice(start, next < 0 ? text.length : next)
}

function csvNonEmptyRows(relDir: string): number {
  const dir = path.join(repoRoot, 'tools/legacy-gas/_notion-export', relDir)
  const csvName = fs.readdirSync(dir)
    .filter((name) => name.endsWith('.csv') && !name.endsWith('_all.csv'))
    .sort()[0]
  const text = fs.readFileSync(path.join(dir, csvName), 'utf8').replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuote = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]
    if (ch === '"') {
      if (inQuote && next === '"') {
        cell += '"'
        i += 1
      } else {
        inQuote = !inQuote
      }
    } else if (ch === ',' && !inQuote) {
      row.push(cell)
      cell = ''
    } else if ((ch === '\n' || ch === '\r') && !inQuote) {
      if (ch === '\r' && next === '\n') i += 1
      row.push(cell)
      if (row.some((value) => value.trim().length > 0)) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += ch
    }
  }
  row.push(cell)
  if (row.some((value) => value.trim().length > 0)) rows.push(row)
  return rows.slice(1).filter((cells) => {
    const firstCell = cells[0]?.trim()
    return !!firstCell
  }).length
}

test.describe('SP-04 full menu and legacy migration contract', () => {
  const appLayout = read('clients/desktop/src/renderer/components/AppLayout.tsx')
  const routes = read('clients/desktop/src/renderer/routes/index.tsx')
  const delivery = read('clients/desktop/src/renderer/api/delivery.ts')
  const excelExport = read('clients/desktop/src/renderer/api/excelExportApi.ts')
  const slipCleanup = read('clients/desktop/src/renderer/api/slipCleanupApi.ts')
  const roleJava = read('shared/common/src/main/java/com/samhanair/logis/common/security/Role.java')
  const transferService = read('services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockTransferService.java')
  const transferTest = read('services/inventory-service/src/test/java/com/samhanair/logis/inventory/service/StockTransferServiceTest.java')
  const estimateNumberService = read('services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/service/EstimateNumberService.java')
  const partnerOrderConfirmService = read('services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConfirmService.java')
  const desktopMock = read('clients/desktop/src/renderer/api/mock.ts')
  const legacyReport = read('docs/dev-reports/legacy-gas-cross-check-2026-05-11.md')
  const importScript = read('tools/operational-validation/import-notion-csv.ps1')
  const apiGatewayConfig = read('services/api-gateway/src/main/resources/application.yml')
  const dcConfigController = read('services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/web/PartnerDcConfigsController.java')
  const quoteGas = read('tools/legacy-gas/종합견적서/Code.js')
  const orderGas = read('tools/legacy-gas/거래처 발송 주문서/Code.js')
  const productSheetSync = read('services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java')
  const productCatalogLookup = read('services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/vendor/client/ProductCatalogLookupClient.java')
  const partnerOrderApplication = read('services/partner-order-service/src/main/resources/application.yml')

  test('management labels replace 조회-only primary menu labels', () => {
    expect(appLayout).toContain('판매관리')
    expect(appLayout).toContain('구매관리')
    expect(appLayout).toContain('재고이동 관리')
    expect(appLayout).toContain('창고 관리')
    expect(appLayout).not.toContain('>판매조회<')
    expect(appLayout).not.toContain('>구매조회<')
  })

  test('sidebar links and router guards match backend write/export contracts', () => {
    expect(delivery).toContain("DELIVERY_BATCH_ROLES = ['MANAGER', 'MASTER']")
    expect(excelExport).toContain("role === 'MANAGER' || role === 'MASTER'")
    expect(slipCleanup).toMatch(/SLIP_CLEANUP_ROLES[\s\S]*'SALES'[\s\S]*'MANAGER'[\s\S]*'MASTER'/)
    expect(slipCleanup).not.toContain("'ACCOUNTANT'")

    expect(routes).toMatch(/path: '\/sales\/new'[\s\S]*RoleGuard allow=\{SLIP_CREATE_ROLES\}/)
    expect(routes).toMatch(/path: '\/purchases\/new'[\s\S]*RoleGuard allow=\{SLIP_CREATE_ROLES\}/)
    expect(routes).toMatch(/path: '\/transfers\/new'[\s\S]*RoleGuard allow=\{TRANSFER_CREATE_ROLES\}/)
    expect(routes).toMatch(/path: '\/sales\/link-dispatch'[\s\S]*RoleGuard allow=\{DELIVERY_BATCH_ROLES\}/)
    expect(routes).toMatch(/path: '\/sales\/partner-dc-config'[\s\S]*RoleGuard allow=\{PARTNER_DC_CONFIG_ROLES\}/)
  })

  test('partner DC settings have gateway route and method-level role guards', () => {
    const route = ymlRouteBlock(apiGatewayConfig, 'dc-config-partner-dc-configs-v1')
    expect(route).toContain('Path=/api/v1/partner-dc-configs/**')
    expect(route).toContain('JwtAuthentication')
    expect(route).not.toContain('StripPrefix=2')
    expect(dcConfigController).toContain("@PreAuthorize(\"hasAnyRole('SALES','MANAGER','MASTER')\")")
    expect(dcConfigController).toContain("@PreAuthorize(\"hasAnyRole('MANAGER','MASTER')\")")
  })

  test('admin-origin operational screens are standalone guarded routes', () => {
    expect(routes).toMatch(/path: '\/admin\/sheet-sync'[\s\S]*RoleGuard allow=\{SHEET_SYNC_ROLES\}/)
    expect(routes).toMatch(/path: '\/admin\/blocked-partners'[\s\S]*RoleGuard allow=\{BLOCKED_PARTNER_ROLES\}/)
    expect(routes).toMatch(/path: '\/admin\/aligo-address-book'[\s\S]*RoleGuard allow=\{ALIGO_ADDRESS_BOOK_ROLES\}/)
  })

  test('dispatch role is assignable and wired to dispatch menus', () => {
    expect(roleJava).toContain('DISPATCH("배차담당자")')
    expect(appLayout).toContain('sidebar-dispatch-board')
    expect(appLayout).toContain('sidebar-arologis-dispatch-reconcile')
    expect(routes).toContain('ARO_DISPATCH_RECONCILE_ROLES')
  })

  test('region menu has a single public entry with dispatch read-only path', () => {
    expect(countOccurrences(appLayout, 'to="/admin/regions"')).toBe(1)
    expect(appLayout).not.toContain('지역 분류')
    expect(appLayout).toContain('배차지역 관리')
  })

  test('stock transfer numbers keep YYYY/MM/DD-N without T/TR prefixes', () => {
    expect(transferService).toContain('DateTimeFormatter.ofPattern("yyyy/MM/dd")')
    expect(transferService).toContain('return prefix + seq')
    expect(transferTest).toContain('.doesNotStartWith("T-")')
    expect(transferTest).toContain('.doesNotStartWith("TR-")')
  })

  test('estimate and order numbers follow the same YYYY/MM/DD-N public standard', () => {
    expect(estimateNumberService).toContain('DateTimeFormatter.ofPattern("yyyy/MM/dd")')
    expect(estimateNumberService).toContain('return estimateDate.format(DATE_FMT) + "-" + seqNo')
    expect(estimateNumberService).not.toContain('EQ-')
    expect(partnerOrderConfirmService).toContain('return datePrefix + "-" + (maxSeq + 1)')
    expect(desktopMock).not.toContain('EST-2026')
    expect(desktopMock).not.toContain('PO-2026')
    expect(desktopMock).not.toContain('PO-AD')
    expect(desktopMock).not.toContain('PO-JS')
  })

  test('legacy GAS and Notion migration evidence is preserved', () => {
    expect(legacyReport).toContain('Legacy GAS 27개 카테고리 cross-check 보고서')
    expect(legacyReport).toContain('진짜 미이식')
    expect(importScript).toContain('Get-CsvDataRowCount')
    expect(importScript).toContain('expectedRows=$expectedRows')
  })

  test('integrated quote and order sheet source tabs are preserved', () => {
    expect(quoteGas).toContain("const SRC_SHEET_ID      = '1RJqO3jT-yJTi3NDBhL60o_cZWlVETGTU7UlvIKXuVNQ'")
    expect(quoteGas).toContain("const HOME_NAME         = '홈멀티_단가인상'")
    expect(quoteGas).toContain("const SINGLE_NAME       = '싱글 세트_단가인상'")
    expect(quoteGas).toContain("const COMM_PARTS_NAME   = '상업멀티 구성_단가인상'")
    expect(orderGas).toContain("const HOME_NAME         = '홈멀티'")
    expect(orderGas).toContain("const SINGLE_NAME       = '싱글 세트'")
    expect(orderGas).toContain("const COMM_PARTS_NAME   = '상업멀티 구성'")

    expect(productSheetSync).toContain('new SheetTabMapping("싱글 세트"')
    expect(productSheetSync).toContain('0, 2, 4, 7')
    expect(productSheetSync).toContain('new SheetTabMapping("상업멀티 구성"')
    expect(productSheetSync).toContain('0, 1, 3, 5')
    expect(productCatalogLookup).toContain('홈멀티_단가인상!A1:Z')
    expect(productCatalogLookup).toContain('싱글 세트_단가인상!A1:Z')
    expect(productCatalogLookup).toContain('상업멀티 구성_단가인상!A1:Z')
    expect(productCatalogLookup).not.toContain('종합견적서!A2:C')
    expect(partnerOrderApplication).toContain('catalog-range: ${INTEGRATED_QUOTE_RANGE:}')
  })

  test('current Notion CSV exports match audited row counts', () => {
    expect(csvNonEmptyRows('가배차용 지역별 분류표')).toBe(20)
    expect(csvNonEmptyRows('거래처 DC정보')).toBe(213)
    expect(csvNonEmptyRows('단톡방리스트')).toBe(112)
    expect(csvNonEmptyRows('발송금지리스트')).toBe(6)
  })
})
