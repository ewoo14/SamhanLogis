import { expect, test } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const specDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(specDir, '../../../..')

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8')
}

test.describe('SP-08-5-2 매입 수정 direct PUT 계약', () => {
  test('T1 BE PUT endpoint contract keeps INBOUND direct edit + optimistic lock', () => {
    const controller = read('services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipUpdateController.java')
    const service = read('services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipUpdateService.java')
    const dto = read('services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/SlipUpdateRequest.java')
    const errorCode = read('shared/common/src/main/java/com/samhanair/logis/common/exception/ErrorCode.java')
    const slip = read('services/slip-service/src/main/java/com/samhanair/logis/slip/domain/Slip.java')

    expect(controller).toContain('@PutMapping("/{id}")')
    expect(controller).toContain("hasAnyRole('WAREHOUSE','MANAGER','MASTER')")
    expect(controller).toContain('HttpHeaderConstants.CALLER_ID_HEADER')
    expect(dto).toContain('LocalDateTime updatedAt')
    expect(dto).toContain('List<LineRequest> lines')
    expect(service).toContain('verifyVersion(slip, request.updatedAt())')
    expect(service).toContain('slip.getSlipType() != SlipType.INBOUND')
    expect(service).toContain('ErrorCode.SLIP_OPTIMISTIC_LOCK_CONFLICT')
    expect(service).toContain('ErrorCode.SLIP_UPDATE_INVALID_LINE')
    expect(service).toContain('recordBatch(saved.getId(), actorId, actorName, null')
    expect(service).toContain('"SLIP_EDIT"')
    expect(slip).toContain('orphanRemoval = false')
    expect(slip).toContain('replaceLines')
    expect(slip).toContain('line.markDeleted')
    expect(errorCode).toContain('SLIP_OPTIMISTIC_LOCK_CONFLICT(HttpStatus.CONFLICT')
    expect(errorCode).toContain('SLIP_UPDATE_INVALID_LINE(HttpStatus.UNPROCESSABLE_ENTITY')
  })

  test('T2 FE exposes edit button only for WAREHOUSE/MANAGER/MASTER purchase detail', () => {
    const page = read('clients/desktop/src/renderer/routes/SlipDetailPage.tsx')
    const api = read('clients/desktop/src/renderer/api/slip.ts')

    expect(page).toContain("const PURCHASE_EDIT_ROLES = ['WAREHOUSE', 'MANAGER', 'MASTER']")
    expect(page).toContain("mode === 'INBOUND'")
    expect(page).toContain('purchase-slip-edit-open')
    expect(page).toContain('purchase-slip-edit-form')
    expect(page).toContain('purchase-slip-edit-submit')
    expect(page).toContain('Modal')
    expect(page).toContain('Input')
    expect(api).toContain('updatePurchaseSlip')
    expect(api).toContain('apiClient.put<ApiEnvelope<SlipDetail>>')
    expect(api).toContain('updatedAt: string')
  })

  test('T3 409 conflict banner uses Korean reload copy and reload handler', () => {
    const page = read('clients/desktop/src/renderer/routes/SlipDetailPage.tsx')

    expect(page).toContain('purchase-slip-edit-conflict-banner')
    expect(page).toContain('다른 사용자가 먼저 수정했습니다. 최신 내용 불러오기 후 다시 저장해 주세요.')
    expect(page).toContain('purchase-slip-edit-reload')
    expect(page).toContain('최신 내용 불러오기')
    expect(page).toMatch(/handlePurchaseConflictReload[\s\S]*refetchDetail\(\)/)
    expect(page).toMatch(/syncPurchaseFormFromData\(result\.data\)/)
  })

  test('T4 audit timeline contract keeps SLIP_EDIT visible through slip audit logs', () => {
    const service = read('services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipUpdateService.java')
    const page = read('clients/desktop/src/renderer/routes/SlipDetailPage.tsx')
    const auditApi = read('clients/desktop/src/renderer/api/slipAudit.ts')

    expect(service).toContain('"SLIP_EDIT"')
    expect(auditApi).toContain('/audit-logs')
    expect(page).toContain('slipAuditLogs')
    expect(page).toContain('slip-detail-revision-count')
    expect(page).toContain('actorName')
    expect(page).not.toMatch(/actorId.*span|actorId.*detail-value/)
  })

  test('T5 role guard locks INVENTORY/SALES/ACCOUNTANT out of BE direct PUT', () => {
    const controller = read('services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipUpdateController.java')
    const it = read('services/slip-service/src/test/java/com/samhanair/logis/slip/it/SlipUpdateIT.java')

    expect(controller).toContain("hasAnyRole('WAREHOUSE','MANAGER','MASTER')")
    expect(it).toContain('testUpdateForbiddenForInventory')
    expect(it).toContain('testUpdateForbiddenForSales')
    expect(it).toContain('testUpdateForbiddenForAccountant')
    expect(it).toContain('testUpdateNonInboundForbidden')
  })
})
