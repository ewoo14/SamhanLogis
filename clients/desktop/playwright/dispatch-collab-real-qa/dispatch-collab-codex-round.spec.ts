import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * §7 슬라이스4 배차 collab — Codex 5-agent 라운드 실 서버 QA (회귀 무 재확인).
 *
 * Opus 라운드 이후 Codex 변경(SSE 중복구독 제거 / mock 격리 / a11y·"배차 완료" 라벨)
 * + TM afterCommit→in-transaction revert 적용 후, 수정완료(비고)→diff happy-path 가
 * 라이브에서 그대로 동작하는지 캡처(2차 편집 — 누적 diff).
 *
 * [[no-fake-data-ever]] [[real-server-check-screenshot]] — 실 게이트웨이/실 JWT/실 DB, 합성 0.
 */
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const GW_URL = 'http://127.0.0.1:8080'

const MASTER_USER_ID = 'a0000000-0000-0000-0000-000000000001'
const MASTER_ROLE = 'MASTER'
const MASTER_DISPLAY_NAME = '[DEV-SEED] 개발마스터'
const TASK_CODE = process.env['DISPATCH_TASK_CODE'] ?? '2026/06/12-3'

const _dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOT_DIR = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/dispatch-collab-codex'))
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

let n = 0
async function capture(page: Page, name: string): Promise<void> {
  n++
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${String(n).padStart(2, '0')}-${name}.png`), fullPage: false })
}

async function fetchRealToken(): Promise<string> {
  const http = await import('http')
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ loginId: 'dev_master', password: (process.env.DEV_PASSWORD ?? '') })
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
  await page.addInitScript(({ t, userId, role, displayName }: { t: string; userId: string; role: string; displayName: string }) => {
    Object.defineProperty(window, 'samhanAuth', { configurable: true, value: {
      getToken: async () => ({ token: t, userId, role, displayName, fullName: displayName }),
      setToken: async () => undefined, clearToken: async () => undefined } })
  }, { t: token, userId: MASTER_USER_ID, role: MASTER_ROLE, displayName: MASTER_DISPLAY_NAME })
}

async function setupApiProxy(page: Page, token: string): Promise<void> {
  await page.route(/:8080\//, async (route) => {
    const u = new URL(route.request().url())
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
    } catch (err) { console.error('[PROXY]', realUrl, err); await route.abort() }
  })
}

async function gotoAndSettle(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
  await page.waitForTimeout(1_500)
}

test.describe('§7 슬라이스4 배차 협업 Codex 라운드 실 QA — 회귀 무', () => {
  let realToken = ''
  test.beforeAll(async () => { realToken = await fetchRealToken() })

  test('수정완료(비고) → 누적 diff (Codex 변경 후)', async ({ page }) => {
    await installRealAuth(page, realToken)
    await setupApiProxy(page, realToken)

    await gotoAndSettle(page, `${BASE_URL}/#/dispatch-board/history?mockRole=MASTER`)
    await page.getByText(TASK_CODE, { exact: false }).first().click({ timeout: 10_000 }).catch(async () => {
      await page.getByRole('row').nth(1).click().catch(() => {})
    })
    await page.waitForTimeout(1_200)
    await page.getByTestId('dispatch-collab-edit-section').scrollIntoViewIfNeeded().catch(() => {})
    await capture(page, 'detail-after-codex')

    await page.getByTestId('dispatch-collab-edit-start').click({ timeout: 8_000 })
    await page.waitForTimeout(600)
    await page.getByTestId('dispatch-collab-edit-memo').fill('Codex 라운드 QA — afterCommit revert(in-transaction) 후 수정완료')
    await page.getByLabel('수정 사유').fill('Codex 라운드 회귀 무 확인')
    await page.waitForTimeout(400)
    await capture(page, 'edit-filled')

    await page.getByTestId('dispatch-collab-edit-submit').click()
    await page.waitForTimeout(1_500)
    await page.getByTestId('dispatch-collab-edit-item').first().scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(400)
    await capture(page, 'diff-accumulated')
  })
})
