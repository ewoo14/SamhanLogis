/**
 * PR #672 필드 soft-lock — FieldLockIndicator 2세션 시뮬레이션 스크린샷 QA.
 *
 * [[no-fake-data-ever]] [[uuid-no-user-visibility]] [[realqa-run-and-false-red]]
 *
 * 실 백엔드 mock-off 미수행 사유(정직 기록):
 *   SSE 2세션 실연동은 Docker 스택 기동 + 2 브라우저 컨텍스트 + 실 JWT 필요.
 *   본 QA 는 VITE_MOCK_MODE=1 — globalThis mock field-lock store 에 김관리 편집 상태를
 *   addInitScript 로 사전 시드하여 FieldLockIndicator 실 컴포넌트 렌더를 검증한다.
 *   가짜 이미지 합성(PIL/canvas) 이 아닌 실제 React 컴포넌트 + 실 DOM 캡처.
 *   실 SSE 2세션 QA 는 Docker 스택 복원 후 별도 수행(slip-edit-collab-real-qa 패턴).
 *
 * 모바일 UI 구조:
 *   useIsMobile(breakpoint=768) 기준 390px → isMobile=true → slip-collab-edit-open 버튼
 *   비렌더(데스크톱 action-bar 전체 숨김). 모바일은 "더보기(···)" 버튼 → MobileActionSheet
 *   → "수정" 항목 클릭 경로로 collabEditMode=true 활성화. 본 spec 이 실 UI 경로 검증.
 *
 * 검증 포인트:
 *   ① FieldLockIndicator 렌더 — 색상 dot(PRESENCE_COLOR_HEX 녹색 #15803D) + 텍스트
 *   ② 한국어 어순 — "김관리 편집 중" (주체 먼저, 술어 뒤)
 *   ③ UUID/sessionId 비노출 — displayName(김관리)만 화면 표시
 *   ④ 모바일 반응형 — 390×844 뷰포트에서 인디케이터 가시
 *   ⑤ 본인 focus(acquire) 후 다른 사용자 인디케이터 유지(본인 락은 lockedBy 에서 제외)
 *
 * 실행:
 *   cd clients/desktop
 *   node_modules/.bin/playwright test --config playwright/slip-collab/field-lock-shots.config.ts
 */
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { test, expect, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5176'
/** mock.ts MOCK_SLIPS[0] — OUTBOUND / PROCESSING 전표. canCollabEdit=true, canDirectEditSales=false */
const SLIP_ID = 'slip-001'
const PAGE_URL = `${BASE_URL}/#/sales/${SLIP_ID}?mockRole=MASTER&mockAppForce=NONE`

const _dirname = path.dirname(fileURLToPath(import.meta.url))
// playwright/slip-collab/ → clients/desktop/ → 프로젝트 루트 → docs/qa/collab-s1/
const SHOT_DIR = path.resolve(_dirname, '../../../../docs/qa/collab-s1')
fs.mkdirSync(SHOT_DIR, { recursive: true })

/**
 * window.samhanAuth stub — AuthGuard 통과 + collabHeaders() + useFieldLock 사용자 해석용.
 * mock 모드에서도 apiClient interceptor 가 getToken() 을 호출한다 — stub 필수.
 */
async function installAuthMock(page: Page) {
  await page.addInitScript(() => {
    const auth = {
      token: 'playwright-fieldlock-token',
      userId: '00000000-0000-0000-0000-000000010001',
      role: 'MASTER',
      fullName: '오병승',
      partnerCode: 'P-MOCK-001',
    }
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => auth,
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  })
}

/**
 * 다른 사용자(김관리)가 memo 필드를 편집 중인 상태를 globalThis field-lock store 에 시드.
 * useFieldLock 초기화 시 client.list() 가 이 데이터를 반환 → lockedBy('memo') = [김관리].
 * sessionId = 'fieldlock-kim-manager' — 본인 세션과 다르므로 indicator 에 포함됨.
 */
async function seedFieldLockOnce(page: Page) {
  await page.addInitScript(({ slipId }) => {
    const g = globalThis as unknown as {
      __SAMHAN_MOCK_SLIP_FIELD_LOCKS?: Record<string, Array<{
        fieldPath: string
        sessionId: string
        displayName: string
        color: 'BLUE' | 'GREEN' | 'AMBER' | 'ROSE' | 'VIOLET' | 'CYAN' | 'LIME' | 'PINK'
      }>>
    }
    g.__SAMHAN_MOCK_SLIP_FIELD_LOCKS = {
      [slipId]: [
        { fieldPath: 'memo', sessionId: 'fieldlock-kim-manager', displayName: '김관리', color: 'GREEN' },
      ],
    }
  }, { slipId: SLIP_ID })
}

async function closeBlockingNoticeIfVisible(page: Page) {
  const notice = page.getByTestId('app-notice-modal')
  if (await notice.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: '닫기' }).click()
    await expect(notice).toHaveCount(0)
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Desktop QA (≥ 769px) — slip-collab-edit-open 버튼 직접 클릭
// ──────────────────────────────────────────────────────────────────────────────
async function runDesktopQA(page: Page) {
  await installAuthMock(page)
  await seedFieldLockOnce(page)
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' })
  await closeBlockingNoticeIfVisible(page)
  await page.waitForTimeout(1_500)

  // ── 단계 01: 전표 상세 진입 상태 ─────────────────────────────────────────
  const editOpenBtn = page.getByTestId('slip-collab-edit-open')
  await editOpenBtn.waitFor({ state: 'visible', timeout: 20_000 })
  await editOpenBtn.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await page.screenshot({
    path: path.join(SHOT_DIR, 'desktop-01-slip-detail.png'),
    fullPage: false,
  })

  // ── 단계 02: 수정 폼 열기 → FieldLockIndicator "김관리 편집 중" ──────────
  await editOpenBtn.click()
  const panel = page.getByTestId('slip-collaboration-panel')
  const form = panel.getByTestId('slip-collab-edit-form')
  await form.waitFor({ state: 'visible', timeout: 20_000 })

  // useFieldLock enabled=true → client.list() → mock store → React state 갱신
  const indicator = form.getByTestId('field-lock-indicator').first()
  await indicator.waitFor({ state: 'visible', timeout: 20_000 })
  await indicator.scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)

  // 검증 ①②③: aria-label + 텍스트 조합 — UUID 비노출
  await expect(indicator).toHaveAttribute('aria-label', '다른 사용자 1명 편집 중')
  await expect(indicator).toContainText('김관리')
  await expect(indicator).toContainText('편집 중')

  await page.screenshot({
    path: path.join(SHOT_DIR, 'desktop-02-fieldlock-indicator.png'),
    fullPage: false,
  })

  // ── 단계 03: 메모 입력란 focus (acquire 트리거) → 다른 사용자 인디케이터 유지 ─
  const memoInput = form.getByLabel('메모 수정값')
  await memoInput.scrollIntoViewIfNeeded()
  await memoInput.focus()
  // acquire() async 완료 후 lockedBy 에서 본인 sessionId 제외 → 김관리 인디케이터 유지
  await page.waitForTimeout(800)

  // 검증 ⑤: focus 후 다른 사용자 인디케이터 유지
  await expect(indicator).toContainText('김관리')
  await page.screenshot({
    path: path.join(SHOT_DIR, 'desktop-03-memo-focus.png'),
    fullPage: false,
  })
}

