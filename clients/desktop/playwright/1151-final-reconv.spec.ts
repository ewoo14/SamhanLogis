import { expect, test, type Page } from '@playwright/test'
import * as path from 'node:path'
import { resolveQaCredential } from '../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from './support/qa-screenshot-dir'

const REAL_BASE = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5275'
const DOMAIN_BASE = process.env['DOMAIN_AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5277'
const MOCK_BASE = process.env['MOCK_AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5276'
const API_BASE = process.env['API_BASE'] ?? 'http://127.0.0.1:28082'
const DOMAIN_API_BASE = process.env['DOMAIN_API_BASE'] ?? 'http://127.0.0.1:8080'
const ISOLATED_API = 'http://127.0.0.1:1'
const TARGET = process.env['QA_INBOUND_TARGET'] ?? '45c8c4a0-76d2-476b-be4c-e1f0fa0749d3'
const SHOTS = resolveQaShotsDir(path.resolve(process.cwd(), '../../docs/qa/2026-08-09-1151-final-reconv'))

type Login = { token: string; role: string; userId: string; displayName: string }

test.setTimeout(120_000)

async function login(page: Page, password: string, apiBase = API_BASE): Promise<Login> {
  const response = await page.request.post(`${apiBase}/auth/login`, {
    data: { loginId: 'dev_master', password },
  })
  console.log(`[LOGIN] POST ${apiBase}/auth/login -> ${response.status()}`)
  expect(response.status()).toBe(200)
  return (await response.json()).data as Login
}

async function installAuth(page: Page, auth: Login): Promise<void> {
  await page.addInitScript(({ token, role, userId, displayName }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token, userId, role, fullName: displayName, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, auth)
}

async function installMockAuth(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({
          token: 'final-reconv-mock-token',
          userId: '00000000-0000-0000-0000-000000010001',
          role: 'MASTER',
          fullName: '오병승',
          partnerCode: 'P-MOCK-001',
        }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  })
}

async function advanceToProcessing(page: Page): Promise<void> {
  for (const action of ['save', 'send', 'accept', 'process']) {
    const next = page.locator('button[title^="다음 단계:"]')
    await expect(next, `${action} 버튼`).toBeEnabled({ timeout: 30_000 })
    const pending = page.waitForResponse((response) =>
      response.url() === `${API_BASE}/slips/${TARGET}/${action}`
      && response.request().method() === 'POST')
    await next.click()
    const response = await pending
    const body = await response.text()
    console.log(`[LIFECYCLE] POST ${response.url()} -> ${response.status()}`)
    console.log(`[LIFECYCLE BODY] ${body}`)
    expect(response.status(), `${action} HTTP`).toBe(200)
  }
}

test('HEAD 번들과 비mock 제품 SSE가 실제 HTTP 200으로 열린다', async ({ page }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : String(error))
    return
  }

  const source = await page.request.get(`${DOMAIN_BASE}/realtime/createRealtimeClient.ts`)
  const sourceText = await source.text()
  console.log(`[BUNDLE SOURCE] GET ${source.url()} -> ${source.status()} guard=${sourceText.includes('if (isMockMode()) return controller')}`)
  expect(source.status()).toBe(200)
  expect(sourceText).toContain('if (isMockMode()) return controller')

  const auth = await login(page, password, DOMAIN_API_BASE)
  await installAuth(page, auth)
  const endpoint = `${DOMAIN_API_BASE}/api/v1/products/catalog-realtime`
  const pending = page.waitForResponse((response) => response.url() === endpoint, { timeout: 30_000 })
  await page.goto(`${DOMAIN_BASE}/#/products/catalog`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '기초품목 관리', level: 3 })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('product-catalog-table')).toBeVisible()
  await expect(page.getByTestId('product-catalog-list-error')).toHaveCount(0)
  const response = await pending
  console.log(`[REAL SSE] GET ${response.url()} -> ${response.status()} content-type=${response.headers()['content-type'] ?? ''}`)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('text/event-stream')
  await page.screenshot({ path: path.join(SHOTS, '01-real-product-catalog-sse-200.png'), fullPage: true })
})

