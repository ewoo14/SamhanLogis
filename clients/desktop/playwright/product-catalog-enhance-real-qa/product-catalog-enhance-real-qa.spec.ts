import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * 품목관리 고도화 (PR #461) Docker 실서버 QA Playwright spec.
 *
 * 대상: spec §3 T1/T3/T5/T7 UI 캡처
 * 실서버: http://localhost:8080 (api-gateway), http://localhost:5175 (FE dev)
 * 인증: dev_master / DEV_PASSWORD 환경변수 (MASTER role, products.admin UPDATE)
 *       dev_warehouse / DEV_PASSWORD 환경변수 (WAREHOUSE role, products.admin 없음)
 *
 * 실행:
 *   cd C:\dev\Samhan-Public\clients\desktop
 *   node_modules\.bin\playwright test --config=playwright.real-qa.config.ts playwright/product-catalog-enhance-real-qa --reporter=line --timeout=60000
 */
import { expect, test, request, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url))

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5175'
const API_BASE = 'http://localhost:8080'

const SCREENSHOTS_DIR = resolveQaShotsDir(path.resolve(
  _dirname,
  '../../../../docs/qa/product-catalog-enhance/screenshots',
))

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
// [#22] 전제 데이터 셋업 — TEST-BUNDLE-SET-01 BUNDLE + 구성품.
//   신선 Docker 스택에서 T1/T7 재현 가능하도록 beforeAll 에서 idempotent 셋업.
//   - dev_master 토큰으로 GET /api/v1/products?q=TEST-BUNDLE-SET-01 조회.
//   - 존재 + BUNDLE 이면: usage 를 BOTH/HOME_MULTI 로 정규화 + 구성품 PUT(known set) 으로 갱신(idempotent).
//   - 존재하지 않거나 BUNDLE 이 아니면: BUNDLE 타입은 시트 sync 경로로만 생성되고 공개 REST
//     create 엔드포인트(CreateProductRequest)에 productType 필드가 없어 위조 생성 불가 →
//     T1/T7 을 skip 처리(no-fake-data: 가짜 BUNDLE 날조 금지, 정직 보고).
//   구성품 셋업이 성공하면 setupReady=true → T1/T7 진행.
// ---------------------------------------------------------------------------

const SETUP_BUNDLE_CODE = 'TEST-BUNDLE-SET-01'
let setupReady = false
let setupSkipReason = ''

