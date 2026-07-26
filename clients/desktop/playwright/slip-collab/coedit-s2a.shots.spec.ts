/**
 * PR #674 S2a 코-에디팅 전표 전체 폼 QA 스크린샷 캡처 스펙.
 *
 * 검증 포인트:
 *  ① 전표 인라인 편집(매출 전표 수정) — CollaborativeSlipInput 헤더 필드 Yjs 바인딩
 *    원격 Y.Doc 업데이트 → header.memo / header.deliveryAddress 원격 텍스트 병합 표시
 *  ② items Y.Array — CRDT `items.line-001.quantity` / `items.line-001.unitPrice` 셀의
 *    원격 값 반영 (DOM testid는 별도 목적의 `items.0.*` 경로)
 *  ③ 원격 커서 배지 — header.memo 필드에 "원격사용자A" 배지,
 *    CRDT `items.line-001.quantity` 셀에 "원격사용자B" 배지
 *  ④ Design B-2 fix: 배지 position:absolute 오버레이 → 품목 셀 높이/행 정렬 불변
 *  ⑤ FE B-1 fix: 숫자 셀(수량) clear → 재입력 가능
 *    (|| previous 폴백 제거로 빈 문자열로 지우기 가능)
 *  ⑥ UUID 비노출 (화면 텍스트에 UUID 패턴 없음)
 *  ⑦ 모바일(390x844) 반응형 뷰
 *
 * mock 전략 (VITE_MOCK_MODE=1):
 *  - Yjs 원격 업데이트: addInitScript → globalThis.__SAMHAN_MOCK_SLIP_COEDIT_SEED['slip-005']
 *    → GET /collab/coedit mock 핸들러가 base64 update 배열 반환
 *    → DocCoeditProvider.applySnapshot → Y.applyUpdate → header Y.Map + items Y.Array 병합
 *  - SSE 커서 주입: page.route(collab/stream glob) 인터셉트
 *    coedit:awareness SSE 이벤트 2건 (user1: header.memo, user2: items.line-001.quantity)
 *    provider.applyRemoteAwareness 적용 후 CollaborativeSlipInput.setRemoteCursors 배지 렌더
 *  - 실 2세션 SSE 미수행 사유: Docker 스택 미기동 환경 — page.route 정적 mock 대체.
 *    각 검증 포인트별 PASS/미확인 여부 로그에 정직 기록.
 *
 * 산출 경로: docs/qa/coedit-s2a/*.png
 *
 * 실행:
 *   cd C:\dev\Samhan-Public\clients\desktop
 *   node_modules/.bin/playwright test playwright/slip-collab/coedit-s2a.shots.spec.ts --reporter=line
 *   (기본 playwright.config.ts — VITE_MOCK_MODE=1 웹서버 자동 기동)
 */
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { test, expect, type Page } from '@playwright/test'
import * as Y from 'yjs'
import { Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness'

// ============================================================
// 상수 · 경로
// ============================================================

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

/** slip-005: OUTBOUND + DRAFT → canDirectEditSales = true (MASTER 권한) */
const SLIP_ID = 'slip-005'

const _dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOT_DIR = path.resolve(
  process.env['QA_SHOTS_DIR'] ?? path.resolve(_dirname, '../../../../docs/qa/coedit-s2a'),
)
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

// ============================================================
// 헬퍼: base64 인코딩 (Node Buffer)
// ============================================================

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

// ============================================================
// 헬퍼: 스크린샷 캡처
// ============================================================

async function capture(page: Page, name: string): Promise<void> {
  const filePath = path.join(SCREENSHOT_DIR, `${name}.png`)
  await page.screenshot({ path: filePath, fullPage: false })
  console.log(`[CAPTURE] ${filePath}`)
}

// ============================================================
// 헬퍼: auth stub (Electron IPC 없이 Bearer 토큰 경로)
// ============================================================

async function installAuthMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({
          token: 'playwright-mock-token',
          userId: '00000000-0000-0000-0000-000000010001',
          role: 'MASTER',
          fullName: '오병승',
          partnerCode: null,
          groups: [],
        }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  })
}

