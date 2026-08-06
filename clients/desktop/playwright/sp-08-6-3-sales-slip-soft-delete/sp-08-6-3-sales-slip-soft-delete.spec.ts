import { expect, test } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const specDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(specDir, '../../../..')

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8')
}

test.describe('SP-08-6-3 매출 전표 soft delete 계약', () => {
  /**
   * T1 BE 계약
   *
   * SalesSlipDeleteController: @DeleteMapping("/{id}/sales") + @PreAuthorize SALES/MANAGER/MASTER
   * HttpHeaderConstants.CALLER_ID_HEADER 헤더 수신
   * SalesSlipDeleteService.delete() 위임 + audit SLIP_DELETE 단언
   * OUTBOUND guard (slipType != OUTBOUND → SLIP_DELETE_NON_SALES)
   * requireEditable() — DRAFT/SAVED 외 단계는 SLIP_DELETE_SALES_SHIPPED
   * verifyVersion ChronoUnit.MICROS truncation
   * ErrorCode: SLIP_OPTIMISTIC_LOCK_CONFLICT + SLIP_DELETE_SALES_SHIPPED 모두 선언
   */
  test('T1 BE contract: @DeleteMapping + PreAuthorize + OUTBOUND guard + audit SLIP_DELETE', () => {
    const controller = read(
      'services/slip-service/src/main/java/com/samhanair/logis/slip/web/SalesSlipDeleteController.java',
    )
    const service = read(
      'services/slip-service/src/main/java/com/samhanair/logis/slip/service/SalesSlipDeleteService.java',
    )
    const errorCode = read(
      'shared/common/src/main/java/com/samhanair/logis/common/exception/ErrorCode.java',
    )
    const slip = read(
      'services/slip-service/src/main/java/com/samhanair/logis/slip/domain/Slip.java',
    )

    // controller endpoint
    expect(controller).toContain('@DeleteMapping("/{id}/sales")')
    expect(controller).toContain('@RequirePermission(page = "sales.slip.edit"')
    expect(controller).toContain('PermissionAction.DELETE')
    expect(controller).toContain('HttpHeaderConstants.CALLER_ID_HEADER')
    expect(controller).toContain('SalesSlipDeleteService')
    expect(controller).toContain('deleteService.delete(')

    // service — optimistic lock + audit
    expect(service).toContain('verifyVersion(slip, request.updatedAt())')
    expect(service).toContain('ChronoUnit.MICROS')
    expect(service).toContain('ErrorCode.SLIP_OPTIMISTIC_LOCK_CONFLICT')
    expect(service).toContain('"SLIP_DELETE"')
    expect(service).toContain(
      'auditLogService.recordBatch(saved.getId(), actorId, actorName, null',
    )

    // domain — OUTBOUND guard + requireEditable
    expect(slip).toContain('deleteForSales')
    expect(slip).toMatch(
      /deleteForSales[\s\S]*if \(this\.slipType != SlipType\.OUTBOUND\)[\s\S]*SLIP_DELETE_NON_SALES/,
    )
    expect(slip).toContain('SLIP_DELETE_SALES_SHIPPED')

    // ErrorCode declarations
    expect(errorCode).toContain('SLIP_OPTIMISTIC_LOCK_CONFLICT(HttpStatus.CONFLICT')
    expect(errorCode).toContain('SLIP_DELETE_SALES_SHIPPED(HttpStatus.UNPROCESSABLE_ENTITY')
    expect(errorCode).toContain('SLIP_DELETE_NON_SALES(HttpStatus.FORBIDDEN')
  })

  /**
   * T2 FE 계약
   *
   * SlipDetailPage: canSoftDeleteSlip() + canDirectDeleteSales 연산
   * data-testid 4종: sales-slip-delete-button / confirm / confirm-yes / confirm-no
   * design-system <Modal> + <Button variant="danger"> 사용
   * deleteSalesSlip API 함수: apiClient.delete + updatedAt 전송
   */
  test('T2 FE contract: canAccess delete gate + testid 4종 + Modal + deleteSalesSlip API', () => {
    const page = read('clients/desktop/src/renderer/routes/SlipDetailPage.tsx')
    const api = read('clients/desktop/src/renderer/api/slip.ts')

    // 유형·상태별 동적 권한 게이트 + canDirectDeleteSales
    expect(page).toContain('canSoftDeleteSlip')
    expect(page).toContain("'sales.slip.edit'")
    expect(page).toContain('canDirectDeleteSales')
    expect(page).toMatch(/canDirectDeleteSales[\s\S]*mode === 'OUTBOUND'/)

    // data-testid 4종
    expect(page).toContain('data-testid="sales-slip-delete-button"')
    expect(page).toContain('data-testid="sales-slip-delete-confirm"')
    expect(page).toContain('data-testid="sales-slip-delete-confirm-yes"')
    expect(page).toContain('data-testid="sales-slip-delete-confirm-no"')

    // design-system components
    expect(page).toContain('Modal')
    expect(page).toContain('variant="danger"')

    // 422 shipped banner — alert() 제거 확인 + banner testid 확인
    expect(page).toContain('sales-slip-delete-shipped-banner')
    expect(page).toContain('danger-banner')
    expect(page).not.toContain("alert('출고 완료된 매출 전표")

    // 403 / fallback — alert() 제거 + 배너 testid 확인
    expect(page).not.toContain("alert('매출 전표 삭제 권한이 없습니다')")
    expect(page).not.toContain("alert('매출 전표 삭제에 실패했습니다')")
    expect(page).toContain('sales-slip-delete-forbidden-banner')
    expect(page).toContain('sales-slip-delete-error-banner')

    // API
    expect(api).toContain('deleteSalesSlip')
    expect(api).toContain('apiClient.delete')
    expect(api).toContain('updatedAt')
  })

  /**
   * T3 409 conflict + 422 SHIPPED 배너 처리
   *
   * "최신 내용 불러오기" 한국어 문구 (conflict 배너)
   * sales-slip-delete-conflict-banner data-testid
   * 409 처리 시 setSalesDeleteConflict(true) 또는 동등 핸들러
   * 422 처리 시 setSalesDeleteShippedAlert 설정
   */
  test('T3 409 conflict + 422 SHIPPED: 배너 testid + Korean copy + state 핸들러', () => {
    const page = read('clients/desktop/src/renderer/routes/SlipDetailPage.tsx')

    // 409 conflict 배너
    expect(page).toContain('sales-slip-delete-conflict-banner')
    expect(page).toContain('최신 내용 불러오기')
    expect(page).toMatch(/status === 409[\s\S]*setSalesDeleteConflict\(true\)/)
    // 다른 사용자 수정 안내 문구
    expect(page).toContain('다른 사용자가 먼저 수정했습니다')

    // 422 shipped 배너
    expect(page).toContain('sales-slip-delete-shipped-banner')
    expect(page).toMatch(/status === 422[\s\S]*setSalesDeleteShippedAlert/)

    // UUID 노출 금지 — conflict banner 내 actorId 미노출
    expect(page).not.toMatch(/sales-slip-delete-conflict-banner[\s\S]{0,300}actorId/)
  })

  /**
   * T4 audit SLIP_DELETE + UUID 비공개
   *
   * SalesSlipDeleteService: "SLIP_DELETE" action + recordBatch 호출
   * slipAudit.ts: /audit-logs endpoint 포함
   * SlipDetailPage: slipAuditLogs query key 사용
   * UUID 비공개 가드: actorId 를 화면 텍스트로 직접 노출하지 않음
   */
  test('T4 audit: SLIP_DELETE action + /audit-logs + slipAuditLogs + UUID guard', () => {
    const service = read(
      'services/slip-service/src/main/java/com/samhanair/logis/slip/service/SalesSlipDeleteService.java',
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
   * controller @PreAuthorize SALES/MANAGER/MASTER 허용
   * INVENTORY / WAREHOUSE / ACCOUNTANT 는 해당 역할 허용 목록에 미포함
   * SlipSalesDeleteIT 4종 forbidden + shipped 케이스 검증
   */
  test('T5 role guard: PreAuthorize + IT forbidden 4 method names', () => {
    const controller = read(
      'services/slip-service/src/main/java/com/samhanair/logis/slip/web/SalesSlipDeleteController.java',
    )
    const deleteIt = read(
      'services/slip-service/src/test/java/com/samhanair/logis/slip/it/SlipSalesDeleteIT.java',
    )

    expect(controller).toContain('@RequirePermission(page = "sales.slip.edit"')
    expect(controller).toContain('PermissionAction.DELETE')

    // SlipSalesDeleteIT 4 forbidden + shipped 케이스 확인
    expect(deleteIt).toContain('testDeleteSalesForbiddenForInventory')
    expect(deleteIt).toContain('testDeleteSalesForbiddenForWarehouse')
    expect(deleteIt).toContain('testDeleteSalesForbiddenForAccountant')
    expect(deleteIt).toContain('testDeleteSalesNonOutboundForbidden')
    // D8: SENT 이후 단계 전표 422 케이스
    expect(deleteIt).toContain('testDeleteSalesShippedReturns422')

    // controller 에 INVENTORY/WAREHOUSE/ACCOUNTANT 허용 역할 미포함 확인 (명시적 방어)
    expect(controller).not.toContain("'INVENTORY'")
    expect(controller).not.toContain("'WAREHOUSE'")
    expect(controller).not.toContain("'ACCOUNTANT'")
  })
})
