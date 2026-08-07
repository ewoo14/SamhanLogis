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

  // #31 이력 일원화(2026-07-06) — PO 상세 인라인 "수정 이력"(auditQuery/partnerOrderAuditApi 기반
  // partner-order-edit-audit-timeline) 은 제거되고, PartnerOrderCollaborationPanel 에 내장된
  // PartnerOrderVersionHistoryPanel(버전이력 — revisions API)로 일원화됐다. T4 는 신 계약을 검증한다.
  test('T4 version history panel (버전이력) renders actor, time, and changed field summary', () => {
    const page = read('clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx')
    const collabPanel = read('clients/desktop/src/renderer/components/collab/PartnerOrderCollaborationPanel.tsx')
    const versionHistoryPanel = read('clients/desktop/src/renderer/components/audit/PartnerOrderVersionHistoryPanel.tsx')
    const revisionApi = read('clients/desktop/src/renderer/api/partnerOrderRevision.ts')

    // 구 계약(audit-logs 기반 인라인 타임라인)은 완전히 제거됐다.
    expect(page).not.toContain('partner-order-edit-audit-timeline')
    expect(page).not.toContain('partnerOrderAuditApi')
    // 신 계약 — 상세 페이지는 협업 패널을 렌더하고, 협업 패널은 버전이력 패널을 내장한다.
    expect(page).toContain('PartnerOrderCollaborationPanel')
    expect(collabPanel).toContain('PartnerOrderVersionHistoryPanel')
    expect(revisionApi).toContain('listPartnerOrderRevisions')
    expect(revisionApi).toContain('/revisions')
    // 버전이력 패널이 actor(actorName)·time(createdAt)·변경요약(changeSummary)을 렌더한다.
    expect(versionHistoryPanel).toContain('partner-order-version-history-panel')
    expect(versionHistoryPanel).toContain('partner-order-version-history-open')
    expect(versionHistoryPanel).toContain('historyOpen')
    expect(versionHistoryPanel).toContain('rev.actorName')
    expect(versionHistoryPanel).toContain('formatLocalDateTime(rev.createdAt)')
    expect(versionHistoryPanel).toContain('formatChangeSummary(rev)')
    expect(versionHistoryPanel).not.toContain('internal id')
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
