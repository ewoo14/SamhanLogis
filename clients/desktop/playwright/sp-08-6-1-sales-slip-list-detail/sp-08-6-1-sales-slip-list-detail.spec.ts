/**
 * SP-08-6-1 매출 목록·상세 R1/R2 정적 계약 검증
 *
 * 목적: SlipQueryController OUTBOUND 분기 + SalesQueryPage 계약 + 권한 가드가
 *      SP-08-5-1 패턴과 대칭적으로 구현되어 있음을 보장.
 * 실행 환경: dev server 없이 소스 정적 분석 (파일 read + 문자열 단언).
 *
 * 5 case:
 *   T1 — BE 계약: SlipQueryController.listForQuery SALE 분기 + ownerFullName(salesPersonName) + 정렬
 *   T2 — FE 계약: SalesQueryPage 컴포넌트 + data-testid + canAccess('sales.slip.list') + 한국어 라벨
 *   T3 — inventory-service endpoint 회귀 (SP-08-5-4 정합 — 출고 흐름)
 *   T4 — audit + UUID 비공개
 *   T5 — 권한 가드 (SALES/MANAGER/MASTER 허용 + INVENTORY/WAREHOUSE 403)
 */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const specDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(specDir, '../../../..')
const UUID_REGEX = /\b(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8')
}

const slipQueryControllerPath =
  'services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipQueryController.java'
const slipSalesGuardPath =
  'services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipSalesAccessGuard.java'
const slipResponsePath =
  'services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/SlipResponse.java'
const salesQueryPagePath =
  'clients/desktop/src/renderer/routes/sales-query/SalesQueryPage.tsx'
const sessionPath =
  'clients/desktop/src/renderer/stores/session.ts'
const stockControllerPath =
  'services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/StockController.java'
const screenshotScriptPath =
  'scripts/generate-sp-08-6-1-sales-slip-list-detail-screenshots.ps1'

