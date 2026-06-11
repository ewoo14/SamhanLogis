/**
 * 좌측 메뉴 5대분류 재편 — 신규 IA 구조 정적 계약 스펙 (PR #462 Round A).
 *
 * 본 스펙은 AppLayout.tsx 소스를 정적 read 하여 7그룹 IA 구조를 박제한다.
 * dev server 의존 없음(파일 read 만) → CI 에서 항상 수집·실행되며 skipped=0.
 *
 * 배치 사유:
 *   기존 full-menu-contract/ 디렉터리는 playwright.config.ts testIgnore 대상이라
 *   거기 둔 핵심 IA 단언 3건이 CI 미수집(false-green)이었다. menu-relocate/ 는
 *   testIgnore 비대상이므로 본 디렉터리로 이전해 CI desktop-playwright 잡
 *   (npx playwright test, testIgnore 상속)에서 수집·실행을 보장한다.
 *
 * 약한 가드 강화(P3):
 *   (a) 홈 단언 — 사이드바 NavLink(to="/" end) 블록 한정 정규식으로 좁혀
 *       상단 주석/홈택스 오매칭을 방지한다.
 *   (b) 그룹소속 단언 — SidebarCategory label="X" 블록을 잘라(해당 label~다음 label
 *       직전) 그 안에서만 항목 to/testid 를 검사. greedy 전역 매칭(항목이 다른
 *       그룹에 있어도 통과하던 갭)을 제거한다.
 *   (c) 그룹 부재 단언 — 폐기된 구 그룹 label 문자열 부재(블록 경계 기반).
 */
import { expect, test } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const specDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(specDir, '../../../..')

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8')
}

/**
 * 라벨 순서대로 등장하는지(앞 라벨 index < 뒤 라벨 index) 단언.
 * 각 라벨은 반드시 존재해야 한다.
 */
function assertInOrder(text: string, labels: string[]): void {
  let previous = -1
  for (const label of labels) {
    const index = text.indexOf(label)
    expect(index, `${label} 토큰이 존재해야 함`).toBeGreaterThanOrEqual(0)
    expect(index, `${label} 토큰이 직전 라벨보다 뒤에 있어야 함`).toBeGreaterThan(previous)
    previous = index
  }
}

/**
 * 특정 SidebarCategory label 블록 텍스트만 잘라 반환한다.
 * 시작 = `<SidebarCategory label="X"`, 끝 = 다음 `<SidebarCategory label=` 직전(없으면 문서 끝).
 * 항목이 다른 그룹에 있어도 통과하던 전역 greedy 매칭 갭을 제거하기 위함.
 */
function categoryBlock(text: string, label: string): string {
  const startToken = `<SidebarCategory label="${label}"`
  const start = text.indexOf(startToken)
  expect(start, `SidebarCategory label="${label}" 블록이 존재해야 함`).toBeGreaterThanOrEqual(0)
  const next = text.indexOf('<SidebarCategory label="', start + startToken.length)
  return text.slice(start, next < 0 ? text.length : next)
}

/**
 * [Round B P2] 카테고리 블록 안에서 특정 data-testid 를 가진 단일 <SidebarLink> 블록만 잘라 반환한다.
 * 시작 = 해당 testid 를 포함하는 <SidebarLink 여는 태그, 끝 = 그 블록의 </SidebarLink>.
 *
 * 같은 블록(같은 SidebarLink) 안에서 to=·data-testid=·label 3종을 함께 hard 단언하기 위함.
 * 기존 categoryBlock 전역 매칭은 to/testid/label 이 서로 다른 항목에 흩어져 있어도 통과하던
 * false-green 갭이 있었다(예: 품목 관리 route 미단언, 시트 동기화 testid 미단언).
 *
 * @param block categoryBlock() 로 잘라낸 카테고리 텍스트
 * @param testId 대상 SidebarLink 의 data-testid 값
 */
function sidebarLinkBlock(block: string, testId: string): string {
  const testIdToken = `data-testid="${testId}"`
  const testIdIndex = block.indexOf(testIdToken)
  expect(
    testIdIndex,
    `data-testid="${testId}" SidebarLink 가 블록 안에 존재해야 함`,
  ).toBeGreaterThanOrEqual(0)
  // testid 앞쪽에서 가장 가까운 <SidebarLink 여는 태그 시작점
  const open = block.lastIndexOf('<SidebarLink', testIdIndex)
  expect(open, `${testId} 의 <SidebarLink 여는 태그를 찾아야 함`).toBeGreaterThanOrEqual(0)
  // testid 뒤쪽에서 가장 가까운 </SidebarLink> 닫는 태그 끝점
  const closeToken = '</SidebarLink>'
  const closeStart = block.indexOf(closeToken, testIdIndex)
  expect(closeStart, `${testId} 의 </SidebarLink> 닫는 태그를 찾아야 함`).toBeGreaterThanOrEqual(0)
  return block.slice(open, closeStart + closeToken.length)
}

/**
 * 단일 SidebarLink 블록 안에서 to / data-testid / label 3종을 모두 hard 단언한다.
 *
 * @param block categoryBlock() 결과
 * @param testId data-testid 값
 * @param to 기대 to(route) 값
 * @param label 블록 안에 포함되어야 할 라벨 텍스트
 */
