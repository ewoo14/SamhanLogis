/**
 * SP-08-5-4 구매관리 입고 검수 CTA 회귀 + InboundInspection 흐름 정적 검증
 *
 * 목적: SP-08-5-1/2/3 기능 변경 이후 기존 검수 CTA 계약이 깨지지 않았음을 보장.
 * 실행 환경: dev server 없이 소스 정적 분석 (파일 read + 문자열 단언).
 *
 * 5 case:
 *   T1 — SAVED 행 검수 CTA 노출 정적 단언 (canInspectInbound + INSPECTABLE_STATUSES)
 *   T2 — CONFIRMED 행 검수 CTA 노출 정적 단언
 *   T3 — InboundInspectionDialog 저장 onSuccess → invalidateQueries(['slips','query','INBOUND'])
 *   T4 — inventory-service endpoint /api/v1/inventory/inbound-inspections/* 계약
 *   T5 — SP-08-5-1/2/3 회고 가드 (UUID 비공개 + 한국어 라벨)
 */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(__dirname, '../..')
const repoRoot = path.resolve(desktopRoot, '../..')

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8')
}

const purchasePagePath = 'clients/desktop/src/renderer/routes/purchase-query/PurchaseQueryPage.tsx'
const sessionPath = 'clients/desktop/src/renderer/stores/session.ts'
const dialogPath = 'clients/desktop/src/renderer/routes/components/InboundInspectionDialog.tsx'
const inspectionApiPath = 'clients/desktop/src/renderer/api/inboundInspectionApi.ts'

