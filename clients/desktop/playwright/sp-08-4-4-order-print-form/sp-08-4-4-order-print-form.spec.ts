import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

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

    expect(page).toContain('PRINT_ROLES')
    expect(page).toContain("'PARTNER'")
    expect(page).toContain('partner-order-print-open')
    expect(page).toContain('variant="secondary"')
    expect(page).toContain('/api/v1/partner-orders/${encodeURIComponent(orderId)}/print')
    expect(page).toContain("window.open(url, '_blank', 'width=900,height=1200')")
  })

  test('T3: print stylesheet @media print 정의', () => {
    const css = read('clients/desktop/src/renderer/components/sales/print.module.css')
    const service = read('services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderPrintService.java')

    expect(css).toContain('@media print')
    expect(css).toContain('@page')
    expect(css).toContain('Pretendard')
    expect(service).toContain('@font-face')
    expect(service).toContain("'Pretendard'")
  })

  test('T4: A4 layout 정합', () => {
    const css = read('clients/desktop/src/renderer/components/sales/print.module.css')
    const service = read('services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderPrintService.java')

    expect(css).toContain('width: 210mm')
    expect(css).toContain('min-height: 297mm')
    expect(css).toContain('page-break-after: avoid')
    expect(service).toContain('width: 210mm;')
    expect(service).toContain('min-height: 297mm;')
    expect(service).toContain('거래처 정보')
    expect(service).toContain('날인란')
  })

  test('T5: PARTNER role 본인 주문만 인쇄 가능', () => {
    const controller = read('services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/PartnerOrderPrintController.java')
    const service = read('services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderPrintService.java')
    const it = read('services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/it/PartnerOrderPrintIT.java')

    expect(controller).toContain('HttpHeaderConstants.CALLER_ROLE_HEADER')
    expect(controller).toContain('X-Partner-Code')
    expect(service).toContain('"PARTNER".equalsIgnoreCase')
    expect(service).toContain('본인 거래처 주문서만 인쇄할 수 있습니다.')
    expect(it).toContain('testPrintPartnerRoleSeesOwnOrderOnly')
    expect(it).toContain('.andExpect(status().isForbidden())')
  })
})
