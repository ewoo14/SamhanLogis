import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { expect, test, type APIResponse, type Page } from '@playwright/test'

const require = createRequire(import.meta.url)
const { resolveQaCredential } = require('../../../../scripts/lib/qa-credentials.cjs')
const { resolveQaShotsDir } = require('../../../../scripts/lib/qa-shots-dir.cjs')
const here = path.dirname(fileURLToPath(import.meta.url))
const shotsDir = resolveQaShotsDir(path.resolve(here, '../../../../docs/qa/2026-08-10-1095-r11'))
const desktopUrl = process.env['QA_DESKTOP_URL'] ?? 'http://127.0.0.1:5295'
const apiBase = process.env['QA_API_BASE'] ?? 'http://127.0.0.1:8080'
const productBase = process.env['QA_PRODUCT_BASE'] ?? 'http://127.0.0.1:28084'
const model = 'AM080AXVHHH1'

type Login = { token: string; userId?: string; role?: string; displayName?: string }

function redact(value: string): string {
  return value
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig, '<redacted-id>')
    .replace(/Bearer\s+[^\s"']+/ig, 'Bearer <redacted>')
}

function headers(session: Login): Record<string, string> {
  const claims = JSON.parse(Buffer.from(session.token.split('.')[1], 'base64url').toString('utf8'))
  return {
    Authorization: `Bearer ${session.token}`,
    'X-User-Id': String(claims.sub ?? session.userId ?? ''),
    'X-User-Role': String(session.role ?? claims.role ?? 'MASTER'),
    'X-Is-System-Master': String(claims.isSystemMaster === true),
    'X-User-Groups': Array.isArray(claims.groups) ? claims.groups.join(',') : '',
    'X-User-Name': encodeURIComponent(String(session.displayName ?? claims.name ?? 'R11 QA')),
  }
}

async function record(evidence: Record<string, unknown>, key: string, response: APIResponse): Promise<any> {
  const raw = await response.text()
  evidence[key] = { http: response.status(), body: redact(raw).slice(0, 8_000) }
  expect(response.ok(), `${key}: HTTP ${response.status()} ${redact(raw)}`).toBeTruthy()
  return raw ? JSON.parse(raw).data : null
}

async function login(page: Page, password: string): Promise<Login> {
  const response = await page.request.post(`${apiBase}/auth/login`, {
    data: { loginId: 'dev_master', password },
  })
  expect(response.ok(), `로그인 HTTP ${response.status()}`).toBeTruthy()
  return JSON.parse(await response.text()).data
}

async function installAuth(page: Page, session: Login): Promise<void> {
  await page.addInitScript(({ token, userId, role, displayName }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token, userId, role, fullName: displayName, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, session)
}

async function statusTotals(page: Page, auth: Record<string, string>): Promise<Record<string, number>> {
  const result: Record<string, number> = {}
  for (const status of ['ACTIVE', 'DISCONTINUED', 'NOT_FOR_SALE', 'OUT_OF_STOCK']) {
    const response = await page.request.get(`${productBase}/products`, {
      headers: auth,
      params: { status, page: 0, size: 1 },
    })
    const body = JSON.parse(await response.text())
    expect(response.ok(), `${status} count HTTP ${response.status()}`).toBeTruthy()
    result[status] = body.data?.totalElements ?? -1
  }
  return result
}

test('R11 단품 저장본 상태 확정 전 잠금·실패 fail-closed·reactivate 경로', async ({ page }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, `QA credential unavailable: ${error instanceof Error ? error.message : String(error)}`)
    return
  }

  const evidence: Record<string, unknown> = { model, deployedRevision: 'R11 local JAR' }
  const session = await login(page, password)
  await installAuth(page, session)
  const auth = headers(session)
  const before = await record(evidence, 'productBefore', await page.request.get(`${productBase}/products/by-model/${model}`, { headers: auth }))
  evidence.countsBefore = await statusTotals(page, auth)
  expect(before.status).toBe('ACTIVE')

  let estimateId = ''
  let statusChanged = false
  try {
    await page.goto(`${desktopUrl}/sales/estimates/new`)
    await expect(page.getByTestId('estimate-form-save-button')).toBeVisible()
    const partner = page.getByRole('combobox', { name: '거래처 검색' })
    await partner.fill('삼성')
    await page.getByRole('option').first().click()
    const modelInput = page.getByRole('combobox', { name: '라인 1 모델명' })
    await modelInput.fill(model)
    await expect(page.getByLabel('라인 1 품목명')).not.toHaveValue('')
    const quantity = page.getByTestId('estimate-form-line-0-qty')
    await expect(quantity).toBeEditable()
    await quantity.fill('10')
    await page.screenshot({ path: path.join(shotsDir, '01-r11-active-editable.png'), fullPage: true })

    const createResponse = page.waitForResponse((response) =>
      response.request().method() === 'POST' && new URL(response.url()).pathname === '/slips/estimates')
    await page.getByTestId('estimate-form-save-button').click()
    const created = await record(evidence, 'estimateCreate', await createResponse)
    estimateId = created.id
    await expect(page.getByTestId('estimate-detail-no')).toBeVisible()

    await record(evidence, 'discontinue', await page.request.post(`${productBase}/products/${before.id}/discontinue`, { headers: auth }))
    statusChanged = true
    await page.goto(`${desktopUrl}/sales/estimates/${estimateId}/edit`)
    const lockedQuantity = page.getByTestId('estimate-form-line-0-qty')
    await expect(lockedQuantity).not.toBeEditable({ timeout: 30_000 })
    await expect(page.getByText('상태 확인 중', { exact: true })).toBeVisible()
    await page.screenshot({ path: path.join(shotsDir, '02-r11-status-unknown-locked.png'), fullPage: true })

    await record(evidence, 'reactivate', await page.request.post(`${productBase}/products/${before.id}/reactivate`, { headers: auth }))
    let releaseLookup: (() => void) | null = null
    await page.route('**/api/products/lookup', async (route) => {
      await new Promise<void>((resolve) => { releaseLookup = resolve })
      await route.continue()
    })
    await page.goto(`${desktopUrl}/sales/estimates/${estimateId}/edit`)
    const activeQuantity = page.getByTestId('estimate-form-line-0-qty')
    await expect.poll(() => releaseLookup !== null).toBeTruthy()
    await expect(activeQuantity).not.toBeEditable({ timeout: 10_000 })
    await page.screenshot({ path: path.join(shotsDir, '04-r11-late-status-locked.png'), fullPage: true })
    releaseLookup?.()
    await expect(activeQuantity).toBeEditable({ timeout: 30_000 })
    await page.screenshot({ path: path.join(shotsDir, '03-r11-active-unlocked.png'), fullPage: true })
    await page.unroute('**/api/products/lookup')

    await page.route('**/api/products/lookup', (route) => route.abort('failed'))
    await page.goto(`${desktopUrl}/sales/estimates/${estimateId}/edit`)
    const failedLookupQuantity = page.getByTestId('estimate-form-line-0-qty')
    await expect(failedLookupQuantity).not.toBeEditable({ timeout: 30_000 })
    await expect(page.getByText('상태 확인 중', { exact: true })).toBeVisible()
    await page.screenshot({ path: path.join(shotsDir, '05-r11-status-lookup-failed-locked.png'), fullPage: true })
    await page.unroute('**/api/products/lookup')

    const duplicate = await page.request.post(`${productBase}/products/${before.id}/reactivate`, { headers: auth })
    evidence.reactivateAlreadyActive = { http: duplicate.status(), body: redact(await duplicate.text()) }
    expect(duplicate.status()).toBe(204)
  } finally {
    if (statusChanged) {
      await page.request.post(`${productBase}/products/${before.id}/reactivate`, { headers: auth })
    }
    evidence.productAfter = await record(evidence, 'productAfter', await page.request.get(`${productBase}/products/by-model/${model}`, { headers: auth }))
    evidence.countsAfter = await statusTotals(page, auth)
    await fs.writeFile(path.join(shotsDir, 'r11-evidence.json'), `${redact(JSON.stringify(evidence, null, 2))}\n`, 'utf8')
  }
})
