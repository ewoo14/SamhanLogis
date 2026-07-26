import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * Phase 2.4 실 partner-order-service QA 스크린샷 촬영 스크립트.
 *
 * 목적: 실 서버(:8288) + 실 Postgres V7 partner_order_revisions 테이블 대상 동작 검증.
 * 게이트웨이 경로 우회: Playwright route() 로 /api/v1/partner-orders/** 를 :8288 직접 프록시.
 * 권한 헤더 (X-User-Id / X-User-Name / X-User-Role) 는 route 핸들러에서 주입.
 * 로그인/대시보드/목록 등 auth 관련 endpoint 는 stub 허용.
 *
 * 실 적중 endpoint (mock 금지):
 *   GET  /api/v1/partner-orders                         → :8288
 *   GET  /api/v1/partner-orders/:id                     → :8288
 *   GET  /api/v1/partner-orders/:id/revisions           → :8288
 *   POST /api/v1/partner-orders/:id/revisions/:no/restore → :8288
 *   PUT  /api/v1/partner-orders/:id                     → :8288 (편집 후 revision 생성)
 *
 * stub 허용 endpoint:
 *   POST /auth/login                                   → stub (토큰 반환)
 *   GET  /auth/me                                      → stub (사용자 정보)
 *   GET  /api/v1/permission-matrix/**                  → stub (권한 all-grant)
 *
 * 스크린샷 저장: docs/qa/phase-2-4-partner-order-restore/screenshots/NN-*.png
 *
 * 실행:
 *   cd C:\dev\SamhanLogis\clients\desktop
 *   set PLAYWRIGHT_SKIP_WEB_SERVER=1
 *   set AUDIT_BASE_URL=http://127.0.0.1:5173
 *   npx playwright test playwright/phase-2-4-real-qa --reporter=line --headed=false
 */
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { expect, test, type Page, type Route } from '@playwright/test'

// ============================================================
// 상수 설정
// ============================================================

// VITE_MOCK_MODE=1 서버(5174)를 기본값으로 사용 — mock auth 우회 + 실 API 프록시 조합.
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5174'
const PARTNER_ORDER_SERVICE = 'http://localhost:8288'

/** 실 MASTER 계정 UUID (V5 seed — a0000000-0000-0000-0000-000000000001) */
const MASTER_USER_ID = 'a0000000-0000-0000-0000-000000000001'
const MASTER_USER_NAME = '[DEV-SEED] 개발마스터'
const MASTER_USER_ROLE = 'MASTER'

/** QA 스크린샷 저장 디렉토리 */
const _dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOT_DIR = resolveQaShotsDir(path.resolve(
  _dirname,
  '../../../../docs/qa/phase-2-4-partner-order-restore/screenshots',
))

// 디렉토리 보장
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
}

// 스크린샷 카운터
let screenshotCounter = 0

async function capture(page: Page, name: string): Promise<void> {
  screenshotCounter++
  const num = String(screenshotCounter).padStart(2, '0')
  const filePath = path.join(SCREENSHOT_DIR, `${num}-${name}.png`)
  await page.screenshot({ path: filePath, fullPage: false })
  console.log(`[CAPTURE] ${filePath}`)
}

// ============================================================
// 라우트 핸들러: 실 partner-order-service 프록시
// ============================================================

/**
 * /api/v1/partner-orders/** 요청을 실 :8288 으로 프록시하고
 * X-User-Id / X-User-Name / X-User-Role 권한 헤더를 주입한다.
 * 게이트웨이(:8080) 우회 — 실 서비스 직접 적중.
 */
async function proxyToRealService(route: Route): Promise<void> {
  const originalUrl = route.request().url()
  const urlObj = new URL(originalUrl)

  // FE base URL 부분 제거 후 실 서비스 URL 재구성
  const realUrl = `${PARTNER_ORDER_SERVICE}${urlObj.pathname}${urlObj.search}`

  const originalHeaders = await route.request().headersArray()
  const filteredHeaders: Record<string, string> = {}
  for (const { name, value } of originalHeaders) {
    // host 헤더는 실 서비스 주소로 교체되므로 제거
    if (name.toLowerCase() !== 'host') {
      filteredHeaders[name] = value
    }
  }

  // 권한 헤더 주입
  filteredHeaders['X-User-Id'] = MASTER_USER_ID
  filteredHeaders['X-User-Name'] = MASTER_USER_NAME
  filteredHeaders['X-User-Role'] = MASTER_USER_ROLE

  const postData = route.request().postData()

  try {
    const response = await route.fetch({
      url: realUrl,
      method: route.request().method(),
      headers: filteredHeaders,
      body: postData ?? undefined,
    })
    await route.fulfill({ response })
  } catch (err) {
    console.error(`[PROXY ERROR] ${realUrl}:`, err)
    await route.abort()
  }
}

