import { expect, test } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const specDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(specDir, '../../../..')

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8')
}

// 정적 파일 계약 검증 — dev server 불필요.
// page.goto() 미사용 → isServerAvailable 가드 적용 대상 외.
test.describe('SP-08-4-2 주문 수정 direct PUT 계약', () => {
  test('T1 BE contract keeps direct PUT body shape and optimistic lock field', () => {
    const controller = read('services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/PartnerOrderEditController.java')
    const service = read('services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderUpdateService.java')
    const dto = read('services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/PartnerOrderUpdateRequest.java')
    const errorCode = read('shared/common/src/main/java/com/samhanair/logis/common/exception/ErrorCode.java')

    expect(controller).toContain('@PutMapping("/{id}")')
    expect(controller).toContain('@RequirePermission(page = "sales.partner-order.edit", action = PermissionAction.UPDATE)')
    expect(dto).toContain('LocalDateTime updatedAt')
    expect(dto).toContain('String partnerCode')
    expect(dto).toContain('LocalDate dueDate')
    expect(dto).toContain('List<LineRequest> lines')
    expect(service).toContain('verifyVersion(order, request.updatedAt())')
    expect(service).toContain('recordBatch(saved, actorId, actorName, null, changes)')
    expect(dto).not.toContain('@JsonInclude')
    expect(errorCode).toContain('PARTNER_ORDER_OPTIMISTIC_LOCK_CONFLICT(HttpStatus.CONFLICT')
    expect(errorCode).toContain('PARTNER_ORDER_UPDATE_INVALID_LINE(HttpStatus.UNPROCESSABLE_ENTITY')
  })

  test('T2 FE wires edit button for internal roles and submits direct PUT request', () => {
    const page = read('clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx')
    const api = read('clients/desktop/src/renderer/api/sales.ts')

    expect(page).toContain("canAccess('sales.partner-order.edit', 'update')")
    expect(page).toContain('partner-order-edit-open')
    expect(page).toContain('partner-order-edit-form')
    expect(page).toContain('partner-order-edit-submit')
    expect(page).toContain('Input')
    expect(page).toContain('Select')
    expect(page).toContain('Modal')
    expect(api).toContain('updatePartnerOrder')
    expect(api).toContain('apiClient.put<ApiEnvelope<PartnerOrderDetail>>')
    expect(api).toContain('updatedAt: string')
  })

  test('T3 conflict banner uses Korean reload prompt on 409', () => {
    const page = read('clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx')
    const mock = read('clients/desktop/src/renderer/api/mock.ts')

    expect(page).toContain('partner-order-edit-conflict-banner')
    expect(page).toContain('최신 내용으로 다시 불러온 뒤 다시 저장해 주세요')
    expect(page).toContain('partner-order-edit-reload')
    expect(page).toContain('최신 내용 불러오기')
    expect(mock).toContain('PARTNER_ORDER_OPTIMISTIC_LOCK_CONFLICT')
    expect(page).not.toMatch(/endpoint|internal id/i)
  })

  test('T4 audit log timeline renders actor, time, and changed field', () => {
    const page = read('clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx')
    const api = read('clients/desktop/src/renderer/api/sales.ts')
    const auditApi = read('clients/desktop/src/renderer/api/createAuditApi.ts')
    const mock = read('clients/desktop/src/renderer/api/mock.ts')

    expect(api).not.toContain('listPartnerOrderAuditLogs')
    expect(auditApi).toContain('partnerOrderAuditApi')
    expect(auditApi).toContain('/audit-logs')
    expect(page).toContain('partner-order-edit-audit-timeline')
    expect(page).toContain('entry.actorName')
    expect(page).toContain('entry.field')
    expect(mock).toContain('fieldName: \'요청사항\'')
    expect(mock).not.toContain('internal id')
  })
  test('T5: 409 reload 후 success 피드백 + UUID fallback 가드', async () => {
    const tsx = read('clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx')

    expect(tsx).toContain('reloadSuccessMessage')
    expect(tsx).toContain('partner-order-edit-reload-success')
    expect(tsx).toContain("'조회 중'")
    expect(tsx).not.toMatch(/orderNumber \?\? id/)
  })

  test('T6: 409 reload 후 재저장 흐름 정적 계약', () => {
    const tsx = read('clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx')

    expect(tsx).toContain('setConflictMessage(null)')
    expect(tsx).toContain('setReloadSuccessMessage')
    expect(tsx).toMatch(/handleConflictReload[\s\S]*refetch\(\)/)
    expect(tsx).toMatch(/syncFormFromData\(result\.data\)/)
  })
})
