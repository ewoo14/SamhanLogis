import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
/**
 * KST(Asia/Seoul) 전역 표준화 — 실서버 검증 캡처.
 *
 * 이전(UTC) 배차 collab QA 는 수정완료 시각이 15:xx(UTC)로 찍혔다(KST 00:xx).
 * postgres -c timezone=Asia/Seoul + 서비스 JVM -Duser.timezone=Asia/Seoul 적용 후,
 * 동일 배차 task 수정완료의 수정 이력 시각이 **KST(~01:xx)** 로 찍히는지 캡처한다.
 * [[no-fake-data-ever]] — 실 게이트웨이/실 JWT/실 DB(timezone=Asia/Seoul).
 */
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const GW_URL = 'http://127.0.0.1:8080'
const MASTER_USER_ID = 'a0000000-0000-0000-0000-000000000001'
const TASK_CODE = process.env['DISPATCH_TASK_CODE'] ?? '2026/06/12-3'

const _dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOT_DIR = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/kst-verification'))
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

let n = 0
async function capture(page: Page, name: string): Promise<void> {
  n++
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${String(n).padStart(2, '0')}-${name}.png`), fullPage: false })
}

async function fetchRealToken(): Promise<string> {
  const http = await import('http')
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ loginId: 'dev_master', password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') })
    const req = http.default.request(
      { hostname: '127.0.0.1', port: 8080, path: '/api/v1/auth/login', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => { let d = ''; res.on('data', (c) => { d += c }); res.on('end', () => {
        try { resolve(JSON.parse(d).data.token as string) } catch (e) { reject(new Error('token: ' + d)) } }) },
    )
    req.on('error', reject); req.write(body); req.end()
  })
}

async function installRealAuth(page: Page, token: string): Promise<void> {
  await page.addInitScript(({ t, userId }: { t: string; userId: string }) => {
    Object.defineProperty(window, 'samhanAuth', { configurable: true, value: {
      getToken: async () => ({ token: t, userId, role: 'MASTER', displayName: '[DEV-SEED] 개발마스터', fullName: '[DEV-SEED] 개발마스터' }),
      setToken: async () => undefined, clearToken: async () => undefined } })
  }, { t: token, userId: MASTER_USER_ID })
}

async function setupApiProxy(page: Page, token: string): Promise<void> {
  await page.route(/:8080\//, async (route) => {
    const u = new URL(route.request().url())
    const headers: Record<string, string> = {}
    for (const { name, value } of await route.request().headersArray()) {
      if (name.toLowerCase() !== 'host') headers[name] = value
    }
    headers['Authorization'] = `Bearer ${token}`
    const postData = route.request().postData()
    try {
      const response = await route.fetch({ url: `${GW_URL}${u.pathname}${u.search}`, method: route.request().method(), headers, body: postData ?? undefined })
      await route.fulfill({ response })
    } catch (err) { await route.abort() }
  })
}

test.describe('KST 전역 표준화 실서버 검증', () => {
  let realToken = ''
  test.beforeAll(async () => { realToken = await fetchRealToken() })

  test('배차 수정완료 시각이 KST 로 찍힌다', async ({ page }) => {
    await installRealAuth(page, realToken)
    await setupApiProxy(page, realToken)
    await page.goto(`${BASE_URL}/#/dispatch-board/history?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
    await page.waitForTimeout(1_500)

    await page.getByText(TASK_CODE, { exact: false }).first().click({ timeout: 10_000 }).catch(async () => {
      await page.getByRole('row').nth(1).click().catch(() => {})
    })
    await page.waitForTimeout(1_200)
    await page.getByTestId('dispatch-collab-edit-start').click({ timeout: 8_000 })
    await page.waitForTimeout(500)
    await page.getByTestId('dispatch-collab-edit-memo').fill('KST 전역 표준화 검증 — 수정완료 시각이 한국시간으로 찍혀야 함')
    await page.getByLabel('수정 사유').fill('KST 검증')
    await page.getByTestId('dispatch-collab-edit-submit').click()
    await page.waitForTimeout(1_500)
    await page.getByTestId('dispatch-collab-edit-item').first().scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(400)
    await capture(page, 'dispatch-edit-kst-time')
  })
})