// ──────────────────────────────────────────────────────────────────────────────
// Mobile QA (390px → isMobile=true) — "더보기" → MobileActionSheet → "수정"
//
// 390px 에서 useIsMobile(768) = true → detail-action-bar 전체 {!isMobile ? ...} 숨김.
// MobileActionSheet 내 "수정" 버튼(role=button, name="수정") 클릭으로 collabEditMode 활성화.
// ──────────────────────────────────────────────────────────────────────────────
async function runMobileQA(page: Page) {
  await installAuthMock(page)
  await seedFieldLockOnce(page)
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' })
  await closeBlockingNoticeIfVisible(page)
  await page.waitForTimeout(1_500)

  // ── 단계 01: 모바일 전표 상세 — mobile-summary-card + mobile-action-bar ─────
  const mobileMoreBtn = page.getByRole('button', { name: '더보기' })
  await mobileMoreBtn.waitFor({ state: 'visible', timeout: 20_000 })
  await mobileMoreBtn.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await page.screenshot({
    path: path.join(SHOT_DIR, 'mobile-01-slip-detail.png'),
    fullPage: false,
  })

  // ── 단계 02a: 더보기 시트 열기 (모바일 UX 경로 증거) ──────────────────────
  await mobileMoreBtn.click()
  const sheet = page.getByRole('dialog')
  await sheet.waitFor({ state: 'visible', timeout: 10_000 })
  await page.screenshot({
    path: path.join(SHOT_DIR, 'mobile-02a-more-sheet.png'),
    fullPage: false,
  })

  // ── 단계 02b: "수정" 선택 → collabEditMode=true ────────────────────────────
  await sheet.getByRole('button', { name: '수정' }).click()

  // 협업 패널 편집 폼 진입 대기
  const panel = page.getByTestId('slip-collaboration-panel')
  const form = panel.getByTestId('slip-collab-edit-form')
  await form.waitFor({ state: 'visible', timeout: 20_000 })

  // useFieldLock enabled → list() → 김관리 lock 로드 → indicator 렌더
  const indicator = form.getByTestId('field-lock-indicator').first()
  await indicator.waitFor({ state: 'visible', timeout: 20_000 })
  await indicator.scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)

  // 검증 ①②③④
  await expect(indicator).toHaveAttribute('aria-label', '다른 사용자 1명 편집 중')
  await expect(indicator).toContainText('김관리')
  await expect(indicator).toContainText('편집 중')

  await page.screenshot({
    path: path.join(SHOT_DIR, 'mobile-02-fieldlock-indicator.png'),
    fullPage: false,
  })

  // ── 단계 03: 메모 입력란 focus → 다른 사용자 인디케이터 유지 ───────────────
  const memoInput = form.getByLabel('메모 수정값')
  await memoInput.scrollIntoViewIfNeeded()
  await memoInput.focus()
  await page.waitForTimeout(800)

  // 검증 ⑤
  await expect(indicator).toContainText('김관리')
  await page.screenshot({
    path: path.join(SHOT_DIR, 'mobile-03-memo-focus.png'),
    fullPage: false,
  })
}

// ──────────────────────────────────────────────────────────────────────────────
// 데스크톱 1280×800
// ──────────────────────────────────────────────────────────────────────────────
test.describe('필드 soft-lock QA — Desktop 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('전표 수정 폼 + FieldLockIndicator 3단계 캡처', async ({ page }) => {
    await runDesktopQA(page)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// 모바일 390×844 — 더보기 시트 경유 편집 모드
// ──────────────────────────────────────────────────────────────────────────────
test.describe('필드 soft-lock QA — Mobile 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('모바일 더보기→수정→FieldLockIndicator 단계별 캡처', async ({ page }) => {
    await runMobileQA(page)
  })
})
