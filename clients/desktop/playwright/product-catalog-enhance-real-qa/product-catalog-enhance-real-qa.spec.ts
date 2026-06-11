/**
 * 품목관리 고도화 (PR #461) Docker 실서버 QA Playwright spec.
 *
 * 대상: spec §3 T1/T3/T5/T7 UI 캡처
 * 실서버: http://localhost:8080 (api-gateway), http://localhost:5175 (FE dev)
 * 인증: dev_master / dev_p05_pass! (MASTER role, products.admin UPDATE)
 *       dev_warehouse / dev_p05_pass! (WAREHOUSE role, products.admin 없음)
 *
 * 실행:
 *   cd C:\dev\Samhan-Public\clients\desktop
 *   node_modules\.bin\playwright test --config=playwright.real-qa.config.ts playwright/product-catalog-enhance-real-qa --reporter=line --timeout=60000
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url))

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5175'
const API_BASE = 'http://localhost:8080'

const SCREENSHOTS_DIR = path.resolve(
  _dirname,
  '../../../../docs/qa/product-catalog-enhance/screenshots',
)

fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })

async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, `${name}.png`),
    fullPage: false,
  })
}

/**
 * 실서버에서 로그인 후 window.samhanAuth stub 주입.
 * client.ts interceptor 가 window.samhanAuth.getToken() 을 호출하므로
 * addInitScript 로 반드시 주입해야 axios 헤더에 토큰이 들어간다.
 */