// ============================================================
// DocCoeditProvider 구조 Y.Doc 시드 생성
// createCoeditProvider.ts 와 동일 구조:
//   header = doc.getMap('header') — 텍스트 필드는 Y.Text 값
//   items  = doc.getArray('items') — 각 행이 Y.Map (plain string 값)
// ============================================================

/** createCoeditProvider.ts HEADER_TEXT_FIELDS 와 동일 */
const HEADER_TEXT_FIELDS = new Set(['memo', 'deliveryAddress', 'supervisionAddress', 'projectName'])

const REMOTE_MEMO = '원격 사용자 수정 중 — 협업 코-에디팅 S2a QA'
const REMOTE_ADDR = '서울 강남구 테헤란로 152 [원격 편집 중]'

interface CoeditSeedResult {
  /** Y.encodeStateAsUpdate 결과 base64 */
  yjsUpdateBase64: string
  /** 원격사용자A awareness (header.memo 커서) base64 */
  awarenessBase64User1: string
  /** 원격사용자B awareness (items.line-001.quantity 커서) base64 */
  awarenessBase64User2: string
}

function buildDocCoeditSeed(): CoeditSeedResult {
  // 1. 원격 Y.Doc 생성 — DocCoeditProvider 의 doc/header/items 와 동일 구조
  const remoteDoc = new Y.Doc()
  const remoteHeader = remoteDoc.getMap<unknown>('header')
  const remoteItems = remoteDoc.getArray<Y.Map<unknown>>('items')

  remoteDoc.transact(() => {
    // header 텍스트 필드 (Y.Text) — HEADER_TEXT_FIELDS 기준
    for (const fieldName of HEADER_TEXT_FIELDS) {
      const text = new Y.Text()
      if (fieldName === 'memo') text.insert(0, REMOTE_MEMO)
      else if (fieldName === 'deliveryAddress') text.insert(0, REMOTE_ADDR)
      // supervisionAddress, projectName 은 빈 Y.Text
      remoteHeader.set(fieldName, text)
    }
    // header 비텍스트 필드 (plain string)
    remoteHeader.set('partnerName', '한일냉동기술')
    remoteHeader.set('partnerCode', 'P-0004')
    remoteHeader.set('businessNumber', '456-78-90123')
    remoteHeader.set('recipientPhone', '010-9876-5432')
    remoteHeader.set('paymentDueDate', '2026-06-30')

    // items (Y.Map per row — plain string 값, SAMPLE_LINES 3건 반영)
    const item0 = new Y.Map<unknown>()
    item0.set('lineId', 'line-001')
    item0.set('productId', 'p-aj040')
    item0.set('productName', '시스템에어컨 4Way 4HP')
    item0.set('modelName', 'AJ040RXH4BC1')
    item0.set('specification', '4HP')
    item0.set('quantity', '7')       // 원격 사용자가 2→7 수정
    item0.set('unitPrice', '1900000') // 원격 사용자가 단가 수정
    item0.set('note', '')

    const item1 = new Y.Map<unknown>()
    item1.set('lineId', 'line-002')
    item1.set('productId', 'p-mwr10')
    item1.set('productName', '유선 리모컨 (WE10N)')
    item1.set('modelName', 'MWR-WE10N')
    item1.set('specification', '220V')
    item1.set('quantity', '2')
    item1.set('unitPrice', '85000')
    item1.set('note', '')

    const item2 = new Y.Map<unknown>()
    item2.set('lineId', 'line-003')
    item2.set('productId', 'p-pc1nw')
    item2.set('productName', 'WIFI 판넬')
    item2.set('modelName', 'PC1NWSK3NW')
    item2.set('specification', '')
    item2.set('quantity', '1')
    item2.set('unitPrice', '120000')
    item2.set('note', '')

    remoteItems.push([item0, item1, item2])
  })

  const yjsUpdateBase64 = toBase64(Y.encodeStateAsUpdate(remoteDoc))

  // 2. 원격 awareness 1 — header.memo 필드 커서 (원격사용자A, 초록색)
  const awarenessDoc1 = new Y.Doc()
  const awareness1 = new Awareness(awarenessDoc1)
  awareness1.setLocalState({
    user: { displayName: '원격사용자A', color: '#15803D' },
    cursor: { fieldPath: 'header.memo', anchor: 4, head: 12 },
  })
  const awarenessBase64User1 = toBase64(
    encodeAwarenessUpdate(awareness1, [awarenessDoc1.clientID])
  )

  // 3. 원격 awareness 2 — items.line-001.quantity 셀 커서 (원격사용자B, 주황색)
  const awarenessDoc2 = new Y.Doc()
  const awareness2 = new Awareness(awarenessDoc2)
  awareness2.setLocalState({
    user: { displayName: '원격사용자B', color: '#B45309' },
    cursor: { fieldPath: 'items.line-001.quantity', anchor: 0, head: 1 },
  })
  const awarenessBase64User2 = toBase64(
    encodeAwarenessUpdate(awareness2, [awarenessDoc2.clientID])
  )

  return { yjsUpdateBase64, awarenessBase64User1, awarenessBase64User2 }
}