// 정적 파일 계약 검증 — dev server 불필요.
// page.goto() 미사용 → isServerAvailable 가드 적용 대상 외.
test.describe('SP-08-6-1 매출 목록/상세 계약', () => {
  /**
   * T1 — BE 계약: SlipQueryController.listForQuery SALE 분기
   *
   * SlipQueryController 가 guardOutboundSalesRead 를 호출하고,
   * OUTBOUND 분기에 salesPersonName 필드가 응답 DTO 에 포함되며,
   * 기본 정렬이 slipDate DESC + seqNo DESC 로 고정됨을 검증한다.
   */
  test('T1: SlipQueryController.listForQuery OUTBOUND 분기 + salesPersonName + 정렬 계약', () => {
    const controller = read(slipQueryControllerPath)
    const guard = read(slipSalesGuardPath)
    const slipResponse = read(slipResponsePath)

    // guardOutboundSalesRead 호출 — 매출 권한 체크 (C5-3: 그룹/isSystemMaster OR 병행 4-arg)
    expect(controller).toContain(
      'SlipSalesAccessGuard.guardOutboundSalesRead(slipType, role, userGroups, isSystemMaster)',
    )

    // restrictOutboundWhenTypeOmitted — type 미지정 시 OUTBOUND row 자동 제외 (C5-3 4-arg, 줄바꿈 호출)
    expect(controller).toContain(
      'SlipSalesAccessGuard.restrictOutboundWhenTypeOmitted(effectiveSlipType, role,',
    )

    // 기본 정렬 slipDate DESC + seqNo DESC
    expect(controller).toContain('Sort.Order.desc("slipDate")')
    expect(controller).toContain('Sort.Order.desc("seqNo")')

    // listForQuery 메서드 존재
    expect(controller).toContain('public ApiResponse<Page<SlipResponse>> listForQuery(')

    // guard — 허용 역할: SALES / MANAGER / MASTER
    expect(guard).toContain('"SALES".equals(role)')
    expect(guard).toContain('"MANAGER".equals(role)')
    expect(guard).toContain('"MASTER".equals(role)')

    // guard — 금지 역할 문구
    expect(guard).toContain('INVENTORY')
    expect(guard).toContain('WAREHOUSE')
    expect(guard).toContain('403')

    // salesPersonName — 담당자명 필드 존재
    expect(slipResponse).toContain('salesPersonName')

    // partnerName — 거래처명 필드 존재
    expect(slipResponse).toContain('partnerName')

    // businessNumber — 거래처코드 필드 (UUID 비공개 대체 식별자)
    expect(slipResponse).toContain('businessNumber')
  })

  /**
   * T2 — FE 계약: SalesQueryPage 컴포넌트 + data-testid + canQuerySales + 한국어 라벨
   *
   * [C5 follow-up] SalesQueryPage 가 slipType='OUTBOUND' 로 querySlips 를 호출하고,
   * canQuerySales(auth) 헬퍼를 사용하며 (BE SlipSalesAccessGuard: SALES/MANAGER/MASTER 한정),
   * data-testid 가 UUID 대신 slipNo 기반 비즈니스 식별자를 쓰고,
   * 모든 사용자 노출 라벨이 한국어임을 검증한다.
   */
  test('T2: SalesQueryPage canQuerySales + OUTBOUND querySlips + 한국어 라벨 + data-testid 계약', () => {
    const page = read(salesQueryPagePath)
    const session = read(sessionPath)

    // [P1-B] canQuerySales 복원 — session.ts 에 export 존재해야 함
    expect(session).toContain('export function canQuerySales')

    // [C5 follow-up] SalesQueryPage 가 canQuerySales(auth) 를 사용
    expect(page).toContain('const auth = useSessionStore((s) => s.auth)')
    expect(page).toContain('const canQuery = canQuerySales(auth)')
    expect(session).toContain("hasBuiltinRoleGroup(auth, 'SALES')")
    expect(session).toContain("hasBuiltinRoleGroup(auth, 'MANAGER')")
    expect(session).toContain("hasBuiltinRoleGroup(auth, 'MASTER')")

    // slipType: 'OUTBOUND' 로 매출 목록 조회
    expect(page).toContain("slipType: 'OUTBOUND'")

    // SHIPPABLE_STATUSES — SAVED / CONFIRMED 출고 전환 가능 상태
    expect(page).toContain("const SHIPPABLE_STATUSES = ['SAVED', 'CONFIRMED'] as const")

    // 한국어 라벨 — 상태
    expect(page).toContain("DRAFT: '임시저장'")
    expect(page).toContain("SAVED: '저장완료'")
    expect(page).toContain("CONFIRMED: '확정'")

    // 한국어 라벨 — 컬럼 헤더
    expect(page).toContain('판매번호')
    expect(page).toContain('거래처')
    expect(page).toContain('거래처코드')
    expect(page).toContain('배송주소')
    expect(page).toContain('담당자명')
    expect(page).toContain('입금예정일')

    // data-testid — UUID 대신 slipNo 기반 (UUID 비공개 가드)
    expect(page).toContain('data-testid={`sales-query-detail-${toPublicTestId(row.slipNo)}`}')
    expect(page).toContain('data-testid={`sales-query-row-${row.slipNo}`}')
    expect(page).not.toMatch(/data-testid=\{`sales-query-(detail|row)-\$\{row\.id\}`\}/)

    // 판매 검색 모달 한국어 라벨
    expect(page).toContain('판매번호')
    expect(page).toContain('거래처명')
    expect(page).toContain('배송주소')
    expect(page).toContain('프로젝트명')

    // CTA 자리 표시: 상세 버튼
    expect(page).toContain('상세')

    // 총 건수 텍스트
    expect(page).toContain('총 ')
  })

  /**
   * T3 — inventory-service endpoint 회귀 (SP-08-5-4 정합 — 출고 흐름)
   *
   * 재고 출고 차감 endpoint /deduct 가 StockController 에 존재하고,
   * OUTBOUND 슬립의 출고 전환 흐름이 SP-08-5-4 inbound 흐름과 대칭적으로
   * inventory-service 를 경유함을 정적으로 검증한다.
   */
  test('T3: inventory-service 출고 차감 endpoint /deduct 계약 + SP-08-5-4 정합', () => {
    const stock = read(stockControllerPath)

    // 출고 차감 endpoint 존재
    expect(stock).toContain('@PostMapping("/deduct")')
    expect(stock).toContain('출고 차감')

    // FIFO 로트 차감 — DEDUCT movement
    expect(stock).toContain('FIFO')
    expect(stock).toContain('DEDUCT')

    // OUTBOUND 슬립 라인 요약 클라이언트 — inventory-service 내부 참조
    const outboundClientPath =
      'services/inventory-service/src/main/java/com/samhanair/logis/inventory/client/OutboundSlipLineSummary.java'
    const outboundClient = read(outboundClientPath)
    expect(outboundClient).toBeTruthy()

    // inbound inspection controller 와 대칭 구조 존재 확인
    const inboundInspectionPath =
      'services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/InboundInspectionController.java'
    const inboundController = read(inboundInspectionPath)
    expect(inboundController).toContain('inbound-inspections')
  })

  /**
   * T4 — audit + UUID 비공개
   *
   * QA 스크린샷 생성 스크립트가 UUID 를 포함하지 않고 비즈니스 식별자(판매번호)만 사용하며,
   * SalesQueryPage data-testid 가 slipNo 기반임을 검증한다.
   */
  test('T4: QA 스크린샷 스크립트 UUID 비공개 + 판매번호 표시 계약', () => {
    const script = read(screenshotScriptPath)
    const page = read(salesQueryPagePath)

    // 스크립트에 UUID 미포함 가드
    expect(script).not.toMatch(UUID_REGEX)

    // 스크립트에 판매번호 형식 포함 (YYYY/MM/DD-N)
    expect(script).toMatch(/2026\/05\/\d{2}-\d/)

    // 스크립트에 Malgun Gothic fallback 폰트 포함 (Windows 한국어)
    expect(script).toContain('Malgun Gothic')

    // SalesQueryPage — row.id 대신 row.slipNo 기반 testid
    expect(page).toContain('data-testid={`sales-query-detail-${toPublicTestId(row.slipNo)}`}')
    expect(page).not.toMatch(/data-testid=\{`sales-query-detail-\$\{row\.id\}`\}/)

    // SalesQueryPage — row 레벨 testid 도 slipNo 기반
    expect(page).toContain('data-testid={`sales-query-row-${row.slipNo}`}')
    expect(page).not.toMatch(/data-testid=\{`sales-query-row-\$\{row\.id\}`\}/)

    // 한국어 에러 메시지
    expect(page).toContain('출고 전표 목록을 불러오지 못했습니다')
  })

  /**
   * T5 — 권한 가드 (SALES/MANAGER/MASTER 허용 + INVENTORY/WAREHOUSE 403)
   *
   * SlipSalesAccessGuard 가 OUTBOUND 조회 시 INVENTORY / WAREHOUSE 를 403으로 차단하고,
   * SALES / MANAGER / MASTER 만 허용함을 정적 단언한다.
   * SP-08-5-1 의 INBOUND 가드(WAREHOUSE 허용, SALES 거부)와 대칭 구조임을 확인한다.
   */
  test('T5: 권한 가드 SALES/MANAGER/MASTER 허용 + INVENTORY/WAREHOUSE 403 계약', () => {
    const guard = read(slipSalesGuardPath)
    const controller = read(slipQueryControllerPath)
    const session = read(sessionPath)

    // 허용 역할 3개
    expect(guard).toContain('"SALES".equals(role)')
    expect(guard).toContain('"MANAGER".equals(role)')
    expect(guard).toContain('"MASTER".equals(role)')

    // 금지 역할 명시
    expect(guard).toContain('INVENTORY')
    expect(guard).toContain('WAREHOUSE')

    // 403 응답 코드 / FORBIDDEN 예외
    expect(guard).toContain('FORBIDDEN')
    expect(guard).toContain('출고 전표 조회는 SALES / MANAGER / MASTER 권한만 허용합니다.')

    // canReadOutboundSales 메서드 존재
    expect(guard).toContain('static boolean canReadOutboundSales(String role)')

    // restrictOutboundWhenTypeOmitted — type 미지정 시 INVENTORY/WAREHOUSE 에게 OUTBOUND 노출 안 함
    expect(guard).toContain('static SlipType restrictOutboundWhenTypeOmitted(SlipType slipType, String role)')

    // controller 에서 guard 호출 (C5-3: 그룹/isSystemMaster OR 병행 4-arg — role 경로 보존 + 그룹 경로 추가)
    expect(controller).toContain(
      'SlipSalesAccessGuard.guardOutboundSalesRead(slipType, role, userGroups, isSystemMaster)',
    )
    expect(controller).toContain(
      'SlipSalesAccessGuard.restrictOutboundWhenTypeOmitted(effectiveSlipType, role,',
    )

    // [P1-B revert] canQuerySales 헬퍼 session.ts 에 복원 — export 존재해야 함
    expect(session).toContain('export function canQuerySales')

    // [C5 follow-up] SalesQueryPage 가 canQuerySales(auth) 로 인가 게이트를 구성
    const salesPage = read(salesQueryPagePath)
    expect(salesPage).toContain('const canQuery = canQuerySales(auth)')
    // canQuerySales 는 BE SlipSalesAccessGuard 와 동일 허용 집합(SALES/MANAGER/MASTER)
    // — ACCOUNTANT/INVENTORY 는 seed 에 sales.slip.list view=TRUE 지만 BE 가드가 403 반환하므로
    //   FE 도 동일 집합으로 화면 게이트. canAccess('sales.slip.list') 사용 시 FE-shows-BE-blocks 발생.
  })
})
