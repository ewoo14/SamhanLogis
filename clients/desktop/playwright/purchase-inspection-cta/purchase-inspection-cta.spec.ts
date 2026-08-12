/**
 * Samhan Public 구매관리 입고 검수 CTA contract.
 *
 * dev server 없이 실행되는 정적 회귀 스펙:
 * - 구매관리(`/purchases`) 통합 화면에서도 SAVED/CONFIRMED 입고전표는 검수 Dialog 로 진입해야 한다.
 * - 버튼/테스트 식별자는 UUID가 아닌 구매번호(slipNo) 기반 public id 를 사용해야 한다.
 * - 입고 검수 권한은 inventory-service 계약과 같은 WAREHOUSE / MANAGER / MASTER 여야 한다.
 * - 업무번호 `YYYY/MM/DD-N` 은 서비스/메뉴/업무 타입별 독립 순번이며 서로 다른 타입끼리 중복될 수 있다.
 */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(__dirname, '../..')
const repoRoot = path.resolve(desktopRoot, '../..')

const purchasePagePath = path.join(desktopRoot, 'src/renderer/routes/purchase-query/PurchaseQueryPage.tsx')
const sessionPath = path.join(desktopRoot, 'src/renderer/stores/session.ts')
const layoutPath = path.join(desktopRoot, 'src/renderer/components/AppLayout.tsx')
const slipApiPath = path.join(desktopRoot, 'src/renderer/api/slip.ts')
const mockApiPath = path.join(desktopRoot, 'src/renderer/api/mock.ts')
const transferServicePath = path.join(repoRoot, 'services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockTransferService.java')
const transferMigrationPath = path.join(repoRoot, 'services/inventory-service/src/main/resources/db/migration/V10__normalize_stock_transfer_numbers.sql')
const manualPath = path.join(repoRoot, 'docs/manual/02-창고/06-구매조회.md')
const decisionsPath = path.join(repoRoot, 'migration/decisions/DECISIONS.md')

function read(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8')
}

