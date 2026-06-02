import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path, { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = path.resolve(__dirname, '../../../..')

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

test.describe('SP-08-4-4 주문 인쇄 양식 정적 계약', () => {
  test('T1: BE GET /print endpoint contract', () => {
    const controller = read('services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/PartnerOrderPrintController.java')
    const service = read('services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderPrintService.java')
    const it = read('services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/it/PartnerOrderPrintIT.java')

    expect(controller).toContain('@GetMapping(value = "/{id}/print"')
    expect(controller).toContain('MediaType.TEXT_HTML_VALUE + ";charset=UTF-8"')
    expect(controller).toContain("@PreAuthorize(\"hasAnyRole('SALES','MANAGER','MASTER','PARTNER')\")")
    expect(service).toContain('PartnerOrderIdResolver.findByIdentifier')
    expect(service).toContain('@media print')
    expect(service).toContain('@page { size: A4; margin: 0; }')
    expect(it).toContain('testPrintSuccessHtmlReturns200')
  })

  test('T2: FE 주문 상세 인쇄 버튼', () => {
    const page = read('clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx')
    const routes = read('clients/desktop/src/renderer/routes/index.tsx')

    expect(page).toContain('PRINT_ROLES')
    expect(page).toContain('partner-order-print-open')
    expect(page).toContain('variant="secondary"')
    expect(page).toContain('/api/v1/partner-orders/${encodeURIComponent(orderId)}/print')
    expect(page).toContain("apiClient.get")
    expect(page).toContain('URL.createObjectURL')
    expect(page).toContain("window.open(url, '_blank')")
    expect(page).toContain('opened.opener = null')
    expect(routes).toContain("const SALES_PARTNER_ORDER_ROLES = ['SALES', 'MANAGER', 'MASTER'] as const")
  })

  test('T3: BE inline print stylesheet @media print 정의', () => {
    const service = read('services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderPrintService.java')

    expect(service).toContain('@font-face')
    expect(service).toContain("'Pretendard Variable', Pretendard")
    expect(service).toContain('tr { page-break-inside: avoid; }')
  })

  test('T4: A4 layout 정합', () => {
    const service = read('services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderPrintService.java')

    expect(service).toContain('width: 210mm;')
    expect(service).toContain('min-height: 297mm;')
    expect(service).toContain('page-break-after: avoid;')
    expect(service).toContain('거래처 정보')
    expect(service).toContain('날인란')
  })

  test('T5: PARTNER role 본인 주문만 인쇄 가능', () => {
    const controller = read('services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/PartnerOrderPrintController.java')
    const service = read('services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderPrintService.java')
    const it = read('services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/it/PartnerOrderPrintIT.java')

    expect(controller).toContain('HttpHeaderConstants.PARTNER_CODE_HEADER')
    expect(controller).not.toContain('CALLER_ROLE_HEADER')
    expect(service).toContain('ROLE_PARTNER')
    expect(service).toContain('SecurityContextHolder')
    expect(service).toContain('본인 거래처 주문서만 인쇄할 수 있습니다.')
    expect(it).toContain('testPrintPartnerRoleSeesOwnOrderOnly')
    expect(it).toContain('testPrintPartnerSpoofedRoleHeaderRejected')
    expect(it).toContain('.andExpect(status().isForbidden())')
  })
})