test('비mock 거래처 SSE가 실제 HTTP 200으로 열린다', async ({ page }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : String(error))
    return
  }

  const auth = await login(page, password, DOMAIN_API_BASE)
  await installAuth(page, auth)
  const endpoint = `${DOMAIN_API_BASE}/admin/partners/list-realtime`
  const pending = page.waitForResponse((response) => response.url() === endpoint, { timeout: 30_000 })
  await page.goto(`${DOMAIN_BASE}/#/admin/partners`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '거래처 관리', level: 3 })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('admin-partners-table')).toBeVisible()
  await expect(page.getByTestId('admin-partners-action-error')).toHaveCount(0)
  const response = await pending
  console.log(`[REAL SSE] GET ${response.url()} -> ${response.status()} content-type=${response.headers()['content-type'] ?? ''}`)
  if (response.status() !== 200) console.log(`[REAL SSE BODY] ${await response.text()}`)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('text/event-stream')
  await page.screenshot({ path: path.join(SHOTS, '02-real-partners-sse-200.png'), fullPage: true })
})

test('mock 실시간 화면 3개가 no-op 뒤 로딩·에러 없이 열린다', async ({ page }) => {
  const isolatedFailures: string[] = []
  const pageErrors: string[] = []
  page.on('requestfailed', (request) => {
    if (request.url().startsWith(ISOLATED_API)) {
      isolatedFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`)
    }
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await installMockAuth(page)

  await page.goto(`${MOCK_BASE}/#/products/catalog?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '기초품목 관리', level: 3 })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('product-catalog-table')).toBeVisible()
  await expect(page.getByTestId('product-catalog-list-error')).toHaveCount(0)
  await page.screenshot({ path: path.join(SHOTS, '03-mock-product-catalog-noop.png'), fullPage: true })

  await page.goto(`${MOCK_BASE}/#/admin/partners?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '거래처 관리', level: 3 })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('admin-partners-table')).toBeVisible()
  await expect(page.getByTestId('admin-partners-action-error')).toHaveCount(0)
  await page.screenshot({ path: path.join(SHOTS, '04-mock-partners-noop.png'), fullPage: true })

  await page.goto(`${MOCK_BASE}/#/purchases/slip-003?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('입고전표 상세')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('불러오는 중')).toHaveCount(0)
  await expect(page.locator('[role="alert"]')).toHaveCount(0)
  await page.waitForTimeout(2_000)
  await page.screenshot({ path: path.join(SHOTS, '05-mock-slip-detail-noop.png'), fullPage: true })

  console.log(`[MOCK HARDGATE] VITE_API_BASE_URL=${ISOLATED_API} isolatedFailures=${isolatedFailures.length} pageErrors=${pageErrors.length}`)
  for (const failure of isolatedFailures) console.log(`[MOCK ESCAPE] ${failure}`)
  for (const error of pageErrors) console.log(`[MOCK PAGEERROR] ${error}`)
  expect(isolatedFailures).toEqual([])
  expect(pageErrors).toEqual([])
})

test('실 Desktop 입고 완료가 fresh source journal을 발화한다', async ({ page }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : String(error))
    return
  }

  const auth = await login(page, password)
  await installAuth(page, auth)
  await page.goto(`${REAL_BASE}/#/purchases/${TARGET}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('입고전표 상세')).toBeVisible({ timeout: 30_000 })
  await advanceToProcessing(page)

  const complete = page.getByRole('button', { name: /완료 \(.+입고 완료.+\)/ })
  await expect(complete).toBeEnabled({ timeout: 30_000 })
  await page.screenshot({ path: path.join(SHOTS, '06-real-before-inbound-complete.png'), fullPage: true })
  const pending = page.waitForResponse((response) =>
    response.url() === `${API_BASE}/slips/${TARGET}/complete`
    && response.request().method() === 'POST')
  await complete.click()
  const response = await pending
  const body = await response.text()
  console.log(`[COMPLETE] POST ${response.url()} -> ${response.status()}`)
  console.log(`[COMPLETE BODY] ${body}`)
  expect(response.status()).toBe(200)
  await expect(page.getByRole('button', { name: '완료 (처리 완료)' })).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: path.join(SHOTS, '07-real-after-inbound-complete.png'), fullPage: true })
})
