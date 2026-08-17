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

// [Round A P1] assertInOrder 헬퍼는 7카테고리 순서 단언과 함께
//   menu-relocate/menu-ia-contract.spec.ts 로 이전됨.

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

  // [Round A P1] 7그룹 IA 구조 단언 3건(홈/대시보드 · 7카테고리 순서+구그룹 부재 · 이동항목 route/testid)은
  //   testIgnore 비대상 디렉터리 playwright/menu-relocate/menu-ia-contract.spec.ts 로 이전(CI 수집 보장).
  //   본 스펙은 testIgnore 격리 상태라 여기 두면 false-green 이었다. 잔여는 legacy-GAS 소스 의존 단언만 유지.

  test('management labels replace 조회-only primary menu labels', () => {
    expect(appLayout).toContain('판매관리')
    expect(appLayout).toContain('구매관리')
    expect(appLayout).toContain('재고이동 관리')
    expect(appLayout).toContain('창고관리')
    expect(appLayout).not.toContain('>판매조회<')
    expect(appLayout).not.toContain('>구매조회<')
  })

  test('sidebar links and router guards match backend write/export contracts', () => {
    expect(appLayout).toMatch(/const showDeliveryBatch = dynamicCanAccess\('slip\.delivery-batch',\s*'view'\)/)
    expect(appLayout).toMatch(/const showPartnerDcConfig = dynamicCanAccess\('sales\.partner-dc-config',\s*'view'\)/)
    expect(appLayout).toMatch(/const showSlipCleanup = dynamicCanAccess\('slip\.cleanup', 'view'\)/)
    expect(routes).toMatch(/path: '\/sales\/slip-cleanup'[\s\S]*<PermissionGuard pageCode="slip\.cleanup" action="view">[\s\S]*<SlipCleanupPage \/>/)
    expect(slipCleanup).not.toContain('SLIP_CLEANUP_ROLES')

    expect(routes).toMatch(/path: '\/sales\/new'[\s\S]*<PermissionGuard pageCode="sales\.slip\.create" action="view">[\s\S]*<SlipFormPage mode="OUTBOUND" \/>/)
    expect(routes).toMatch(/path: '\/purchases\/new'[\s\S]*<PermissionGuard pageCode="sales\.slip\.create" action="view">[\s\S]*<SlipFormPage mode="INBOUND" \/>/)
    expect(routes).toMatch(/path: '\/transfers\/new'[\s\S]*<PermissionGuard pageCode="inventory\.stock-transfer" action="view">[\s\S]*<TransferFormPage \/>/)
    expect(routes).toMatch(/path: '\/sales\/link-dispatch'[\s\S]*<PermissionGuard pageCode="slip\.delivery-batch" action="view">/)
    expect(routes).toMatch(/path: '\/sales\/partner-dc-config'[\s\S]*<PermissionGuard pageCode="sales\.partner-dc-config" action="view">/)
  })

  test('partner DC settings have gateway route and method-level role guards', () => {
    const route = ymlRouteBlock(apiGatewayConfig, 'dc-config-partner-dc-configs-v1')
    expect(route).toContain('Path=/api/v1/partner-dc-configs/**')
    expect(route).toContain('JwtAuthentication')
    expect(route).not.toContain('StripPrefix=2')
    expect(dcConfigController).toContain('@RequirePermission(page = "sales.partner-dc-config", action = PermissionAction.VIEW)')
    expect(dcConfigController).toContain('@RequirePermission(page = "sales.partner-dc-config", action = PermissionAction.UPDATE)')
  })

  test('admin-origin operational screens are standalone guarded routes', () => {
    // [C5 후속] blocked-partners/aligo-address-book 은 C2b(#403)에서 PermissionGuard 전환 —
    // 구 RoleGuard 단언은 stale 이었다 (본 spec 은 testIgnore 격리 상태이나 격리 해제 대비 현행화).
    expect(routes).toMatch(/path: '\/admin\/sheet-sync'[\s\S]*PermissionGuard pageCode="products\.sync" action="view"/)
    expect(routes).toMatch(/path: '\/admin\/blocked-partners'[\s\S]*PermissionGuard pageCode="partners\.block" action="view"/)
    expect(routes).toMatch(/path: '\/admin\/aligo-address-book'[\s\S]*PermissionGuard pageCode="aligo\.address-book" action="view"/)
  })

  test('dispatch role is assignable and wired to dispatch menus', () => {
    expect(roleJava).toContain('DISPATCH("배차담당자")')
    expect(appLayout).toContain('sidebar-dispatch-board')
    expect(appLayout).toContain('sidebar-arologis-dispatch-reconcile')
    // [C5 후속] ROLES 상수 제거 — 실배차 비교 라우트는 arologis.dispatch.ops PermissionGuard.
    expect(routes).toMatch(/path: '\/arologis\/dispatch-reconcile'[\s\S]*?PermissionGuard pageCode="arologis\.dispatch\.ops" action="view"/)
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
    expect(quoteGas).toContain("const SRC_SHEET_ID      = '<SHEET_ID>'")
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
