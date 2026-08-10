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
 *
 * 시작 = 해당 `label="X"` 직전의 가장 가까운 `<SidebarCategory` 여는 태그,
 * 끝   = 그 시작 이후 다음 `<SidebarCategory` 직전(없으면 문서 끝).
 *
 * [2026-06-11 P2 #7] 기존 구현은 `<SidebarCategory\b[\s\S]*?label="X"` 정규식을 썼는데,
 *   `[\s\S]*?` lazy 매칭이 **첫 번째** `<SidebarCategory`(판매)에서 시작해 대상 label 까지
 *   확장되어 start 가 항상 첫 카테고리로 anchor 됐다. 결과 슬라이스가 대상 그룹 앞의
 *   다른 그룹(판매·구매…)까지 포함해 '그룹 격리' 단언이 vacuous 였다(예: '회계' 블록이
 *   판매~회계 전체를 포함 → 다른 그룹 항목도 통과). label 위치를 먼저 찾고 그 직전
 *   가장 가까운 여는 태그로 anchor 하도록 교정한다.
 */
function categoryBlock(text: string, label: string): string {
  const labelToken = `label="${label}"`
  const labelIndex = text.indexOf(labelToken)
  expect(labelIndex, `SidebarCategory label="${label}" 가 존재해야 함`).toBeGreaterThanOrEqual(0)

  // label 직전의 가장 가까운 <SidebarCategory 여는 태그 = 해당 그룹의 시작점.
  const openToken = '<SidebarCategory'
  const start = text.lastIndexOf(openToken, labelIndex)
  expect(
    start,
    `label="${label}" 직전 <SidebarCategory 여는 태그가 존재해야 함`,
  ).toBeGreaterThanOrEqual(0)
  // 여는 태그와 label 사이에 다른 <SidebarCategory 가 끼면 안 됨(같은 태그여야 함).
  const between = text.slice(start + openToken.length, labelIndex)
  expect(
    between.includes(openToken),
    `label="${label}" 가 자신의 <SidebarCategory 여는 태그 속성이어야 함(다른 카테고리 침범 없음)`,
  ).toBe(false)

  // 다음 카테고리 직전까지가 이 그룹의 경계.
  const next = text.indexOf(openToken, start + openToken.length)
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function assertSidebarLinkExactLabel(block: string, testId: string, label: string): void {
  const linkBlock = sidebarLinkBlock(block, testId)
  expect(linkBlock, `${testId}: 라벨 "${label}" 정확 단언`).toMatch(
    new RegExp(`>\\s*${escapeRegExp(label)}\\s*</SidebarLink>`),
  )
}

function compactLabel(label: string): string {
  return label.replace(/\s+/g, '')
}

function constBlock(text: string, constName: string, nextConstName: string): string {
  const startToken = `const ${constName} =`
  const start = text.indexOf(startToken)
  expect(start, `${startToken} 선언이 존재해야 함`).toBeGreaterThanOrEqual(0)
  const endToken = `const ${nextConstName} =`
  const end = text.indexOf(endToken, start + startToken.length)
  expect(end, `${endToken} 선언이 ${startToken} 뒤에 존재해야 함`).toBeGreaterThan(start)
  return text.slice(start, end)
}

test.describe('SP-04/Round A 좌측 메뉴 5대분류 IA 정적 계약', () => {
  const appLayout = read('clients/desktop/src/renderer/components/AppLayout.tsx')

  // (a) 홈 라벨 존재 + 대시보드 부재 — 사이드바 NavLink 한정.
  test('상단 고정 링크: 홈(NavLink to="/" end) 존재 + 대시보드 라벨 부재', () => {
    // 홈 NavLink 블록 한정 — 상단 주석의 "홈"·회계 그룹 "홈택스" 오매칭 방지.
    expect(appLayout).toMatch(/<NavLink to="\/" end>[\s\S]*?홈[\s\S]*?<\/NavLink>/)
    // [Round C P3 #10] 같은 to="/" end NavLink 의 라벨(여는/닫는 태그 사이 \s* 텍스트)이 "대시보드" 가
    //   아니어야 함(라벨 폐기 박제). 라벨을 태그 사이로 한정해 '운영 대시보드'(회계 SidebarLink)
    //   오매칭을 차단한다(기존 [\s\S]*? 광역 매칭 위험 제거).
    expect(appLayout).not.toMatch(/<NavLink to="\/" end>\s*대시보드\s*<\/NavLink>/)
    // 홈 NavLink 의 라벨 텍스트(태그 사이)가 정확히 '홈' 이어야 함(>홈< 정밀 토큰).
    expect(appLayout).toMatch(/<NavLink to="\/" end>\s*홈\s*<\/NavLink>/)
  })

  // (b) 7그룹 순서 + 폐기된 구 그룹 부재.
  test('사이드바: 상단 고정 2개 + 7 카테고리 순서, 구 그룹 부재', () => {
    // [Round C P2 #2/#9] '홈'/'알림 내역' 평문 토큰은 AppLayout Javadoc 주석(8-9행)에도 등장해
    //   assertInOrder 단언이 vacuous(주석 매칭) 였다. JSX 한정 토큰으로 좁혀 첫 SidebarCategory
    //   (label="판매") 앞에 상단 고정 2개(홈 NavLink·알림 내역 testid)가 오는 것을 박제한다.
    assertInOrder(appLayout, [
      '<NavLink to="/" end>',
      'data-testid="sidebar-notifications"',
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

  test('7 카테고리는 접근성 속성을 가진 collapsible 토글로 렌더된다', () => {
    expect(appLayout).toContain('aria-expanded={open}')
    expect(appLayout).toContain('aria-controls={controls}')
    expect(appLayout).toContain('role="group"')
    expect(appLayout).toContain('aria-labelledby={headingId}')
    expect(appLayout).toContain('localStorage')
    expect(appLayout).toContain('useLocation')

    for (const label of ['판매', '구매', '회계', '그룹웨어', '인사', '배차', '창고 운영']) {
      const block = categoryBlock(appLayout, label)
      const testId = `sidebar-category-toggle-${compactLabel(label)}`
      expect(block, `${label}: 카테고리 토글 testid 보존`).toContain(`testId="${testId}"`)
      expect(block, `${label}: activeTargets 로 활성 라우트 자동 펼침 대상 명시`).toContain('activeTargets={[')
    }
  })

  // [Round A 재리뷰 사이클2 P2 #1/#5] cross-group 자동펼침 오탐 방지 정적 박제 —
  //   판매 그룹의 진입점 '/sales' 는 bare prefix 로 두면 '/sales/closing'(회계)·
  //   '/sales/link-dispatch'(그룹웨어) 진입 시 판매 그룹까지 동시 자동펼침되므로,
  //   activeTargets 에서 bare '/sales' 를 제거하고 exactTargets 로 분리해야 한다.
  test('판매 그룹: bare /sales 는 activeTargets 에서 제외 + exactTargets 로 정확 매칭(cross-group 오탐 차단)', () => {
    const salesBlock = categoryBlock(appLayout, '판매')

    // activeTargets 안의 bare '/sales'(prefix 매칭) 부재 — 따옴표 정확 토큰으로 하위 경로
    //   ('/sales/estimates' 등)와 구분해 단언한다.
    const activeTargetsMatch = /activeTargets=\{\[([\s\S]*?)\]\}/.exec(salesBlock)
    expect(activeTargetsMatch, '판매 activeTargets 배열 존재').not.toBeNull()
    const activeTargetsBody = activeTargetsMatch?.[1] ?? ''
    expect(
      /(^|[\s,[])'\/sales'\s*,/.test(activeTargetsBody),
      "판매 activeTargets 에 bare '/sales' 가 없어야 함(cross-group prefix 오매칭 차단)",
    ).toBe(false)

    // exactTargets 로 '/sales' 정확 매칭 분리 박제.
    expect(salesBlock, "판매 그룹은 exactTargets={['/sales']} 로 진입점을 정확 매칭해야 함").toMatch(
      /exactTargets=\{\[\s*'\/sales'\s*\]\}/,
    )

    // 판매 전용 하위 경로는 여전히 activeTargets 에 존재(자동펼침 보존).
    expect(activeTargetsBody, "판매 activeTargets 에 '/sales/partner-orders' 보존").toContain(
      "'/sales/partner-orders'",
    )
  })

  // [Round C P3 #12] 그룹 가시성 OR 구성원 정적 단언 — Round A/B 의 OR fix(단독 권한자 그룹 누락
  //   해소)가 향후 revert 되면 CI 에서 즉시 적발되도록 박제한다. AppLayout 의 show* 집계식이
  //   각 핵심 구성원을 포함하는지 소스 텍스트로 단언한다(런타임 의존 없음).
  test('그룹 가시성 OR 구성원 정적 박제 — showSales/showAccounting/showArologisGroup/showAdminHrGroup', () => {
    const salesVisibility = constBlock(appLayout, 'showSales', 'showPurchase')
    const accountingVisibility = constBlock(appLayout, 'showAccounting', 'showDeliveryBatch')

    // (회계) Round B 보강: 세금계산서 발행 묶음(batch-issue)·수신 세금계산서(inbound) 단독 권한자도
    //   회계 그룹을 얻어야 한다 → OR 식에 두 변수가 포함되어야 한다.
    expect(accountingVisibility, '회계 OR 식에 showAccountingTaxInvoiceBatch 포함').toContain('showAccountingTaxInvoiceBatch')
    expect(accountingVisibility, '회계 OR 식에 showAccountingTaxInvoiceInbound 포함').toContain('showAccountingTaxInvoiceInbound')
    expect(accountingVisibility, '회계 OR 식에서 주문서 관리 권한 제외').not.toContain('showAccountingAdminOrder')
    expect(accountingVisibility, '회계 OR 식에 원장 대조 권한 포함').toContain('showAccountingAdminLedger')
    expect(accountingVisibility, '회계 OR 식에 운영 대시보드 권한 포함').toContain('showAccountingAdminMigOps')
    expect(accountingVisibility, '회계 OR 식에 회계 수정 요청 권한 포함').toContain('showAccountingEditRequests')

    // (배차) Round A 보강: 배차지역 관리 단독 권한자(showRegionMgmt)도 배차 그룹을 얻어야 한다.
    expect(appLayout, '배차 OR 식 = showDispatchBoard || showArologis || showRegionMgmt').toMatch(
      /const showArologisGroup\s*=\s*showDispatchBoard\s*\|\|\s*showArologis\s*\|\|\s*showRegionMgmt/,
    )

    // (인사) 자식 메뉴 중 하나라도 보일 때만 헤더를 노출한다. admin.users 는 제외(빈 헤더 방지, Round B #3).
    expect(appLayout, '인사 OR 식 = 직원 || 운송사 || 권한관리 || 권한위임 || 결재라인 || 출고마감').toMatch(
      /const showAdminHrGroup\s*=\s*showAdminEmployees\s*\|\|\s*showCarrierMaster\s*\|\|\s*showPermissionAdmin\s*\|\|\s*showPermissionDelegation\s*\|\|\s*showApprovalLineConfig\s*\|\|\s*showSlipCutoff/,
    )
  })

  // [PR #658] OCR 메뉴 부재 가드 — 영수증 OCR(purchases.receipt-ocr) / 발주서 업로드(sales.vendor-order)
  // 메뉴를 완전 삭제한 후 재추가되지 않도록 정적 박제. route 및 한국어 라벨 양쪽을 단언한다.
  test('OCR 메뉴 부재 — 영수증 OCR / 발주서 업로드 재추가 회귀 가드', () => {
    expect(appLayout, '영수증 OCR 라벨이 메뉴에 없어야 함').not.toContain('영수증 OCR')
    expect(appLayout, '발주서 업로드 라벨이 메뉴에 없어야 함').not.toContain('발주서 업로드')
    expect(appLayout, '/purchases/receipt-ocr route 가 메뉴에 없어야 함').not.toContain('/purchases/receipt-ocr')
    expect(appLayout, '/sales/vendor-order route 가 메뉴에 없어야 함').not.toContain('/sales/vendor-order')
    expect(appLayout, 'purchases.receipt-ocr page-code 가 메뉴에 없어야 함').not.toContain('purchases.receipt-ocr')
    expect(appLayout, 'sales.vendor-order page-code 가 메뉴에 없어야 함').not.toContain('sales.vendor-order')
  })

  // (b) 이동 항목이 지정 그룹 블록 안에서 route+testid+label 3종을 동일 SidebarLink 블록에서
  //     보존하는지 — sidebarLinkBlock 으로 블록을 잘라 hard 단언(false-green 잔여 갭 제거).
  //     [Round B P2] 기존 categoryBlock 전역 매칭은 to/testid/label 이 서로 다른 항목에 흩어져도
  //     통과했다(품목 관리 route 미단언, 시트 동기화 testid 미단언, 단톡방/배차 route 미단언).
  test('이동 항목: 각 카테고리 블록 안에서 route+testid+label 동일 블록 hard 보존', () => {
    const salesBlock = categoryBlock(appLayout, '판매')
    assertSidebarLink(salesBlock, 'sidebar-sales', '/sales', '판매관리')
    assertSidebarLink(salesBlock, 'sidebar-sales-partner-orders', '/sales/partner-orders', '주문서 관리')
    assertSidebarLinkExactLabel(salesBlock, 'sidebar-sales-partner-orders', '주문서 관리')
    assertSidebarLink(salesBlock, 'sidebar-products-catalog', '/products/catalog', '기초품목 관리')
    assertSidebarLink(
      salesBlock,
      'sidebar-products-estimate-items',
      '/products/estimate-items',
      '견적품목 관리',
    )
    // 시트 동기화 — 품목 권한 동반 노출 변형(testid in-products) 의 route+testid+label 동시 단언.
    assertSidebarLink(
      salesBlock,
      'sidebar-settings-sheet-sync-in-products',
      '/admin/sheet-sync',
      '시트 동기화',
    )

    const purchaseBlock = categoryBlock(appLayout, '구매')
    assertSidebarLink(purchaseBlock, 'sidebar-purchases', '/purchases', '구매관리')
    assertSidebarLink(purchaseBlock, 'sidebar-transfers', '/transfers', '재고이동 관리')

    const accountingBlock = categoryBlock(appLayout, '회계')
    expect(accountingBlock, '회계 관리자 중첩 그룹 토글은 제거되어야 함').not.toContain('sidebar-accounting-admin-group-toggle')
    expect(accountingBlock, '회계 관리자 중첩 그룹 컨테이너는 제거되어야 함').not.toContain('sidebar-accounting-admin-group')
    expect(accountingBlock, '주문서 route 는 판매 activeTargets 소속이어야 하므로 회계 블록에서 제외').not.toContain(
      "'/accounting/admin/orders'",
    )
    expect(accountingBlock, '주문서 관리는 판매 flat 항목이어야 하므로 회계 블록에서 제외').not.toContain(
      'sidebar-accounting-admin-orders',
    )
    assertSidebarLink(accountingBlock, 'sidebar-accounting-admin-sales-ledger', '/accounting/admin/ledger/sales', '매출 원장 대조')
    assertSidebarLink(accountingBlock, 'sidebar-accounting-admin-purchase-ledger', '/accounting/admin/ledger/purchase', '매입 원장 대조')
    assertSidebarLink(accountingBlock, 'sidebar-accounting-admin-migration-ops', '/accounting/admin/migration-ops', '운영 대시보드')
    assertSidebarLink(accountingBlock, 'sidebar-accounting-admin-edit-requests', '/admin/accounting-edit-requests', '회계 수정 요청')

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

    // [#463] 배차 그룹 — 유지 메뉴 3종의 리라벨 hard 단언.
    const dispatchBlock = categoryBlock(appLayout, '배차')
    assertSidebarLink(dispatchBlock, 'sidebar-dispatch-history', '/dispatch-board/history', '배차현황')
    assertSidebarLink(dispatchBlock, 'sidebar-arologis-preclassify', '/arologis/pre-classify', '가배차리스트')
    assertSidebarLink(dispatchBlock, 'sidebar-arologis-unassigned', '/arologis/unassigned', '미배차리스트')

    const warehouseOpsBlock = categoryBlock(appLayout, '창고 운영')
    assertSidebarLink(warehouseOpsBlock, 'sidebar-warehouses', '/warehouses', '창고관리')
  })
})