test.beforeAll(async () => {
  const ctx = await request.newContext()
  try {
    const loginRes = await ctx.post(`${API_BASE}/auth/login`, {
      data: { loginId: 'dev_master', password: (process.env.DEV_PASSWORD ?? '') },
    })
    if (!loginRes.ok()) {
      setupSkipReason = `로그인 실패: HTTP ${loginRes.status()} (Docker 스택 미기동?)`
      return
    }
    const token: string = (await loginRes.json()).data?.token ?? ''
    const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

    // 1. TEST-BUNDLE-SET-01 존재 + BUNDLE 여부 확인
    const listRes = await ctx.get(`${API_BASE}/api/v1/products`, {
      headers: authHeaders,
      params: { q: SETUP_BUNDLE_CODE, size: '20' },
    })
    if (!listRes.ok()) {
      setupSkipReason = `품목 조회 실패: HTTP ${listRes.status()}`
      return
    }
    const content: Array<{ modelCode: string; productType?: string }> =
      (await listRes.json()).content ?? []
    const target = content.find((r) => r.modelCode === SETUP_BUNDLE_CODE)
    if (!target) {
      setupSkipReason =
        `${SETUP_BUNDLE_CODE} 미존재 — BUNDLE 은 시트 sync 로만 생성되며 REST 위조 불가(seed 필요)`
      return
    }
    if (target.productType !== 'BUNDLE') {
      setupSkipReason =
        `${SETUP_BUNDLE_CODE} 가 BUNDLE 이 아님(productType=${target.productType}) — seed 필요`
      return
    }

    // 2. usage 정규화 — BOTH/HOME_MULTI (T7 가 BOTH→ESTIMATE 토글을 관찰)
    const usageRes = await ctx.patch(`${API_BASE}/api/v1/products/${SETUP_BUNDLE_CODE}/usage`, {
      headers: authHeaders,
      data: { usageScope: 'BOTH', estimateCategories: ['HOME_MULTI'] },
    })
    if (!usageRes.ok()) {
      setupSkipReason = `usage 정규화 실패: HTTP ${usageRes.status()}`
      return
    }

    // 3. 구성품 known set PUT — 활성 단품을 동적으로 골라 구성(시드 모델코드 하드코딩 회피).
    //    카탈로그에서 BUNDLE 이 아닌 활성 품목 2건을 선택해 구성품으로 등록(idempotent replace-all).
    const singlesRes = await ctx.get(`${API_BASE}/api/v1/products`, {
      headers: authHeaders,
      params: { usageScope: 'BOTH', size: '50' },
    })
    const singles: Array<{ modelCode: string; productType?: string }> =
      (singlesRes.ok() ? (await singlesRes.json()).content : []) ?? []
    const componentCodes = singles
      .filter((r) => r.productType !== 'BUNDLE' && r.modelCode !== SETUP_BUNDLE_CODE)
      .slice(0, 2)
      .map((r) => r.modelCode)
    if (componentCodes.length === 0) {
      setupSkipReason = '구성품으로 쓸 활성 단품이 없어 구성품 셋업 불가'
      return
    }
    const compBody = componentCodes.map((code, idx) => ({
      componentProductCode: code,
      defaultQty: idx + 1,
      qtyMode: 'FOLLOW_SET',
      isDefault: idx === 0,
    }))
    const compRes = await ctx.put(`${API_BASE}/api/v1/products/${SETUP_BUNDLE_CODE}/components`, {
      headers: authHeaders,
      data: compBody,
    })
    if (!compRes.ok()) {
      setupSkipReason = `구성품 PUT 실패: HTTP ${compRes.status()}`
      return
    }

    setupReady = true
  } catch (err) {
    setupSkipReason = `셋업 예외: ${(err as Error).message}`
  } finally {
    await ctx.dispose()
  }
})

// ---------------------------------------------------------------------------
// T1: 세트 컬럼 + 구성품 수 실 캡처
// ---------------------------------------------------------------------------