async function loginAndInstallStub(
  page: Page,
  loginId: string,
  password: string,
): Promise<string> {
  const res = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId, password },
  })
  const body = await res.json()
  const token: string = body.data?.token ?? ''
  const role: string = body.data?.role ?? 'MASTER'
  const userId: string = body.data?.userId ?? ''
  const displayName: string = body.data?.displayName ?? loginId

  await page.addInitScript(({ tok, r, uid, name }: { tok: string; r: string; uid: string; name: string }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({
          token: tok,
          userId: uid,
          role: r,
          fullName: name,
          partnerCode: null,
        }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, { tok: token, r: role, uid: userId, name: displayName })

  return token
}

// ---------------------------------------------------------------------------
// T1: 세트 컬럼 + 구성품 수 실 캡처
// ---------------------------------------------------------------------------

test('T1: 품목관리 — BUNDLE 세트 뱃지 + 구성품 수 + 조회 전용 배너', async ({ page }) => {
  await loginAndInstallStub(page, 'dev_master', 'dev_p05_pass!')

  await page.goto(`${BASE_URL}/#/products/catalog`)
  await page.waitForSelector('[data-testid="product-catalog-table"]', { timeout: 30000 })

  // 세트 뱃지 확인
  await page.waitForSelector('[data-testid^="product-catalog-set-badge-"]', { timeout: 10000 })
  const setBadge = page.locator('[data-testid^="product-catalog-set-badge-"]').first()
  const badgeText = await setBadge.textContent()
  // "세트 · N" 형식 검증
  expect(badgeText).toMatch(/세트\s*·\s*\d+/)

  await screenshot(page, 'T1-catalog-bundle-badge')
  console.log(`[T1] PASS: BUNDLE 뱃지 = "${badgeText}"`)
})

// ---------------------------------------------------------------------------
// T3: 카테고리 미선택 시 드래그 비활성 캡션
// ---------------------------------------------------------------------------

test('T3: 카테고리 미선택 — 드래그 비활성 캡션 확인', async ({ page }) => {
  await loginAndInstallStub(page, 'dev_master', 'dev_p05_pass!')

  await page.goto(`${BASE_URL}/#/products/catalog`)
  await page.waitForSelector('[data-testid="product-catalog-table"]', { timeout: 30000 })

  // 카테고리 미선택 상태에서 drag-disabled-caption 표시 확인
  const caption = page.locator('[data-testid="product-catalog-drag-disabled-caption"]')
  await expect(caption).toBeVisible({ timeout: 5000 })
  const captionText = await caption.textContent()
  expect(captionText).toContain('카테고리를 선택하면')

  await screenshot(page, 'T3-no-category-drag-disabled-caption')
  console.log(`[T3] PASS drag-disabled 캡션: "${captionText}"`)

  // 카테고리 선택 후 드래그 활성 확인
  const catSelect = page.locator('[data-testid="product-catalog-category-select"]')
  await catSelect.selectOption('HOME_MULTI')
  await page.waitForTimeout(2000)
  await screenshot(page, 'T3-category-selected-HOME_MULTI')
  console.log('[T3] PASS: 카테고리 HOME_MULTI 선택 후 드래그 활성 캡처')
})

// ---------------------------------------------------------------------------
// T5: dev_warehouse — 페이지 접근 결과 (products.list 없으면 redirect)
// ---------------------------------------------------------------------------

test('T5: warehouse 역할 — 품목관리 접근 결과 캡처', async ({ page }) => {
  await loginAndInstallStub(page, 'dev_warehouse', 'dev_p05_pass!')

  await page.goto(`${BASE_URL}/#/products/catalog`)
  await page.waitForTimeout(5000)

  const url = page.url()
  await screenshot(page, 'T5-warehouse-access-result')
  console.log(`[T5] URL: ${url}`)

  if (url.includes('login') || url.includes('forbidden')) {
    console.log('[T5] PASS: warehouse 역할 → 품목관리 접근 거부 (redirect)')
  } else {
    // 조회 전용 배너가 있는지 확인
    const readOnlyBanner = page.locator('[data-testid="product-catalog-readonly-banner"]')
    if (await readOnlyBanner.isVisible()) {
      console.log('[T5] PASS: 조회 전용 배너 표시')
    } else {
      console.log('[T5] INFO: warehouse 역할로 품목관리 접근 가능 (토글 비활성 확인 필요)')
    }
  }
})

// ---------------------------------------------------------------------------
// T7: SSE 실시간 동기화 — 2 컨텍스트 브라우저 자동 갱신 캡처
// ---------------------------------------------------------------------------

test('T7: SSE 실시간 — A에서 토글 변경 후 B 화면 갱신 확인', async ({ browser }) => {
  // 실서버 토큰 직접 취득
  const loginCtx = await browser.newContext()
  const tmpPage = await loginCtx.newPage()
  const loginRes = await tmpPage.request.post(`${API_BASE}/auth/login`, {
    data: { loginId: 'dev_master', password: 'dev_p05_pass!' },
  })
  const loginBody = await loginRes.json()
  const masterToken: string = loginBody.data?.token ?? ''
  const masterId: string = loginBody.data?.userId ?? ''
  await loginCtx.close()

  const authStub = { tok: masterToken, r: 'MASTER', uid: masterId, name: '개발마스터' }

  // 컨텍스트 A
  const ctxA = await browser.newContext()
  const pageA = await ctxA.newPage()
  await pageA.addInitScript(({ tok, r, uid, name }: typeof authStub) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token: tok, userId: uid, role: r, fullName: name, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, authStub)
  await pageA.goto(`${BASE_URL}/#/products/catalog`)
  await pageA.waitForSelector('[data-testid="product-catalog-table"]', { timeout: 30000 })

  // 컨텍스트 B
  const ctxB = await browser.newContext()
  const pageB = await ctxB.newPage()
  await pageB.addInitScript(({ tok, r, uid, name }: typeof authStub) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token: tok, userId: uid, role: r, fullName: name, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, authStub)
  await pageB.goto(`${BASE_URL}/#/products/catalog`)
  await pageB.waitForSelector('[data-testid="product-catalog-table"]', { timeout: 30000 })

  // PATCH 전 pageB 대상 행의 '주문 노출' 토글 상태 캡처 (BOTH 시작 → checked).
  // usageScope BOTH→ESTIMATE 변경은 order 토글 checked=true→false 로 관찰됨.
  const orderToggleB = pageB.locator(
    '[data-testid="product-catalog-order-toggle-TEST-BUNDLE-SET-01"]',
  )
  await expect(orderToggleB).toHaveCount(1)
  const orderCheckedBefore = await orderToggleB.isChecked()
  await screenshot(pageB, 'T7-B-before-toggle')
  console.log(`[T7] B 초기 상태 캡처 — 주문 노출 토글 checked=${orderCheckedBefore}`)

  // A에서 API로 노출 토글 변경 (BOTH → ESTIMATE: 주문 노출 OFF)
  const patchRes = await pageA.request.patch(
    `${API_BASE}/api/v1/products/TEST-BUNDLE-SET-01/usage`,
    {
      headers: { Authorization: `Bearer ${masterToken}`, 'Content-Type': 'application/json' },
      data: { usageScope: 'ESTIMATE', estimateCategory: 'HOME_MULTI' },
    },
  )
  // (1) PATCH 응답이 성공이어야 한다 — 실패 시 테스트 실패.
  expect(patchRes.ok(), `usage PATCH 실패: HTTP ${patchRes.status()}`).toBeTruthy()
  console.log('[T7] A에서 토글 변경 완료(ESTIMATE), B SSE 갱신 능동 대기...')

  // (3) B 화면이 SSE 로 자동 갱신되어 주문 노출 토글이 변경될 때까지 능동 대기.
  // waitForTimeout 고정 대기 대신 expect.poll 로 before≠after 단언 — SSE 회귀 시 실패.
  await expect
    .poll(async () => orderToggleB.isChecked(), {
      timeout: 15000,
      message: 'SSE 미수신 — pageB 주문 노출 토글이 PATCH 후에도 변경되지 않음',
    })
    .toBe(!orderCheckedBefore)

  const orderCheckedAfter = await orderToggleB.isChecked()
  expect(orderCheckedAfter, 'SSE 갱신 후 토글 상태가 변경되지 않음').not.toBe(orderCheckedBefore)
  await screenshot(pageB, 'T7-B-after-sse-update')
  console.log(`[T7] B 갱신 후 캡처 — 주문 노출 토글 checked=${orderCheckedAfter} (변경 확인)`)

  // 원복 (BOTH 복원)
  await pageA.request.patch(
    `${API_BASE}/api/v1/products/TEST-BUNDLE-SET-01/usage`,
    {
      headers: { Authorization: `Bearer ${masterToken}`, 'Content-Type': 'application/json' },
      data: { usageScope: 'BOTH', estimateCategory: 'HOME_MULTI' },
    },
  )

  await ctxA.close()
  await ctxB.close()
  console.log('[T7] SSE 동기화 테스트 완료')
})