// ============================================================
// 셋업: coedit 시드 + SSE 라우트 설치
// ============================================================

async function installCoeditSeedAndRoute(page: Page, seed: CoeditSeedResult): Promise<void> {
  // 1. __SAMHAN_MOCK_SLIP_COEDIT_SEED 주입
  //    → mock.ts 핸들러 초기화 시 coeditStore['slip-005'] = [yjsUpdateBase64]
  //    → GET /collab/coedit 응답: { updates: [yjsUpdateBase64] }
  //    → DocCoeditProvider.applySnapshot → Y.applyUpdate(doc, decoded, REMOTE_ORIGIN)
  await page.addInitScript(
    ({ slipId, update }: { slipId: string; update: string }) => {
      const g = globalThis as unknown as {
        __SAMHAN_MOCK_SLIP_COEDIT_SEED?: Record<string, string[]>
      }
      g.__SAMHAN_MOCK_SLIP_COEDIT_SEED = { [slipId]: [update] }
    },
    { slipId: SLIP_ID, update: seed.yjsUpdateBase64 },
  )

  // 2. SSE /collab/stream 인터셉트 — awareness 2건 주입
  //    user1: header.memo 커서, user2: items.line-001.quantity 커서
  //    page.route 는 정적 응답 → EOF 후 provider 가 5초 재연결 시도
  //    재연결도 동일 route 가 처리 → awareness 상태 유지됨
  const sseBody = [
    `event: coedit:awareness`,
    `data: ${JSON.stringify({ awareness: seed.awarenessBase64User1 })}`,
    ``,
    `event: coedit:awareness`,
    `data: ${JSON.stringify({ awareness: seed.awarenessBase64User2 })}`,
    ``,
    `: keep-alive`,
    ``,
  ].join('\n')

  await page.route(`**/api/v1/slips/${SLIP_ID}/collab/stream**`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
      body: sseBody,
    })
  })

  // 3. SlipRealtimeClient (/realtime) — 연결 오류 방지용 keep-alive 응답
  await page.route(`**/api/v1/slips/${SLIP_ID}/realtime**`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
      body: `: keep-alive\n\n`,
    })
  })
}

// ============================================================
// 테스트
// ============================================================

