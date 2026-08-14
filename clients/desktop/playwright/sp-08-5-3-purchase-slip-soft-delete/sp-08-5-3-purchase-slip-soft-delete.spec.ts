import { expect, test } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const specDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(specDir, '../../../..')

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8')
}

test.describe('SP-08-5-3 입고 전표 soft delete 계약', () => {
  /**
   * T1 BE 계약
   *
   * SlipDeleteController: @DeleteMapping("/{id}") + @PreAuthorize WAREHOUSE/MANAGER/MASTER
   * HttpHeaderConstants.CALLER_ID_HEADER 헤더 수신
   * SlipDeleteService.delete() 위임 + audit SLIP_DELETE 단언
   * INBOUND guard (slipType != INBOUND → SLIP_DELETE_NON_INBOUND)
   * requireEditable() — DRAFT/SAVED 외 단계는 SLIP_DELETE_INSPECTION_COMPLETED
   * verifyVersion ChronoUnit.MICROS truncation
   * ErrorCode: SLIP_OPTIMISTIC_LOCK_CONFLICT + SLIP_DELETE_INSPECTION_COMPLETED 모두 선언
   */
  test('T1 BE contract: @DeleteMapping + PreAuthorize + INBOUND guard + audit SLIP_DELETE', () => {
    const controller = read(
      'services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipDeleteController.java',
    )
    const service = read(
      'services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipDeleteService.java',
    )
    const errorCode = read(
      'shared/common/src/main/java/com/samhanair/logis/common/exception/ErrorCode.java',
    )
    const slip = read(
      'services/slip-service/src/main/java/com/samhanair/logis/slip/domain/Slip.java',
    )

    // controller endpoint
    expect(controller).toContain('@DeleteMapping("/{id}")')
    expect(controller).toContain('@RequirePermission(page = "purchases.slip.delete"')
    expect(controller).toContain('HttpHeaderConstants.CALLER_ID_HEADER')
    expect(controller).toContain('SlipDeleteService')
    expect(controller).toContain('deleteService.delete(')

    // service — optimistic lock + audit
    expect(service).toContain('verifyVersion(slip, request.updatedAt())')
    expect(service).toContain('ChronoUnit.MICROS')
    expect(service).toContain('ErrorCode.SLIP_OPTIMISTIC_LOCK_CONFLICT')
    expect(service).toContain('"SLIP_DELETE"')
    expect(service).toContain(
      'auditLogService.recordBatch(saved.getId(), actorId, actorName, null',
    )

    // domain — INBOUND guard + requireEditable
    expect(slip).toContain('deleteForPurchase')
    expect(slip).toMatch(
      /deleteForPurchase[\s\S]*if \(this\.slipType != SlipType\.INBOUND\)[\s\S]*SLIP_DELETE_NON_INBOUND/,
    )
    expect(slip).toContain('SLIP_DELETE_INSPECTION_COMPLETED')
    expect(slip).toContain('requireEditable')

    // ErrorCode declarations
    expect(errorCode).toContain('SLIP_OPTIMISTIC_LOCK_CONFLICT(HttpStatus.CONFLICT')
    expect(errorCode).toContain('SLIP_DELETE_INSPECTION_COMPLETED(HttpStatus.UNPROCESSABLE_ENTITY')
    expect(errorCode).toContain('SLIP_DELETE_NON_INBOUND(HttpStatus.FORBIDDEN')
  })

  /**
   * T2 FE 계약
   *
   * SlipDetailPage: canSoftDeleteSlip() + canDirectDeletePurchase 연산
   * data-testid 4종: purchase-slip-delete-button / confirm / confirm-yes / confirm-no
   * design-system <Modal> + <Button variant="danger"> 사용
   * deletePurchaseSlip API 함수: apiClient.delete + updatedAt 전송
   */
  test('T2 FE contract: canAccess delete gate + testid 4종 + Modal + deletePurchaseSlip API', () => {
    const page = read('clients/desktop/src/renderer/routes/SlipDetailPage.tsx')
    const api = read('clients/desktop/src/renderer/api/slip.ts')

    // 유형·상태별 동적 권한 게이트 + canDirectDeletePurchase
    expect(page).toContain('canSoftDeleteSlip')
    expect(page).toContain("'purchases.slip.delete'")
    expect(page).toContain('canDirectDeletePurchase')
    expect(page).toMatch(/canDirectDeletePurchase[\s\S]*mode === 'INBOUND'/)

    // data-testid 4종
    expect(page).toContain('data-testid="purchase-slip-delete-button"')
    expect(page).toContain('data-testid="purchase-slip-delete-confirm"')
    expect(page).toContain('data-testid="purchase-slip-delete-confirm-yes"')
    expect(page).toContain('data-testid="purchase-slip-delete-confirm-no"')

    // design-system components
    expect(page).toContain('Modal')
    expect(page).toContain('variant="danger"')

    // 422 inspection banner — alert() 제거 확인 + banner testid 확인
    expect(page).toContain('purchase-slip-delete-inspection-banner')
    expect(page).toContain('danger-banner')
    expect(page).not.toContain("alert('검수 완료된 입고 전표")

    // API
    expect(api).toContain('deletePurchaseSlip')
    expect(api).toContain('apiClient.delete')
    expect(api).toContain('updatedAt')
  })

  /**
   * T3 409 conflict
   *
   * "최신 내용 불러오기" 한국어 문구
   * purchase-slip-delete-conflict-banner data-testid
   * 409 처리 시 setPurchaseDeleteConflict(true) 또는 동등 핸들러
   */
  test('T3 409 conflict: Korean reload copy + conflict banner testid', () => {
    const page = read('clients/desktop/src/renderer/routes/SlipDetailPage.tsx')

    expect(page).toContain('purchase-slip-delete-conflict-banner')
    expect(page).toContain('최신 내용 불러오기')
    expect(page).toMatch(/status === 409[\s\S]*setPurchaseDeleteConflict\(true\)/)
    // 다른 사용자 수정 안내 문구
    expect(page).toContain('다른 사용자가 먼저 수정했습니다')
    // UUID 노출 금지 — banner 내 actorId 미노출
    expect(page).not.toMatch(/purchase-slip-delete-conflict-banner[\s\S]{0,300}actorId/)
  })

  /**
   * T4 audit
   *
   * SlipDeleteService: "SLIP_DELETE" action + recordBatch 호출
   * slipAudit.ts: /audit-logs endpoint 포함
   * SlipDetailPage: slipAuditLogs query key 사용
   * UUID 비공개 가드: actorId 를 화면 텍스트로 직접 노출하지 않음
   */
  test('T4 audit: SLIP_DELETE action + /audit-logs + slipAuditLogs + UUID guard', () => {
    const service = read(
      'services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipDeleteService.java',
    )
    const auditApi = read('clients/desktop/src/renderer/api/slipAudit.ts')
    const page = read('clients/desktop/src/renderer/routes/SlipDetailPage.tsx')

    expect(service).toContain('"SLIP_DELETE"')
    expect(auditApi).toContain('/audit-logs')
    expect(page).toContain('slipAuditLogs')

    // UUID 비공개 가드: actorId 를 화면 span/div 에 직접 텍스트 렌더 금지
    expect(page).not.toMatch(/actorId.*detail-value|actorId.*span>/)
  })

  /**
   * T5 권한 가드
   *
   * controller @PreAuthorize + IT method 4종 검증
   * testDeleteForbiddenForInventory / testDeleteForbiddenForSales /
   * testDeleteForbiddenForAccountant / testDeleteNonInboundForbidden
   */
  test('T5 role guard: PreAuthorize + IT forbidden 4 method names', () => {
    const controller = read(
      'services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipDeleteController.java',
    )
    // SlipDeleteIT 4 forbidden case 정합 검증
    const deleteIt = read(
      'services/slip-service/src/test/java/com/samhanair/logis/slip/it/SlipDeleteIT.java',
    )

    expect(controller).toContain('@RequirePermission(page = "purchases.slip.delete"')

    // SlipDeleteIT 가 INVENTORY/SALES/ACCOUNTANT/NonInbound/D8b 패턴 포함 확인
    expect(deleteIt).toContain('testDeleteForbiddenForInventory')
    expect(deleteIt).toContain('testDeleteForbiddenForSales')
    expect(deleteIt).toContain('testDeleteForbiddenForAccountant')
    expect(deleteIt).toContain('testDeleteNonInboundForbidden')
    // D8b: CONFIRMED 단계 전표 422 케이스 추가
    expect(deleteIt).toContain('testDeleteConfirmedReturns422')

    // controller 에 INVENTORY/SALES/ACCOUNTANT 허용 역할 미포함 확인 (명시적 방어)
    expect(controller).not.toContain("'INVENTORY'")
    expect(controller).not.toContain("'SALES'")
    expect(controller).not.toContain("'ACCOUNTANT'")
  })
})