/**
 * stub auth/login 응답 — 실 JWT 토큰 없이 FE AuthGuard 를 통과시키기 위해
 * samhanAuth window stub 을 주입하므로 login API 는 실제 호출 불필요.
 */
async function stubAuthEndpoints(page: Page): Promise<void> {
  // auth/login stub
  await page.route('**/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        code: 'OK',
        message: '성공',
        data: {
          token: 'qa-playwright-token',
          userId: MASTER_USER_ID,
          role: MASTER_USER_ROLE,
          displayName: MASTER_USER_NAME,
        },
        timestamp: new Date().toISOString(),
      }),
    })
  })

  // auth/me stub
  await page.route('**/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        code: 'OK',
        message: '성공',
        data: {
          userId: MASTER_USER_ID,
          loginId: 'dev_master',
          displayName: MASTER_USER_NAME,
          role: MASTER_USER_ROLE,
        },
        timestamp: new Date().toISOString(),
      }),
    })
  })

  // permission-matrix stub — 모든 권한 허용
  await page.route('**/api/v1/permission-matrix**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        code: 'OK',
        message: '성공',
        data: [],
        timestamp: new Date().toISOString(),
      }),
    })
  })

  // permissions/check stub — 항상 허용
  await page.route('**/api/v1/permissions**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        code: 'OK',
        message: '성공',
        data: { allowed: true },
        timestamp: new Date().toISOString(),
      }),
    })
  })
}

/**
 * partner-order-service 실 프록시 라우트 등록.
 * /api/v1/partner-orders/** 만 실 서비스로 프록시.
 */
async function installRealProxy(page: Page): Promise<void> {
  await page.route('**/api/v1/partner-orders**', proxyToRealService)
}

/**
 * window.samhanAuth stub 주입 — AuthGuard 통과용.
 * VITE_MOCK_MODE=0 (실 서버 모드) 에서도 client.ts interceptor 가 getToken() 호출.
 */
async function installAuthWindowStub(page: Page): Promise<void> {
  await page.addInitScript(`
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({
          token: 'qa-playwright-token',
          userId: '${MASTER_USER_ID}',
          role: '${MASTER_USER_ROLE}',
          fullName: '${MASTER_USER_NAME}',
          partnerCode: null,
        }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    });
    console.log('[QA] samhanAuth stub installed');
  `)
}

// ============================================================
// 테스트 픽스처: DRAFT 주문 ID (실 DB)
// ============================================================

/** 실 DB의 DRAFT 주문 UUID — V5 seed 기반 (2026/04/15-1) */
const REAL_DRAFT_ORDER_ID = '8ec658dd-f65e-49d4-82f8-c08c8c2c53e2'
/** 실 DB의 CONFIRMED 주문 UUID (2026/04/15-30) */
const REAL_CONFIRMED_ORDER_ID = 'f6d6d613-25eb-47bc-a72f-e86ac1641184'

/** 주문 상세 URL (hash router) */
const detailUrl = (id: string) =>
  `${BASE_URL}/#/sales/partner-orders/${encodeURIComponent(id)}?mockRole=MASTER`

/** 주문 목록 URL */
const listUrl = () => `${BASE_URL}/#/sales/partner-orders?mockRole=MASTER`

// ============================================================
// 테스트 스위트
// ============================================================

