/**
 * PR-B 품목 노출 수동 토글 — 실서버 QA 스펙
 *
 * 실 스택(게이트웨이 :8080, FE :5173 VITE_MOCK_MODE=0) 에서 실행.
 * 스크린샷은 docs/qa/product-usage-toggle-pr-b/screenshots/ 에 저장.
 *
 * 실행:
 *   cd clients/desktop
 *   AUDIT_BASE_URL=http://127.0.0.1:5173 node_modules/.bin/playwright test \
 *     playwright/product-usage-toggle-real-qa \
 *     --reporter=line --timeout=60000
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname = path.dirname(fileURLToPath(import.meta.url))

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const GATEWAY = 'http://localhost:8080'
const SCREENSHOT_DIR = path.resolve(_dirname, '../../../../docs/qa/product-usage-toggle-pr-b/screenshots')

// Ensure screenshot dir exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
}

async function loginAndGetToken(): Promise<string> {
  const resp = await fetch(`${GATEWAY}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId: 'dev_master', password: 'dev_p05_pass!' }),
  })
  const data = await resp.json() as { data: { token: string } }
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
// T1: 품목 관리 목록 + 토글 UI 실 캡처
// ---------------------------------------------------------------------------
test('T1: 품목관리 목록 + 토글 UI', async ({ page }) => {
  const token = await loginAndGetToken()
  await injectAuthIntoPage(page, token)
  await page.goto(`${BASE_URL}/#/products/catalog`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('product-catalog-query-button')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('product-catalog-query-button').click()
  await expect(page.getByTestId('product-catalog-table').locator('tbody tr').first()).toBeVisible({ timeout: 15_000 })
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, 't1-product-catalog-list.png'),
    fullPage: false,
  })
})

// ---------------------------------------------------------------------------
// T2: PATCH 후 수동 뱃지 캡처
// ---------------------------------------------------------------------------
test('T2: PATCH usage_scope → 수동 뱃지 확인', async ({ page }) => {
  const token = await loginAndGetToken()
  await injectAuthIntoPage(page, token)
  await page.goto(`${BASE_URL}/#/products/catalog`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('product-catalog-query-button')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('product-catalog-query-button').click()

  const table = page.getByTestId('product-catalog-table')
  await expect(table.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 })

  // 첫 번째 행의 견적 토글 클릭 → PATCH → 수동 뱃지 확인
  const firstEstimateToggle = table.locator('[data-testid^="product-catalog-estimate-toggle-"]').first()
  const testId = await firstEstimateToggle.getAttribute('data-testid') ?? ''
  const modelCode = testId.replace('product-catalog-estimate-toggle-', '')

  await firstEstimateToggle.click()

  const sourceBadge = page.getByTestId(`product-catalog-source-badge-${modelCode}`)
  await expect(sourceBadge).toHaveText('수동', { timeout: 10_000 })

  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, 't2-manual-badge-after-patch.png'),
    fullPage: false,
  })
})

// ---------------------------------------------------------------------------
// T6: WAREHOUSE role 토글 비활성 캡처
// ---------------------------------------------------------------------------
test('T6: view-only (WAREHOUSE) — 토글 비활성 + readonly 배너', async ({ page }) => {
  // Login as warehouse
  const wResp = await fetch(`${GATEWAY}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId: 'dev_warehouse', password: 'dev_p05_pass!' }),
  })
  const wData = await wResp.json() as { data: { token: string } }
  const whToken = wData.data.token

  await page.addInitScript((tok) => {
    const auth = {
      token: tok,
      userId: 'a0000000-0000-0000-0000-000000000006',
      role: 'WAREHOUSE',
      fullName: '[DEV-SEED] 개발창고',
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
  }, whToken)

  await page.goto(`${BASE_URL}/#/products/catalog?mockRole=WAREHOUSE`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('product-catalog-query-button')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('product-catalog-query-button').click()

  const table = page.getByTestId('product-catalog-table')
  await expect(table.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 })

  // readonly 배너 확인 (mock mode에서 mockRole=WAREHOUSE → canEdit=false)
  const banner = page.getByTestId('product-catalog-readonly-banner')
  await expect(banner).toBeVisible({ timeout: 8_000 })

  // 체크박스 비활성 확인
  const firstToggle = table.locator('[data-testid^="product-catalog-estimate-toggle-"]').first()
  await expect(firstToggle).toBeDisabled()

  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, 't6-warehouse-readonly-disabled.png'),
    fullPage: false,
  })
})
