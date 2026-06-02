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

test.describe('SP-08-4-3 주문 삭제 + 견적 주문 변환 정적 계약', () => {
  test('T1: BE DELETE endpoint contract', () => {
    const controller = read('services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/PartnerOrderDeleteController.java')
    const service = read('services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderDeleteService.java')
    const it = read('services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/it/PartnerOrderDeleteIT.java')

    expect(controller).toContain('@DeleteMapping("/{id}")')
    expect(controller).toContain("@PreAuthorize(\"hasAnyRole('SALES','MASTER','MANAGER')\")")
    expect(controller).toContain('@ResponseStatus(HttpStatus.NO_CONTENT)')
    expect(service).toContain('PartnerOrderIdResolver.findByIdentifier')
    expect(service).toContain('softDeleteCascade(resolveActorName(actorName))')
    expect(service).toContain('PARTNER_ORDER_DELETE_FORBIDDEN_STATUS')
    expect(it).toContain('testDeleteCanceledOrderReturns422')
  })

  test('T2: BE from-estimate endpoint contract', () => {
    const controller = read('services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/PartnerOrderFromEstimateController.java')
    const service = read('services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderFromEstimateService.java')
    const domain = read('services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrder.java')
    const flyway = read('services/partner-order-service/src/main/resources/db/migration/V6__add_partner_order_from_estimate_link.sql')

    expect(controller).toContain('@PostMapping("/from-estimate/{estimateId}")')
    expect(controller).toContain("@PreAuthorize(\"hasAnyRole('SALES','MASTER','MANAGER')\")")
    expect(controller).toContain('@ResponseStatus(HttpStatus.CREATED)')
    expect(service).toContain('EstimateClient')
    expect(service).toContain('findBySourceEstimateId')
    expect(service).not.toContain('findBySourceEstimateId(snapshot.estimateId())')
    expect(service).toContain('pg_advisory_xact_lock(hashtext(?1))')
    expect(domain).toContain('createFromEstimate')
    expect(domain).toContain('SlipPublishStatus.NOT_REQUIRED')
    expect(flyway).toContain('source_estimate_id UUID')
  })

  test('T3: ErrorCode 신규 3건 정의', () => {
    const errorCode = read('shared/common/src/main/java/com/samhanair/logis/common/exception/ErrorCode.java')

    expect(errorCode).toContain('PARTNER_ORDER_DELETE_FORBIDDEN_STATUS')
    expect(errorCode).toContain('PARTNER_ORDER_FROM_ESTIMATE_NOT_FOUND')
    expect(errorCode).toContain('PARTNER_ORDER_FROM_ESTIMATE_ALREADY_CONVERTED')
  })

  test('T4: desktop 삭제 버튼 + 확인 dialog', () => {
    const page = read('clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx')
    const api = read('clients/desktop/src/renderer/api/sales.ts')

    expect(page).toContain('partner-order-delete-open')
    expect(page).toContain('partner-order-delete-confirm-dialog')
    expect(page).toContain('partner-order-delete-confirm')
    expect(page).toContain('deletePartnerOrder')
    expect(page).toContain('variant="danger"')
    expect(page).toContain("const orderId = id!")
    expect(page).toContain("<strong>{query.data?.orderNumber ?? '조회 중'}</strong>을(를)")
    expect(page).toContain('EDIT_ROLES')
    expect(api).toContain('apiClient.delete')
  })

  test('T5: audit log DELETE 액션 mock', () => {
    const it = read('services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/it/PartnerOrderDeleteIT.java')
    const service = read('services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderDeleteService.java')

    expect(it).toContain('testDeleteAuditLogRecorded')
    expect(it).toContain('"DELETE", "soft-deleted"')
    expect(service).toContain('new ChangeEntry("DELETE", null, "soft-deleted")')
  })
})