test.describe('SP-08-5-4 구매관리 입고 검수 CTA 회귀', () => {
  /**
   * T1 — SAVED 행 검수 CTA 노출 정적 단언
   *
   * PurchaseQueryPage 가 INSPECTABLE_STATUSES 에 'SAVED' 를 포함하고,
   * canInspectInbound 를 이용해 버튼을 조건부 렌더한다는 계약 유지 확인.
   */
  test('T1: SAVED 행에서 검수 CTA 노출 — INSPECTABLE_STATUSES + canInspectInbound boolean', () => {
    const page = read(purchasePagePath)
    const session = read(sessionPath)

    // INSPECTABLE_STATUSES 에 SAVED 포함
    expect(page).toContain("const INSPECTABLE_STATUSES = ['SAVED', 'CONFIRMED'] as const")

    // canInspectInbound 가 WAREHOUSE/MANAGER/MASTER 체크
    expect(session).toMatch(
      /export function canInspectInbound[\s\S]*WAREHOUSE[\s\S]*MANAGER[\s\S]*MASTER/,
    )

    // PurchaseQueryPage 가 canInspectInbound 를 사용
    expect(page).toContain('const canInspect = canInspectInbound(role)')

    // isInspectableInbound helper 가 INSPECTABLE_STATUSES.includes 를 통해 SAVED 행에서 버튼 렌더
    expect(page).toContain('function isInspectableInbound(row: SlipQueryRow, canInspect: boolean): boolean')
    expect(page).toContain('INSPECTABLE_STATUSES.includes(row.status as')

    // 검수 버튼 렌더 단언
    expect(page).toContain('data-testid={`purchase-query-inspect-${toPublicTestId(row.slipNo)}`}')
    expect(page).toContain('isInspectableInbound(row, canInspect)')
  })

  /**
   * T2 — CONFIRMED 행 검수 CTA 노출 정적 단언
   *
   * CONFIRMED 도 INSPECTABLE_STATUSES 에 포함되어 검수 버튼이 렌더되어야 한다.
   * SP-08-5-2/3 변경 후 CONFIRMED 행 버튼이 제거되지 않았음을 확인.
   */
  test('T2: CONFIRMED 행에서도 검수 CTA 노출 — INSPECTABLE_STATUSES 에 CONFIRMED 포함', () => {
    const page = read(purchasePagePath)

    // CONFIRMED 도 INSPECTABLE_STATUSES 에 포함
    expect(page).toContain("const INSPECTABLE_STATUSES = ['SAVED', 'CONFIRMED'] as const")

    // DataGrid 모드에서도 검수 컬럼 동일 렌더 (canInspect 조건부 spread)
    expect(page).toContain("key: 'inspectionAction'")
    expect(page).toContain("label: '검수'")

    // 테이블 헤더에 검수 컬럼 존재
    expect(page).toContain('{canInspect ? <Th width="86px" align="center">검수</Th> : null}')

    // UUID 비공개: 검수 버튼 testid 가 row.id 가 아닌 slipNo 기반
    expect(page).toContain('data-testid={`purchase-query-inspect-${toPublicTestId(row.slipNo)}`}')
    expect(page).not.toMatch(/data-testid=\{`purchase-query-inspect-\$\{row\.id\}`\}/)
  })

  /**
   * T3 — InboundInspectionDialog 저장 onSuccess → invalidateQueries(['slips','query','INBOUND'])
   *
   * 검수 저장 및 완료 시 구매관리 목록 쿼리를 무효화하여
   * 상태(INSPECTING/COMPLETED 등) 변경이 즉시 반영되는지 확인.
   */
  test('T3: 검수 저장 onSuccess → invalidateQueries 구매관리 목록 갱신', () => {
    const dialog = read(dialogPath)

    // saveMutation.onSuccess — 구매관리 목록 invalidate
    expect(dialog).toContain("void qc.invalidateQueries({ queryKey: ['slips', 'query', 'INBOUND'] })")

    // completeMutation.onSuccess 에도 동일 invalidate 존재
    const invalidateMatches = dialog.match(
      /invalidateQueries\(\{ queryKey: \['slips', 'query', 'INBOUND'\] \}\)/g,
    )
    expect(invalidateMatches).not.toBeNull()
    expect((invalidateMatches ?? []).length).toBeGreaterThanOrEqual(2)

    // onSuccess prop 호출 — PurchaseQueryPage.slipsQuery.refetch() 연결
    expect(dialog).toContain('onSuccess?.()')

    // useQueryClient 훅 사용
    expect(dialog).toContain('const qc = useQueryClient()')
  })

  /**
   * T4 — inventory-service endpoint /api/v1/inventory/inbound-inspections/* 계약
   *
   * inboundInspectionApi.ts 가 /api/v1/inventory/inbound-inspections 기반 URL 을 사용하는지
   * 정적 단언 (양쪽 호환: /inspections/* 또는 /api/v1/inspections/* 모두 아닌
   * /api/v1/inventory/inbound-inspections/* 가 정식 경로).
   */
  test('T4: inventory-service endpoint /api/v1/inventory/inbound-inspections/* 계약', () => {
    const api = read(inspectionApiPath)

    // 검수 상세 조회
    expect(api).toContain('/api/v1/inventory/inbound-inspections/${slipId}')

    // 검수 저장 (PENDING 유지)
    expect(api).toContain('/api/v1/inventory/inbound-inspections/${slipId}/inspect')

    // 검수 완료 (재고 반영)
    expect(api).toContain('/api/v1/inventory/inbound-inspections/${slipId}/complete')

    // 검수 목록 조회
    expect(api).toContain("'/api/v1/inventory/inbound-inspections'")

    // 잘못된 경로 형태 미사용 가드
    expect(api).not.toMatch(/apiClient\.(get|post)\s*\(\s*`\/inspections\//)
    expect(api).not.toMatch(/apiClient\.(get|post)\s*\(\s*`\/api\/v1\/inspections\//)

    // UUID 비공개 주석 — slipId 는 path param 전용
    expect(api).toContain('path param 으로만 사용')
  })

  /**
   * T5 — SP-08-5-1/2/3 회고 가드 (UUID 비공개 + 한국어 라벨)
   *
   * SP-08-5-1/2/3 에서 발견된 회귀 항목:
   *   - 사용자 화면에 UUID 직접 노출 금지 (슬립번호/모델코드 등 비즈니스 식별자 사용)
   *   - 모든 상태/버튼/컬럼 라벨은 한국어 표기
   *   - data-testid 는 uuid 가 아닌 slipNo/modelCode 기반 public id
   */
  test('T5: SP-08-5-1/2/3 회고 가드 — UUID 비공개 + 한국어 라벨', () => {
    const page = read(purchasePagePath)
    const dialog = read(dialogPath)
    const api = read(inspectionApiPath)

    // UUID 비공개: PurchaseQueryPage — data-testid 에 row.id 미노출
    expect(page).not.toMatch(/data-testid=\{`purchase-query-row-\$\{row\.id\}`\}/)
    expect(page).toContain('data-testid={`purchase-query-row-${row.slipNo}`}')

    // UUID 비공개: dialog — inspectorId 미노출 (inspectorName 만 표시)
    expect(api).toContain('/** 슬립 UUID — path param 전용, 화면 미노출. */')
    expect(dialog).not.toMatch(/>\{[\w.]*[Ii]d\}/)

    // 한국어 라벨 — SLIP_STATUS_LABEL 한국어 표기
    expect(page).toContain("DRAFT: '임시저장'")
    expect(page).toContain("SAVED: '저장'")
    expect(page).toContain("CONFIRMED: '확정'")
    expect(page).toContain("INSPECTING: '검수중'")

    // 한국어 라벨 — INSPECTION_STATUS_LABEL
    expect(api).toContain("PENDING: '검수대기'")
    expect(api).toContain("COMPLETED: '검수완료'")
    expect(api).toContain("CANCELED: '검수취소'")

    // 한국어 라벨 — dialog 헤더
    expect(dialog).toContain("title=\"입고 검수\"")

    // 한국어 라벨 — 검수 버튼 aria-label
    expect(page).toContain('입고 검수`}')

    // 한국어 에러 메시지
    expect(dialog).toContain('검수 저장에 실패했습니다')
    expect(dialog).toContain('검수가 완료되어 재고에 반영되었습니다')
  })
})
