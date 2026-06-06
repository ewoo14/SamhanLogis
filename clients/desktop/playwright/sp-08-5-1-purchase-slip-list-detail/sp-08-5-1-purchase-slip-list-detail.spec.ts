import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const specDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(specDir, '../../../..')
const UUID_REGEX = /\b(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8')
}

// 정적 파일 계약 검증 — dev server 불필요.
// page.goto() 미사용 → isServerAvailable 가드 적용 대상 외.
test.describe('SP-08-5-1 매입 목록/상세 계약', () => {
  test('T1 slip-service R1/R2 매입 endpoint contract', () => {
    const controller = read('services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipController.java')
    const detailDto = read('services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/SlipDetailResponse.java')
    const it = read('services/slip-service/src/test/java/com/samhanair/logis/slip/it/SlipQueryPurchaseIT.java')

    expect(controller).toContain('@RequestParam(required = false, name = "type") SlipType typeAlias')
    expect(controller).toContain('SlipType effectiveSlipType = slipType != null ? slipType : typeAlias')
    expect(controller).toContain('Sort.Order.desc("slipDate")')
    expect(controller).toContain('Sort.Order.desc("seqNo")')
    expect(controller).toContain('@GetMapping("/{id}")')
    expect(detailDto).toContain('InspectionReadyStatus inspectionStatus')
    expect(detailDto).toContain('case SAVED, CONFIRMED -> InspectionReadyStatus.READY')
    expect(detailDto).toContain('UUID id')
    expect(detailDto).toContain('partnerCode')
    expect(it).toContain('testListInboundSuccess')
    expect(it).toContain('testGetDetailWithLines')
  })

  test('T2 desktop PurchaseQueryPage keeps SP-03 inspection CTA contract', () => {
    const page = read('clients/desktop/src/renderer/routes/purchase-query/PurchaseQueryPage.tsx')
    const api = read('clients/desktop/src/renderer/api/slip.ts')
    const dialog = read('clients/desktop/src/renderer/routes/components/InboundInspectionDialog.tsx')

    expect(page).toContain("const INSPECTABLE_STATUSES = ['SAVED', 'CONFIRMED'] as const")
    expect(page).toContain("import { InboundInspectionDialog } from '../components/InboundInspectionDialog'")
    expect(page).toContain('setInspectionSlipId(row.id)')
    expect(dialog).toContain("invalidateQueries({ queryKey: ['slips', 'query', 'INBOUND'] })")
    expect(api).toContain("slipType: 'OUTBOUND' | 'INBOUND'")
    expect(api).toContain("apiClient.get<ApiEnvelope<PageResponse<SlipQueryRow>>>")
    expect(api).toContain("'/slips/query'")
  })

  test('T3 권한 가드는 WAREHOUSE/MANAGER/MASTER만 허용하고 INVENTORY를 제외한다', () => {
    const controller = read('services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipController.java')
    const session = read('clients/desktop/src/renderer/stores/session.ts')
    const purchasePage = read('clients/desktop/src/renderer/routes/purchase-query/PurchaseQueryPage.tsx')
    const it = read('services/slip-service/src/test/java/com/samhanair/logis/slip/it/SlipQueryPurchaseIT.java')

    expect(controller).toContain('SlipPurchaseAccessGuard.guardInboundPurchaseRead')

    // [C5-2b] canInspectInbound 정적 헬퍼 제거 확인 — session.ts 에 정의 없음
    expect(session).not.toContain('export function canInspectInbound')

    // [C5-2b] PurchaseQueryPage 가 canAccess('inbound.inspection') 로 게이트 구성
    expect(purchasePage).toContain("const canInspect = canAccess('inbound.inspection')")

    expect(it).toContain('testListPurchaseQueryForbiddenForInventory')
    expect(it).toContain('testListPurchaseQueryForbiddenForAccountant')
    expect(it).toContain('testListInboundForbiddenForSales')
    expect(it).toContain('testListInboundForbiddenForAccountant')
  })

  test('T4 사용자 표시와 QA 산출물은 UUID 대신 구매번호를 쓴다', () => {
    const page = read('clients/desktop/src/renderer/routes/purchase-query/PurchaseQueryPage.tsx')
    const script = read('scripts/generate-sp-08-5-1-purchase-slip-list-detail-screenshots.ps1')

    expect(page).toContain('data-testid={`purchase-query-detail-${toPublicTestId(row.slipNo)}`}')
    expect(page).toContain('data-testid={`purchase-query-inspect-${toPublicTestId(row.slipNo)}`}')
    expect(page).not.toMatch(/purchase-query-(detail|inspect)-\$\{row\.id\}/)
    expect(script).toContain('2026/05/17-1')
    expect(script).not.toMatch(UUID_REGEX)
  })

  test('T5 SP-03 회귀: SAVED/CONFIRMED 검수 CTA가 유지된다', () => {
    const page = read('clients/desktop/src/renderer/routes/purchase-query/PurchaseQueryPage.tsx')
    const dialog = read('clients/desktop/src/renderer/routes/components/InboundInspectionDialog.tsx')
    const decisions = read('migration/decisions/DECISIONS.md')

    expect(page).toContain("INSPECTABLE_STATUSES = ['SAVED', 'CONFIRMED']")
    expect(page).toContain('isInspectableInbound(row, canInspect)')
    expect(dialog).toContain("invalidateQueries({ queryKey: ['slips', 'query', 'INBOUND'] })")
    expect(decisions).toContain('SP-03-01')
    expect(decisions).toContain('SAVED / CONFIRMED')
  })
})
