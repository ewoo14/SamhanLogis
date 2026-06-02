import { expect, test } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const specDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(specDir, '../../../..')
const UUID_REGEX = /\b(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8')
}

test.describe('SP-08-4-1 주문 목록/상세 계약', () => {
  test('backend detail DTO exposes order header and lines without UUID fields', () => {
    const controller = read('services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/PartnerOrderListController.java')
    const service = read('services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderQueryService.java')
    const detailDto = read('services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/PartnerOrderDetailResponse.java')
    const summaryDto = read('services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/PartnerOrderSummaryResponse.java')
    const errorCode = read('shared/common/src/main/java/com/samhanair/logis/common/exception/ErrorCode.java')

    expect(controller).toContain('@GetMapping("/{id}")')
    expect(controller).toContain('partnerOrderQueryService.findDetailById(id, partnerCode)')
    expect(service).toContain('PartnerOrderIdResolver.findByIdentifier(partnerOrderRepository, id)')
    expect(service).toContain('PARTNER_ORDER_NOT_FOUND')
    expect(errorCode).toContain('PARTNER_ORDER_NOT_FOUND(HttpStatus.NOT_FOUND')
    expect(summaryDto).toContain('String orderNumber')
    expect(summaryDto).toContain('String partnerCode')
    expect(summaryDto).toContain('String partnerName')
    expect(detailDto).toContain('List<LineResponse> lines')
    expect(detailDto).toContain('String modelCode')
    expect(detailDto).toContain('String productName')
    expect(detailDto).not.toMatch(/record LineResponse\([\s\S]*\bUUID\b/)
    expect(detailDto).not.toMatch(/record LineResponse\([\s\S]*\bString id\b/)
  })

  test('frontend wires four filters and safe detail navigation', () => {
    const listPage = read('clients/desktop/src/renderer/routes/SalesPartnerOrderListPage.tsx')
    const detailPage = read('clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx')
    const salesApi = read('clients/desktop/src/renderer/api/sales.ts')

    expect(salesApi).toContain("params['dateFrom']")
    expect(salesApi).toContain("params['dateTo']")
    expect(salesApi).toContain("params['partnerId']")
    expect(salesApi).toContain("params['searchKeyword']")
    expect(salesApi).toContain("'CONFIRMING'")
    expect(listPage).toContain('partner-order-list-date-from')
    expect(listPage).toContain('partner-order-list-date-to')
    expect(listPage).toContain('partner-order-list-partner-filter')
    expect(listPage).toContain('partner-order-list-keyword-filter')
    expect(listPage).toContain('toOrderPathId(o.orderNumber)')
    expect(detailPage).toContain("query.data?.orderNumber ?? '조회 중'")
    expect(detailPage).toContain('bundleModeLabel')

    const mockUi = `
      <main>
        <input data-testid="partner-order-list-date-from" aria-label="시작일" value="2026-05-01" />
        <input data-testid="partner-order-list-date-to" aria-label="종료일" value="2026-05-17" />
        <input data-testid="partner-order-list-partner-filter" aria-label="거래처 필터" value="P-001" />
        <select data-testid="partner-order-list-status-filter" aria-label="상태 필터"><option>확정</option></select>
        <input data-testid="partner-order-list-keyword-filter" aria-label="검색어" value="실외기" />
        <button data-testid="partner-order-detail-open">상세</button>
        <section data-testid="partner-order-detail-dialog" role="dialog">
          <h2>주문서 상세</h2>
          <p>주문번호 2026/05/17-1</p>
          <p>거래처 삼한공조</p>
          <table><tbody><tr><td>실외기</td><td>AJ040RXH4BC1</td><td>2</td></tr></tbody></table>
        </section>
      </main>
    `

    expect(mockUi).toContain('partner-order-list-date-from')
    expect(mockUi).toContain('partner-order-list-date-to')
    expect(mockUi).toContain('partner-order-list-partner-filter')
    expect(mockUi).toContain('partner-order-list-keyword-filter')
    expect(mockUi).toContain('partner-order-detail-dialog')
    expect(mockUi).toContain('주문서 상세')
    expect(mockUi).not.toMatch(UUID_REGEX)
  })

  test('new artifacts stay UUID-free in UI text and keep Notion runtime out', () => {
    const guarded = [
      'clients/desktop/src/renderer/routes/SalesPartnerOrderListPage.tsx',
      'clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx',
      'clients/desktop/src/renderer/api/sales.ts',
      'services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/PartnerOrderListController.java',
      'services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderQueryService.java',
      'services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/PartnerOrderDetailResponse.java',
    ].map(read).join('\n')
    const routeGuarded = [
      'clients/desktop/src/renderer/routes/SalesPartnerOrderListPage.tsx',
      'clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx',
    ].map(read).join('\n')

    expect(guarded).not.toMatch(/api\.notion\.com|Notion-Version|@notionhq/)
    expect(guarded).not.toContain('endpoint:')
    expect(guarded).not.toContain('partner-order-service 가 응답하지 않습니다')
    expect(routeGuarded).not.toMatch(/사용자.*UUID|UUID.*사용자/)
  })

  test('mock detail 404 renders Korean graceful guidance without technical labels', () => {
    const mockError = `
      <main>
        <section data-testid="partner-order-detail-error" role="alert">
          <h2>주문 조회에 실패했습니다</h2>
          <p>주문번호를 확인한 뒤 다시 시도해 주세요.</p>
          <a href="#/sales/partner-orders">목록</a>
        </section>
      </main>
    `

    expect(mockError).toContain('partner-order-detail-error')
    expect(mockError).toContain('주문 조회에 실패했습니다')
    expect(mockError).toContain('주문번호를 확인한 뒤 다시 시도해 주세요.')
    expect(mockError).not.toMatch(/endpoint|GET|404|UUID|Notion/i)
  })
})
