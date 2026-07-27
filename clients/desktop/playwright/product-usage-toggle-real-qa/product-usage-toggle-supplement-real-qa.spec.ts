import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * PR-B 보충 QA (cb099ab3) — T8 q 검색 UI + T9R 페이징 결정성
 *
 * 실 스택(게이트웨이 :8080, FE :5173 VITE_MOCK_MODE=0) 에서 실행.
 * 스크린샷은 docs/qa/product-usage-toggle-pr-b/screenshots/ 에 저장.
 *
 * 실행:
 *   cd clients/desktop
 *   node_modules\.bin\playwright test \
 *     playwright/product-usage-toggle-real-qa/product-usage-toggle-supplement-real-qa.spec.ts \
 *     --config=playwright.real-qa.config.ts --reporter=line --timeout=60000
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname = path.dirname(fileURLToPath(import.meta.url))

// 5175 포트 = vite.renderer.dev.config.ts (VITE_MOCK_MODE 미설정 — 실 API 호출)
// 5173 포트 = 기본 vite dev (VITE_MOCK_MODE=1 가능성 있음)
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const GATEWAY = 'http://localhost:8080'
const SCREENSHOT_DIR = resolveQaShotsDir(path.resolve(
  _dirname,
  '../../../../docs/qa/product-usage-toggle-pr-b/screenshots',
))

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
}

async function loginAndGetToken(): Promise<string> {
  const resp = await fetch(`${GATEWAY}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId: 'dev_master', password: 'dev_p05_pass!' }),
  })
  const data = (await resp.json()) as { data: { token: string } }
  return data.data.token
}

async function injectAuthIntoPage(page: Page, token: string): Promise<void> {
  await page.addInitScript((tok) => {
    const auth = {
      token: tok,
      userId: 'a0000000-0000-0000-0000-000000000001',
      role: 'MASTER',
      fullName: '[DEV-SEED] 개발마스터',
      partnerCode: null,
    }
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => auth,
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, token)
}

// ---------------------------------------------------------------------------
// T8: q 검색 실효 — FE 화면 검색창 입력 → 조회 버튼 클릭 → 결과 축소 캡처
// ---------------------------------------------------------------------------
test('T8: q 검색 실효 — AR06 입력 후 결과 축소 캡처', async ({ page }) => {
  const token = await loginAndGetToken()
  await injectAuthIntoPage(page, token)
  await page.goto(`${BASE_URL}/#/products/catalog`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('product-catalog-query-button')).toBeVisible({ timeout: 15_000 })

  // 1단계: 검색창에 AR06 입력
  const searchInput = page.locator(
    'input[placeholder*="모델명"], input[placeholder*="검색"], input[placeholder*="모델 또는 품목"], [data-testid="product-catalog-search-input"]',
  ).first()
  await expect(searchInput).toBeVisible({ timeout: 8_000 })
  await searchInput.fill('AR06')

  // 2단계: 조회 버튼 클릭
  await page.getByTestId('product-catalog-query-button').click()

  // 3단계: 결과 갱신 대기 (네트워크 응답)
  await page.waitForTimeout(2000)

  const table = page.getByTestId('product-catalog-table')

  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, 't8-q-search-ar06.png'),
    fullPage: false,
  })

  // 행 수 검증: AR06 검색 결과 (전체 100건 대비 축소 — API 검증에서 3건)
  const rows = table.locator('tbody tr')
  const rowCount = await rows.count()
  console.log(`T8 AR06 검색 결과 행 수: ${rowCount}`)
  expect(rowCount).toBeLessThan(10)
})

// ---------------------------------------------------------------------------
// T9R: 페이징 결정성 — page=0 2회 호출 동일 순서 단언 (ORDER BY fix 검증)
// ---------------------------------------------------------------------------
test('T9R: 페이징 결정성 — page=0 2회 동일 순서', async ({ page }) => {
  const token = await loginAndGetToken()

  const fetchPage = async (): Promise<string[]> => {
    const resp = await fetch(
      `${GATEWAY}/api/v1/products?size=5&page=0`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    const d = (await resp.json()) as { content: Array<{ modelCode: string }> }
    return (d.content ?? []).map((p) => p.modelCode)
  }

  const first = await fetchPage()
  await page.waitForTimeout(500)
  const second = await fetchPage()

  console.log('1회차:', first)
  console.log('2회차:', second)

  // 동일 순서 단언
  expect(first).toEqual(second)
  // 최소 1건 이상
  expect(first.length).toBeGreaterThan(0)

  // 캡처: 콘솔 로그 대신 페이지 자체 목록
  await injectAuthIntoPage(page, token)
  await page.goto(`${BASE_URL}/#/products/catalog`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('product-catalog-query-button')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('product-catalog-query-button').click()
  await expect(
    page.getByTestId('product-catalog-table').locator('tbody tr').first(),
  ).toBeVisible({ timeout: 15_000 })

  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, 't9r-paging-deterministic.png'),
    fullPage: false,
  })
})
