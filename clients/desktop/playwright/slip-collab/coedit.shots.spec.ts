/**
 * PR #673 S1 라이브 코-에디팅 QA 스크린샷 캡처 스펙.
 *
 * 검증 포인트:
 *  ① 원격 Yjs 업데이트 → CollaborativeTextField 협업 메모에 원격 텍스트 병합 표시
 *  ② 로컬 타이핑 추가 → 로컬 + 원격 텍스트 공존 (Y.Text CRDT 병합)
 *  ③ page.route SSE 인터셉트 → coedit:awareness 이벤트 주입 → 원격 커서 오버레이 가시성
 *  ④ 모바일(390x844) 반응형 뷰 — MobileCollapsible defaultOpen 협업 메모
 *  ⑤ UUID 비노출 확인 (slipId · clientId 화면 미표시)
 *
 * mock 전략 (VITE_MOCK_MODE=1):
 *  - Yjs 원격 업데이트: addInitScript → globalThis.__SAMHAN_MOCK_SLIP_COEDIT_SEED['slip-001']
 *    → GET /collab/coedit mock 이 해당 base64 배열 반환 → provider 가 Y.applyUpdate 적용
 *  - SSE 커서 주입: page.route collab/stream glob → event:coedit:awareness SSE 이벤트 주입
 *    → provider.subscribeAwareness 콜백 → setRemoteCursors → coedit-remote-cursor 오버레이
 *  - 실 SSE 2세션(Docker 스택) 없이 값병합 입증 + 커서 인터셉트 시도.
 *    커서가 표시되지 않을 경우 한계를 정직하게 기록한다.
 *
 * 산출 경로: docs/qa/coedit-s1/*.png
 *
 * 실행:
 *   cd clients/desktop
 *   node_modules/.bin/playwright test playwright/slip-collab/coedit.shots.spec.ts --reporter=line
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
const SLIP_ID = 'slip-001'

const _dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOT_DIR = path.resolve(_dirname, '../../../../docs/qa/coedit-s1')
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

// ============================================================
// 헬퍼: base64 인코딩 (Node Buffer — browser atob 호환)
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
// 셋업: auth stub + coedit seed + SSE awareness 라우트
// ============================================================

/** window.samhanAuth stub — isElectronPlatform=true 로 판정하게 하여 Bearer 토큰 경로 사용. */
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

interface CoeditSeedResult {
  remoteText: string
  awarenessBase64: string
}

/**
 * Yjs 원격 업데이트 seed + SSE awareness 라우트 설치.
 *
 * 1) Y.Doc + Y.Text('memo').insert → encodeStateAsUpdate → base64
 *    → addInitScript 로 __SAMHAN_MOCK_SLIP_COEDIT_SEED['slip-001'] 에 주입
 *    → GET /collab/coedit mock 핸들러가 반환 → provider.applyRemoteUpdate
 *
 * 2) 별도 Awareness 인스턴스 → cursor{anchor:3, head:9} → encodeAwarenessUpdate → base64
 *    → page.route SSE → 'event: coedit:awareness\ndata: ...' → provider.applyRemoteAwareness
 *    → setRemoteCursors → [data-testid^="coedit-remote-cursor-"] 오버레이 렌더
 */