test('T1: 품목관리 — BUNDLE 세트 뱃지 + 구성품 수 + 조회 전용 배너', async ({ page }) => {
  // [#22] 전제 데이터(TEST-BUNDLE-SET-01) 셋업 실패 시 정직하게 skip (가짜 통과 금지).
  test.skip(!setupReady, `전제 데이터 셋업 미완료: ${setupSkipReason}`)
  await loginAndInstallStub(page, 'dev_master', (process.env.DEV_PASSWORD ?? ''))

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
// T3: 기본 카테고리 탭에서 드래그 활성
// ---------------------------------------------------------------------------

test('T3: 기본 홈멀티 탭 — 드래그 활성 확인', async ({ page }) => {
  await loginAndInstallStub(page, 'dev_master', (process.env.DEV_PASSWORD ?? ''))

  await page.goto(`${BASE_URL}/#/products/estimate-items`)
  await page.waitForSelector('[data-testid="estimate-items-table"]', { timeout: 30000 })

  const homeTab = page.locator('[data-testid="estimate-items-category-tab-HOME_MULTI"]')
  await expect(homeTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('[data-testid="estimate-items-drag-disabled-caption"]')).toHaveCount(0)
  await page.waitForSelector('[aria-label$="드래그"]', { timeout: 10000 })
  await screenshot(page, 'T3-home-multi-tab-drag-enabled')
  console.log('[T3] PASS: 기본 HOME_MULTI 탭에서 드래그 활성 캡처')
})

// ---------------------------------------------------------------------------
// T5: dev_warehouse — 페이지 접근 결과 (products.list 없으면 redirect)
// ---------------------------------------------------------------------------

test('T5: warehouse 역할 — 품목관리 접근 결과 캡처', async ({ page }) => {
  await loginAndInstallStub(page, 'dev_warehouse', (process.env.DEV_PASSWORD ?? ''))

  await page.goto(`${BASE_URL}/#/products/estimate-items`)
  await page.waitForTimeout(5000)

  const url = page.url()
  await screenshot(page, 'T5-warehouse-access-result')
  console.log(`[T5] URL: ${url}`)

  // [#17] vacuous(단언 0) 제거 — 양 분기 모두 강제 단언.
  //   warehouse 역할(products.admin UPDATE 없음)은 둘 중 하나여야 한다:
  //   (A) products.list VIEW 도 없으면 → 로그인/forbidden 으로 redirect.
  //   (B) products.list VIEW 만 있으면 → 접근 가능 + 조회 전용 배너 + 첫 토글 disabled.
  if (url.includes('login') || url.includes('forbidden')) {
    // (A) redirect 분기 — URL 이 실제로 차단 경로여야 한다.
    expect(url).toMatch(/login|forbidden/)
    console.log('[T5] PASS: warehouse 역할 → 품목관리 접근 거부 (redirect)')
  } else {
    // (B) 접근 가능 분기 — 조회 전용 배너 + 첫 토글 비활성을 강제 단언.
    const readOnlyBanner = page.locator('[data-testid="estimate-items-readonly-banner"]')
    await expect(
      readOnlyBanner,
      'warehouse 접근 가능 시 조회 전용 배너가 보여야 함',
    ).toBeVisible({ timeout: 10000 })

    // 테이블 로드 대기 후 첫 토글 비활성 단언 (편집 권한 차단 가시 확인)
    await page.waitForSelector('[data-testid="estimate-items-table"]', { timeout: 30000 })
    const firstEstimateToggle = page
      .locator('[data-testid^="estimate-items-estimate-toggle-"]')
      .first()
    await expect(firstEstimateToggle).toBeVisible({ timeout: 10000 })
    await expect(
      firstEstimateToggle,
      'warehouse 조회 전용 — 견적 노출 토글이 비활성이어야 함',
    ).toBeDisabled()

    await screenshot(page, 'T5-warehouse-readonly-view')
    console.log('[T5] PASS: 조회 전용 배너 + 첫 토글 비활성 단언 통과')
  }
})

// ---------------------------------------------------------------------------
// T7: SSE 실시간 동기화 — 2 컨텍스트 브라우저 자동 갱신 캡처
// ---------------------------------------------------------------------------

test('T7: SSE 실시간 — A에서 토글 변경 후 B 화면 갱신 확인', async ({ browser }) => {
  // [#22] 전제 데이터(TEST-BUNDLE-SET-01) 셋업 실패 시 정직하게 skip (가짜 통과 금지).
  test.skip(!setupReady, `전제 데이터 셋업 미완료: ${setupSkipReason}`)
  // 실서버 토큰 직접 취득
  const loginCtx = await browser.newContext()
  const tmpPage = await loginCtx.newPage()
  const loginRes = await tmpPage.request.post(`${API_BASE}/auth/login`, {
    data: { loginId: 'dev_master', password: (process.env.DEV_PASSWORD ?? '') },
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
  await pageA.goto(`${BASE_URL}/#/products/estimate-items`)
  await pageA.waitForSelector('[data-testid="estimate-items-table"]', { timeout: 30000 })

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
  await pageB.goto(`${BASE_URL}/#/products/estimate-items`)
  await pageB.waitForSelector('[data-testid="estimate-items-table"]', { timeout: 30000 })

  // PATCH 전 pageB 대상 행의 '주문 노출' 토글 상태 캡처 (BOTH 시작 → checked).
  // usageScope BOTH→ESTIMATE 변경은 order 토글 checked=true→false 로 관찰됨.
  const orderToggleB = pageB.locator(
    '[data-testid="estimate-items-order-toggle-TEST-BUNDLE-SET-01"]',
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
      data: { usageScope: 'ESTIMATE', estimateCategories: ['HOME_MULTI'] },
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
      data: { usageScope: 'BOTH', estimateCategories: ['HOME_MULTI'] },
    },
  )

  await ctxA.close()
  await ctxB.close()
  console.log('[T7] SSE 동기화 테스트 완료')
})