test.describe('Samhan Public 구매관리 입고 검수 CTA', () => {
  test('구매관리는 SAVED/CONFIRMED 행에서 InboundInspectionDialog를 연다', () => {
    const page = read(purchasePagePath)
    const dialog = read(path.join(desktopRoot, 'src/renderer/routes/components/InboundInspectionDialog.tsx'))

    expect(page).toContain("import { InboundInspectionDialog } from '../components/InboundInspectionDialog'")
    expect(page).toContain("const INSPECTABLE_STATUSES = ['SAVED', 'CONFIRMED'] as const")
    expect(page).toContain('const [inspectionSlipId, setInspectionSlipId] = useState<string | null>(null)')
    expect(page).toContain('setInspectionSlipId(row.id)')
    expect(page).toContain('<InboundInspectionDialog')
    expect(page).toContain('slipId={inspectionSlipId}')
    expect(dialog).toContain("invalidateQueries({ queryKey: ['slips', 'query', 'INBOUND'] })")
  })

  test('검수 버튼은 UUID가 아닌 구매번호 기반 public test id를 사용한다', () => {
    const page = read(purchasePagePath)
    const slipApi = read(slipApiPath)

    expect(slipApi).toContain('status: SlipStatus')
    expect(page).toContain('function toPublicTestId(value: string): string')
    expect(page).toContain('data-testid={`purchase-query-inspect-${toPublicTestId(row.slipNo)}`}')
    expect(page).not.toMatch(/data-testid=\{`purchase-query-inspect-\$\{row\.id\}`\}/)
  })

  test('입고 검수 권한은 메뉴와 버튼이 같은 canAccess 패턴을 쓴다', () => {
    // [C5-2b] canInspectInbound 정적 헬퍼 제거 — usePermissions().canAccess() 로 이관 완료.
    // session.ts 에 canInspectInbound 함수가 존재하지 않아야 한다.
    const session = read(sessionPath)
    const layout = read(layoutPath)
    const page = read(purchasePagePath)

    // C5-2b: session.ts 에 canInspectInbound 정의 없음 — 제거 완료 확인
    expect(session).not.toContain('export function canInspectInbound')

    // AppLayout: dynamicCanAccess('inbound.inspection') 단독 사용 (정적 fallback 제거됨)
    expect(layout).toContain("const showInboundInspection = dynamicCanAccess('inbound.inspection', 'view')")
    // C5-2b: || canInspectInbound(auth?.role) fallback 제거됨
    expect(layout).not.toContain('|| canInspectInbound(auth?.role)')

    // PurchaseQueryPage: canAccess('inbound.inspection') 로 이관
    expect(page).toContain("const canInspect = canAccess('inbound.inspection')")
  })

  test('문서는 구매관리 검수 CTA와 업무번호 독립 순번 원칙을 명시한다', () => {
    const manual = read(manualPath)
    const decisions = read(decisionsPath)

    expect(manual).toContain('검수')
    expect(manual).toContain('구매관리')
    expect(manual).toContain('SAVED / CONFIRMED')
    expect(manual).toContain('WAREHOUSE / MANAGER / MASTER')
    expect(manual).toContain('YYYY/MM/DD-{순번}')
    expect(manual).toContain('서비스/메뉴/업무 타입별로 독립')

    expect(decisions).toContain('SP-03')
    expect(decisions).toContain('판매관리')
    expect(decisions).toContain('구매관리')
    expect(decisions).toContain('서로 다른 서비스·메뉴·업무 타입의 업무번호는 같은 날짜 같은 순번을 가질 수 있다')
    expect(decisions).toContain('재고이동 이동번호도 전표번호 표준과 동일하게')
  })

  test('관리형 업무 메뉴는 조회 전용처럼 보이지 않는 라벨을 쓴다', () => {
    const layout = read(layoutPath)
    const salesSubNav = read(path.join(desktopRoot, 'src/renderer/components/sales/SalesSubNav.tsx'))

    // [Round C P1 #7] 4개 관리형 메뉴는 top-level <NavLink> 리터럴 → SidebarLink(내부 NavLink) 전환됨.
    //   견적서 관리(아래 103행)와 동일하게 라벨~</SidebarLink> 블록 패턴으로 갱신한다.
    expect(layout).toMatch(/창고관리[\s\S]*?<\/SidebarLink>/)
    expect(layout).toMatch(/판매관리[\s\S]*?<\/SidebarLink>/)
    expect(layout).toMatch(/구매관리[\s\S]*?<\/SidebarLink>/)
    expect(layout).toMatch(/재고이동 관리[\s\S]*?<\/SidebarLink>/)
    // SidebarLink(내부 NavLink) 닫힘 구조로 강화 — '견적서 관리\n          </SidebarLink>' 형태 실재
    expect(layout).toMatch(/견적서 관리[\s\S]*?<\/SidebarLink>/)
    expect(layout).toContain('주문서 관리')
    expect(layout).toContain('주문서 승인')
    expect(layout.match(/to="\/sales\/order-approvals"/g)).toHaveLength(1)
    expect(layout).toContain('거래처 DC 설정')
    expect(salesSubNav).toContain("label: '견적서 관리'")
    expect(salesSubNav).toContain("label: '주문서 관리'")
    expect(salesSubNav).toContain("label: '주문서 승인'")
    expect(salesSubNav.match(/\{ to: '\/sales\/order-approvals', label:/g)).toHaveLength(1)
    expect(salesSubNav).toContain("label: '거래처 DC 설정'")
  })

  test('재고이동 이동번호도 T/TR prefix 없이 YYYY/MM/DD-N 형식을 쓴다', () => {
    const mockApi = read(mockApiPath)
    const transferService = read(transferServicePath)
    const migration = read(transferMigrationPath)

    expect(mockApi).toContain("transferNo: '2026/05/04-1'")
    expect(mockApi).not.toMatch(/transferNo:\s*'T-/)
    expect(mockApi).not.toMatch(/transferNo:\s*'TR-/)

    expect(transferService).toContain('DateTimeFormatter.ofPattern("yyyy/MM/dd")')
    expect(transferService).toContain('String prefix = date.format(NO_DATE_FMT) + "-"')
    expect(transferService).toContain('findMaxSequenceByTransferNoPrefix(prefix) + 1')
    expect(transferService).toContain('return prefix + seq')
    expect(transferService).not.toContain('String prefix = "TR-"')

    expect(migration).toContain("regexp_replace(transfer_no, '^T-', '')")
    expect(migration).toContain("WHERE transfer_no ~ '^TR-[0-9]{8}-[0-9]+$'")
  })
})