async function installCoeditSeedAndRoute(page: Page): Promise<CoeditSeedResult> {
  // 1. 원격 Y.Text 업데이트 생성 (Node.js 컨텍스트)
  const remoteDoc = new Y.Doc()
  const remoteTextField = remoteDoc.getText('memo')
  const REMOTE_TEXT = '원격 사용자가 작성한 협업 메모입니다'
  remoteTextField.insert(0, REMOTE_TEXT)
  const yjsUpdateBase64 = toBase64(Y.encodeStateAsUpdate(remoteDoc))

  // 2. 원격 awareness 생성 (별도 Y.Doc — provider clientID 와 충돌 방지)
  const awarenessDoc = new Y.Doc()
  const awareness = new Awareness(awarenessDoc)
  awareness.setLocalState({
    user: { displayName: '원격 사용자', color: '#15803D' },
    cursor: { fieldName: 'memo', anchor: 3, head: 9 },
  })
  const awarenessBase64 = toBase64(encodeAwarenessUpdate(awareness, [awarenessDoc.clientID]))

  // 3. addInitScript: __SAMHAN_MOCK_SLIP_COEDIT_SEED 주입 (getMockResponse 최초 호출 시 복사)
  await page.addInitScript(
    ({ slipId, update }: { slipId: string; update: string }) => {
      const g = globalThis as unknown as {
        __SAMHAN_MOCK_SLIP_COEDIT_SEED?: Record<string, string[]>
      }
      g.__SAMHAN_MOCK_SLIP_COEDIT_SEED = { [slipId]: [update] }
    },
    { slipId: SLIP_ID, update: yjsUpdateBase64 },
  )

  // 4. page.route: SSE collab/stream 인터셉트 → awareness 이벤트 1회 주입
  //    route.fulfill() 는 정적 응답이므로 provider SSE 클라이언트가 EOF 후 5s 재연결.
  //    awareness 상태는 Awareness 인메모리에 유지됨 → 오버레이 유지.
  const sseBody = [
    `event: coedit:awareness`,
    `data: ${JSON.stringify({ awareness: awarenessBase64 })}`,
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
        'Transfer-Encoding': 'chunked',
      },
      body: sseBody,
    })
  })

  return { remoteText: REMOTE_TEXT, awarenessBase64 }
}

// ============================================================
// 테스트
// ============================================================

