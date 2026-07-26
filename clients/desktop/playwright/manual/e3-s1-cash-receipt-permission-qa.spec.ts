import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * E3 S1 CashReceipt(입금보고서) — Permission Matrix 실 서버 QA 스크린샷.
 * PR #709 Opus 재검 — UUID 비노출 계약 변경 라이브 검증의 부속 GUI 증거.
 * [[no-fake-data-ever]] [[real-server-check-screenshot]]
 *
 * 실행:
 *   node_modules/.bin/playwright test \
 *     --config playwright/manual/e3-s1-cash-receipt-permission-qa.config.ts
 */
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { test, expect, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const GW_URL = 'http://127.0.0.1:8080'

const MASTER_USER_ID = 'a0000000-0000-0000-0000-000000000001'
const MASTER_ROLE = 'MASTER'
const MASTER_DISPLAY_NAME = '[DEV-SEED] 개발마스터'

const _dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOT_DIR = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/e3-s1-cash-receipt-domain'))
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

let n = 0
async function capture(page: Page, name: string): Promise<void> {
  n++
  const p = path.join(SCREENSHOT_DIR, `${String(n).padStart(2, '0')}-${name}.png`)
  await page.screenshot({ path: p, fullPage: false })
  console.log(`[CAPTURED] ${p}`)
}

async function fetchRealToken(): Promise<string> {
  const http = await import('http')
  return new Promise((resolve, reject) => {
    const devPassword = process.env['DEV_PASSWORD']
    if (!devPassword) { reject(new Error('DEV_PASSWORD 환경변수 필수 (하드코딩 금지·GitGuardian)')); return }
    const body = JSON.stringify({ loginId: 'dev_master', password: devPassword })
    const req = http.default.request(
      { hostname: '127.0.0.1', port: 8080, path: '/auth/login', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let d = ''
        res.on('data', (c) => { d += c })
        res.on('end', () => {
          try { resolve(JSON.parse(d).data.token as string) }
          catch (e) { reject(new Error('token parse failed: ' + d)) }
        })
      },
    )
    req.on('error', reject); req.write(body); req.end()
  })
}

async function installRealAuth(page: Page, token: string): Promise<void> {
  await page.addInitScript(
    ({ t, userId, role, displayName }: { t: string; userId: string; role: string; displayName: string }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({ token: t, userId, role, displayName, fullName: displayName }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    { t: token, userId: MASTER_USER_ID, role: MASTER_ROLE, displayName: MASTER_DISPLAY_NAME },
  )
}

async function setupApiProxy(page: Page, token: string): Promise<void> {
  await page.route(/:8080\//, async (route) => {
    const u = new URL(route.request().url())
    if (u.pathname.endsWith('/collab/stream') || u.pathname.includes('/coedit/stream') || u.pathname.includes('/realtime')) {
      await route.abort(); return
    }
    const realUrl = `${GW_URL}${u.pathname}${u.search}`
    const headers: Record<string, string> = {}
    for (const { name, value } of await route.request().headersArray()) {
      if (name.toLowerCase() !== 'host') headers[name] = value
    }
    headers['Authorization'] = `Bearer ${token}`
    const postData = route.request().postData()
    try {
      const response = await route.fetch({ url: realUrl, method: route.request().method(), headers, body: postData ?? undefined })
      await route.fulfill({ response })
    } catch (err) {
      console.error('[PROXY]', realUrl, err)
      await route.abort()
    }
  })
}

async function dismissViteOverlay(page: Page): Promise<void> {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}

async function gotoAndSettle(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await dismissViteOverlay(page)
  await page.waitForTimeout(2_000)
}

test.describe('E3 S1 CashReceipt — 권한 매트릭스 accounting.cash-receipts 실 QA', () => {
  let realToken = ''
  test.beforeAll(async () => { realToken = await fetchRealToken() })

  test('권한 매트릭스 화면에 입금보고서(accounting.cash-receipts) 페이지코드가 등록되어 있다', async ({ page }) => {
    await installRealAuth(page, realToken)
    await setupApiProxy(page, realToken)

    await gotoAndSettle(page, `${BASE_URL}/#/admin/permission-matrix`)

    const heading = page.getByRole('heading', { name: /권한/ }).first()
    await expect(heading).toBeVisible({ timeout: 15_000 })
    await capture(page, 'permission-matrix-master-overview')

    const cashReceiptLabel = page.getByText('입금보고서', { exact: true }).first()
    await expect(cashReceiptLabel).toBeVisible({ timeout: 15_000 })
    await cashReceiptLabel.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await capture(page, 'permission-matrix-cash-receipts-row')
  })
})