function assertSidebarLink(
  block: string,
  testId: string,
  to: string,
  label: string,
): void {
  const linkBlock = sidebarLinkBlock(block, testId)
  expect(linkBlock, `${testId}: to="${to}" 단언`).toContain(`to="${to}"`)
  expect(linkBlock, `${testId}: data-testid 단언`).toContain(`data-testid="${testId}"`)
  expect(linkBlock, `${testId}: 라벨 "${label}" 단언`).toContain(label)
}

test.describe('SP-04/Round A 좌측 메뉴 5대분류 IA 정적 계약', () => {
  const appLayout = read('clients/desktop/src/renderer/components/AppLayout.tsx')

  // (a) 홈 라벨 존재 + 대시보드 부재 — 사이드바 NavLink 한정.
  test('상단 고정 링크: 홈(NavLink to="/" end) 존재 + 대시보드 라벨 부재', () => {
    // 홈 NavLink 블록 한정 — 상단 주석의 "홈"·회계 그룹 "홈택스" 오매칭 방지.
    expect(appLayout).toMatch(/<NavLink to="\/" end>[\s\S]*?홈[\s\S]*?<\/NavLink>/)
    // 같은 to="/" end NavLink 가 "대시보드" 라벨이 아니어야 함(라벨 폐기 박제).
    expect(appLayout).not.toMatch(/<NavLink to="\/" end>[\s\S]*?대시보드[\s\S]*?<\/NavLink>/)
  })

  // (b) 7그룹 순서 + 폐기된 구 그룹 부재.
  test('사이드바: 상단 고정 2개 + 7 카테고리 순서, 구 그룹 부재', () => {
    assertInOrder(appLayout, [
      '홈',
      '알림 내역',
      'label="판매"',
      'label="구매"',
      'label="회계"',
      'label="그룹웨어"',
      'label="인사"',
      // [Round B P2] 배차 그룹 헤더 라벨 'arologis'(코드명) → '배차'(업무 라벨).
      'label="배차"',
      'label="창고 운영"',
    ])

    // (c) 폐기된 구 그룹 라벨 부재(블록 경계 기반 — SidebarCategory label 문자열).
    expect(appLayout).not.toContain('<SidebarCategory label="메신저"')
    expect(appLayout).not.toContain('<SidebarCategory label="알림 매핑"')
    expect(appLayout).not.toContain('<SidebarCategory label="품목"')
    expect(appLayout).not.toContain('<SidebarCategory label="설정"')
  })

  // (b) 이동 항목이 지정 그룹 블록 안에서 route+testid+label 3종을 동일 SidebarLink 블록에서
  //     보존하는지 — sidebarLinkBlock 으로 블록을 잘라 hard 단언(false-green 잔여 갭 제거).
  //     [Round B P2] 기존 categoryBlock 전역 매칭은 to/testid/label 이 서로 다른 항목에 흩어져도
  //     통과했다(품목 관리 route 미단언, 시트 동기화 testid 미단언, 단톡방/배차 route 미단언).
  test('이동 항목: 각 카테고리 블록 안에서 route+testid+label 동일 블록 hard 보존', () => {
    const salesBlock = categoryBlock(appLayout, '판매')
    assertSidebarLink(salesBlock, 'sidebar-sales', '/sales', '판매관리')
    assertSidebarLink(salesBlock, 'sidebar-products-catalog', '/products/catalog', '품목 관리')
    // 시트 동기화 — 품목 권한 동반 노출 변형(testid in-products) 의 route+testid+label 동시 단언.
    assertSidebarLink(
      salesBlock,
      'sidebar-settings-sheet-sync-in-products',
      '/admin/sheet-sync',
      '시트 동기화',
    )

    const purchaseBlock = categoryBlock(appLayout, '구매')
    assertSidebarLink(purchaseBlock, 'sidebar-purchases', '/purchases', '구매관리')
    assertSidebarLink(purchaseBlock, 'sidebar-purchases-receipt-ocr', '/purchases/receipt-ocr', '영수증 OCR')
    assertSidebarLink(purchaseBlock, 'sidebar-transfers', '/transfers', '재고이동 관리')

    const groupwareBlock = categoryBlock(appLayout, '그룹웨어')
    assertSidebarLink(groupwareBlock, 'sidebar-link-dispatch', '/sales/link-dispatch', '링크발송')
    assertSidebarLink(
      groupwareBlock,
      'sidebar-messenger-aligo-address-book',
      '/admin/aligo-address-book',
      '알리고 주소록',
    )
    // 단톡방 매핑 — route(/admin/chat-rooms) 까지 hard 단언(기존 testid+label 만).
    assertSidebarLink(groupwareBlock, 'sidebar-admin-chat-rooms', '/admin/chat-rooms', '단톡방 매핑')

    // [Round B P2] 배차 그룹 — 라벨 '배차'(구 'arologis'). 배차 메뉴 route(/dispatch-board) hard 단언.
    const dispatchBlock = categoryBlock(appLayout, '배차')
    assertSidebarLink(dispatchBlock, 'sidebar-dispatch-board', '/dispatch-board', '배차 메뉴')

    const warehouseOpsBlock = categoryBlock(appLayout, '창고 운영')
    assertSidebarLink(warehouseOpsBlock, 'sidebar-warehouses', '/warehouses', '창고관리')
  })
})