test.describe('Phase 2.4 실 QA — 거래처 주문 버전이력 + 복원 (실 :8288 직접 적중)', () => {

  // ──────────────────────────────────────────────────────────
  // 01: 로그인 화면
  // ──────────────────────────────────────────────────────────
  test('01-login-page: 로그인 화면 캡처', async ({ page }) => {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    await capture(page, 'login-page')
  })

  // ──────────────────────────────────────────────────────────
  // 02: 주문 목록 (실 :8288 API)
  // ──────────────────────────────────────────────────────────
  test('02-order-list: 주문 목록 (실 API 직접 적중)', async ({ page }) => {
    await installAuthWindowStub(page)
    await stubAuthEndpoints(page)
    await installRealProxy(page)

    await page.goto(listUrl(), { waitUntil: 'domcontentloaded' })

    // 목록 로드 대기
    const listContainer = page.getByTestId('partner-order-list-table')
      .or(page.locator('table'))
      .or(page.locator('[class*="list"]').first())
    await listContainer.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {
      console.log('[WARN] list container not found by testid, waiting for any content')
    })
    await page.waitForTimeout(2000)
    await capture(page, 'order-list-real-api')
  })

  // ──────────────────────────────────────────────────────────
  // 03: 주문 상세 (DRAFT, 버전이력 패널 포함)
  // ──────────────────────────────────────────────────────────
  test('03-order-detail-draft: DRAFT 주문 상세 + 버전이력 패널', async ({ page }) => {
    await installAuthWindowStub(page)
    await stubAuthEndpoints(page)
    await installRealProxy(page)

    await page.goto(detailUrl(REAL_DRAFT_ORDER_ID), { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await capture(page, 'order-detail-draft-no-revisions')
  })

  // ──────────────────────────────────────────────────────────
  // 04: 주문 편집 → 저장 → revision 생성 검증
  // ──────────────────────────────────────────────────────────
  test('04-order-edit-creates-revision: PUT 편집 후 revision 목록 변화', async ({ page }) => {
    await installAuthWindowStub(page)
    await stubAuthEndpoints(page)
    await installRealProxy(page)

    // 상세 페이지 진입
    await page.goto(detailUrl(REAL_DRAFT_ORDER_ID), { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await capture(page, 'order-detail-before-edit')

    // 편집 버튼 클릭 (데이터가 없으면 skip)
    const editBtn = page.getByRole('button', { name: /편집|수정/ }).first()
    const editBtnCount = await editBtn.count()

    if (editBtnCount > 0) {
      await editBtn.click()
      await page.waitForTimeout(1500)
      await capture(page, 'order-edit-form-opened')

      // 메모 입력창 찾아서 값 변경
      const memoInput = page.getByPlaceholder(/메모/).or(page.locator('[name="memo"]')).first()
      const memoCount = await memoInput.count()
      if (memoCount > 0) {
        await memoInput.fill('QA 테스트 메모 - Phase 2.4')
        await page.waitForTimeout(500)
      }

      // 저장 버튼
      const saveBtn = page.getByRole('button', { name: /저장|확인/ }).first()
      const saveBtnCount = await saveBtn.count()
      if (saveBtnCount > 0) {
        await saveBtn.click()
        await page.waitForTimeout(2000)
        await capture(page, 'order-edit-saved')
      }
    } else {
      console.log('[INFO] 편집 버튼 미발견 — FE 편집 패널 구조 확인 필요')
      await capture(page, 'order-edit-btn-not-found')
    }
  })

  // ──────────────────────────────────────────────────────────
  // 05: 버전이력 API 직접 확인 (실 :8288)
  // ──────────────────────────────────────────────────────────
  test('05-revision-api-direct: 버전이력 API 실 적중 확인', async ({ page }) => {
    await installAuthWindowStub(page)
    await stubAuthEndpoints(page)
    await installRealProxy(page)

    // API 응답 캡처용 — 버전이력 요청 인터셉트
    const revisionResponses: string[] = []
    page.on('response', async (response) => {
      if (response.url().includes('/revisions') && !response.url().includes('/restore')) {
        try {
          const body = await response.text()
          revisionResponses.push(`URL: ${response.url()}\nStatus: ${response.status()}\nBody: ${body}`)
        } catch {
          // ignore
        }
      }
    })

    await page.goto(detailUrl(REAL_DRAFT_ORDER_ID), { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    // 버전이력 패널 캡처
    const historyPanel = page.getByTestId('partner-order-version-history-panel')
    const panelCount = await historyPanel.count()
    if (panelCount > 0) {
      await capture(page, 'version-history-panel-real')
      const panelText = await historyPanel.innerText()
      console.log('[REVISION PANEL TEXT]', panelText)
    } else {
      await capture(page, 'version-history-panel-not-found')
      console.log('[WARN] 버전이력 패널 testid 미발견')
    }

    console.log('[REVISION API RESPONSES]', revisionResponses.join('\n---\n'))
  })

  // ──────────────────────────────────────────────────────────
  // 06: 복원 confirm 모달 + 복원 실행 (DRAFT)
  // ──────────────────────────────────────────────────────────
  test('06-restore-draft: DRAFT 주문 복원 흐름 (revision 있는 경우)', async ({ page }) => {
    await installAuthWindowStub(page)
    await stubAuthEndpoints(page)
    await installRealProxy(page)

    // 복원 응답 캡처
    const restoreResponses: string[] = []
    page.on('response', async (response) => {
      if (response.url().includes('/restore')) {
        try {
          const body = await response.text()
          restoreResponses.push(`Status: ${response.status()}\nBody: ${body}`)
          console.log('[RESTORE RESPONSE]', body)
        } catch {
          // ignore
        }
      }
    })

    await page.goto(detailUrl(REAL_DRAFT_ORDER_ID), { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await capture(page, 'restore-before-panel')

    // 버전이력 패널 확인
    const historyPanel = page.getByTestId('partner-order-version-history-panel')
    const panelVisible = await historyPanel.isVisible().catch(() => false)

    if (!panelVisible) {
      console.log('[INFO] 버전이력 패널 미표시 — revision 0건 (편집 전 상태)')
      await capture(page, 'restore-no-revisions-state')
      return
    }

    // 복원 버튼 확인
    const restoreBtn = page.getByTestId('partner-order-version-history-restore-button-1')
    const restoreBtnCount = await restoreBtn.count()

    if (restoreBtnCount === 0) {
      console.log('[INFO] 복원 버튼 없음 — revision 1건 이하 (최신=현재 상태)')
      await capture(page, 'restore-no-restore-button')
      return
    }

    // 복원 버튼 클릭
    await expect(restoreBtn).toBeEnabled()
    await restoreBtn.click()
    await page.waitForTimeout(500)
    await capture(page, 'restore-confirm-modal')

    // DS Modal 확인
    const dialog = page.getByRole('dialog')
    const dialogVisible = await dialog.isVisible().catch(() => false)
    if (dialogVisible) {
      await expect(dialog).toContainText('복원')

      // confirm 버튼 클릭
      const confirmBtn = page.getByTestId('partner-order-version-history-restore-confirm')
      if (await confirmBtn.isVisible()) {
        await confirmBtn.click()
        await page.waitForTimeout(2000)
        await capture(page, 'restore-success-toast')

        // 토스트 확인
        const toast = page.getByTestId('partner-order-version-history-toast')
        const toastVisible = await toast.isVisible().catch(() => false)
        if (toastVisible) {
          const toastText = await toast.innerText()
          console.log('[TOAST]', toastText)
        }
      }
    }

    console.log('[RESTORE RESPONSES]', restoreResponses.join('\n---\n'))
  })

  // ──────────────────────────────────────────────────────────
  // 07: CONFIRMED 주문 상세 + 복원 (slipResyncRequired)
  // ──────────────────────────────────────────────────────────
  test('07-confirmed-order-detail: CONFIRMED 주문 상세 + 버전이력', async ({ page }) => {
    await installAuthWindowStub(page)
    await stubAuthEndpoints(page)
    await installRealProxy(page)

    await page.goto(detailUrl(REAL_CONFIRMED_ORDER_ID), { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await capture(page, 'confirmed-order-detail')

    const historyPanel = page.getByTestId('partner-order-version-history-panel')
    const panelVisible = await historyPanel.isVisible().catch(() => false)
    if (panelVisible) {
      await capture(page, 'confirmed-order-version-history')
    }
  })

  // ──────────────────────────────────────────────────────────
  // 08: 주문 목록 필터 (상태=DRAFT)
  // ──────────────────────────────────────────────────────────
  test('08-order-list-draft-filter: DRAFT 필터 적용 주문 목록', async ({ page }) => {
    await installAuthWindowStub(page)
    await stubAuthEndpoints(page)
    await installRealProxy(page)

    await page.goto(`${listUrl()}&status=DRAFT`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await capture(page, 'order-list-draft-filter')
  })
})