test.describe('PR #673 S1 Yjs 코-에디팅 QA 스크린샷', () => {

  test('desktop-01 ~ 03: 원격 텍스트 병합 → 로컬 타이핑 → 커서 오버레이 시도', async ({ page }) => {
    // 데스크톱 뷰포트 설정
    await page.setViewportSize({ width: 1280, height: 800 })
    await installAuthMock(page)
    const { remoteText } = await installCoeditSeedAndRoute(page)

    // OUTBOUND slip-001 → /sales/:id 라우트 (MASTER 권한)
    await page.goto(`${BASE_URL}/#/sales/${SLIP_ID}?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
    })

    // 협업 패널 로딩 대기
    const panel = page.getByTestId('slip-collaboration-panel')
    await expect(panel).toBeVisible({ timeout: 20_000 })

    // CollaborativeTextField 렌더 + Yjs provider 초기화 + 원격 텍스트 적용 대기
    const collabField = panel.getByTestId('collaborative-text-field')
    await expect(collabField).toBeVisible({ timeout: 15_000 })

    // GET /collab/coedit 응답 처리 + React 상태 갱신 대기
    await page.waitForTimeout(2_500)

    // ①: 원격 텍스트 병합 확인
    const textarea = collabField.locator('textarea')
    const textValue = await textarea.inputValue()
    console.log(`[CHECK-01] textarea value: "${textValue}"`)
    expect(textValue).toBe(remoteText)

    // 협업 메모 section 으로 스크롤 (viewport 내 배치)
    await collabField.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)

    // 캡처 ①: desktop-01-merged (원격 텍스트 병합)
    await capture(page, 'desktop-01-merged')

    // ②: 로컬 타이핑 — 커서를 텍스트 끝으로 이동 후 추가 입력
    await textarea.click()
    await textarea.press('Control+End')
    await textarea.type('\n[로컬] 개발마스터 검토 완료', { delay: 30 })
    await page.waitForTimeout(600)

    const localTypedValue = await textarea.inputValue()
    console.log(`[CHECK-02] local typed value: "${localTypedValue.slice(0, 40)}..."`)
    expect(localTypedValue).toContain(remoteText)
    expect(localTypedValue).toContain('[로컬] 개발마스터 검토 완료')

    // 캡처 ②: desktop-02-local-typed (로컬 + 원격 텍스트 공존)
    await capture(page, 'desktop-02-local-typed')

    // ③: SSE awareness 처리 후 원격 커서 오버레이 확인
    //    page.route fulfill 은 정적 → provider SSE 클라이언트가 즉시 EOF 처리.
    //    awareness 이벤트 → applyAwarenessUpdate → notifyAwareness → setRemoteCursors.
    //    NOTE: 컨테이너 div 는 자식이 전부 absolute 라 0×0 크기 → isVisible() false.
    //          toContainText('원격 사용자') 로 텍스트 기반 감지 + timeout retry 사용.
    await page.waitForTimeout(1_500)

    const cursorLocator = panel.getByTestId(/coedit-remote-cursor-/)
    let cursorDetected = false
    try {
      await expect(cursorLocator.first()).toContainText('원격 사용자', { timeout: 5_000 })
      cursorDetected = true
      console.log('[CHECK-03] 원격 커서 오버레이 텍스트 감지 성공: "원격 사용자"')
    } catch {
      console.warn(
        '[INFO-03] 원격 커서 오버레이 미감지 — 가능한 원인:\n'
        + '  · SSE EOF 후 awareness 콜백 미완 (page.route static response → backoff 5s)\n'
        + '  · awarenessDoc.clientID 충돌로 getRemoteCursors() 필터 제외\n'
        + '  · textarea 미렌더 시점 caretCoordinates 0,0 → overlay 패런트 외 배치\n'
        + '  실 2세션(Docker 스택 + 실 SSE relay) 환경에서 커서 연동 별도 검증 필요.',
      )
    }

    await collabField.scrollIntoViewIfNeeded()
    if (cursorDetected) {
      // 캡처 ③: desktop-03-remote-cursor (원격 커서 오버레이 + 라벨 표시)
      await capture(page, 'desktop-03-remote-cursor')
    } else {
      // 캡처 ③: 현재 상태 (커서 미표시 — 정직 기록)
      await capture(page, 'desktop-03-cursor-not-visible')
    }

    // ⑤: UUID 비노출 확인 — 화면 텍스트에 slipId 미표시
    const pageText = await panel.textContent()
    expect(pageText).not.toMatch(/slip-001/)
    expect(pageText).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  })

  test('mobile-01 ~ 02: 모바일(390x844) 반응형 — 원격 텍스트 병합 + 로컬 타이핑', async ({ page }) => {
    // 모바일 뷰포트 설정
    await page.setViewportSize({ width: 390, height: 844 })
    await installAuthMock(page)
    const { remoteText } = await installCoeditSeedAndRoute(page)

    await page.goto(`${BASE_URL}/#/sales/${SLIP_ID}?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
    })

    // 협업 패널 로딩 대기 — 모바일: MobileCollapsible defaultOpen 내부
    const panel = page.getByTestId('slip-collaboration-panel')
    await expect(panel).toBeVisible({ timeout: 20_000 })

    const collabField = panel.getByTestId('collaborative-text-field')
    await expect(collabField).toBeVisible({ timeout: 15_000 })

    // Yjs provider 초기화 + 원격 텍스트 적용 대기
    await page.waitForTimeout(2_500)

    // 협업 메모 영역으로 스크롤
    await collabField.scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)

    // ④: 원격 텍스트 병합 확인 (모바일)
    const mobileTextarea = collabField.locator('textarea')
    const mobileTextValue = await mobileTextarea.inputValue()
    console.log(`[CHECK-MOBILE-01] textarea value: "${mobileTextValue}"`)
    expect(mobileTextValue).toBe(remoteText)

    // 캡처 ④: mobile-01-merged (모바일 원격 텍스트 병합)
    await capture(page, 'mobile-01-merged')

    // 모바일 로컬 타이핑
    await mobileTextarea.click()
    await mobileTextarea.press('End')
    await mobileTextarea.type('\n[모바일] 현장 확인', { delay: 30 })
    await page.waitForTimeout(500)

    await collabField.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)

    const mobileTyped = await mobileTextarea.inputValue()
    console.log(`[CHECK-MOBILE-02] typed value: "${mobileTyped.slice(0, 40)}..."`)
    expect(mobileTyped).toContain(remoteText)
    expect(mobileTyped).toContain('[모바일] 현장 확인')

    // 캡처 ⑤: mobile-02-local-typed (모바일 로컬 + 원격 공존)
    await capture(page, 'mobile-02-local-typed')

    // ⑤: UUID 비노출 확인
    const mobilePanelText = await panel.textContent()
    expect(mobilePanelText).not.toMatch(/slip-001/)
    expect(mobilePanelText).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  })
})
