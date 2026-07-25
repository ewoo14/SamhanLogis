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
    expect(controller).toContain('@RequirePermission(page = "purchases.slip.edit"')
    expect(controller).toContain('HttpHeaderConstants.CALLER_ID_HEADER')
    expect(dto).toContain('LocalDateTime updatedAt')
    expect(dto).toContain('List<LineRequest> lines')
    expect(service).toContain('verifyVersion(slip, request.updatedAt())')
    expect(service).toContain('validateLines(request.lines())')
    expect(service).toContain('String after = summarize(saved)')
    expect(service).toContain('ChronoUnit.MICROS')
    expect(service).toContain('ErrorCode.SLIP_OPTIMISTIC_LOCK_CONFLICT')
    expect(service).toContain('ErrorCode.SLIP_UPDATE_INVALID_LINE')
    expect(service).toContain('recordBatch(saved.getId(), actorId, actorName, null')
    expect(service).toContain('"SLIP_EDIT"')
    expect(slip).toContain('orphanRemoval = false')
    expect(slip).toContain('replaceLines')
    expect(slip).toContain('line.markDeleted')
    expect(slip).toMatch(/public void updateHeader[\s\S]*if \(this\.slipType != SlipType\.INBOUND\)[\s\S]*requireEditable\(\)/)
    expect(slip).toMatch(/public void replaceLines[\s\S]*if \(this\.slipType != SlipType\.INBOUND\)[\s\S]*requireEditable\(\)/)
    expect(errorCode).toContain('SLIP_OPTIMISTIC_LOCK_CONFLICT(HttpStatus.CONFLICT')
    expect(errorCode).toContain('SLIP_UPDATE_INVALID_LINE(HttpStatus.UNPROCESSABLE_ENTITY')
  })

  test('T2 FE exposes edit button only for WAREHOUSE/MANAGER/MASTER purchase detail', () => {
    const page = read('clients/desktop/src/renderer/routes/SlipDetailPage.tsx')
    const api = read('clients/desktop/src/renderer/api/slip.ts')

    expect(page).toContain("canAccess('purchases.slip.edit', 'update')")
    expect(page).toContain("mode === 'INBOUND'")
    expect(page).toContain('purchase-slip-edit-open')
    expect(page).toContain('purchase-slip-edit-form')
    expect(page).toContain('purchase-slip-edit-submit')
    expect(page).toContain('purchase-slip-edit-modal')
    expect(page).toContain('purchaseUpdatedAt')
    expect(page).toContain('removePurchaseLine')
    expect(page).toContain('×')
    expect(page).not.toContain('purchase-slip-edit-add-line')
    expect(page).not.toContain('addPurchaseLine')
    expect(page).toContain('purchaseEditFormRef')
    expect(page).toContain('scrollIntoView({ behavior: \'smooth\', block: \'start\' })')
    expect(page).toContain("!((salesEditOpen && mode === 'OUTBOUND') || (purchaseEditOpen && mode === 'INBOUND'))")
    expect(page).toContain('단가(VAT제외)')
    // RED-2(#824 R1): #824 가 "합계" 열을 VAT 제외 raw total 에서 라인 권위 lineTotalWithVat
    // (VAT 포함)로 재설계하며 라벨도 "합계(VAT포함)"으로 바뀌었다 — 화면 실제와 어긋난
    // 스펙 문자열을 동기화한다(프로덕션 코드 변경 아님).
    expect(page).toContain('합계(VAT포함)')
    // RED-3(#902 라운드 fix, E-2): 매입 상세 "단가(VAT포함)" ↔ 수정 화면 "단가(VAT제외)"가
    // 같은 저장값을 모순되게 설명하던 결함(E-2)을 고치며, 단가 aria-label 이 하드코드
    // 리터럴에서 라인별 동적 판정(editUnitPriceLabel)으로 바뀌었다 — authoritative 라인
    // (공급가액을 직접 편집한 라인)은 unitPrice === unitPriceWithVat 로 저장되어 "VAT제외"
    // 라벨이 거짓이 되므로, 라인 성질에 따라 단가(VAT포함)/단가(VAT제외)/단가(행별 VAT
    // 기준)을 말해야 한다. 하드코드 리터럴 회귀(라벨 모순 재발)를 잡기 위해 판정 로직
    // 자체 + 호출부를 함께 단언한다 — 문자열 단순 존재만으로는 3528행 등 읽기전용 상세
    // 헤더의 정적 "단가(VAT포함)" 라벨과 구분되지 않는다.
    expect(page).toContain('export function editUnitPriceLabel(')
    expect(page).toMatch(/unitPrice === unitPriceWithVat[\s\S]{0,20}\?\s*'단가\(VAT포함\)'[\s\S]{0,20}:\s*'단가\(VAT제외\)'/)
    expect(page).toContain('단가(행별 VAT 기준)')
    expect(page).toContain('aria-label={`${editUnitPriceLabel(line)} ${index + 1}`}')
    expect(page).not.toMatch(/<Modal[\s\S]*title="매입 전표 수정"/)
    expect(page).toContain('Input')
    expect(api).toContain('updatePurchaseSlip')
    expect(api).toContain('apiClient.put<ApiEnvelope<SlipDetail>>')
    expect(api).toContain('updatedAt: string')
  })

  test('T3 409 conflict banner uses Korean reload copy and reload handler', () => {
    const page = read('clients/desktop/src/renderer/routes/SlipDetailPage.tsx')

    expect(page).toContain('purchase-slip-edit-conflict-banner')
    expect(page).toContain('다른 사용자가 먼저 수정했습니다. 최신 내용 불러오기 후 다시 저장해 주세요.')
    expect(page).toContain('purchaseIsConflict')
    expect(page).toContain('purchase-slip-edit-reload')
    expect(page).toContain('최신 내용 불러오기')
    expect(page).toMatch(/handlePurchaseConflictReload[\s\S]*refetchDetail\(\)/)
    expect(page).toMatch(/syncPurchaseFormFromData\(result\.data\)/)
    expect(page).toMatch(/handlePurchaseConflictReload[\s\S]*syncSlipCoeditProvider\(slipFormCoeditProvider, result\.data, mode\)/)
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

    expect(controller).toContain('@RequirePermission(page = "purchases.slip.edit"')
    expect(it).toContain('testUpdateForbiddenForInventory')
    expect(it).toContain('testUpdateForbiddenForSales')
    expect(it).toContain('testUpdateForbiddenForAccountant')
    expect(it).toContain('testUpdateNonInboundForbidden')
  })
})
