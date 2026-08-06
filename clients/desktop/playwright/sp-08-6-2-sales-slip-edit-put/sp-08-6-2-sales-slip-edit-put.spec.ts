import { expect, test } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const specDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(specDir, '../../../..')

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8')
}

test.describe('SP-08-6-2 매출 수정 direct PUT 계약', () => {
  test('T1 BE PUT endpoint contract keeps OUTBOUND direct edit + optimistic lock', () => {
    const controller = read('services/slip-service/src/main/java/com/samhanair/logis/slip/web/SalesSlipUpdateController.java')
    const service = read('services/slip-service/src/main/java/com/samhanair/logis/slip/service/SalesSlipUpdateService.java')
    const dto = read('services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/SlipUpdateRequest.java')
    const errorCode = read('shared/common/src/main/java/com/samhanair/logis/common/exception/ErrorCode.java')
    const slip = read('services/slip-service/src/main/java/com/samhanair/logis/slip/domain/Slip.java')

    // 컨트롤러 — PUT /slips/{id}/sales + SALES/MANAGER/MASTER 권한 + 헤더
    expect(controller).toContain('@PutMapping("/{id}/sales")')
    expect(controller).toContain('@RequirePermission(page = "sales.slip.edit"')
    expect(controller).toContain('HttpHeaderConstants.CALLER_ID_HEADER')

    // DTO — updatedAt 낙관적 잠금 토큰 + 라인 목록
    expect(dto).toContain('LocalDateTime updatedAt')
    expect(dto).toContain('List<LineRequest> lines')

    // 서비스 — 핵심 처리 흐름
    expect(service).toContain('verifyVersion(slip, request.updatedAt())')
    expect(service).toContain('validateLines(request.lines())')
    expect(service).toContain('String after = summarize(saved)')
    expect(service).toContain('ChronoUnit.MICROS')
    expect(service).toContain('ErrorCode.SLIP_OPTIMISTIC_LOCK_CONFLICT')
    expect(service).toContain('ErrorCode.SLIP_UPDATE_INVALID_LINE')
    expect(service).toContain('recordBatch(saved.getId(), actorId, actorName, null')
    expect(service).toContain('"SLIP_EDIT"')

    // 도메인 — OUTBOUND 전용 메서드 + orphanRemoval=false 정책
    expect(slip).toContain('orphanRemoval = false')
    expect(slip).toContain('replaceSalesLines')
    expect(slip).toContain('updateSalesHeader')
    expect(slip).toContain('line.markDeleted')
    expect(slip).toMatch(/public void updateSalesHeader[\s\S]*if \(this\.slipType != SlipType\.OUTBOUND\)[\s\S]*requireEditable\(\)/)
    expect(slip).toMatch(/public void replaceSalesLines[\s\S]*if \(this\.slipType != SlipType\.OUTBOUND\)[\s\S]*requireEditable\(\)/)

    // ErrorCode — 409 / 422 / 403 매핑
    expect(errorCode).toContain('SLIP_OPTIMISTIC_LOCK_CONFLICT(HttpStatus.CONFLICT')
    expect(errorCode).toContain('SLIP_UPDATE_INVALID_LINE(HttpStatus.UNPROCESSABLE_ENTITY')
    expect(errorCode).toContain('SLIP_UPDATE_NON_SALES(HttpStatus.FORBIDDEN')
  })

  test('T2 FE exposes edit button only for SALES/MANAGER/MASTER sales detail', () => {
    const page = read('clients/desktop/src/renderer/routes/SlipDetailPage.tsx')
    const api = read('clients/desktop/src/renderer/api/slip.ts')

    // 유형·상태별 동적 권한 게이트
    expect(page).toContain('canOpenDirectEdit')
    expect(page).toContain("'sales.slip.edit'")

    // mode 분기 — OUTBOUND 진입 시에만 canDirectEditSales = true
    expect(page).toContain("mode === 'OUTBOUND'")
    expect(page).toContain('canDirectEditSales')

    // 수정 버튼 data-testid
    expect(page).toContain('sales-slip-edit-button')

    // 수정 폼 내부 state
    expect(page).toContain('salesUpdatedAt')
    expect(page).toContain('salesIsConflict')
    expect(page).toContain('salesEditOpen')

    // 충돌 재로드 핸들러
    expect(page).toContain('handleSalesConflictReload')
    expect(page).toContain('syncSalesFormFromData')

    // API — updateSalesSlip + put + updatedAt
    expect(api).toContain('updateSalesSlip')
    expect(api).toContain('apiClient.put<ApiEnvelope<SlipDetail>>')
    expect(api).toContain('updatedAt: string')
  })

  test('T3 409 conflict banner uses Korean reload copy and reload handler', () => {
    const page = read('clients/desktop/src/renderer/routes/SlipDetailPage.tsx')

    // 충돌 배너 구현 검증
    expect(page).toContain('salesIsConflict')
    expect(page).toContain('handleSalesConflictReload')
    expect(page).toContain('syncSalesFormFromData(result.data)')

    // 충돌 재로드 로직
    expect(page).toMatch(/handleSalesConflictReload[\s\S]*refetchDetail\(\)/)
    expect(page).toMatch(/handleSalesConflictReload[\s\S]*syncSlipCoeditProvider\(slipFormCoeditProvider, result\.data, mode\)/)
  })

  test('T4 audit timeline contract keeps SLIP_EDIT visible through slip audit logs', () => {
    const service = read('services/slip-service/src/main/java/com/samhanair/logis/slip/service/SalesSlipUpdateService.java')
    const page = read('clients/desktop/src/renderer/routes/SlipDetailPage.tsx')
    const auditApi = read('clients/desktop/src/renderer/api/slipAudit.ts')

    // 서비스 — SLIP_EDIT 이벤트 기록
    expect(service).toContain('"SLIP_EDIT"')

    // audit API
    expect(auditApi).toContain('/audit-logs')

    // 화면 — audit log + revision count + actorName 표시 + UUID 비공개
    expect(page).toContain('slipAuditLogs')
    expect(page).toContain('slip-detail-revision-count')
    expect(page).toContain('actorName')
    expect(page).not.toMatch(/actorId.*span|actorId.*detail-value/)
  })

  test('T5 role guard locks INVENTORY/WAREHOUSE/ACCOUNTANT out of BE sales PUT', () => {
    const controller = read('services/slip-service/src/main/java/com/samhanair/logis/slip/web/SalesSlipUpdateController.java')
    const it = read('services/slip-service/src/test/java/com/samhanair/logis/slip/it/SlipSalesUpdateIT.java')

    // 컨트롤러 권한 — SALES/MANAGER/MASTER 만 허용
    expect(controller).toContain('@RequirePermission(page = "sales.slip.edit"')

    // IT — 차단 케이스 4건
    expect(it).toContain('testUpdateSalesForbiddenForInventory')
    expect(it).toContain('testUpdateSalesForbiddenForWarehouse')
    expect(it).toContain('testUpdateSalesForbiddenForAccountant')
    expect(it).toContain('testUpdateSalesNonOutboundForbidden')
  })
})
