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
    expect(page).toContain('단가(VAT포함)')
    // RED-2(#824 R1): #824 가 "합계" 열을 VAT 제외 raw total 에서 라인 권위 lineTotalWithVat
    // (VAT 포함)로 재설계하며 라벨도 "합계(VAT포함)"으로 바뀌었다 — 화면 실제와 어긋난
    // 스펙 문자열을 동기화한다(프로덕션 코드 변경 아님).
    expect(page).toContain('합계(VAT포함)')
    // RED-3(#902 라운드 fix, E-2) 은 매입 상세 "단가(VAT포함)" ↔ 수정 화면 "단가(VAT제외)"가
    // 같은 저장값을 모순되게 설명하던 결함을 라인별 동적 판정(unitPrice===unitPriceWithVat)
    // 으로 고쳤었다 — 그런데 재수렴 R-1(#937)이 그 "동적 판정" 자체가 새 결함이었음을
    // 실증했다: 이 화면은 단가 입력을 예외 없이 VAT 포함으로 계산하는데(수량만 바꿔도
    // 마찬가지), 동적 판정은 unitPrice/unitPriceWithVat 두 컬럼이 하이드레이션 시점에
    // 우연히 같은지만 볼 뿐 "실제로 무엇을 계산하는가"와 무관했다 — 그 결과 활성 라인
    // 99.6%(수정 가능 DRAFT 2,164건 전부)가 "단가(VAT제외)" 로 열리면서 실제로는 VAT
    // 포함으로 계산됐다(실 DB 인구조사, docs/qa/937-detail-readonly-fix 재수렴 라운드).
    // 근본수정은 라벨을 데이터에 의존하지 않는 상수로 되돌린다 — 이 화면이 실제로 적용하는
    // 세금 도메인이 상수이므로 라벨도 상수여야 한다(V1). 하드코드 리터럴 자체는 되돌아왔지만
    // "행마다 다른 라벨" 회귀(RED-3 이 원래 막으려던 겉모습)가 아니라 "라벨이 계산과
    // 반대말을 하는" 회귀(V1)를 막는 것이 이제 이 표면의 진짜 불변식이다 — 판정 로직
    // 자체 + 호출부를 함께 단언해 다음 회귀도 이 스펙에서 잡히게 한다.
    expect(page).toContain('export function editUnitPriceLabel(')
    expect(page).toMatch(/export function editUnitPriceLabel\(\s*\n\s*_line: Pick<PurchaseEditLine, 'unitPrice' \| 'unitPriceWithVat'>,\s*\n\): EditUnitPriceLabel \{\s*\n\s*return '단가\(VAT포함\)'/)
    expect(page).not.toMatch(/unitPrice === unitPriceWithVat/)
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