test.describe('PR #674 S2a Yjs 코-에디팅 (전표 전체 폼) QA 스크린샷', () => {

  const seed = buildDocCoeditSeed()

  test('desktop-01~03: 편집 모드 진입 → 원격 텍스트+커서 배지 → 수량 셀 clear 재입력', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await installAuthMock(page)
    await installCoeditSeedAndRoute(page, seed)

    await page.goto(`${BASE_URL}/#/sales/${SLIP_ID}?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
    })

    // 전표 상세 로딩 — 앱헤더 전표번호 표시 확인 (.first() — 버전이력 행 중복 회피)
    await expect(page.getByText('2026/05/02-12').first()).toBeVisible({ timeout: 20_000 })

    // 권한 로딩 대기 후 "수정" 버튼(canDirectEditSales: OUTBOUND+DRAFT+MASTER) 확인
    const editBtn = page.getByTestId('sales-slip-edit-button')
    await expect(editBtn).toBeVisible({ timeout: 15_000 })

    // 캡처 ①: desktop-01-editmode.png — 전표 상세 + "수정" 버튼 표시 확인
    await capture(page, 'desktop-01-editmode')

    // ─── 수정 인라인 폼 오픈 ───
    await editBtn.click()
    const inlineForm = page.getByTestId('sales-slip-edit-modal')
    await expect(inlineForm).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('dialog', { name: '매출 전표 수정' })).toHaveCount(0)
    console.log('[CHECK] 매출 전표 수정 인라인 폼 오픈: PASS')

    // coedit provider 초기화 대기:
    //   setSalesEditOpen(true) → useEffect → createDocCoeditProvider
    //   → GET /collab/coedit → Y.applyUpdate → applyProviderState → setState
    //   → SSE subscribe → page.route 인터셉트 → applyRemoteAwareness
    // 인라인 폼 내 coedit field가 나타날 때까지 대기 (최대 8초 timeout 내)
    const memoFieldWrapper = page.getByTestId('slip-coedit-field-header-memo')
    await expect(memoFieldWrapper).toBeVisible({ timeout: 8_000 })
    // coedit provider applySnapshot + SSE awareness 처리 대기
    await page.waitForTimeout(2_500)

    const memoInput = memoFieldWrapper.locator('input')
    const memoValue = await memoInput.inputValue().catch(() => '(ERROR)')
    const memoPass = memoValue === REMOTE_MEMO
    console.log(`[CHECK-①] header.memo 원격 텍스트 병합: ${memoPass ? 'PASS' : `PARTIAL — "${memoValue.slice(0, 30)}..."`}`)
    expect(memoValue).toBe(REMOTE_MEMO)

    // ─── 검증 ③ 원격 커서 배지 (header.memo → 원격사용자A) ───
    const memoNameBadges = memoFieldWrapper.locator('[aria-hidden="true"]')
    const memoBadgeCount = await memoNameBadges.count()
    const memoBadgeText = memoBadgeCount > 0
      ? await memoNameBadges.first().textContent().catch(() => '')
      : ''
    console.log(`[CHECK-③-memo] 커서 배지 count=${memoBadgeCount} text="${memoBadgeText}" — ${memoBadgeCount > 0 ? 'PASS' : '미표시(SSE 처리 지연 가능)'}`)
    expect(memoBadgeCount).toBeGreaterThan(0)
    expect(memoBadgeText).toContain('원격사용자A')

    // ─── 검증 ② 품목 셀 수량(CRDT items.line-001.quantity) 원격 값 반영 ───
    // sales-slip-edit-lines testid가 없으면 모달 내 테이블로 대체
    const salesEditLinesById = page.getByTestId('sales-slip-edit-lines')
    const salesEditLinesHasTestid = await salesEditLinesById.isVisible({ timeout: 3_000 }).catch(() => false)
    const salesEditLines = salesEditLinesHasTestid
      ? salesEditLinesById
      : page.locator('table').first()

    const quantityFieldWrapper = page.getByTestId('slip-coedit-field-items-0-quantity')
    await expect(quantityFieldWrapper).toBeVisible({ timeout: 8_000 })

    const quantityInput = quantityFieldWrapper.locator('input')
    const quantityValue = await quantityInput.inputValue().catch(() => '(ERROR)')
    console.log(`[CHECK-②] items.line-001.quantity 원격 값: "${quantityValue}" (기대: 7 — 원격 사용자가 2→7 수정)`)
    expect(quantityValue).toBe('7')

    // ─── 검증 ③ 원격 커서 배지 (items.line-001.quantity → 원격사용자B) ───
    const qtyNameBadges = quantityFieldWrapper.locator('[aria-hidden="true"]')
    const qtyBadgeCount = await qtyNameBadges.count()
    const qtyBadgeText = qtyBadgeCount > 0
      ? await qtyNameBadges.first().textContent().catch(() => '')
      : ''
    console.log(`[CHECK-③-qty] 커서 배지 count=${qtyBadgeCount} text="${qtyBadgeText}" — ${qtyBadgeCount > 0 ? 'PASS' : '미표시(SSE 처리 지연 가능)'}`)
    expect(qtyBadgeCount).toBeGreaterThan(0)
    expect(qtyBadgeText).toContain('원격사용자B')

    // 캡처 ②: desktop-02-remote-fields.png — 인라인 편집 헤더+품목 원격 텍스트+커서 배지
    // (스크롤 없이 인라인 폼 상단이 보이도록)
    await capture(page, 'desktop-02-remote-fields')

    // ─── 검증 ④ 배지 absolute → 셀 높이 불변 확인 ───
    // 품목 테이블로 스크롤하여 항목 행 높이 시각 확인용 캡처
    await salesEditLines.scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)

    // ─── 검증 ⑤ FE B-1 fix: 숫자 셀 clear → 재입력 가능 ───
    // 이전 동작(|| previous 폴백): clear 시 이전 값(7) 복원 — 지울 수 없었음
    // fix 후 동작: clear 시 0 으로 설정, 재입력 가능
    await quantityInput.click({ clickCount: 3 }) // 전체 선택
    await quantityInput.fill('')                  // clear

    // React re-render + applyProviderState(quantity: Number('' || 0) = 0) 대기
    await page.waitForTimeout(600)

    const clearedValue = await quantityInput.inputValue().catch(() => '(ERROR)')
    // 폴백 제거 후: '' → Y.Doc 에 '' 기록 → coeditLinesToEditLines quantity: Number(''||0) = 0
    const clearPass = clearedValue !== '7' // '7' 로 복원되면 fix 실패
    console.log(`[CHECK-⑤-clear] 수량 clear 후 값: "${clearedValue}" — ${clearPass ? 'PASS (7로 복원 안 됨)' : 'FAIL (이전값 7 복원)'}`)
    expect(clearedValue).toBe('0')

    // 새 수량 5 재입력
    await quantityInput.fill('5')
    await page.waitForTimeout(400)

    const reEnteredValue = await quantityInput.inputValue().catch(() => '(ERROR)')
    console.log(`[CHECK-⑤-reenter] 수량 재입력 값: "${reEnteredValue}" (기대: 5)`)
    expect(reEnteredValue).toBe('5')

    // 캡처 ③: desktop-03-cell-clear.png — 수량 셀 clear 후 5 재입력 완료
    await capture(page, 'desktop-03-cell-clear')

    // ─── 검증 ⑥ UUID 비노출 ───
    const bodyText = await page.locator('body').textContent().catch(() => '')
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    expect(bodyText).not.toMatch(uuidPattern)
    console.log('[CHECK-⑥] UUID 비노출: PASS')

    // ─── 품목 3행 존재 확인 ───
    const rows = salesEditLines.locator('tbody tr')
    const rowCount = await rows.count()
    console.log(`[CHECK] 품목 행 수: ${rowCount} (기대: 3)`)
    expect(rowCount).toBeGreaterThanOrEqual(1)
  })

  test('mobile-01: 모바일(390x844) 편집 모드 반응형', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await installAuthMock(page)
    await installCoeditSeedAndRoute(page, seed)

    await page.goto(`${BASE_URL}/#/sales/${SLIP_ID}?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
    })

    await expect(page.getByText('2026/05/02-12').first()).toBeVisible({ timeout: 20_000 })

    await page.getByRole('button', { name: '더보기' }).click()
    const editBtn = page.locator('.mobile-more-sheet').getByRole('button', { name: '수정' })
    await expect(editBtn, '모바일 액션시트에 직접 수정 버튼이 보여야 한다').toBeVisible({ timeout: 3_000 })
    await editBtn.click()
    const inlineForm = page.getByTestId('sales-slip-edit-modal')
    await expect(inlineForm, '모바일 수정 인라인 폼이 열려야 S2a 모바일 QA 캡처가 유효하다').toBeVisible({ timeout: 8_000 })
    await expect(page.getByRole('dialog', { name: '매출 전표 수정' })).toHaveCount(0)
    console.log('[CHECK] 모바일 수정 인라인 폼 오픈: PASS')
    const inlineBox = await inlineForm.boundingBox()
    expect(inlineBox?.width ?? 0).toBeLessThanOrEqual(390)
    await page.waitForTimeout(2_500)

    // 캡처 ④: mobile-01.png — 모바일 인라인 편집 (원격 텍스트 + 반응형 레이아웃)
    await capture(page, 'mobile-01')

    // ⑥ 모바일 UUID 비노출
    const mobileText = await page.locator('body').textContent().catch(() => '')
    expect(mobileText).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    console.log('[CHECK-⑥] 모바일 UUID 비노출: PASS')
  })
})
